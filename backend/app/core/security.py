import logging
from datetime import datetime, timezone
from typing import Optional
from fastapi import HTTPException, Request, Response

from app.core.database import db
from app.core.config import ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_NAME

logger = logging.getLogger(__name__)


async def normalize_session_expiry(collection, session: dict) -> Optional[datetime]:
    expires_at = session.get("expires_at")

    if isinstance(expires_at, str):
        try:
            expires_at = datetime.fromisoformat(expires_at)
        except ValueError:
            await collection.delete_one({"session_token": session.get("session_token")})
            return None
        await collection.update_one(
            {"session_token": session.get("session_token")},
            {"$set": {"expires_at": expires_at}}
        )

    if not isinstance(expires_at, datetime):
        await collection.delete_one({"session_token": session.get("session_token")})
        return None

    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
        await collection.update_one(
            {"session_token": session.get("session_token")},
            {"$set": {"expires_at": expires_at}}
        )

    if expires_at < datetime.now(timezone.utc):
        await collection.delete_one({"session_token": session.get("session_token")})
        return None

    return expires_at


def clear_cookie_variants(response: Response, key: str):
    cookie_variants = [
        {"path": "/", "secure": True, "samesite": "none", "httponly": True},
        {"path": "/", "secure": False, "samesite": "lax", "httponly": True},
        {"path": "/", "secure": False, "samesite": "none", "httponly": True},
        {"path": "/", "secure": True, "samesite": "lax", "httponly": True},
        {"path": "/", "httponly": True},
    ]

    seen = set()
    for variant in cookie_variants:
        signature = tuple(sorted(variant.items()))
        if signature in seen:
            continue
        seen.add(signature)
        response.delete_cookie(key, **variant)


async def delete_pharmacy_account_data(user_id: str):
    driver_ids = await db.drivers.distinct("driver_id", {"pharmacy_id": user_id})
    await db.notifications.delete_many({"$or": [{"user_id": user_id}, {"user_id": {"$in": driver_ids}}]})
    await db.messages.delete_many({"pharmacy_id": user_id})
    await db.driver_sessions.delete_many({"driver_id": {"$in": driver_ids}})
    await db.push_subscriptions.delete_many({"$or": [{"user_id": user_id, "user_type": "pharmacy"}, {"user_id": {"$in": driver_ids}, "user_type": "driver"}]})
    await db.drivers.delete_many({"pharmacy_id": user_id})
    await db.deliveries.delete_many({"pharmacy_id": user_id})
    await db.customers.delete_many({"pharmacy_id": user_id})
    await db.notes.delete_many({"pharmacy_id": user_id})
    await db.doctors_list.delete_many({"pharmacy_id": user_id})
    await db.useful_numbers.delete_many({"pharmacy_id": user_id})
    await db.user_sessions.delete_many({"user_id": user_id})
    await db.users.delete_one({"user_id": user_id})


# ============ AUTH HELPERS ============

async def get_current_user(request: Request) -> dict:
    session_token = request.cookies.get("session_token")
    if not session_token:
        auth_header = request.headers.get("Authorization")
        if auth_header and auth_header.startswith("Bearer "):
            session_token = auth_header.split(" ")[1]
    if not session_token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    session = await db.user_sessions.find_one({"session_token": session_token}, {"_id": 0})
    if not session:
        raise HTTPException(status_code=401, detail="Invalid session")
    expires_at = await normalize_session_expiry(db.user_sessions, session)
    if not expires_at:
        raise HTTPException(status_code=401, detail="Session expired")
    user = await db.users.find_one({"user_id": session["user_id"]}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    if user.get("is_active", True) is False:
        await db.user_sessions.delete_many({"user_id": user["user_id"]})
        raise HTTPException(status_code=403, detail="Account disattivato")
    return user

async def get_current_driver(request: Request) -> dict:
    session_token = request.cookies.get("driver_session_token")
    if not session_token:
        auth_header = request.headers.get("Authorization")
        if auth_header and auth_header.startswith("Bearer "):
            session_token = auth_header.split(" ")[1]
    if not session_token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    session = await db.driver_sessions.find_one({"session_token": session_token}, {"_id": 0})
    if not session:
        raise HTTPException(status_code=401, detail="Invalid session")
    expires_at = await normalize_session_expiry(db.driver_sessions, session)
    if not expires_at:
        raise HTTPException(status_code=401, detail="Session expired")
    driver = await db.drivers.find_one({"driver_id": session["driver_id"]}, {"_id": 0})
    if not driver:
        raise HTTPException(status_code=401, detail="Driver not found")
    if not driver.get("is_active", True):
        await db.driver_sessions.delete_many({"driver_id": driver["driver_id"]})
        raise HTTPException(status_code=403, detail="Account fattorino disattivato")

    pharmacy = await db.users.find_one({"user_id": driver.get("pharmacy_id")}, {"_id": 0, "user_id": 1, "is_active": 1})
    if not pharmacy or pharmacy.get("is_active", True) is False:
        await db.driver_sessions.delete_many({"driver_id": driver["driver_id"]})
        raise HTTPException(status_code=403, detail="Farmacia associata disattivata")
    return driver

async def get_current_admin(request: Request) -> dict:
    if not ADMIN_EMAIL or not ADMIN_PASSWORD:
        raise HTTPException(status_code=503, detail="Super amministratore non configurato")

    session_token = request.cookies.get("admin_session_token")
    if not session_token:
        raise HTTPException(status_code=401, detail="Not authenticated")

    session = await db.admin_sessions.find_one({"session_token": session_token}, {"_id": 0})
    if not session:
        raise HTTPException(status_code=401, detail="Invalid session")

    expires_at = await normalize_session_expiry(db.admin_sessions, session)
    if not expires_at or session.get("email") != ADMIN_EMAIL:
        raise HTTPException(status_code=401, detail="Session expired")

    return {"email": ADMIN_EMAIL, "name": ADMIN_NAME}
