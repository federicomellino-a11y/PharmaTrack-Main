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


@router.get("/notes")
async def get_notes(user: dict = Depends(get_current_user)):
    return await db.notes.find({"pharmacy_id": user["user_id"]}, {"_id": 0}).sort([("pinned", -1), ("updated_at", -1)]).to_list(500)

@router.post("/notes")
async def create_note(note: NoteCreate, user: dict = Depends(get_current_user)):
    note_data = {"note_id": f"note_{uuid.uuid4().hex[:12]}", "pharmacy_id": user["user_id"], **note.dict(), "created_at": datetime.now(timezone.utc).isoformat(), "updated_at": datetime.now(timezone.utc).isoformat()}
    await db.notes.insert_one(note_data)
    return {k: v for k, v in note_data.items() if k != "_id"}

@router.put("/notes/{note_id}")
async def update_note(note_id: str, request: Request, user: dict = Depends(get_current_user)):
    body = await request.json()
    body["updated_at"] = datetime.now(timezone.utc).isoformat()
    result = await db.notes.update_one({"note_id": note_id, "pharmacy_id": user["user_id"]}, {"$set": body})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Nota non trovata")
    return await db.notes.find_one({"note_id": note_id}, {"_id": 0})

@router.delete("/notes/{note_id}")
async def delete_note(note_id: str, user: dict = Depends(get_current_user)):
    result = await db.notes.delete_one({"note_id": note_id, "pharmacy_id": user["user_id"]})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Nota non trovata")
    return {"message": "Nota eliminata"}
