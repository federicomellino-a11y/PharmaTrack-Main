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


@router.get("/reports")
async def get_reports(period: str = "month", user: dict = Depends(get_current_user)):
    pharmacy_id = user["user_id"]
    now = datetime.now(timezone.utc)
    if period == "week": start_date = now - timedelta(days=7)
    elif period == "year": start_date = now - timedelta(days=365)
    else: start_date = now - timedelta(days=30)
    deliveries = await db.deliveries.find({"pharmacy_id": pharmacy_id, "status": "delivered", "actual_delivery": {"$gte": start_date.isoformat()}}, {"_id": 0, "amount": 1, "customer_id": 1, "driver_id": 1, "payment_method": 1}).to_list(10000)
    total_revenue = sum(d.get("amount", 0) or 0 for d in deliveries)
    total_deliveries = len(deliveries)
    customer_counts = {}
    customer_revenue = {}
    for d in deliveries:
        cid = d.get("customer_id")
        if cid:
            customer_counts[cid] = customer_counts.get(cid, 0) + 1
            customer_revenue[cid] = customer_revenue.get(cid, 0) + (d.get("amount", 0) or 0)
    top_customer_ids = sorted(customer_counts.keys(), key=lambda x: customer_counts[x], reverse=True)[:5]
    top_customers = []
    for cid in top_customer_ids:
        customer = await db.customers.find_one({"customer_id": cid}, {"_id": 0, "name": 1})
        if customer:
            top_customers.append({"customer_id": cid, "name": customer["name"], "deliveries": customer_counts[cid], "revenue": customer_revenue[cid]})
    driver_counts = {}
    driver_revenue = {}
    for d in deliveries:
        did = d.get("driver_id")
        if did:
            driver_counts[did] = driver_counts.get(did, 0) + 1
            driver_revenue[did] = driver_revenue.get(did, 0) + (d.get("amount", 0) or 0)
    top_drivers = []
    for did in sorted(driver_counts.keys(), key=lambda x: driver_counts[x], reverse=True)[:5]:
        driver = await db.drivers.find_one({"driver_id": did}, {"_id": 0, "name": 1})
        if driver:
            top_drivers.append({"driver_id": did, "name": driver["name"], "deliveries": driver_counts[did], "revenue": driver_revenue.get(did, 0)})
    cash_count = sum(1 for d in deliveries if d.get("payment_method") == "cash")
    return {"period": period, "total_revenue": total_revenue, "total_deliveries": total_deliveries, "avg_order_value": total_revenue / total_deliveries if total_deliveries > 0 else 0, "top_customers": top_customers, "top_drivers": top_drivers, "payment_breakdown": {"cash": cash_count, "pos": total_deliveries - cash_count}}
