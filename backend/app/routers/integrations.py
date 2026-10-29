import os
import json
import uuid
import secrets
import logging
import bcrypt
from datetime import datetime, timezone, timedelta
from typing import Optional, List, Dict, Any
import httpx
from fastapi import APIRouter, HTTPException, Depends, Request, Response

from app.core.database import db, client, database_name
from app.core.websocket import manager
from app.core.config import *
from app.core.security import (
    get_current_user, get_current_driver, get_current_admin,
    normalize_session_expiry, clear_cookie_variants, delete_pharmacy_account_data,
)
from app.core.notifications import (
    create_notification_internal, send_transactional_email, send_web_push_notifications,
    push_notifications_enabled, build_notification_target_url,
    upsert_push_subscription, remove_push_subscription,
)
from app.core.shifts_service import (
    _attach_delivery_to_open_shift, _shift_aggregate_totals, _enrich_shift,
)
from app.core.winfarm_bridge import render_bridge_script
from app.models.schemas import *

logger = logging.getLogger(__name__)
router = APIRouter()


async def _winfarm_create_delivery(pharmacy_id: str, body: dict) -> dict:
    """Crea (o riusa) una consegna da una vendita Winfarm. Condiviso tra il
    bridge desktop (token) e l'endpoint REST (sessione).
    Alias italiani accettati: cliente/telefono/indirizzo/importo/pagamento/note."""
    customer_id = body.get("customer_id")
    customer_phone = (body.get("customer_phone") or body.get("telefono") or "").strip()
    customer_name = (body.get("customer_name") or body.get("cliente") or "").strip()
    customer_address = body.get("customer_address") or body.get("indirizzo")
    amount = body.get("amount") or body.get("importo")
    payment_method = body.get("payment_method") or body.get("pagamento") or "cash"
    notes = body.get("notes") or body.get("note")
    external_ref = body.get("external_ref") or body.get("ricevuta") or body.get("scontrino")

    if not (customer_id or customer_phone or customer_name):
        raise HTTPException(status_code=400, detail="Specifica customer_id, customer_phone o customer_name")

    try:
        amount_val = float(str(amount).replace(",", ".")) if amount not in (None, "") else None
    except (TypeError, ValueError):
        amount_val = None

    # --- Anti doppio-click: stessa vendita entro 3 minuti ---
    if not external_ref:
        three_min_ago = (datetime.now(timezone.utc) - timedelta(minutes=3)).isoformat()
        dup = await db.deliveries.find_one({
            "pharmacy_id": pharmacy_id,
            "imported_from": "winfarm",
            "created_at": {"$gte": three_min_ago},
            "customer_name": customer_name,
            "amount": amount_val,
        }, {"_id": 0})
        if dup:
            return {"delivery": dup, "customer_created": False, "duplicate": True}

    customer = None
    if customer_id:
        customer = await db.customers.find_one({"customer_id": customer_id, "pharmacy_id": pharmacy_id}, {"_id": 0})
    if not customer and customer_phone:
        digits = "".join(c for c in customer_phone if c.isdigit())
        if digits:
            tail = digits[-9:] if len(digits) >= 9 else digits
            customer = await db.customers.find_one(
                {"pharmacy_id": pharmacy_id, "phone": {"$regex": tail + "$"}}, {"_id": 0})
    if not customer and customer_name:
        customer = await db.customers.find_one(
            {"pharmacy_id": pharmacy_id, "name": {"$regex": f"^{customer_name}$", "$options": "i"}}, {"_id": 0})

    created_customer = False
    if not customer:
        if not customer_name:
            raise HTTPException(status_code=404, detail="Cliente non trovato; passa customer_name per crearlo")
        customer = {
            "customer_id": f"cust_{uuid.uuid4().hex[:12]}",
            "pharmacy_id": pharmacy_id,
            "name": customer_name,
            "phone": customer_phone or "",
            "address": customer_address or "",
            "email": None, "fiscal_code": None, "birth_date": None, "notes": None,
            "customer_lat": None, "customer_lng": None, "place_id": None,
            "extra_phones": [],
            "created_at": datetime.now(timezone.utc).isoformat(),
            "imported_from": "winfarm",
        }
        await db.customers.insert_one(customer)
        customer.pop("_id", None)
        created_customer = True

    now_iso = datetime.now(timezone.utc).isoformat()
    delivery_data = {
        "delivery_id": f"del_{uuid.uuid4().hex[:12]}",
        "pharmacy_id": pharmacy_id,
        "customer_id": customer["customer_id"],
        "driver_id": None,
        "customer_name": customer["name"],
        "customer_phone": customer.get("phone") or "",
        "customer_address": customer.get("address") or "",
        "customer_lat": customer.get("customer_lat"),
        "customer_lng": customer.get("customer_lng"),
        "notes": notes,
        "status": "da_preparare",
        "payment_method": payment_method if payment_method in ["cash", "pos"] else "cash",
        "amount": amount_val,
        "amount_given": None,
        "change_due": None,
        "payment_collected": False,
        "scheduled_date": None,
        "scheduled_time": None,
        "priority": "normal",
        "estimated_delivery": None,
        "actual_delivery": None,
        "created_at": now_iso,
        "updated_at": now_iso,
        "auto_assigned": False,
        "imported_from": "winfarm",
        "external_ref": external_ref,
    }
    await db.deliveries.insert_one(delivery_data)

    await create_notification_internal(
        pharmacy_id, "pharmacy",
        "Nuova consegna da Winfarm",
        f"{customer['name']} · {('€' + format(amount_val, '.2f')) if amount_val is not None else 'importo da definire'}",
        "delivery", {"delivery_id": delivery_data["delivery_id"]},
    )
    try:
        await manager.send_personal_message(
            {"type": "new_delivery", "delivery_id": delivery_data["delivery_id"]}, pharmacy_id, "pharmacy")
    except Exception:
        logger.warning("WebSocket notify fallita per %s", delivery_data["delivery_id"])

    return {
        "delivery": {k: v for k, v in delivery_data.items() if k != "_id"},
        "customer_created": created_customer,
        "customer": customer,
        "duplicate": False,
    }


async def _bridge_pharmacy(request: Request) -> dict:
    """Autentica il bridge desktop con il token della farmacia."""
    token = request.headers.get("X-Bridge-Token") or request.query_params.get("t") or ""
    token = token.strip()
    if not token:
        raise HTTPException(status_code=401, detail="Token bridge mancante")
    user = await db.users.find_one({"bridge_token": token}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=401, detail="Token bridge non valido")
    return user


@router.get("/integrations/winfarm/status")
async def winfarm_status(request: Request, user: dict = Depends(get_current_user)):
    """Stato del bridge: token configurato, ultimo import, conteggi."""
    token = user.get("bridge_token")
    if not token:
        token = f"wf_{secrets.token_urlsafe(24)}"
        await db.users.update_one({"user_id": user["user_id"]}, {"$set": {"bridge_token": token}})
    last = await db.deliveries.find_one(
        {"pharmacy_id": user["user_id"], "imported_from": "winfarm"}, {"_id": 0}, sort=[("created_at", -1)])
    today_iso = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    imports_today = await db.deliveries.count_documents({
        "pharmacy_id": user["user_id"], "imported_from": "winfarm",
        "created_at": {"$gte": today_iso}})
    total = await db.deliveries.count_documents({"pharmacy_id": user["user_id"], "imported_from": "winfarm"})
    return {
        "configured": True,
        "token_preview": f"{token[:5]}...{token[-4:]}",
        "last_import": last.get("created_at") if last else None,
        "last_import_customer": last.get("customer_name") if last else None,
        "imports_today": imports_today,
        "imports_total": total,
        "pharmacy_name": user.get("pharmacy_name") or user.get("name"),
        "base_url": (request.headers.get("origin") or "").rstrip("/"),
    }


@router.get("/integrations/winfarm/bridge/download")
async def winfarm_bridge_download(request: Request, user: dict = Depends(get_current_user)):
    """Script AutoHotkey già configurato (URL + token della farmacia)."""
    token = user.get("bridge_token")
    if not token:
        token = f"wf_{secrets.token_urlsafe(24)}"
        await db.users.update_one({"user_id": user["user_id"]}, {"$set": {"bridge_token": token}})
    base_url = (request.query_params.get("base") or request.headers.get("origin")
                or os.environ.get("APP_BASE_URL") or "https://pharmatrack-zeta.vercel.app")
    script = render_bridge_script(base_url, token, user.get("pharmacy_name") or user.get("name") or "")
    filename = "pharmatrack-bridge-winfarm.ahk"
    return Response(
        content=script,
        media_type="text/plain; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("/integrations/winfarm/bridge")
async def winfarm_bridge_import(request: Request):
    """Endpoint chiamato dallo script desktop: token della farmacia nell'header."""
    pharmacy = await _bridge_pharmacy(request)
    body = dict(request.query_params)
    if not body.get("cliente") and not body.get("telefono"):
        try:
            payload = await request.json()
            if isinstance(payload, dict):
                body.update(payload)
        except Exception:
            pass
    result = await _winfarm_create_delivery(pharmacy["user_id"], body)
    if result.get("duplicate"):
        raise HTTPException(status_code=409, detail="Consegna già importata")
    return result


@router.post("/integrations/winfarm/import")
async def winfarm_import(request: Request, user: dict = Depends(get_current_user)):
    """Endpoint REST (sessione farmacia). Accetta JSON con alias italiani."""
    body = await request.json()
    return await _winfarm_create_delivery(user["user_id"], body or {})
