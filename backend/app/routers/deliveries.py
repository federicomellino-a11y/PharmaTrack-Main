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
    return await db.deliveries.find(query, {"_id": 0}).sort("created_at", -1).to_list(500)

@router.post("/deliveries")
async def create_delivery(delivery: DeliveryCreate, user: dict = Depends(get_current_user)):
    customer = await db.customers.find_one({"customer_id": delivery.customer_id, "pharmacy_id": user["user_id"]}, {"_id": 0})
    if not customer:
        raise HTTPException(status_code=404, detail="Cliente non trovato")

    if delivery.payment_method == "cash" and delivery.amount is not None and delivery.amount_given is not None and delivery.amount_given < delivery.amount:
        raise HTTPException(status_code=400, detail="Il pagato con non può essere inferiore all'importo")

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
        "status": "assigned" if assigned_driver else "da_preparare",
        "payment_method": delivery.payment_method, "amount": delivery.amount,
        "amount_given": delivery.amount_given, "change_due": change_due, "payment_collected": False,
        "scheduled_date": delivery.scheduled_date, "scheduled_time": delivery.scheduled_time,
        "priority": delivery.priority,
        "estimated_delivery": None, "actual_delivery": None,
        "created_at": datetime.now(timezone.utc).isoformat(), "updated_at": datetime.now(timezone.utc).isoformat(),
        "auto_assigned": bool(assigned_driver and not delivery.driver_id),
    }
    await db.deliveries.insert_one(delivery_data)
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
