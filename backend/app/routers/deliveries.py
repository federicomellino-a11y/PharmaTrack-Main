import os
import json
import math
import uuid
import logging
import hashlib
import secrets
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

ETA_ROAD_FACTOR = 1.35
ETA_AVG_SPEED_KMH = 24.0


def _haversine_km(lat1, lng1, lat2, lng2):
    radius = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlng = math.radians(lng2 - lng1)
    a = (math.sin(dlat / 2) ** 2
         + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlng / 2) ** 2)
    return 2 * radius * math.asin(math.sqrt(a))


def _parse_iso(value):
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except Exception:
        return None


def _enrich_with_eta(items, drivers_by_id):
    """Distanza e tempo stimato dal fattorino assegnato a ogni consegna attiva."""
    now = datetime.now(timezone.utc)
    for item in items:
        driver = drivers_by_id.get(item.get("driver_id") or "")
        if not driver:
            continue
        last_update = _parse_iso(driver.get("last_location_update"))
        if last_update:
            if last_update.tzinfo is None:
                last_update = last_update.replace(tzinfo=timezone.utc)
            item["driver_location_age_minutes"] = max(0, int(round((now - last_update).total_seconds() / 60)))
        lat, lng = driver.get("current_lat"), driver.get("current_lng")
        if lat is None or lng is None:
            continue
        if item.get("customer_lat") is None or item.get("customer_lng") is None:
            continue
        km = _haversine_km(float(lat), float(lng), float(item["customer_lat"]), float(item["customer_lng"]))
        item["driver_distance_km"] = round(km, 1)
        item["driver_eta_minutes"] = max(1, int(round(km * ETA_ROAD_FACTOR / ETA_AVG_SPEED_KMH * 60)))
    return items



@router.get("/deliveries")
async def get_deliveries(status: Optional[str] = None, driver_id: Optional[str] = None, user: dict = Depends(get_current_user)):
    query = {"pharmacy_id": user["user_id"]}
    if status:
        if status == "active":
            query["status"] = {"$in": ["da_preparare", "pronta", "pending", "assigned", "picked_up", "in_transit", "delivered_pending_confirmation"]}
        elif status == "pending_confirmation":
            query["status"] = "delivered_pending_confirmation"
        elif status == "completed":
            query["status"] = {"$in": ["delivered", "cancelled"]}
        else:
            query["status"] = status
    if driver_id:
        query["driver_id"] = driver_id
    items = await db.deliveries.find(query, {"_id": 0}).sort("created_at", -1).to_list(500)
    driver_ids = {item.get("driver_id") for item in items if item.get("driver_id")}
    if driver_ids:
        drivers = await db.drivers.find(
            {"pharmacy_id": user["user_id"], "driver_id": {"$in": list(driver_ids)}},
            {"_id": 0, "driver_id": 1, "current_lat": 1, "current_lng": 1, "last_location_update": 1},
        ).to_list(200)
        _enrich_with_eta(items, {d["driver_id"]: d for d in drivers})
    return items

@router.post("/deliveries")
async def create_delivery(delivery: DeliveryCreate, user: dict = Depends(get_current_user)):
    customer = await db.customers.find_one({"customer_id": delivery.customer_id, "pharmacy_id": user["user_id"]}, {"_id": 0})
    if not customer:
        raise HTTPException(status_code=404, detail="Cliente non trovato")

    if delivery.payment_method == "cash" and delivery.amount is not None and delivery.amount_given is not None and delivery.amount_given < delivery.amount:
        raise HTTPException(status_code=400, detail="Il pagato con non può essere inferiore all'importo")

    # Fattorino predefinito dal profilo: viene solo preselezionato.
    # La consegna resta comunque in "da preparare" finche' non viene confermata.
    selected_driver_id = delivery.driver_id or (user.get("settings") or {}).get("default_driver_id")
    assigned_driver = None
    if selected_driver_id:
        assigned_driver = await db.drivers.find_one({
            "driver_id": selected_driver_id,
            "pharmacy_id": user["user_id"],
            "is_active": True,
        }, {"_id": 0, "driver_id": 1, "name": 1})
        if delivery.driver_id and not assigned_driver:
            raise HTTPException(status_code=400, detail="Fattorino selezionato non valido o non attivo")
        if not delivery.driver_id and not assigned_driver:
            selected_driver_id = None

    # V19: smistamento automatico (opt-in via settings.assignment_mode = "least_loaded").
    # Default "manual": se il farmacista non sceglie un fattorino, la consegna resta in coda.
    assignment_mode = (user.get("settings") or {}).get("assignment_mode", "manual")
    if not selected_driver_id and assignment_mode == "least_loaded":
        candidates = await db.drivers.find({"pharmacy_id": user["user_id"], "is_active": True}, {"_id": 0, "driver_id": 1, "name": 1}).to_list(50)
        if candidates:
            open_shift_ids = set()
            async for sh in db.driver_shifts.find({"pharmacy_id": user["user_id"], "status": "open"}, {"_id": 0, "driver_id": 1}):
                open_shift_ids.add(sh.get("driver_id"))
            pool = [c for c in candidates if c["driver_id"] in open_shift_ids] or candidates
            best, best_load = None, None
            for c in pool:
                load = await db.deliveries.count_documents({
                    "pharmacy_id": user["user_id"],
                    "driver_id": c["driver_id"],
                    "status": {"$in": ["assigned", "picked_up", "in_transit", "da_preparare", "pronta"]},
                })
                if best is None or load < best_load:
                    best, best_load = c, load
            if best:
                selected_driver_id, assigned_driver = best["driver_id"], best

    change_due = None
    if delivery.payment_method == "cash" and delivery.amount is not None and delivery.amount_given is not None:
        change_due = delivery.amount_given - delivery.amount

    delivery_data = {
        "delivery_id": f"del_{uuid.uuid4().hex[:12]}",
        "pharmacy_id": user["user_id"],
        "customer_id": delivery.customer_id,
        "driver_id": assigned_driver["driver_id"] if assigned_driver else None,
        "customer_name": customer["name"], "customer_phone": customer["phone"], "customer_address": customer["address"],
        "customer_lat": customer.get("customer_lat"), "customer_lng": customer.get("customer_lng"),
        "notes": delivery.notes,
        "status": "da_preparare",  # sempre in coda: l'assegnazione e' un passo a parte
        "payment_method": delivery.payment_method, "amount": delivery.amount,
        "amount_given": delivery.amount_given, "change_due": change_due, "payment_collected": False,
        "scheduled_date": delivery.scheduled_date, "scheduled_time": delivery.scheduled_time,
        "priority": delivery.priority,
        "estimated_delivery": None, "actual_delivery": None,
        "created_at": datetime.now(timezone.utc).isoformat(), "updated_at": datetime.now(timezone.utc).isoformat(),
        "auto_assigned": False,  # in coda: non ancora assegnata
        "nre": (getattr(delivery, "nre", None) or None),
        "client_meta": (getattr(delivery, "client_meta", None) or None),
    }
    await db.deliveries.insert_one(delivery_data)
    # Log audit NRE (tracciabilità legale, Garante 2025)
    if delivery_data.get("nre"):
        await db.audit_log.insert_one({
            "audit_id": f"aud_{uuid.uuid4().hex[:12]}",
            "entity": "delivery", "entity_id": delivery_data["delivery_id"],
            "action": "nre_set", "actor": user["user_id"], "actor_role": "pharmacy",
            "detail": {"nre_prefix": str(delivery_data["nre"])[:4] + "***"},
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
    if assigned_driver:
        await _attach_delivery_to_open_shift(assigned_driver["driver_id"], delivery_data["delivery_id"])
        await manager.send_personal_message({"type": "new_delivery", "delivery_id": delivery_data["delivery_id"]}, assigned_driver["driver_id"], "driver")
        await create_notification_internal(assigned_driver["driver_id"], "driver", "Nuova consegna assegnata", f"Hai una nuova consegna per {delivery_data['customer_name']}", "delivery", {"delivery_id": delivery_data["delivery_id"]})
    return {k: v for k, v in delivery_data.items() if k != "_id"}

@router.get("/deliveries/{delivery_id}")
async def get_delivery(delivery_id: str, user: dict = Depends(get_current_user)):
    delivery = await db.deliveries.find_one({"delivery_id": delivery_id, "pharmacy_id": user["user_id"]}, {"_id": 0})
    if not delivery:
        raise HTTPException(status_code=404, detail="Consegna non trovata")
    return delivery

@router.put("/deliveries/{delivery_id}")
async def update_delivery(delivery_id: str, update: DeliveryUpdate, user: dict = Depends(get_current_user)):
    delivery = await db.deliveries.find_one({"delivery_id": delivery_id, "pharmacy_id": user["user_id"]}, {"_id": 0})
    if not delivery:
        raise HTTPException(status_code=404, detail="Consegna non trovata")
    update_data = {"updated_at": datetime.now(timezone.utc).isoformat()}
    if update.driver_id is not None:
        update_data["driver_id"] = update.driver_id
        if delivery["status"] in ["pending", "da_preparare", "pronta"]:
            update_data["status"] = "assigned"
    if update.status is not None:
        effective_driver_id = update.driver_id if update.driver_id is not None else delivery.get("driver_id")
        if update.status == "in_transit" and not effective_driver_id:
            raise HTTPException(status_code=400, detail="Assegna prima un fattorino per avviare la consegna")
        update_data["status"] = update.status
        if update.status == "delivered":
            update_data["actual_delivery"] = datetime.now(timezone.utc).isoformat()
    if update.notes is not None: update_data["notes"] = update.notes
    if update.payment_method is not None: update_data["payment_method"] = update.payment_method
    if update.amount is not None: update_data["amount"] = update.amount
    if update.amount_given is not None:
        update_data["amount_given"] = update.amount_given
        amount = update.amount if update.amount is not None else delivery.get("amount", 0)
        payment_method = update.payment_method if update.payment_method is not None else delivery.get("payment_method")
        if payment_method == "cash" and amount is not None and update.amount_given is not None and update.amount_given < amount:
            raise HTTPException(status_code=400, detail="Il pagato con non può essere inferiore all'importo")
        if amount is not None:
            update_data["change_due"] = update.amount_given - amount
    if update.payment_collected is not None: update_data["payment_collected"] = update.payment_collected
    if update.scheduled_date is not None: update_data["scheduled_date"] = update.scheduled_date
    if update.scheduled_time is not None: update_data["scheduled_time"] = update.scheduled_time
    if update.priority is not None: update_data["priority"] = update.priority
    await db.deliveries.update_one({"delivery_id": delivery_id}, {"$set": update_data})
    if update.driver_id:
        await _attach_delivery_to_open_shift(update.driver_id, delivery_id)
        await manager.send_personal_message({"type": "new_delivery", "delivery_id": delivery_id}, update.driver_id, "driver")
        await create_notification_internal(update.driver_id, "driver", "Nuova consegna assegnata", f"Hai una nuova consegna per {delivery['customer_name']}", "delivery", {"delivery_id": delivery_id})
    return await db.deliveries.find_one({"delivery_id": delivery_id}, {"_id": 0})

@router.delete("/deliveries/{delivery_id}")
async def delete_delivery(delivery_id: str, user: dict = Depends(get_current_user)):
    result = await db.deliveries.delete_one({"delivery_id": delivery_id, "pharmacy_id": user["user_id"]})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Consegna non trovata")
    return {"message": "Consegna eliminata"}


# ============ PUBLIC TRACKING LINK (GDPR-minimized) ============
TRACKING_TTL_HOURS = 72


@router.post("/deliveries/{delivery_id}/share-link")
async def create_delivery_share_link(delivery_id: str, user: dict = Depends(get_current_user)):
    """Generate a public tracking token (72h TTL). Only the SHA-256 hash is stored."""
    delivery = await db.deliveries.find_one(
        {"delivery_id": delivery_id, "pharmacy_id": user["user_id"]}
    )
    if not delivery:
        raise HTTPException(status_code=404, detail="Consegna non trovata")
    if delivery.get("status") in ("delivered", "cancelled"):
        raise HTTPException(status_code=400, detail="Consegna già chiusa")

    token = secrets.token_urlsafe(16)
    token_hash = hashlib.sha256(token.encode()).hexdigest()
    expires_at = datetime.now(timezone.utc) + timedelta(hours=TRACKING_TTL_HOURS)
    await db.deliveries.update_one(
        {"delivery_id": delivery_id},
        {"$set": {
            "tracking_token_hash": token_hash,
            "tracking_expires_at": expires_at.isoformat(),
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }},
    )
    return {"token": token, "expires_at": expires_at.isoformat(), "expires_in_hours": TRACKING_TTL_HOURS}


@router.get("/public/tracking/{token}")
async def public_delivery_tracking(token: str):
    """Public, minimal tracking status. No auth, no PII beyond first name."""
    token_hash = hashlib.sha256(token.encode()).hexdigest()
    delivery = await db.deliveries.find_one({"tracking_token_hash": token_hash})
    if not delivery:
        raise HTTPException(status_code=404, detail="Link non valido")

    expires_at = delivery.get("tracking_expires_at")
    if expires_at:
        try:
            if datetime.fromisoformat(expires_at) < datetime.now(timezone.utc):
                raise HTTPException(status_code=410, detail="Link scaduto")
        except ValueError:
            pass

    pharmacy = await db.users.find_one(
        {"user_id": delivery.get("pharmacy_id")}, {"pharmacy_name": 1, "_id": 0}
    )
    first_name = (delivery.get("customer_name") or "").split(" ")[0] or "Cliente"
    return {
        "customer_first_name": first_name,
        "status": delivery.get("status"),
        "updated_at": delivery.get("updated_at"),
        "pharmacy_name": (pharmacy or {}).get("pharmacy_name") or "Farmacia",
        "has_pod": bool(delivery.get("pod_confirmed_at")),
    }
