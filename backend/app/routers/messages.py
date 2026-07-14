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


@router.get("/messages/conversations")
async def get_message_conversations(user: dict = Depends(get_current_user)):
    drivers = await db.drivers.find({"pharmacy_id": user["user_id"]}, {"_id": 0, "password_hash": 0}).sort("name", 1).to_list(200)
    messages = await db.messages.find({"pharmacy_id": user["user_id"]}, {"_id": 0}).sort("created_at", -1).to_list(2000)

    conversation_map = {}
    for message in messages:
        conversation = conversation_map.setdefault(message["driver_id"], {
            "last_message": None,
            "last_message_at": None,
            "last_sender_type": None,
            "unread_count": 0,
        })
        if not conversation["last_message_at"]:
            conversation["last_message"] = message.get("content")
            conversation["last_message_at"] = message.get("created_at")
            conversation["last_sender_type"] = message.get("sender_type")
        if message.get("sender_type") == "driver" and not message.get("is_read"):
            conversation["unread_count"] += 1

    conversations = []
    for driver in drivers:
        summary = conversation_map.get(driver["driver_id"], {})
        conversations.append({
            "driver_id": driver["driver_id"],
            "driver_name": driver.get("name"),
            "driver_phone": driver.get("phone"),
            "vehicle_type": driver.get("vehicle_type"),
            "is_active": driver.get("is_active", False),
            "last_message": summary.get("last_message"),
            "last_message_at": summary.get("last_message_at"),
            "last_sender_type": summary.get("last_sender_type"),
            "unread_count": summary.get("unread_count", 0),
        })

    conversations.sort(key=lambda item: (item.get("driver_name") or "").lower())
    conversations.sort(key=lambda item: item.get("last_message_at") or "", reverse=True)
    return conversations

@router.put("/messages/{driver_id}/read")
async def mark_messages_read(driver_id: str, user: dict = Depends(get_current_user)):
    result = await db.messages.update_many(
        {"pharmacy_id": user["user_id"], "driver_id": driver_id, "sender_type": "driver", "is_read": False},
        {"$set": {"is_read": True}}
    )
    return {"updated": result.modified_count}

@router.get("/messages/{driver_id}")
async def get_messages(driver_id: str, user: dict = Depends(get_current_user)):
    messages = await db.messages.find({"pharmacy_id": user["user_id"], "driver_id": driver_id}, {"_id": 0}).sort("created_at", 1).to_list(500)
    await db.messages.update_many({"pharmacy_id": user["user_id"], "driver_id": driver_id, "sender_type": "driver"}, {"$set": {"is_read": True}})
    return messages

@router.post("/messages")
async def send_message(message: MessageCreate, user: dict = Depends(get_current_user)):
    driver = await db.drivers.find_one({"driver_id": message.driver_id, "pharmacy_id": user["user_id"]}, {"_id": 0})
    if not driver:
        raise HTTPException(status_code=404, detail="Fattorino non trovato")
    message_data = {
        "message_id": f"msg_{uuid.uuid4().hex[:12]}",
        "pharmacy_id": user["user_id"], "driver_id": message.driver_id,
        "sender_type": "pharmacy", "sender_id": user["user_id"],
        "content": message.content, "is_read": False,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.messages.insert_one(message_data)
    await manager.send_personal_message({"type": "new_message", "message": {k: v for k, v in message_data.items() if k != "_id"}}, message.driver_id, "driver")
    return {k: v for k, v in message_data.items() if k != "_id"}

@router.put("/driver/messages/read")
async def mark_driver_messages_read(driver: dict = Depends(get_current_driver)):
    result = await db.messages.update_many(
        {"driver_id": driver["driver_id"], "sender_type": "pharmacy", "is_read": False},
        {"$set": {"is_read": True}}
    )
    return {"updated": result.modified_count}

@router.get("/driver/messages")
async def get_driver_messages(driver: dict = Depends(get_current_driver)):
    messages = await db.messages.find({"driver_id": driver["driver_id"]}, {"_id": 0}).sort("created_at", 1).to_list(500)
    await db.messages.update_many({"driver_id": driver["driver_id"], "sender_type": "pharmacy"}, {"$set": {"is_read": True}})
    return messages

@router.post("/driver/messages")
async def send_driver_message(request: Request, driver: dict = Depends(get_current_driver)):
    body = await request.json()
    content = body.get("content")
    if not content:
        raise HTTPException(status_code=400, detail="Content required")
    message_data = {
        "message_id": f"msg_{uuid.uuid4().hex[:12]}",
        "pharmacy_id": driver["pharmacy_id"], "driver_id": driver["driver_id"],
        "sender_type": "driver", "sender_id": driver["driver_id"],
        "content": content, "is_read": False,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.messages.insert_one(message_data)
    await manager.send_personal_message({"type": "new_message", "message": {k: v for k, v in message_data.items() if k != "_id"}}, driver["pharmacy_id"], "pharmacy")
    return {k: v for k, v in message_data.items() if k != "_id"}
