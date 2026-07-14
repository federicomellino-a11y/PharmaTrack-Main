import os
import json
import uuid
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
from app.models.schemas import *

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/integrations/winfarm/import")
async def winfarm_import(request: Request, user: dict = Depends(get_current_user)):
    """Endpoint generico per il bridge Winfarm: accetta una vendita e crea
    una delivery in stato `da_preparare`. Il farmacista la troverà su
    /deliveries pronta da assegnare. Tutti i campi sono opzionali tranne
    qualcosa che identifichi il cliente (customer_id, customer_phone o
    customer_name)."""
    body = await request.json()

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

    # Cerca cliente per id, telefono normalizzato o nome
    customer = None
    if customer_id:
        customer = await db.customers.find_one({"customer_id": customer_id, "pharmacy_id": user["user_id"]}, {"_id": 0})
    if not customer and customer_phone:
        digits = "".join(c for c in customer_phone if c.isdigit())
        if digits:
            # match per ultime 9 cifre (gestisce prefissi internazionali e formattazioni varie)
            tail = digits[-9:] if len(digits) >= 9 else digits
            customer = await db.customers.find_one(
                {"pharmacy_id": user["user_id"], "phone": {"$regex": tail + "$"}},
                {"_id": 0},
            )
    if not customer and customer_name:
        customer = await db.customers.find_one({"pharmacy_id": user["user_id"], "name": {"$regex": f"^{customer_name}$", "$options": "i"}}, {"_id": 0})

    # Se nessun match e abbiamo nome → crea cliente nuovo
    created_customer = False
    if not customer:
        if not customer_name:
            raise HTTPException(status_code=404, detail="Cliente non trovato; passa customer_name per crearlo")
        cid = f"cust_{uuid.uuid4().hex[:12]}"
        customer = {
            "customer_id": cid,
            "pharmacy_id": user["user_id"],
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

    try:
        amount_val = float(amount) if amount is not None else None
    except (TypeError, ValueError):
        amount_val = None

    delivery_data = {
        "delivery_id": f"del_{uuid.uuid4().hex[:12]}",
        "pharmacy_id": user["user_id"],
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
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "auto_assigned": False,
        "imported_from": "winfarm",
        "external_ref": external_ref,
    }
    await db.deliveries.insert_one(delivery_data)

    # Notifica push/in-app
    await create_notification_internal(
        user["user_id"], "pharmacy",
        "Nuova consegna da Winfarm",
        f"{customer['name']} · {('€' + format(amount_val, '.2f')) if amount_val is not None else 'importo da definire'}",
        "delivery", {"delivery_id": delivery_data["delivery_id"]},
    )

    return {
        "delivery": {k: v for k, v in delivery_data.items() if k != "_id"},
        "customer_created": created_customer,
        "customer": customer,
    }

