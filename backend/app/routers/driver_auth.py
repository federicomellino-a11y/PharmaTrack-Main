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

from app.core.limiter import limiter

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/driver/login")
@limiter.limit("10/minute")
async def driver_login(request: Request, response: Response):
    body = await request.json()
    email = body.get("email")
    password = body.get("password")
    if not email or not password:
        raise HTTPException(status_code=400, detail="Email e password richiesti")
    # Recupera solo i campi necessari, password_hash incluso per il check
    driver = await db.drivers.find_one({"email": email}, {"_id": 0})
    if not driver:
        raise HTTPException(status_code=401, detail="Credenziali non valide")
    if not bcrypt.checkpw(password.encode(), driver["password_hash"].encode()):
        raise HTTPException(status_code=401, detail="Credenziali non valide")
    if not driver.get("is_active", True):
        raise HTTPException(status_code=403, detail="Account disattivato")

    pharmacy = await db.users.find_one({"user_id": driver.get("pharmacy_id")}, {"_id": 0, "user_id": 1, "is_active": 1})
    if not pharmacy or pharmacy.get("is_active", True) is False:
        raise HTTPException(status_code=403, detail="Farmacia associata disattivata")
    
    session_token = f"drv_sess_{uuid.uuid4().hex}"
    expires_at = datetime.now(timezone.utc) + timedelta(days=7)
    await db.driver_sessions.delete_many({"driver_id": driver["driver_id"]})
    await db.driver_sessions.insert_one({
        "driver_id": driver["driver_id"],
        "session_token": session_token,
        "expires_at": expires_at,
        "created_at": datetime.now(timezone.utc).isoformat()
    })
    response.set_cookie(key="driver_session_token", value=session_token, httponly=True,
                        secure=True, samesite="none", path="/", max_age=7*24*60*60)
    return {k: v for k, v in driver.items() if k not in ["_id", "password_hash"]}

@router.get("/driver/me")
async def get_driver_me(driver: dict = Depends(get_current_driver)):
    return {k: v for k, v in driver.items() if k != "password_hash"}

@router.post("/driver/logout")
async def driver_logout(request: Request, response: Response):
    session_token = request.cookies.get("driver_session_token")
    if session_token:
        await db.driver_sessions.delete_many({"session_token": session_token})
    clear_cookie_variants(response, "driver_session_token")
    return {"message": "Logged out"}

@router.put("/driver/location")
async def update_driver_location(request: Request, driver: dict = Depends(get_current_driver)):
    body = await request.json()
    lat = body.get("lat")
    lng = body.get("lng")
    if lat is None or lng is None:
        raise HTTPException(status_code=400, detail="Lat and lng required")
    await db.drivers.update_one(
        {"driver_id": driver["driver_id"]},
        {"$set": {"current_lat": lat, "current_lng": lng, "last_location_update": datetime.now(timezone.utc).isoformat()}}
    )
    await manager.send_personal_message(
        {"type": "driver_location", "driver_id": driver["driver_id"], "lat": lat, "lng": lng},
        driver["pharmacy_id"], "pharmacy"
    )
    return {"status": "ok"}
