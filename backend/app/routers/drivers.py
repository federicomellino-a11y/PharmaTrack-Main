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


@router.get("/drivers")
async def get_drivers(user: dict = Depends(get_current_user)):
    drivers = await db.drivers.find({"pharmacy_id": user["user_id"]}, {"_id": 0, "password_hash": 0}).sort("name", 1).to_list(100)
    return drivers

@router.post("/drivers")
async def create_driver(driver: DriverCreate, user: dict = Depends(get_current_user)):
    existing = await db.drivers.find_one({"email": driver.email})
    if existing:
        raise HTTPException(status_code=400, detail="Email già in uso")
    password_hash = bcrypt.hashpw(driver.password.encode(), bcrypt.gensalt()).decode()
    driver_data = {
        "driver_id": f"drv_{uuid.uuid4().hex[:12]}",
        "pharmacy_id": user["user_id"],
        "name": driver.name, "phone": driver.phone, "email": driver.email,
        "password_hash": password_hash, "vehicle_type": driver.vehicle_type,
        "is_active": True, "current_lat": None, "current_lng": None,
        "last_location_update": None, "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.drivers.insert_one(driver_data)
    return {k: v for k, v in driver_data.items() if k not in ["_id", "password_hash"]}

@router.get("/drivers/{driver_id}")
async def get_driver(driver_id: str, user: dict = Depends(get_current_user)):
    driver = await db.drivers.find_one({"driver_id": driver_id, "pharmacy_id": user["user_id"]}, {"_id": 0, "password_hash": 0})
    if not driver:
        raise HTTPException(status_code=404, detail="Fattorino non trovato")
    return driver


@router.get("/drivers/{driver_id}/stats")
async def get_driver_stats(driver_id: str, user: dict = Depends(get_current_user)):
    """Statistiche aggregate di un fattorino (per la farmacia)."""
    driver = await db.drivers.find_one(
        {"driver_id": driver_id, "pharmacy_id": user["user_id"]}, {"_id": 0, "password_hash": 0}
    )
    if not driver:
        raise HTTPException(status_code=404, detail="Fattorino non trovato")

    deliveries = await db.deliveries.find(
        {"pharmacy_id": user["user_id"], "driver_id": driver_id}, {"_id": 0}
    ).to_list(5000)

    now = datetime.now(timezone.utc)
    today = now.date().isoformat()
    week_ago = (now - timedelta(days=7)).isoformat()
    month_ago = (now - timedelta(days=30)).isoformat()

    total_count = len(deliveries)
    delivered_count = sum(1 for d in deliveries if d.get("status") == "delivered")
    pending_confirm = sum(1 for d in deliveries if d.get("status") == "delivered_pending_confirmation")
    cancelled_count = sum(1 for d in deliveries if d.get("status") == "cancelled")
    active_count = sum(1 for d in deliveries if d.get("status") in ["assigned", "picked_up", "in_transit"])

    today_count = sum(1 for d in deliveries
                      if (d.get("actual_delivery") or d.get("updated_at") or "").startswith(today)
                      and d.get("status") in ["delivered", "delivered_pending_confirmation"])
    week_count = sum(1 for d in deliveries
                     if (d.get("actual_delivery") or d.get("updated_at") or "") >= week_ago
                     and d.get("status") in ["delivered", "delivered_pending_confirmation"])
    month_count = sum(1 for d in deliveries
                      if (d.get("actual_delivery") or d.get("updated_at") or "") >= month_ago
                      and d.get("status") in ["delivered", "delivered_pending_confirmation"])

    cash_total = sum(float(d.get("amount") or 0) for d in deliveries
                     if d.get("status") in ["delivered", "delivered_pending_confirmation"]
                     and d.get("payment_method") == "cash")
    pos_total = sum(float(d.get("amount") or 0) for d in deliveries
                    if d.get("status") in ["delivered", "delivered_pending_confirmation"]
                    and d.get("payment_method") == "pos")
    revenue_total = cash_total + pos_total

    # Tempo medio consegna (dal created_at al actual_delivery, in minuti)
    durations = []
    for d in deliveries:
        if d.get("status") != "delivered":
            continue
        try:
            created = datetime.fromisoformat(d["created_at"].replace("Z", "+00:00"))
            done = datetime.fromisoformat((d.get("actual_delivery") or d.get("updated_at")).replace("Z", "+00:00"))
            mins = (done - created).total_seconds() / 60.0
            if 0 < mins < 720:  # ignora outlier > 12h
                durations.append(mins)
        except Exception:
            continue
    avg_delivery_minutes = round(sum(durations) / len(durations), 1) if durations else None

    # Cliente più servito da questo fattorino
    customer_counts = {}
    for d in deliveries:
        if d.get("status") not in ["delivered", "delivered_pending_confirmation"]:
            continue
        cid = d.get("customer_id")
        if not cid:
            continue
        customer_counts[cid] = customer_counts.get(cid, 0) + 1
    top_customer = None
    if customer_counts:
        top_cid, top_n = max(customer_counts.items(), key=lambda x: x[1])
        top_c = await db.customers.find_one({"customer_id": top_cid, "pharmacy_id": user["user_id"]}, {"_id": 0, "name": 1, "phone": 1})
        if top_c:
            top_customer = {"name": top_c.get("name"), "phone": top_c.get("phone"), "count": top_n}

    # Numero turni effettuati e cassa media per turno
    shifts = await db.driver_shifts.find(
        {"driver_id": driver_id, "pharmacy_id": user["user_id"]}, {"_id": 0}
    ).to_list(500)
    total_shifts = len(shifts)
    settled_shifts = sum(1 for s in shifts if s.get("status") == "settled")

    last_delivery = None
    delivered_sorted = sorted(
        [d for d in deliveries if d.get("status") in ["delivered", "delivered_pending_confirmation"]],
        key=lambda d: d.get("actual_delivery") or d.get("updated_at") or "",
        reverse=True,
    )
    if delivered_sorted:
        last = delivered_sorted[0]
        last_delivery = {
            "delivery_id": last.get("delivery_id"),
            "customer_name": last.get("customer_name"),
            "amount": last.get("amount"),
            "when": last.get("actual_delivery") or last.get("updated_at"),
        }

    return {
        "driver": driver,
        "counters": {
            "total": total_count,
            "delivered": delivered_count,
            "pending_confirm": pending_confirm,
            "cancelled": cancelled_count,
            "active": active_count,
            "today": today_count,
            "week": week_count,
            "month": month_count,
        },
        "money": {
            "cash_total": round(cash_total, 2),
            "pos_total": round(pos_total, 2),
            "revenue_total": round(revenue_total, 2),
        },
        "avg_delivery_minutes": avg_delivery_minutes,
        "top_customer": top_customer,
        "shifts": {"total": total_shifts, "settled": settled_shifts, "pending": total_shifts - settled_shifts},
        "last_delivery": last_delivery,
    }


@router.put("/drivers/{driver_id}")
async def update_driver(driver_id: str, request: Request, user: dict = Depends(get_current_user)):
    body = await request.json()
    update_data = {f: body[f] for f in ["name", "phone", "vehicle_type", "is_active"] if f in body}
    if "password" in body and body["password"]:
        update_data["password_hash"] = bcrypt.hashpw(body["password"].encode(), bcrypt.gensalt()).decode()
    if update_data:
        result = await db.drivers.update_one({"driver_id": driver_id, "pharmacy_id": user["user_id"]}, {"$set": update_data})
        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="Fattorino non trovato")
    return await db.drivers.find_one({"driver_id": driver_id, "pharmacy_id": user["user_id"]}, {"_id": 0, "password_hash": 0})

@router.delete("/drivers/{driver_id}")
async def delete_driver(driver_id: str, user: dict = Depends(get_current_user)):
    result = await db.drivers.delete_one({"driver_id": driver_id, "pharmacy_id": user["user_id"]})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Fattorino non trovato")
    await db.deliveries.update_many(
        {"driver_id": driver_id, "pharmacy_id": user["user_id"], "status": {"$in": ["assigned", "picked_up", "in_transit"]}},
        {"$set": {"driver_id": None, "status": "pronta"}}
    )
    await db.driver_sessions.delete_many({"driver_id": driver_id})
    await db.push_subscriptions.delete_many({"user_id": driver_id, "user_type": "driver"})
    return {"message": "Fattorino eliminato"}
