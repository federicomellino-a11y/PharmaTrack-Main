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


@router.get("/useful-numbers")
async def get_useful_numbers(user: dict = Depends(get_current_user)):
    return await db.useful_numbers.find({"pharmacy_id": user["user_id"]}, {"_id": 0}).sort("category", 1).to_list(500)

@router.post("/useful-numbers")
async def create_useful_number(number: UsefulNumberCreate, user: dict = Depends(get_current_user)):
    number_data = {"number_id": f"num_{uuid.uuid4().hex[:12]}", "pharmacy_id": user["user_id"], **number.dict(), "created_at": datetime.now(timezone.utc).isoformat()}
    await db.useful_numbers.insert_one(number_data)
    return {k: v for k, v in number_data.items() if k != "_id"}

@router.delete("/useful-numbers/{number_id}")
async def delete_useful_number(number_id: str, user: dict = Depends(get_current_user)):
    result = await db.useful_numbers.delete_one({"number_id": number_id, "pharmacy_id": user["user_id"]})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Numero non trovato")
    return {"message": "Numero eliminato"}
