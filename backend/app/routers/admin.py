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


@router.post("/admin/login")
@limiter.limit("10/minute")
async def admin_login(request: Request, data: AdminLogin, response: Response):
    if not ADMIN_EMAIL or not ADMIN_PASSWORD:
        raise HTTPException(status_code=503, detail="Super amministratore non configurato")
    if data.email != ADMIN_EMAIL or data.password != ADMIN_PASSWORD:
        raise HTTPException(status_code=401, detail="Credenziali admin non valide")

    session_token = f"adm_sess_{uuid.uuid4().hex}"
    expires_at = datetime.now(timezone.utc) + timedelta(days=7)
    await db.admin_sessions.delete_many({"email": ADMIN_EMAIL})
    await db.admin_sessions.insert_one({
        "email": ADMIN_EMAIL,
        "session_token": session_token,
        "expires_at": expires_at,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    response.set_cookie(key="admin_session_token", value=session_token, httponly=True, secure=True, samesite="none", path="/", max_age=7*24*60*60)
    return {"email": ADMIN_EMAIL, "name": ADMIN_NAME}

@router.get("/admin/me")
async def admin_me(admin: dict = Depends(get_current_admin)):
    return admin

@router.post("/admin/logout")
async def admin_logout(request: Request, response: Response):
    session_token = request.cookies.get("admin_session_token")
    if session_token:
        await db.admin_sessions.delete_many({"session_token": session_token})
    clear_cookie_variants(response, "admin_session_token")
    return {"message": "Logged out"}

@router.get("/admin/overview")
async def admin_overview(admin: dict = Depends(get_current_admin)):
    latest_users = await db.users.find({}, {"_id": 0, "password_hash": 0}).sort("created_at", -1).limit(8).to_list(8)
    return {
        "admin": admin,
        "summary": {
            "users": await db.users.count_documents({}),
            "drivers": await db.drivers.count_documents({}),
            "customers": await db.customers.count_documents({}),
            "deliveries": await db.deliveries.count_documents({}),
            "active_sessions": await db.user_sessions.count_documents({}) + await db.driver_sessions.count_documents({}),
        },
        "latest_users": latest_users,
    }

@router.get("/admin/users")
async def admin_users(admin: dict = Depends(get_current_admin)):
    users = await db.users.find({}, {"_id": 0, "password_hash": 0}).sort("created_at", -1).to_list(500)
    enriched_users = []
    for item in users:
        user_id = item["user_id"]
        item["stats"] = {
            "drivers": await db.drivers.count_documents({"pharmacy_id": user_id}),
            "customers": await db.customers.count_documents({"pharmacy_id": user_id}),
            "deliveries": await db.deliveries.count_documents({"pharmacy_id": user_id}),
        }
        enriched_users.append(item)
    return enriched_users

@router.get("/admin/database/stats")
async def admin_database_stats(admin: dict = Depends(get_current_admin)):
    return {
        "collections": {
            "users": await db.users.count_documents({}),
            "customers": await db.customers.count_documents({}),
            "drivers": await db.drivers.count_documents({}),
            "deliveries": await db.deliveries.count_documents({}),
            "messages": await db.messages.count_documents({}),
            "notifications": await db.notifications.count_documents({}),
            "push_subscriptions": await db.push_subscriptions.count_documents({}),
            "notes": await db.notes.count_documents({}),
        },
        "sessions": {
            "pharmacies": await db.user_sessions.count_documents({}),
            "drivers": await db.driver_sessions.count_documents({}),
            "admin": await db.admin_sessions.count_documents({}),
        },
    }

@router.get("/admin/users/{user_id}/details")
async def admin_user_details(user_id: str, admin: dict = Depends(get_current_admin)):
    user = await db.users.find_one({"user_id": user_id}, {"_id": 0, "password_hash": 0})
    if not user:
        raise HTTPException(status_code=404, detail="Utente non trovato")

    stats = {
        "customers": await db.customers.count_documents({"pharmacy_id": user_id}),
        "drivers": await db.drivers.count_documents({"pharmacy_id": user_id}),
        "deliveries": await db.deliveries.count_documents({"pharmacy_id": user_id}),
        "messages": await db.messages.count_documents({"pharmacy_id": user_id}),
        "notifications": await db.notifications.count_documents({"user_id": user_id, "user_type": "pharmacy"}),
        "sessions": await db.user_sessions.count_documents({"user_id": user_id}),
    }

    drivers = await db.drivers.find(
        {"pharmacy_id": user_id},
        {"_id": 0, "password_hash": 0}
    ).sort("created_at", -1).limit(20).to_list(20)

    recent_deliveries = await db.deliveries.find(
        {"pharmacy_id": user_id},
        {
            "_id": 0,
            "delivery_id": 1,
            "status": 1,
            "created_at": 1,
            "updated_at": 1,
            "customer_name": 1,
            "driver_name": 1,
            "amount": 1,
            "payment_method": 1,
            "scheduled_date": 1,
            "scheduled_time": 1,
            "priority": 1,
        }
    ).sort("created_at", -1).limit(12).to_list(12)

    recent_notifications = await db.notifications.find(
        {"user_id": user_id, "user_type": "pharmacy"},
        {"_id": 0, "notification_id": 1, "title": 1, "message": 1, "created_at": 1, "is_read": 1}
    ).sort("created_at", -1).limit(12).to_list(12)

    return {
        "user": user,
        "stats": stats,
        "drivers": drivers,
        "recent_deliveries": recent_deliveries,
        "recent_notifications": recent_notifications,
    }

@router.put("/admin/users/{user_id}/status")
async def admin_update_user_status(user_id: str, data: AdminUserStatusUpdate, admin: dict = Depends(get_current_admin)):
    result = await db.users.update_one({"user_id": user_id}, {"$set": {"is_active": data.is_active}})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Utente non trovato")

    if not data.is_active:
        await db.user_sessions.delete_many({"user_id": user_id})
        driver_ids = await db.drivers.distinct("driver_id", {"pharmacy_id": user_id})
        if driver_ids:
            await db.driver_sessions.delete_many({"driver_id": {"$in": driver_ids}})

    user = await db.users.find_one({"user_id": user_id}, {"_id": 0, "password_hash": 0})
    return user

@router.get("/admin/database/health")
async def admin_database_health(admin: dict = Depends(get_current_admin)):
    await db.command("ping")
    return {
        "status": "ok",
        "database": db.name,
        "collections": await db.list_collection_names(),
        "active_connections": {
            "pharmacy": len(manager.active_connections.get("pharmacy", [])),
            "driver": len(manager.active_connections.get("driver", [])),
        },
        "push_configured": push_notifications_enabled(),
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }


@router.get("/admin/database/schema")
async def admin_database_schema(admin: dict = Depends(get_current_admin)):
    return {
        "database": db.name,
        "collections": {
            "users": {
                "description": "Farmacie registrate",
                "primary_keys": ["user_id", "email"],
                "important_fields": ["name", "pharmacy_name", "pharmacy_address", "pharmacy_phone", "settings", "is_active", "created_at"],
            },
            "drivers": {
                "description": "Fattorini collegati a una farmacia",
                "primary_keys": ["driver_id", "email"],
                "important_fields": ["pharmacy_id", "name", "phone", "vehicle_type", "is_active", "lat", "lng", "created_at"],
            },
            "customers": {
                "description": "Clienti della farmacia",
                "primary_keys": ["customer_id"],
                "important_fields": ["pharmacy_id", "name", "phone", "address", "customer_lat", "customer_lng", "created_at"],
            },
            "deliveries": {
                "description": "Consegne e relativo stato operativo",
                "primary_keys": ["delivery_id"],
                "important_fields": ["pharmacy_id", "customer_id", "driver_id", "status", "payment_method", "amount", "priority", "scheduled_date", "auto_assigned", "created_at", "updated_at"],
            },
            "messages": {
                "description": "Chat farmacia ↔ fattorini",
                "primary_keys": ["message_id"],
                "important_fields": ["pharmacy_id", "driver_id", "sender_type", "content", "is_read", "created_at"],
            },
            "notifications": {
                "description": "Notifiche applicative e realtime",
                "primary_keys": ["notification_id"],
                "important_fields": ["user_id", "user_type", "title", "message", "type", "is_read", "data", "created_at"],
            },
            "push_subscriptions": {
                "description": "Sottoscrizioni push web per PWA/browser",
                "primary_keys": ["endpoint"],
                "important_fields": ["user_id", "user_type", "subscription", "user_agent", "created_at", "updated_at", "last_success_at", "last_error"],
            },
            "user_sessions": {"description": "Sessioni farmacia", "primary_keys": ["session_token"], "important_fields": ["user_id", "expires_at", "created_at"]},
            "driver_sessions": {"description": "Sessioni fattorini", "primary_keys": ["session_token"], "important_fields": ["driver_id", "expires_at", "created_at"]},
            "admin_sessions": {"description": "Sessioni super admin", "primary_keys": ["session_token"], "important_fields": ["email", "expires_at", "created_at"]},
            "notes": {"description": "Note della farmacia", "primary_keys": ["note_id"], "important_fields": ["pharmacy_id", "title", "content", "pinned", "created_at", "updated_at"]},
            "doctors_list": {"description": "Medici utili", "primary_keys": ["doctor_id"], "important_fields": ["pharmacy_id", "name", "specialty", "phone", "email"]},
            "useful_numbers": {"description": "Numeri utili", "primary_keys": ["number_id"], "important_fields": ["pharmacy_id", "name", "phone", "category"]},
        },
    }

@router.post("/admin/database/cleanup-sessions")
async def admin_cleanup_sessions(admin: dict = Depends(get_current_admin)):
    summary = {}

    session_configs = [
        ("pharmacies", db.user_sessions, "user_id", db.users, "user_id"),
        ("drivers", db.driver_sessions, "driver_id", db.drivers, "driver_id"),
        ("admin", db.admin_sessions, "email", None, None),
    ]

    for label, collection, foreign_key, parent_collection, parent_field in session_configs:
        before = await collection.count_documents({})
        deleted = 0

        async for session in collection.find({}, {"_id": 0, "session_token": 1, foreign_key: 1, "expires_at": 1}):
            expires_at = await normalize_session_expiry(collection, session)
            if not expires_at:
                deleted += 1
                continue

            if parent_collection is not None:
                exists = await parent_collection.find_one({parent_field: session.get(foreign_key)}, {"_id": 1})
                if not exists:
                    await collection.delete_one({"session_token": session.get("session_token")})
                    deleted += 1
            elif session.get("email") != ADMIN_EMAIL:
                await collection.delete_one({"session_token": session.get("session_token")})
                deleted += 1

        summary[label] = {
            "before": before,
            "after": await collection.count_documents({}),
            "deleted": deleted,
        }

    return {
        "message": "Pulizia sessioni completata",
        "summary": summary,
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }

@router.delete("/admin/users/{user_id}")
async def admin_delete_user(user_id: str, admin: dict = Depends(get_current_admin)):
    user = await db.users.find_one({"user_id": user_id}, {"_id": 0, "email": 1, "name": 1})
    if not user:
        raise HTTPException(status_code=404, detail="Utente non trovato")

    await send_transactional_email(
        user["email"],
        "Account PharmaTrack eliminato",
        f"Ciao {user.get('name') or 'utente'},\n\nil tuo account PharmaTrack è stato eliminato da un amministratore.\nSe pensi sia stato un errore, contatta il supporto.",
    )
    await delete_pharmacy_account_data(user_id)
    return {"message": "Utente eliminato"}
