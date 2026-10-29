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


EDIT_WINDOW_HOURS = 24


def _parse_iso(value):
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except Exception:
        return None


def _is_within_edit_window(message: dict) -> bool:
    created = _parse_iso(message.get("created_at"))
    if not created:
        return True
    if created.tzinfo is None:
        created = created.replace(tzinfo=timezone.utc)
    return (datetime.now(timezone.utc) - created) <= timedelta(hours=EDIT_WINDOW_HOURS)


async def _sync_thread_preview(message: dict, content: str) -> None:
    conversation_id = message.get("conversation_id")
    if not conversation_id:
        return
    last = await db.messages.find_one(
        {"conversation_id": conversation_id, "is_deleted": {"$ne": True}},
        {"_id": 0, "message_id": 1},
        sort=[("created_at", -1)],
    )
    if last and last.get("message_id") == message.get("message_id"):
        await db.chat_threads.update_one(
            {"conversation_id": conversation_id}, {"$set": {"last_message": content}}
        )


async def _apply_edit(message: dict, content: str) -> dict:
    now = datetime.now(timezone.utc).isoformat()
    await db.messages.update_one(
        {"message_id": message["message_id"]},
        {"$set": {"content": content, "edited_at": now}},
    )
    await _sync_thread_preview(message, content)
    updated = {**message, "content": content, "edited_at": now}
    updated.pop("_id", None)
    target = ("driver", message["driver_id"]) if message.get("sender_type") == "pharmacy" else ("pharmacy", message["pharmacy_id"])
    await manager.send_personal_message({"type": "message_updated", "message": updated}, target[1], target[0])
    return updated


async def _apply_delete(message: dict) -> dict:
    now = datetime.now(timezone.utc).isoformat()
    await db.messages.update_one(
        {"message_id": message["message_id"]},
        {"$set": {"is_deleted": True, "content": "", "deleted_at": now}},
    )
    await _sync_thread_preview(message, "")
    updated = {**message, "content": "", "is_deleted": True, "deleted_at": now}
    updated.pop("_id", None)
    target = ("driver", message["driver_id"]) if message.get("sender_type") == "pharmacy" else ("pharmacy", message["pharmacy_id"])
    await manager.send_personal_message({"type": "message_updated", "message": updated}, target[1], target[0])
    return updated


async def _load_message_for_actor(message_id: str, actor_type: str, actor: dict) -> dict:
    query = {"message_id": message_id}
    if actor_type == "pharmacy":
        query["pharmacy_id"] = actor["user_id"]
    else:
        query["driver_id"] = actor["driver_id"]
    message = await db.messages.find_one(query, {"_id": 0})
    if not message:
        raise HTTPException(status_code=404, detail="Messaggio non trovato")
    if message.get("is_deleted"):
        raise HTTPException(status_code=400, detail="Messaggio eliminato")
    if message.get("sender_type") != actor_type:
        raise HTTPException(status_code=403, detail="Puoi modificare solo i tuoi messaggi")
    if not _is_within_edit_window(message):
        raise HTTPException(status_code=403, detail=f"Modificabile solo entro {EDIT_WINDOW_HOURS} ore")
    return message


async def _read_content(request: Request) -> str:
    try:
        body = await request.json()
    except Exception:
        body = {}
    content = (body.get("content") or "").strip()
    if not content:
        raise HTTPException(status_code=400, detail="Il messaggio non può essere vuoto")
    if len(content) > 4000:
        raise HTTPException(status_code=400, detail="Messaggio troppo lungo")
    return content



async def _open_thread(pharmacy_id: str, driver_id: str) -> dict:
    """Chat aperta per la coppia farmacia/fattorino, creata se non esiste."""
    thread = await db.chat_threads.find_one(
        {"pharmacy_id": pharmacy_id, "driver_id": driver_id, "status": "open"},
        {"_id": 0}, sort=[("created_at", -1)],
    )
    if thread:
        return thread
    count = await db.chat_threads.count_documents({"pharmacy_id": pharmacy_id, "driver_id": driver_id})
    now = datetime.now(timezone.utc).isoformat()
    thread = {
        "conversation_id": f"chat_{uuid.uuid4().hex[:12]}",
        "pharmacy_id": pharmacy_id, "driver_id": driver_id,
        "number": count + 1, "title": None, "status": "open",
        "created_at": now, "last_message_at": None, "last_message": None,
    }
    await db.chat_threads.insert_one(dict(thread))
    # i messaggi storici senza thread appartengono alla prima chat
    if count == 0:
        await db.messages.update_many(
            {"pharmacy_id": pharmacy_id, "driver_id": driver_id, "conversation_id": {"$exists": False}},
            {"$set": {"conversation_id": thread["conversation_id"]}},
        )
    return thread


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

@router.get("/messages/{driver_id}/history")
async def get_chat_history(driver_id: str, user: dict = Depends(get_current_user)):
    threads = await db.chat_threads.find(
        {"pharmacy_id": user["user_id"], "driver_id": driver_id}, {"_id": 0}
    ).sort("created_at", -1).to_list(100)
    return threads


@router.post("/messages/{driver_id}/new-chat")
async def open_new_chat(driver_id: str, user: dict = Depends(get_current_user)):
    """Chiude la chat attiva e ne apre una nuova (stesso fattorino)."""
    driver = await db.drivers.find_one({"driver_id": driver_id, "pharmacy_id": user["user_id"]}, {"_id": 0, "driver_id": 1})
    if not driver:
        raise HTTPException(status_code=404, detail="Fattorino non trovato")
    now = datetime.now(timezone.utc).isoformat()
    await db.chat_threads.update_many(
        {"pharmacy_id": user["user_id"], "driver_id": driver_id, "status": "open"},
        {"$set": {"status": "closed", "closed_at": now}},
    )
    thread = await _open_thread(user["user_id"], driver_id)
    return thread


@router.put("/messages/{driver_id}/close-chat")
async def close_chat(driver_id: str, user: dict = Depends(get_current_user)):
    """Chiude la chat attiva: il prossimo messaggio ne apre una nuova."""
    now = datetime.now(timezone.utc).isoformat()
    result = await db.chat_threads.update_many(
        {"pharmacy_id": user["user_id"], "driver_id": driver_id, "status": "open"},
        {"$set": {"status": "closed", "closed_at": now}},
    )
    return {"closed": result.modified_count}


@router.get("/messages/{driver_id}")
async def get_messages(driver_id: str, user: dict = Depends(get_current_user)):
    thread = await _open_thread(user["user_id"], driver_id)
    messages = await db.messages.find(
        {"pharmacy_id": user["user_id"], "driver_id": driver_id, "conversation_id": thread["conversation_id"]},
        {"_id": 0},
    ).sort("created_at", 1).to_list(500)
    await db.messages.update_many(
        {"pharmacy_id": user["user_id"], "driver_id": driver_id, "sender_type": "driver", "is_read": False},
        {"$set": {"is_read": True}},
    )
    return messages

@router.post("/messages")
async def send_message(message: MessageCreate, user: dict = Depends(get_current_user)):
    driver = await db.drivers.find_one({"driver_id": message.driver_id, "pharmacy_id": user["user_id"]}, {"_id": 0})
    if not driver:
        raise HTTPException(status_code=404, detail="Fattorino non trovato")
    thread = await _open_thread(user["user_id"], message.driver_id)
    message_data = {
        "message_id": f"msg_{uuid.uuid4().hex[:12]}",
        "pharmacy_id": user["user_id"], "driver_id": message.driver_id,
        "conversation_id": thread["conversation_id"],
        "sender_type": "pharmacy", "sender_id": user["user_id"],
        "content": message.content, "is_read": False,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.messages.insert_one(dict(message_data))
    await db.chat_threads.update_one(
        {"conversation_id": thread["conversation_id"]},
        {"$set": {"last_message_at": message_data["created_at"], "last_message": message_data["content"]}},
    )
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
    thread = await _open_thread(driver["pharmacy_id"], driver["driver_id"])
    messages = await db.messages.find(
        {"driver_id": driver["driver_id"], "conversation_id": thread["conversation_id"]}, {"_id": 0}
    ).sort("created_at", 1).to_list(500)
    await db.messages.update_many({"driver_id": driver["driver_id"], "sender_type": "pharmacy"}, {"$set": {"is_read": True}})
    return messages

@router.post("/driver/messages")
async def send_driver_message(request: Request, driver: dict = Depends(get_current_driver)):
    body = await request.json()
    content = body.get("content")
    if not content:
        raise HTTPException(status_code=400, detail="Content required")
    thread = await _open_thread(driver["pharmacy_id"], driver["driver_id"])
    message_data = {
        "message_id": f"msg_{uuid.uuid4().hex[:12]}",
        "pharmacy_id": driver["pharmacy_id"], "driver_id": driver["driver_id"],
        "conversation_id": thread["conversation_id"],
        "sender_type": "driver", "sender_id": driver["driver_id"],
        "content": content, "is_read": False,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.messages.insert_one(dict(message_data))
    await db.chat_threads.update_one(
        {"conversation_id": thread["conversation_id"]},
        {"$set": {"last_message_at": message_data["created_at"], "last_message": content}},
    )
    await manager.send_personal_message({"type": "new_message", "message": {k: v for k, v in message_data.items() if k != "_id"}}, driver["pharmacy_id"], "pharmacy")
    return {k: v for k, v in message_data.items() if k != "_id"}


@router.put("/messages/{message_id}")
async def edit_message(message_id: str, request: Request, user: dict = Depends(get_current_user)):
    content = await _read_content(request)
    message = await _load_message_for_actor(message_id, "pharmacy", user)
    return await _apply_edit(message, content)


@router.delete("/messages/{message_id}")
async def delete_message(message_id: str, user: dict = Depends(get_current_user)):
    message = await _load_message_for_actor(message_id, "pharmacy", user)
    return await _apply_delete(message)


@router.put("/driver/messages/{message_id}")
async def edit_driver_message(message_id: str, request: Request, driver: dict = Depends(get_current_driver)):
    content = await _read_content(request)
    message = await _load_message_for_actor(message_id, "driver", driver)
    return await _apply_edit(message, content)


@router.delete("/driver/messages/{message_id}")
async def delete_driver_message(message_id: str, driver: dict = Depends(get_current_driver)):
    message = await _load_message_for_actor(message_id, "driver", driver)
    return await _apply_delete(message)
