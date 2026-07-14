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


@router.get("/customers")
async def get_customers(user: dict = Depends(get_current_user)):
    customers = await db.customers.find({"pharmacy_id": user["user_id"]}, {"_id": 0}).sort("name", 1).to_list(1000)
    return customers

@router.post("/customers")
async def create_customer(customer: CustomerCreate, user: dict = Depends(get_current_user)):
    customer_data = {
        "customer_id": f"cust_{uuid.uuid4().hex[:12]}",
        "pharmacy_id": user["user_id"],
        "name": customer.name, "phone": customer.phone, "address": customer.address,
        "email": customer.email, "fiscal_code": customer.fiscal_code,
        "birth_date": customer.birth_date, "notes": customer.notes,
        "customer_lat": customer.customer_lat, "customer_lng": customer.customer_lng,
        "place_id": customer.place_id,
        "extra_phones": [p for p in (customer.extra_phones or []) if p and p.strip()],
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.customers.insert_one(customer_data)
    return {k: v for k, v in customer_data.items() if k != "_id"}

@router.get("/customers/{customer_id}")
async def get_customer(customer_id: str, user: dict = Depends(get_current_user)):
    customer = await db.customers.find_one({"customer_id": customer_id, "pharmacy_id": user["user_id"]}, {"_id": 0})
    if not customer:
        raise HTTPException(status_code=404, detail="Cliente non trovato")
    return customer

@router.put("/customers/{customer_id}")
async def update_customer(customer_id: str, request: Request, user: dict = Depends(get_current_user)):
    body = await request.json()
    update_data = {f: body[f] for f in ["name", "phone", "address", "email", "fiscal_code", "birth_date", "notes", "customer_lat", "customer_lng", "place_id", "extra_phones"] if f in body}
    if "extra_phones" in update_data:
        update_data["extra_phones"] = [p for p in (update_data["extra_phones"] or []) if p and str(p).strip()]
    if update_data:
        result = await db.customers.update_one({"customer_id": customer_id, "pharmacy_id": user["user_id"]}, {"$set": update_data})
        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="Cliente non trovato")
    return await db.customers.find_one({"customer_id": customer_id, "pharmacy_id": user["user_id"]}, {"_id": 0})

@router.get("/customers/{customer_id}/stats")
async def get_customer_stats(customer_id: str, user: dict = Depends(get_current_user)):
    customer = await db.customers.find_one({"customer_id": customer_id, "pharmacy_id": user["user_id"]}, {"_id": 0})
    if not customer:
        raise HTTPException(status_code=404, detail="Cliente non trovato")

    deliveries = await db.deliveries.find({"customer_id": customer_id, "pharmacy_id": user["user_id"]}, {"_id": 0}).sort("created_at", -1).to_list(1000)
    total_deliveries = len(deliveries)
    completed_deliveries = sum(1 for delivery in deliveries if delivery.get("status") == "delivered")
    cancelled_deliveries = sum(1 for delivery in deliveries if delivery.get("status") == "cancelled")
    active_deliveries = sum(1 for delivery in deliveries if delivery.get("status") in ["da_preparare", "pronta", "pending", "assigned", "picked_up", "in_transit", "delivered_pending_confirmation"])
    pending_deliveries = sum(1 for delivery in deliveries if delivery.get("status") in ["da_preparare", "pronta", "pending"])

    delivered_deliveries = [delivery for delivery in deliveries if delivery.get("status") == "delivered"]
    total_spent = sum((delivery.get("amount") or 0) for delivery in delivered_deliveries)
    average_order_value = round(total_spent / completed_deliveries, 2) if completed_deliveries else 0
    completion_rate = round((completed_deliveries / total_deliveries) * 100, 1) if total_deliveries else 0
    cancellation_rate = round((cancelled_deliveries / total_deliveries) * 100, 1) if total_deliveries else 0

    payment_breakdown = {
        "cash": {"count": 0, "total": 0},
        "pos": {"count": 0, "total": 0},
        "other": {"count": 0, "total": 0},
    }
    successful_delivery_dates = []

    for delivery in delivered_deliveries:
        payment_method = delivery.get("payment_method") if delivery.get("payment_method") in ["cash", "pos"] else "other"
        payment_breakdown[payment_method]["count"] += 1
        payment_breakdown[payment_method]["total"] += delivery.get("amount") or 0

        reference_date = delivery.get("actual_delivery") or delivery.get("updated_at") or delivery.get("created_at")
        if reference_date:
            try:
                successful_delivery_dates.append(datetime.fromisoformat(reference_date.replace("Z", "+00:00")))
            except ValueError:
                continue

    preferred_payment_method = None
    if any(data["count"] for data in payment_breakdown.values()):
        preferred_payment_method = max(payment_breakdown.items(), key=lambda item: item[1]["count"])[0]

    average_days_between_orders = None
    if len(successful_delivery_dates) >= 2:
        successful_delivery_dates.sort()
        intervals = [
            (successful_delivery_dates[index] - successful_delivery_dates[index - 1]).total_seconds() / 86400
            for index in range(1, len(successful_delivery_dates))
        ]
        average_days_between_orders = round(sum(intervals) / len(intervals), 1)

    now_utc = datetime.now(timezone.utc)
    delivered_this_month = sum(
        1
        for date_value in successful_delivery_dates
        if date_value.year == now_utc.year and date_value.month == now_utc.month
    )

    last_successful_delivery = max(successful_delivery_dates).isoformat() if successful_delivery_dates else None
    last_order_at = deliveries[0].get("created_at") if deliveries else None
    verified_address = customer.get("customer_lat") is not None and customer.get("customer_lng") is not None

    return {
        "customer": customer,
        "stats": {
            "total_deliveries": total_deliveries,
            "completed_deliveries": completed_deliveries,
            "cancelled_deliveries": cancelled_deliveries,
            "active_deliveries": active_deliveries,
            "pending_deliveries": pending_deliveries,
            "total_spent": total_spent,
            "average_order_value": average_order_value,
            "completion_rate": completion_rate,
            "cancellation_rate": cancellation_rate,
            "last_delivery": last_successful_delivery,
            "last_order_at": last_order_at,
            "delivered_this_month": delivered_this_month,
            "preferred_payment_method": preferred_payment_method,
            "average_days_between_orders": average_days_between_orders,
            "payment_breakdown": payment_breakdown,
            "verified_address": verified_address,
        },
        "recent_deliveries": deliveries[:10]
    }

@router.delete("/customers/{customer_id}")
async def delete_customer(customer_id: str, user: dict = Depends(get_current_user)):
    result = await db.customers.delete_one({"customer_id": customer_id, "pharmacy_id": user["user_id"]})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Cliente non trovato")
    await db.deliveries.delete_many({"customer_id": customer_id, "pharmacy_id": user["user_id"], "status": {"$in": ["delivered", "cancelled"]}})
    await db.deliveries.update_many({"customer_id": customer_id, "pharmacy_id": user["user_id"]}, {"$set": {"customer_name": "[Cliente eliminato]", "customer_id": None}})
    return {"message": "Cliente eliminato"}
