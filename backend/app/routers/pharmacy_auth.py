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


@router.post("/auth/register")
async def register(data: PharmacyRegister, response: Response):
    existing = await db.users.find_one({"email": data.email})
    if existing:
        raise HTTPException(status_code=400, detail="Email già registrata")
    
    password_hash = bcrypt.hashpw(data.password.encode(), bcrypt.gensalt()).decode()
    user_id = f"user_{uuid.uuid4().hex[:12]}"
    
    new_user = {
        "user_id": user_id,
        "email": data.email,
        "role": "pharmacy",
        "name": data.name,
        "password_hash": password_hash,
        "picture": None,
        "is_active": True,
        "pharmacy_name": data.pharmacy_name,
        "pharmacy_address": data.pharmacy_address,
        "pharmacy_phone": data.pharmacy_phone,
        "pharmacy_lat": data.pharmacy_lat,
        "pharmacy_lng": data.pharmacy_lng,
        "settings": {
            "notifications_enabled": True,
            "sound_enabled": True,
            "driver_tracking_enabled": False,
        },
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.users.insert_one(new_user)
    await send_transactional_email(
        data.email,
        "Benvenuto in PharmaTrack",
        f"Ciao {data.name},\n\nil tuo account PharmaTrack è stato creato con successo.\nDa ora puoi gestire clienti, consegne e fattorini dalla tua dashboard.\n\nGrazie per esserti iscritto!",
    )
    
    session_token = f"sess_{uuid.uuid4().hex}"
    expires_at = datetime.now(timezone.utc) + timedelta(days=7)
    await db.user_sessions.insert_one({
        "user_id": user_id,
        "session_token": session_token,
        "expires_at": expires_at,
        "created_at": datetime.now(timezone.utc).isoformat()
    })
    
    response.set_cookie(key="session_token", value=session_token, httponly=True,
                        secure=True, samesite="none", path="/", max_age=7*24*60*60)
    
    return {k: v for k, v in new_user.items() if k not in ["_id", "password_hash"]}

@router.post("/auth/login")
@limiter.limit("10/minute")
async def login(request: Request, data: PharmacyLogin, response: Response):
    user = await db.users.find_one({"email": data.email}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=401, detail="Credenziali non valide")
    
    if not bcrypt.checkpw(data.password.encode(), user["password_hash"].encode()):
        raise HTTPException(status_code=401, detail="Credenziali non valide")
    if user.get("is_active", True) is False:
        raise HTTPException(status_code=403, detail="Account disattivato")
    
    session_token = f"sess_{uuid.uuid4().hex}"
    expires_at = datetime.now(timezone.utc) + timedelta(days=7)
    
    await db.user_sessions.delete_many({"user_id": user["user_id"]})
    await db.user_sessions.insert_one({
        "user_id": user["user_id"],
        "session_token": session_token,
        "expires_at": expires_at,
        "created_at": datetime.now(timezone.utc).isoformat()
    })
    
    response.set_cookie(key="session_token", value=session_token, httponly=True,
                        secure=True, samesite="none", path="/", max_age=7*24*60*60)
    
    return {k: v for k, v in user.items() if k not in ["_id", "password_hash"]}

@router.get("/auth/me")
async def get_me(user: dict = Depends(get_current_user)):
    return {k: v for k, v in user.items() if k != "password_hash"}

@router.post("/auth/logout")
async def logout(request: Request, response: Response):
    session_token = request.cookies.get("session_token")
    if session_token:
        await db.user_sessions.delete_many({"session_token": session_token})
    clear_cookie_variants(response, "session_token")
    return {"message": "Logged out"}

@router.post("/auth/forgot-password")
async def forgot_password(data: ForgotPasswordRequest):
    user = await db.users.find_one({"email": data.email}, {"_id": 0})
    if not user:
        # Always return success to prevent email enumeration
        return {"message": "Se l'email esiste, riceverai le istruzioni"}

    reset_token = uuid.uuid4().hex
    expires_at = datetime.now(timezone.utc) + timedelta(hours=1)
    await db.password_reset_tokens.delete_many({"user_id": user["user_id"]})
    await db.password_reset_tokens.insert_one({
        "user_id": user["user_id"],
        "token": reset_token,
        "expires_at": expires_at.isoformat(),
        "created_at": datetime.now(timezone.utc).isoformat(),
    })

    reset_url = f"https://{os.environ.get('REPLIT_DEV_DOMAIN', 'localhost')}/reset-password?token={reset_token}"
    html_body = f"""
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
      <h2 style="color:#0d9488">PharmaTrack — Recupero password</h2>
      <p>Ciao <strong>{user.get('name', '')}</strong>,</p>
      <p>Hai richiesto di reimpostare la password del tuo account PharmaTrack.</p>
      <p style="margin:24px 0">
        <a href="{reset_url}" style="background:#0d9488;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold">
          Reimposta password
        </a>
      </p>
      <p style="color:#666;font-size:13px">Il link scade tra 1 ora. Se non hai richiesto questo, ignora questa email.</p>
    </div>
    """
    text_body = f"Ciao {user.get('name', '')},\n\nReimposta la tua password su PharmaTrack:\n{reset_url}\n\nIl link scade tra 1 ora."

    email_sent = await send_transactional_email(data.email, "Recupero password PharmaTrack", text_body, html_body)
    if not email_sent:
        logger.info("SMTP non configurato – reset URL: %s", reset_url)

    return {"message": "Se l'email esiste, riceverai le istruzioni"}


@router.post("/auth/reset-password")
async def reset_password(data: ResetPasswordRequest):
    record = await db.password_reset_tokens.find_one({"token": data.token})
    if not record:
        raise HTTPException(status_code=400, detail="Link non valido o già utilizzato")

    expires_at = datetime.fromisoformat(record["expires_at"])
    if datetime.now(timezone.utc) > expires_at:
        await db.password_reset_tokens.delete_one({"token": data.token})
        raise HTTPException(status_code=400, detail="Link scaduto. Richiedine uno nuovo")

    if len(data.new_password) < 8:
        raise HTTPException(status_code=422, detail="La password deve contenere almeno 8 caratteri")

    new_hash = bcrypt.hashpw(data.new_password.encode(), bcrypt.gensalt()).decode()
    await db.users.update_one({"user_id": record["user_id"]}, {"$set": {"password_hash": new_hash}})
    await db.password_reset_tokens.delete_one({"token": data.token})
    await db.user_sessions.delete_many({"user_id": record["user_id"]})
    return {"message": "Password aggiornata con successo"}


@router.post("/auth/google")
async def google_auth(data: GoogleAuthRequest, response: Response):
    import urllib.request
    import json as _json
    try:
        url = f"https://oauth2.googleapis.com/tokeninfo?id_token={data.credential}"
        with urllib.request.urlopen(url, timeout=5) as r:
            payload = _json.loads(r.read().decode())
    except Exception as exc:
        logger.error("Google token verification failed: %s", exc)
        raise HTTPException(status_code=401, detail="Token Google non valido")

    google_client_id = os.environ.get("GOOGLE_CLIENT_ID") or os.environ.get("VITE_GOOGLE_CLIENT_ID")
    if google_client_id and payload.get("aud") != google_client_id:
        raise HTTPException(status_code=401, detail="Token Google non valido per questa applicazione")

    email = payload.get("email")
    if not email:
        raise HTTPException(status_code=400, detail="Email non disponibile dall'account Google")

    user = await db.users.find_one({"email": email}, {"_id": 0})

    if not user:
        user_id = f"user_{uuid.uuid4().hex[:12]}"
        name = payload.get("name") or payload.get("given_name") or email.split("@")[0]
        picture = payload.get("picture")
        user = {
            "user_id": user_id,
            "email": email,
            "role": "pharmacy",
            "name": name,
            "password_hash": None,
            "picture": picture,
            "is_active": True,
            "pharmacy_name": None,
            "pharmacy_address": None,
            "pharmacy_phone": None,
            "pharmacy_lat": None,
            "pharmacy_lng": None,
            "google_sub": payload.get("sub"),
            "settings": {
                "notifications_enabled": True,
                "sound_enabled": True,
                "driver_tracking_enabled": False,
            },
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.users.insert_one(user)
    elif user.get("is_active", True) is False:
        raise HTTPException(status_code=403, detail="Account disattivato")

    session_token = f"sess_{uuid.uuid4().hex}"
    expires_at = datetime.now(timezone.utc) + timedelta(days=7)
    await db.user_sessions.delete_many({"user_id": user["user_id"]})
    await db.user_sessions.insert_one({
        "user_id": user["user_id"],
        "session_token": session_token,
        "expires_at": expires_at,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    response.set_cookie(key="session_token", value=session_token, httponly=True,
                        secure=True, samesite="none", path="/", max_age=7*24*60*60)
    return {k: v for k, v in user.items() if k not in ["_id", "password_hash"]}


@router.put("/auth/profile")
async def update_profile(request: Request, user: dict = Depends(get_current_user)):
    body = await request.json()
    update_data = {}
    for field in ["pharmacy_name", "pharmacy_address", "pharmacy_phone", "pharmacy_lat", "pharmacy_lng", "settings", "name"]:
        if field in body:
            update_data[field] = body[field]
    if update_data:
        await db.users.update_one({"user_id": user["user_id"]}, {"$set": update_data})
    updated_user = await db.users.find_one({"user_id": user["user_id"]}, {"_id": 0})
    return {k: v for k, v in updated_user.items() if k != "password_hash"}

@router.delete("/auth/delete-account")
async def delete_account(response: Response, user: dict = Depends(get_current_user)):
    await send_transactional_email(
        user["email"],
        "Conferma eliminazione account PharmaTrack",
        f"Ciao {user.get('name') or 'utente'},\n\nabbiamo preso in carico la richiesta di eliminazione del tuo account PharmaTrack.\nTutti i dati collegati alla farmacia sono stati rimossi.",
    )
    await delete_pharmacy_account_data(user["user_id"])
    clear_cookie_variants(response, "session_token")
    return {"message": "Account eliminato"}
