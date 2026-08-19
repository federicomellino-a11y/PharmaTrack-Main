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
from app.core.cache import cache_get, cache_set

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/statistics")
async def get_statistics(user: dict = Depends(get_current_user)):
    pharmacy_id = user["user_id"]
    cache_key = f"statistics:{pharmacy_id}"
    cached = await cache_get(cache_key)
    if cached is not None:
        return cached
    total_customers = await db.customers.count_documents({"pharmacy_id": pharmacy_id})
    total_drivers = await db.drivers.count_documents({"pharmacy_id": pharmacy_id})
    active_drivers = await db.drivers.count_documents({"pharmacy_id": pharmacy_id, "is_active": True})
    total_deliveries = await db.deliveries.count_documents({"pharmacy_id": pharmacy_id})
    pending_deliveries = await db.deliveries.count_documents({"pharmacy_id": pharmacy_id, "status": {"$in": ["da_preparare", "pronta", "pending"]}})
    active_deliveries = await db.deliveries.count_documents({"pharmacy_id": pharmacy_id, "status": {"$in": ["assigned", "picked_up", "in_transit"]}})
    completed_deliveries = await db.deliveries.count_documents({"pharmacy_id": pharmacy_id, "status": "delivered"})
    cancelled_deliveries = await db.deliveries.count_documents({"pharmacy_id": pharmacy_id, "status": "cancelled"})
    today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    today_deliveries = await db.deliveries.count_documents({"pharmacy_id": pharmacy_id, "created_at": {"$gte": today_start.isoformat()}})
    today_completed = await db.deliveries.count_documents({"pharmacy_id": pharmacy_id, "status": "delivered", "actual_delivery": {"$gte": today_start.isoformat()}})
    weekly_data = []
    for i in range(6, -1, -1):
        day = datetime.now(timezone.utc) - timedelta(days=i)
        day_start = day.replace(hour=0, minute=0, second=0, microsecond=0)
        day_end = day_start + timedelta(days=1)
        count = await db.deliveries.count_documents({"pharmacy_id": pharmacy_id, "created_at": {"$gte": day_start.isoformat(), "$lt": day_end.isoformat()}})
        completed = await db.deliveries.count_documents({"pharmacy_id": pharmacy_id, "status": "delivered", "actual_delivery": {"$gte": day_start.isoformat(), "$lt": day_end.isoformat()}})
        weekly_data.append({"date": day_start.strftime("%Y-%m-%d"), "day": day_start.strftime("%a"), "total": count, "completed": completed})
    result = {
        "customers": {"total": total_customers},
        "drivers": {"total": total_drivers, "active": active_drivers},
        "deliveries": {"total": total_deliveries, "pending": pending_deliveries, "active": active_deliveries, "completed": completed_deliveries, "cancelled": cancelled_deliveries, "today": today_deliveries, "today_completed": today_completed},
        "weekly": weekly_data,
        "priority": {}
    }
    await cache_set(cache_key, result)
    return result
