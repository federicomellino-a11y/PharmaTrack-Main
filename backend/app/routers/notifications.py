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


@router.post("/push/subscribe")
async def subscribe_push_notifications(request: Request, user: dict = Depends(get_current_user)):
    body = await request.json()
    return await upsert_push_subscription(user["user_id"], "pharmacy", body, request)


@router.delete("/push/subscribe")
async def unsubscribe_push_notifications(request: Request, user: dict = Depends(get_current_user)):
    body = await request.json() if request.headers.get("content-length") not in [None, "0"] else {}
    return await remove_push_subscription(user["user_id"], "pharmacy", body)


@router.get("/notifications")
async def get_notifications(user: dict = Depends(get_current_user)):
    return await db.notifications.find({"user_id": user["user_id"], "user_type": "pharmacy"}, {"_id": 0}).sort("created_at", -1).to_list(100)

@router.put("/notifications/{notification_id}/read")
async def mark_notification_read(notification_id: str, user: dict = Depends(get_current_user)):
    await db.notifications.update_one({"notification_id": notification_id, "user_id": user["user_id"]}, {"$set": {"is_read": True}})
    return {"status": "ok"}

@router.delete("/notifications/{notification_id}")
async def delete_notification(notification_id: str, user: dict = Depends(get_current_user)):
    result = await db.notifications.delete_one({"notification_id": notification_id, "user_id": user["user_id"], "user_type": "pharmacy"})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Notifica non trovata")
    return {"status": "deleted"}

@router.put("/notifications/read-all")
async def mark_all_notifications_read(user: dict = Depends(get_current_user)):
    await db.notifications.update_many({"user_id": user["user_id"], "user_type": "pharmacy"}, {"$set": {"is_read": True}})
    return {"status": "ok"}


@router.post("/notifications/test")
async def send_test_notification(user: dict = Depends(get_current_user)):
    notification = await create_notification_internal(
        user["user_id"],
        "pharmacy",
        "Test notifiche PharmaTrack",
        "Questa è una notifica di prova inviata dal server.",
        "system",
        {"url": "/settings"},
    )
    return {"status": "queued", "notification_id": notification["notification_id"]}


@router.post("/driver/push/subscribe")
async def subscribe_driver_push_notifications(request: Request, driver: dict = Depends(get_current_driver)):
    body = await request.json()
    return await upsert_push_subscription(driver["driver_id"], "driver", body, request)


@router.delete("/driver/push/subscribe")
async def unsubscribe_driver_push_notifications(request: Request, driver: dict = Depends(get_current_driver)):
    body = await request.json() if request.headers.get("content-length") not in [None, "0"] else {}
    return await remove_push_subscription(driver["driver_id"], "driver", body)


@router.get("/driver/notifications")
async def get_driver_notifications(driver: dict = Depends(get_current_driver)):
    return await db.notifications.find({"user_id": driver["driver_id"], "user_type": "driver"}, {"_id": 0}).sort("created_at", -1).to_list(100)

@router.put("/driver/notifications/{notification_id}/read")
async def mark_driver_notification_read(notification_id: str, driver: dict = Depends(get_current_driver)):
    await db.notifications.update_one(
        {"notification_id": notification_id, "user_id": driver["driver_id"], "user_type": "driver"},
        {"$set": {"is_read": True}}
    )
    return {"status": "ok"}

@router.put("/driver/notifications/read-all")
async def mark_all_driver_notifications_read(driver: dict = Depends(get_current_driver)):
    await db.notifications.update_many(
        {"user_id": driver["driver_id"], "user_type": "driver"},
        {"$set": {"is_read": True}}
    )
    return {"status": "ok"}

@router.delete("/driver/notifications/{notification_id}")
async def delete_driver_notification(notification_id: str, driver: dict = Depends(get_current_driver)):
    result = await db.notifications.delete_one({"notification_id": notification_id, "user_id": driver["driver_id"], "user_type": "driver"})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Notifica non trovata")
    return {"status": "deleted"}


@router.post("/driver/notifications/test")
async def send_driver_test_notification(driver: dict = Depends(get_current_driver)):
    notification = await create_notification_internal(
        driver["driver_id"],
        "driver",
        "Test notifiche PharmaTrack",
        "Questa è una notifica di prova inviata dal server.",
        "system",
        {"url": "/driver"},
    )
    return {"status": "queued", "notification_id": notification["notification_id"]}
