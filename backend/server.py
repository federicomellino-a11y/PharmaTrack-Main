from fastapi import FastAPI, APIRouter, HTTPException, Depends, WebSocket, WebSocketDisconnect, Response, Request
from fastapi.responses import JSONResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
import uuid
from datetime import datetime, timezone, timedelta
import json
import bcrypt
import asyncio
import smtplib
import ssl
from email.message import EmailMessage
import httpx

try:
    from pywebpush import webpush, WebPushException
except Exception:  # pragma: no cover - optional dependency during local checks
    webpush = None

    class WebPushException(Exception):
        pass

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL'].strip()
database_name = os.environ['DB_NAME'].strip()
client = AsyncIOMotorClient(mongo_url)
db = client[database_name]

app = FastAPI(title="PharmaTrack API")
api_router = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# ============ WEBSOCKET MANAGER ============

class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[str, List[WebSocket]] = {}
        self.user_sockets: Dict[str, WebSocket] = {}

    async def connect(self, websocket: WebSocket, user_id: str, user_type: str):
        await websocket.accept()
        key = f"{user_type}_{user_id}"
        self.user_sockets[key] = websocket
        if user_type not in self.active_connections:
            self.active_connections[user_type] = []
        self.active_connections[user_type].append(websocket)

    def disconnect(self, websocket: WebSocket, user_id: str, user_type: str):
        key = f"{user_type}_{user_id}"
        if key in self.user_sockets:
            del self.user_sockets[key]
        if user_type in self.active_connections and websocket in self.active_connections[user_type]:
            self.active_connections[user_type].remove(websocket)

    async def send_personal_message(self, message: dict, user_id: str, user_type: str):
        key = f"{user_type}_{user_id}"
        if key in self.user_sockets:
            try:
                await self.user_sockets[key].send_json(message)
            except Exception as e:
                logger.error(f"Error sending message to {key}: {e}")

    async def broadcast_to_type(self, message: dict, user_type: str):
        if user_type in self.active_connections:
            for connection in self.active_connections[user_type]:
                try:
                    await connection.send_json(message)
                except Exception as e:
                    logger.error(f"Broadcast error: {e}")

manager = ConnectionManager()

# ============ MODELS ============

class PharmacyRegister(BaseModel):
    email: str
    password: str
    name: str
    pharmacy_name: Optional[str] = None
    pharmacy_address: Optional[str] = None
    pharmacy_phone: Optional[str] = None
    pharmacy_lat: Optional[float] = None
    pharmacy_lng: Optional[float] = None

class PharmacyLogin(BaseModel):
    email: str
    password: str

class ForgotPasswordRequest(BaseModel):
    email: str

class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str

class GoogleAuthRequest(BaseModel):
    credential: str

class AdminLogin(BaseModel):
    email: str
    password: str

class AdminUserStatusUpdate(BaseModel):
    is_active: bool

class CustomerCreate(BaseModel):
    name: str
    phone: str
    address: str
    email: Optional[str] = None
    fiscal_code: Optional[str] = None
    birth_date: Optional[str] = None
    notes: Optional[str] = None
    customer_lat: Optional[float] = None
    customer_lng: Optional[float] = None
    place_id: Optional[str] = None
    extra_phones: Optional[List[str]] = []

class DriverCreate(BaseModel):
    name: str
    phone: str
    email: str
    password: str
    vehicle_type: str = "scooter"

class DeliveryCreate(BaseModel):
    customer_id: str
    driver_id: Optional[str] = None
    notes: Optional[str] = None
    payment_method: str = "cash"
    amount: Optional[float] = Field(default=None, ge=0)
    amount_given: Optional[float] = Field(default=None, ge=0)
    scheduled_date: Optional[str] = None
    scheduled_time: Optional[str] = None
    priority: str = "normal"

class DeliveryUpdate(BaseModel):
    driver_id: Optional[str] = None
    status: Optional[str] = None
    notes: Optional[str] = None
    payment_method: Optional[str] = None
    amount: Optional[float] = Field(default=None, ge=0)
    amount_given: Optional[float] = Field(default=None, ge=0)
    payment_collected: Optional[bool] = None
    scheduled_date: Optional[str] = None
    scheduled_time: Optional[str] = None
    priority: Optional[str] = None

class MessageCreate(BaseModel):
    driver_id: str
    content: str

class DoctorCreate(BaseModel):
    name: str
    specialty: str
    phone: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    schedule: Optional[dict] = None
    notes: Optional[str] = None

class UsefulNumberCreate(BaseModel):
    name: str
    phone: str
    category: str = "general"
    notes: Optional[str] = None

class NoteCreate(BaseModel):
    title: str
    content: str
    color: str = "default"
    pinned: bool = False

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

SMTP_HOST = os.getenv("SMTP_HOST")
SMTP_PORT = int(os.getenv("SMTP_PORT", "465"))
SMTP_USERNAME = os.getenv("SMTP_USERNAME")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD")
SMTP_FROM = os.getenv("SMTP_FROM") or SMTP_USERNAME
SMTP_USE_TLS = os.getenv("SMTP_USE_TLS", "false").lower() == "true"
SMTP_USE_SSL = os.getenv("SMTP_USE_SSL", "true").lower() == "true"
ADMIN_EMAIL = os.getenv("ADMIN_EMAIL") or os.getenv("SUPERADMIN_EMAIL")
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD") or os.getenv("SUPERADMIN_PASSWORD")
ADMIN_NAME = os.getenv("ADMIN_NAME") or os.getenv("SUPERADMIN_NAME") or "Super Admin"
VAPID_PUBLIC_KEY = os.getenv("VAPID_PUBLIC_KEY")
VAPID_PRIVATE_KEY = os.getenv("VAPID_PRIVATE_KEY")
VAPID_SUBJECT = os.getenv("VAPID_SUBJECT", "mailto:support@pharmatrack.app")


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


def push_notifications_enabled() -> bool:
    return bool(webpush and VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY)


def build_notification_target_url(user_type: str, notif_type: str, data: Optional[dict] = None) -> str:
    payload = data or {}
    if user_type == "driver":
        if notif_type == "delivery" and payload.get("delivery_id"):
            return f"/driver/delivery/{payload['delivery_id']}"
        return "/driver"

    if notif_type == "delivery" and payload.get("delivery_id"):
        return "/deliveries"
    if notif_type == "message":
        return "/chat"
    return "/dashboard"


async def upsert_push_subscription(user_id: str, user_type: str, payload: dict, request: Request) -> dict:
    subscription = payload.get("subscription") if isinstance(payload, dict) else None
    endpoint = subscription.get("endpoint") if isinstance(subscription, dict) else None
    keys = subscription.get("keys") if isinstance(subscription, dict) else None

    if not endpoint or not isinstance(keys, dict) or not keys.get("p256dh") or not keys.get("auth"):
        raise HTTPException(status_code=400, detail="Sottoscrizione push non valida")

    now = datetime.now(timezone.utc).isoformat()
    document = {
        "user_id": user_id,
        "user_type": user_type,
        "endpoint": endpoint,
        "subscription": subscription,
        "user_agent": request.headers.get("user-agent"),
        "updated_at": now,
        "created_at": now,
    }

    await db.push_subscriptions.update_one(
        {"user_id": user_id, "user_type": user_type, "endpoint": endpoint},
        {"$set": document, "$setOnInsert": {"created_at": now}},
        upsert=True,
    )
    return {"status": "subscribed", "endpoint": endpoint}


async def remove_push_subscription(user_id: str, user_type: str, payload: dict) -> dict:
    endpoint = payload.get("endpoint") if isinstance(payload, dict) else None
    query = {"user_id": user_id, "user_type": user_type}
    if endpoint:
        query["endpoint"] = endpoint

    result = await db.push_subscriptions.delete_many(query)
    return {"status": "unsubscribed", "deleted": result.deleted_count}


async def send_web_push_notifications(user_id: str, user_type: str, notif_data: dict) -> dict:
    if not push_notifications_enabled():
        return {"sent": 0, "disabled": True}

    subscriptions = await db.push_subscriptions.find({"user_id": user_id, "user_type": user_type}, {"_id": 0}).to_list(50)
    if not subscriptions:
        return {"sent": 0, "disabled": False}

    payload = json.dumps({
        "title": notif_data.get("title") or "PharmaTrack",
        "body": notif_data.get("message") or "Hai una nuova notifica",
        "icon": "/icons/icon-192.png",
        "badge": "/icons/icon-192.png",
        "url": notif_data.get("data", {}).get("url") or build_notification_target_url(user_type, notif_data.get("type"), notif_data.get("data")),
        "data": notif_data.get("data") or {},
        "notification_id": notif_data.get("notification_id"),
        "user_type": user_type,
    })

    sent = 0
    stale_endpoints = []
    for subscription in subscriptions:
        try:
            await asyncio.to_thread(
                webpush,
                subscription_info=subscription["subscription"],
                data=payload,
                vapid_private_key=VAPID_PRIVATE_KEY,
                vapid_claims={"sub": VAPID_SUBJECT},
            )
            sent += 1
            await db.push_subscriptions.update_one(
                {"user_id": user_id, "user_type": user_type, "endpoint": subscription["endpoint"]},
                {"$set": {"last_success_at": datetime.now(timezone.utc).isoformat(), "last_error": None}},
            )
        except WebPushException as exc:
            message = str(exc)
            await db.push_subscriptions.update_one(
                {"user_id": user_id, "user_type": user_type, "endpoint": subscription["endpoint"]},
                {"$set": {"last_error": message, "updated_at": datetime.now(timezone.utc).isoformat()}},
            )
            if "410" in message or "404" in message:
                stale_endpoints.append(subscription["endpoint"])
        except Exception as exc:
            await db.push_subscriptions.update_one(
                {"user_id": user_id, "user_type": user_type, "endpoint": subscription["endpoint"]},
                {"$set": {"last_error": str(exc), "updated_at": datetime.now(timezone.utc).isoformat()}},
            )

    if stale_endpoints:
        await db.push_subscriptions.delete_many({
            "user_id": user_id,
            "user_type": user_type,
            "endpoint": {"$in": stale_endpoints},
        })

    return {"sent": sent, "disabled": False}


async def send_transactional_email(to_address: str, subject: str, text_body: str, html_body: Optional[str] = None) -> bool:
    if not (SMTP_FROM and SMTP_PASSWORD and to_address):
        logger.info("Email not configured: skipping '%s' to %s", subject, to_address)
        return False

    # Use Brevo REST API when the password is an API key (xkeysib-...)
    if SMTP_PASSWORD.startswith("xkeysib-") or SMTP_PASSWORD.startswith("xsmtpsib-"):
        payload = {
            "sender": {"name": "PharmaTrack", "email": SMTP_FROM},
            "to": [{"email": to_address}],
            "subject": subject,
            "textContent": text_body,
            "htmlContent": html_body or text_body,
        }
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.post(
                    "https://api.brevo.com/v3/smtp/email",
                    headers={"api-key": SMTP_PASSWORD, "Content-Type": "application/json"},
                    json=payload,
                )
            if resp.status_code in (200, 201):
                logger.info("Email sent via Brevo API to %s (status %s)", to_address, resp.status_code)
                return True
            logger.error("Brevo API error to %s: %s %s", to_address, resp.status_code, resp.text)
            return False
        except Exception as exc:
            logger.error("Brevo API exception to %s: %s", to_address, exc)
            return False

    # Fallback: standard SMTP
    if not (SMTP_HOST and SMTP_USERNAME):
        logger.info("SMTP not configured: skipping email '%s' to %s", subject, to_address)
        return False

    def _send_email():
        message = EmailMessage()
        message["Subject"] = subject
        message["From"] = SMTP_FROM
        message["To"] = to_address
        message.set_content(text_body)
        if html_body:
            message.add_alternative(html_body, subtype="html")

        if SMTP_USE_SSL:
            context = ssl.create_default_context()
            with smtplib.SMTP_SSL(SMTP_HOST, SMTP_PORT, context=context) as server:
                server.login(SMTP_USERNAME, SMTP_PASSWORD)
                server.send_message(message)
            return

        with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as server:
            if SMTP_USE_TLS:
                server.starttls(context=ssl.create_default_context())
            server.login(SMTP_USERNAME, SMTP_PASSWORD)
            server.send_message(message)

    try:
        await asyncio.to_thread(_send_email)
        return True
    except Exception as exc:
        logger.error("Error sending email to %s: %s", to_address, exc)
        return False

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

@api_router.get("/health")
async def public_health():
    await db.command("ping")
    return {
        "status": "ok",
        "database": database_name,
        "admin_configured": bool(ADMIN_EMAIL and ADMIN_PASSWORD),
        "push_configured": push_notifications_enabled(),
        "smtp_configured": bool(SMTP_FROM and SMTP_PASSWORD),
        "google_auth_configured": bool(os.getenv("GOOGLE_CLIENT_ID") or os.getenv("VITE_GOOGLE_CLIENT_ID")),
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@api_router.get("/push/config")
async def get_push_config():
    return {
        "enabled": push_notifications_enabled(),
        "public_key": VAPID_PUBLIC_KEY if push_notifications_enabled() else None,
        "subject": VAPID_SUBJECT if push_notifications_enabled() else None,
    }

# ============ PHARMACY AUTH ============

@api_router.post("/auth/register")
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

@api_router.post("/auth/login")
async def login(data: PharmacyLogin, response: Response):
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

@api_router.get("/auth/me")
async def get_me(user: dict = Depends(get_current_user)):
    return {k: v for k, v in user.items() if k != "password_hash"}

@api_router.post("/auth/logout")
async def logout(request: Request, response: Response):
    session_token = request.cookies.get("session_token")
    if session_token:
        await db.user_sessions.delete_many({"session_token": session_token})
    clear_cookie_variants(response, "session_token")
    return {"message": "Logged out"}

@api_router.post("/auth/forgot-password")
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


@api_router.post("/auth/reset-password")
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


@api_router.post("/auth/google")
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


@api_router.put("/auth/profile")
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

@api_router.delete("/auth/delete-account")
async def delete_account(response: Response, user: dict = Depends(get_current_user)):
    await send_transactional_email(
        user["email"],
        "Conferma eliminazione account PharmaTrack",
        f"Ciao {user.get('name') or 'utente'},\n\nabbiamo preso in carico la richiesta di eliminazione del tuo account PharmaTrack.\nTutti i dati collegati alla farmacia sono stati rimossi.",
    )
    await delete_pharmacy_account_data(user["user_id"])
    clear_cookie_variants(response, "session_token")
    return {"message": "Account eliminato"}

# ============ SUPER ADMIN ============

@api_router.post("/admin/login")
async def admin_login(data: AdminLogin, response: Response):
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

@api_router.get("/admin/me")
async def admin_me(admin: dict = Depends(get_current_admin)):
    return admin

@api_router.post("/admin/logout")
async def admin_logout(request: Request, response: Response):
    session_token = request.cookies.get("admin_session_token")
    if session_token:
        await db.admin_sessions.delete_many({"session_token": session_token})
    clear_cookie_variants(response, "admin_session_token")
    return {"message": "Logged out"}

@api_router.get("/admin/overview")
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

@api_router.get("/admin/users")
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

@api_router.get("/admin/database/stats")
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

@api_router.get("/admin/users/{user_id}/details")
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

@api_router.put("/admin/users/{user_id}/status")
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

@api_router.get("/admin/database/health")
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


@api_router.get("/admin/database/schema")
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

@api_router.post("/admin/database/cleanup-sessions")
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

@api_router.delete("/admin/users/{user_id}")
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

# ============ DRIVER AUTH ============

@api_router.post("/driver/login")
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

@api_router.get("/driver/me")
async def get_driver_me(driver: dict = Depends(get_current_driver)):
    return {k: v for k, v in driver.items() if k != "password_hash"}

@api_router.post("/driver/logout")
async def driver_logout(request: Request, response: Response):
    session_token = request.cookies.get("driver_session_token")
    if session_token:
        await db.driver_sessions.delete_many({"session_token": session_token})
    clear_cookie_variants(response, "driver_session_token")
    return {"message": "Logged out"}

@api_router.put("/driver/location")
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

# ============ CUSTOMERS ============

@api_router.get("/customers")
async def get_customers(user: dict = Depends(get_current_user)):
    customers = await db.customers.find({"pharmacy_id": user["user_id"]}, {"_id": 0}).sort("name", 1).to_list(1000)
    return customers

@api_router.post("/customers")
async def create_customer(customer: CustomerCreate, user: dict = Depends(get_current_user)):
    customer_data = {
        "customer_id": f"cust_{uuid.uuid4().hex[:12]}",
        "pharmacy_id": user["user_id"],
        "name": customer.name, "phone": customer.phone, "address": customer.address,
        "email": customer.email, "fiscal_code": customer.fiscal_code,
        "birth_date": customer.birth_date, "notes": customer.notes,
        "customer_lat": customer.customer_lat, "customer_lng": customer.customer_lng,
        "place_id": customer.place_id,
        "extra_phones": [p for p in (customer.extra_phones or []) if p and p.strip()],
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.customers.insert_one(customer_data)
    return {k: v for k, v in customer_data.items() if k != "_id"}

@api_router.get("/customers/{customer_id}")
async def get_customer(customer_id: str, user: dict = Depends(get_current_user)):
    customer = await db.customers.find_one({"customer_id": customer_id, "pharmacy_id": user["user_id"]}, {"_id": 0})
    if not customer:
        raise HTTPException(status_code=404, detail="Cliente non trovato")
    return customer

@api_router.put("/customers/{customer_id}")
async def update_customer(customer_id: str, request: Request, user: dict = Depends(get_current_user)):
    body = await request.json()
    update_data = {f: body[f] for f in ["name", "phone", "address", "email", "fiscal_code", "birth_date", "notes", "customer_lat", "customer_lng", "place_id", "extra_phones"] if f in body}
    if "extra_phones" in update_data:
        update_data["extra_phones"] = [p for p in (update_data["extra_phones"] or []) if p and str(p).strip()]
    if update_data:
        result = await db.customers.update_one({"customer_id": customer_id, "pharmacy_id": user["user_id"]}, {"$set": update_data})
        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="Cliente non trovato")
    return await db.customers.find_one({"customer_id": customer_id, "pharmacy_id": user["user_id"]}, {"_id": 0})

@api_router.get("/customers/{customer_id}/stats")
async def get_customer_stats(customer_id: str, user: dict = Depends(get_current_user)):
    customer = await db.customers.find_one({"customer_id": customer_id, "pharmacy_id": user["user_id"]}, {"_id": 0})
    if not customer:
        raise HTTPException(status_code=404, detail="Cliente non trovato")

    deliveries = await db.deliveries.find({"customer_id": customer_id, "pharmacy_id": user["user_id"]}, {"_id": 0}).sort("created_at", -1).to_list(1000)
    total_deliveries = len(deliveries)
    completed_deliveries = sum(1 for delivery in deliveries if delivery.get("status") == "delivered")
    cancelled_deliveries = sum(1 for delivery in deliveries if delivery.get("status") == "cancelled")
    active_deliveries = sum(1 for delivery in deliveries if delivery.get("status") in ["da_preparare", "pronta", "pending", "assigned", "picked_up", "in_transit", "delivered_pending_confirmation"])
    pending_deliveries = sum(1 for delivery in deliveries if delivery.get("status") in ["da_preparare", "pronta", "pending"])

    delivered_deliveries = [delivery for delivery in deliveries if delivery.get("status") == "delivered"]
    total_spent = sum((delivery.get("amount") or 0) for delivery in delivered_deliveries)
    average_order_value = round(total_spent / completed_deliveries, 2) if completed_deliveries else 0
    completion_rate = round((completed_deliveries / total_deliveries) * 100, 1) if total_deliveries else 0
    cancellation_rate = round((cancelled_deliveries / total_deliveries) * 100, 1) if total_deliveries else 0

    payment_breakdown = {
        "cash": {"count": 0, "total": 0},
        "pos": {"count": 0, "total": 0},
        "other": {"count": 0, "total": 0},
    }
    successful_delivery_dates = []

    for delivery in delivered_deliveries:
        payment_method = delivery.get("payment_method") if delivery.get("payment_method") in ["cash", "pos"] else "other"
        payment_breakdown[payment_method]["count"] += 1
        payment_breakdown[payment_method]["total"] += delivery.get("amount") or 0

        reference_date = delivery.get("actual_delivery") or delivery.get("updated_at") or delivery.get("created_at")
        if reference_date:
            try:
                successful_delivery_dates.append(datetime.fromisoformat(reference_date.replace("Z", "+00:00")))
            except ValueError:
                continue

    preferred_payment_method = None
    if any(data["count"] for data in payment_breakdown.values()):
        preferred_payment_method = max(payment_breakdown.items(), key=lambda item: item[1]["count"])[0]

    average_days_between_orders = None
    if len(successful_delivery_dates) >= 2:
        successful_delivery_dates.sort()
        intervals = [
            (successful_delivery_dates[index] - successful_delivery_dates[index - 1]).total_seconds() / 86400
            for index in range(1, len(successful_delivery_dates))
        ]
        average_days_between_orders = round(sum(intervals) / len(intervals), 1)

    now_utc = datetime.now(timezone.utc)
    delivered_this_month = sum(
        1
        for date_value in successful_delivery_dates
        if date_value.year == now_utc.year and date_value.month == now_utc.month
    )

    last_successful_delivery = max(successful_delivery_dates).isoformat() if successful_delivery_dates else None
    last_order_at = deliveries[0].get("created_at") if deliveries else None
    verified_address = customer.get("customer_lat") is not None and customer.get("customer_lng") is not None

    return {
        "customer": customer,
        "stats": {
            "total_deliveries": total_deliveries,
            "completed_deliveries": completed_deliveries,
            "cancelled_deliveries": cancelled_deliveries,
            "active_deliveries": active_deliveries,
            "pending_deliveries": pending_deliveries,
            "total_spent": total_spent,
            "average_order_value": average_order_value,
            "completion_rate": completion_rate,
            "cancellation_rate": cancellation_rate,
            "last_delivery": last_successful_delivery,
            "last_order_at": last_order_at,
            "delivered_this_month": delivered_this_month,
            "preferred_payment_method": preferred_payment_method,
            "average_days_between_orders": average_days_between_orders,
            "payment_breakdown": payment_breakdown,
            "verified_address": verified_address,
        },
        "recent_deliveries": deliveries[:10]
    }

@api_router.delete("/customers/{customer_id}")
async def delete_customer(customer_id: str, user: dict = Depends(get_current_user)):
    result = await db.customers.delete_one({"customer_id": customer_id, "pharmacy_id": user["user_id"]})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Cliente non trovato")
    await db.deliveries.delete_many({"customer_id": customer_id, "pharmacy_id": user["user_id"], "status": {"$in": ["delivered", "cancelled"]}})
    await db.deliveries.update_many({"customer_id": customer_id, "pharmacy_id": user["user_id"]}, {"$set": {"customer_name": "[Cliente eliminato]", "customer_id": None}})
    return {"message": "Cliente eliminato"}

# ============ DRIVERS ============

@api_router.get("/drivers")
async def get_drivers(user: dict = Depends(get_current_user)):
    drivers = await db.drivers.find({"pharmacy_id": user["user_id"]}, {"_id": 0, "password_hash": 0}).sort("name", 1).to_list(100)
    return drivers

@api_router.post("/drivers")
async def create_driver(driver: DriverCreate, user: dict = Depends(get_current_user)):
    existing = await db.drivers.find_one({"email": driver.email})
    if existing:
        raise HTTPException(status_code=400, detail="Email già in uso")
    password_hash = bcrypt.hashpw(driver.password.encode(), bcrypt.gensalt()).decode()
    driver_data = {
        "driver_id": f"drv_{uuid.uuid4().hex[:12]}",
        "pharmacy_id": user["user_id"],
        "name": driver.name, "phone": driver.phone, "email": driver.email,
        "password_hash": password_hash, "vehicle_type": driver.vehicle_type,
        "is_active": True, "current_lat": None, "current_lng": None,
        "last_location_update": None, "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.drivers.insert_one(driver_data)
    return {k: v for k, v in driver_data.items() if k not in ["_id", "password_hash"]}

@api_router.get("/drivers/{driver_id}")
async def get_driver(driver_id: str, user: dict = Depends(get_current_user)):
    driver = await db.drivers.find_one({"driver_id": driver_id, "pharmacy_id": user["user_id"]}, {"_id": 0, "password_hash": 0})
    if not driver:
        raise HTTPException(status_code=404, detail="Fattorino non trovato")
    return driver

@api_router.put("/drivers/{driver_id}")
async def update_driver(driver_id: str, request: Request, user: dict = Depends(get_current_user)):
    body = await request.json()
    update_data = {f: body[f] for f in ["name", "phone", "vehicle_type", "is_active"] if f in body}
    if "password" in body and body["password"]:
        update_data["password_hash"] = bcrypt.hashpw(body["password"].encode(), bcrypt.gensalt()).decode()
    if update_data:
        result = await db.drivers.update_one({"driver_id": driver_id, "pharmacy_id": user["user_id"]}, {"$set": update_data})
        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="Fattorino non trovato")
    return await db.drivers.find_one({"driver_id": driver_id, "pharmacy_id": user["user_id"]}, {"_id": 0, "password_hash": 0})

@api_router.delete("/drivers/{driver_id}")
async def delete_driver(driver_id: str, user: dict = Depends(get_current_user)):
    result = await db.drivers.delete_one({"driver_id": driver_id, "pharmacy_id": user["user_id"]})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Fattorino non trovato")
    await db.deliveries.update_many(
        {"driver_id": driver_id, "pharmacy_id": user["user_id"], "status": {"$in": ["assigned", "picked_up", "in_transit"]}},
        {"$set": {"driver_id": None, "status": "pronta"}}
    )
    await db.driver_sessions.delete_many({"driver_id": driver_id})
    await db.push_subscriptions.delete_many({"user_id": driver_id, "user_type": "driver"})
    return {"message": "Fattorino eliminato"}

# ============ DELIVERIES ============

async def _attach_delivery_to_open_shift(driver_id: str, delivery_id: str):
    """If driver has an open shift, append this delivery to delivery_ids."""
    shift = await db.driver_shifts.find_one(
        {"driver_id": driver_id, "status": "open"},
        {"_id": 0, "shift_id": 1, "delivery_ids": 1},
    )
    if not shift:
        return
    delivery_ids = set(shift.get("delivery_ids") or [])
    if delivery_id in delivery_ids:
        return
    delivery_ids.add(delivery_id)
    await db.driver_shifts.update_one(
        {"shift_id": shift["shift_id"]},
        {"$set": {"delivery_ids": list(delivery_ids), "updated_at": datetime.now(timezone.utc).isoformat()}},
    )


@api_router.get("/deliveries")
async def get_deliveries(status: Optional[str] = None, driver_id: Optional[str] = None, user: dict = Depends(get_current_user)):
    query = {"pharmacy_id": user["user_id"]}
    if status:
        if status == "active":
            query["status"] = {"$in": ["da_preparare", "pronta", "pending", "assigned", "picked_up", "in_transit", "delivered_pending_confirmation"]}
        elif status == "pending_confirmation":
            query["status"] = "delivered_pending_confirmation"
        elif status == "completed":
            query["status"] = {"$in": ["delivered", "cancelled"]}
        else:
            query["status"] = status
    if driver_id:
        query["driver_id"] = driver_id
    return await db.deliveries.find(query, {"_id": 0}).sort("created_at", -1).to_list(500)

@api_router.post("/deliveries")
async def create_delivery(delivery: DeliveryCreate, user: dict = Depends(get_current_user)):
    customer = await db.customers.find_one({"customer_id": delivery.customer_id, "pharmacy_id": user["user_id"]}, {"_id": 0})
    if not customer:
        raise HTTPException(status_code=404, detail="Cliente non trovato")

    if delivery.payment_method == "cash" and delivery.amount is not None and delivery.amount_given is not None and delivery.amount_given < delivery.amount:
        raise HTTPException(status_code=400, detail="Il pagato con non può essere inferiore all'importo")

    selected_driver_id = delivery.driver_id or (user.get("settings") or {}).get("default_driver_id")
    assigned_driver = None
    if selected_driver_id:
        assigned_driver = await db.drivers.find_one({
            "driver_id": selected_driver_id,
            "pharmacy_id": user["user_id"],
            "is_active": True,
        }, {"_id": 0, "driver_id": 1, "name": 1})
        if delivery.driver_id and not assigned_driver:
            raise HTTPException(status_code=400, detail="Fattorino selezionato non valido o non attivo")
        if not delivery.driver_id and not assigned_driver:
            selected_driver_id = None

    change_due = None
    if delivery.payment_method == "cash" and delivery.amount is not None and delivery.amount_given is not None:
        change_due = delivery.amount_given - delivery.amount

    delivery_data = {
        "delivery_id": f"del_{uuid.uuid4().hex[:12]}",
        "pharmacy_id": user["user_id"],
        "customer_id": delivery.customer_id,
        "driver_id": assigned_driver["driver_id"] if assigned_driver else None,
        "customer_name": customer["name"], "customer_phone": customer["phone"], "customer_address": customer["address"],
        "customer_lat": customer.get("customer_lat"), "customer_lng": customer.get("customer_lng"),
        "notes": delivery.notes,
        "status": "assigned" if assigned_driver else "da_preparare",
        "payment_method": delivery.payment_method, "amount": delivery.amount,
        "amount_given": delivery.amount_given, "change_due": change_due, "payment_collected": False,
        "scheduled_date": delivery.scheduled_date, "scheduled_time": delivery.scheduled_time,
        "priority": delivery.priority,
        "estimated_delivery": None, "actual_delivery": None,
        "created_at": datetime.now(timezone.utc).isoformat(), "updated_at": datetime.now(timezone.utc).isoformat(),
        "auto_assigned": bool(assigned_driver and not delivery.driver_id),
    }
    await db.deliveries.insert_one(delivery_data)
    if assigned_driver:
        await _attach_delivery_to_open_shift(assigned_driver["driver_id"], delivery_data["delivery_id"])
        await manager.send_personal_message({"type": "new_delivery", "delivery_id": delivery_data["delivery_id"]}, assigned_driver["driver_id"], "driver")
        await create_notification_internal(assigned_driver["driver_id"], "driver", "Nuova consegna assegnata", f"Hai una nuova consegna per {delivery_data['customer_name']}", "delivery", {"delivery_id": delivery_data["delivery_id"]})
    return {k: v for k, v in delivery_data.items() if k != "_id"}

@api_router.get("/deliveries/{delivery_id}")
async def get_delivery(delivery_id: str, user: dict = Depends(get_current_user)):
    delivery = await db.deliveries.find_one({"delivery_id": delivery_id, "pharmacy_id": user["user_id"]}, {"_id": 0})
    if not delivery:
        raise HTTPException(status_code=404, detail="Consegna non trovata")
    return delivery

@api_router.put("/deliveries/{delivery_id}")
async def update_delivery(delivery_id: str, update: DeliveryUpdate, user: dict = Depends(get_current_user)):
    delivery = await db.deliveries.find_one({"delivery_id": delivery_id, "pharmacy_id": user["user_id"]}, {"_id": 0})
    if not delivery:
        raise HTTPException(status_code=404, detail="Consegna non trovata")
    update_data = {"updated_at": datetime.now(timezone.utc).isoformat()}
    if update.driver_id is not None:
        update_data["driver_id"] = update.driver_id
        if delivery["status"] in ["pending", "da_preparare", "pronta"]:
            update_data["status"] = "assigned"
    if update.status is not None:
        effective_driver_id = update.driver_id if update.driver_id is not None else delivery.get("driver_id")
        if update.status == "in_transit" and not effective_driver_id:
            raise HTTPException(status_code=400, detail="Assegna prima un fattorino per avviare la consegna")
        update_data["status"] = update.status
        if update.status == "delivered":
            update_data["actual_delivery"] = datetime.now(timezone.utc).isoformat()
    if update.notes is not None: update_data["notes"] = update.notes
    if update.payment_method is not None: update_data["payment_method"] = update.payment_method
    if update.amount is not None: update_data["amount"] = update.amount
    if update.amount_given is not None:
        update_data["amount_given"] = update.amount_given
        amount = update.amount if update.amount is not None else delivery.get("amount", 0)
        payment_method = update.payment_method if update.payment_method is not None else delivery.get("payment_method")
        if payment_method == "cash" and amount is not None and update.amount_given is not None and update.amount_given < amount:
            raise HTTPException(status_code=400, detail="Il pagato con non può essere inferiore all'importo")
        if amount is not None:
            update_data["change_due"] = update.amount_given - amount
    if update.payment_collected is not None: update_data["payment_collected"] = update.payment_collected
    if update.scheduled_date is not None: update_data["scheduled_date"] = update.scheduled_date
    if update.scheduled_time is not None: update_data["scheduled_time"] = update.scheduled_time
    if update.priority is not None: update_data["priority"] = update.priority
    await db.deliveries.update_one({"delivery_id": delivery_id}, {"$set": update_data})
    if update.driver_id:
        await _attach_delivery_to_open_shift(update.driver_id, delivery_id)
        await manager.send_personal_message({"type": "new_delivery", "delivery_id": delivery_id}, update.driver_id, "driver")
        await create_notification_internal(update.driver_id, "driver", "Nuova consegna assegnata", f"Hai una nuova consegna per {delivery['customer_name']}", "delivery", {"delivery_id": delivery_id})
    return await db.deliveries.find_one({"delivery_id": delivery_id}, {"_id": 0})

@api_router.delete("/deliveries/{delivery_id}")
async def delete_delivery(delivery_id: str, user: dict = Depends(get_current_user)):
    result = await db.deliveries.delete_one({"delivery_id": delivery_id, "pharmacy_id": user["user_id"]})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Consegna non trovata")
    return {"message": "Consegna eliminata"}

# ============ DRIVER DELIVERIES ============

@api_router.get("/driver/deliveries")
async def get_driver_deliveries(status: Optional[str] = None, driver: dict = Depends(get_current_driver)):
    query = {"driver_id": driver["driver_id"]}
    if status:
        if status == "active":
            query["status"] = {"$in": ["assigned", "picked_up", "in_transit"]}
        elif status == "completed":
            query["status"] = {"$in": ["delivered", "cancelled"]}
        else:
            query["status"] = status
    return await db.deliveries.find(query, {"_id": 0}).sort("created_at", -1).to_list(100)

@api_router.put("/driver/deliveries/{delivery_id}/status")
async def update_delivery_status_driver(delivery_id: str, request: Request, driver: dict = Depends(get_current_driver)):
    body = await request.json()
    new_status = body.get("status")
    if new_status not in ["picked_up", "in_transit", "delivered", "cancelled"]:
        raise HTTPException(status_code=400, detail="Stato non valido")
    delivery = await db.deliveries.find_one({"delivery_id": delivery_id, "driver_id": driver["driver_id"]}, {"_id": 0})
    if not delivery:
        raise HTTPException(status_code=404, detail="Consegna non trovata")

    # Aggancia automaticamente la consegna al turno aperto del driver
    await _attach_delivery_to_open_shift(driver["driver_id"], delivery_id)

    # Driver "delivered" → diventa pending_confirmation (la farmacia deve confermare l'incasso)
    effective_status = "delivered_pending_confirmation" if new_status == "delivered" else new_status
    update_data = {"status": effective_status, "updated_at": datetime.now(timezone.utc).isoformat()}
    if new_status == "delivered":
        update_data["actual_delivery"] = datetime.now(timezone.utc).isoformat()
        update_data["delivered_by_driver_at"] = datetime.now(timezone.utc).isoformat()
        # POS: pagamento già transitato, ma serve comunque conferma del bigliettino → resta pending_confirmation
        # cash: serve consegna fisica del contante → resta pending_confirmation
    await db.deliveries.update_one({"delivery_id": delivery_id}, {"$set": update_data})
    status_labels = {
        "picked_up": "Ritirata",
        "in_transit": "In consegna",
        "delivered_pending_confirmation": "Consegnata · in attesa incasso",
        "cancelled": "Annullata",
    }
    label = status_labels.get(effective_status, effective_status)
    await manager.send_personal_message(
        {"type": "delivery_update", "delivery_id": delivery_id, "status": effective_status, "driver_id": driver["driver_id"]},
        delivery["pharmacy_id"], "pharmacy"
    )
    if effective_status == "delivered_pending_confirmation":
        title = "Consegna effettuata · conferma incasso"
        body_text = f"{delivery['customer_name']} – conferma incasso ({_format_amount(delivery)})"
    else:
        title = f"Consegna {label}"
        body_text = f"La consegna per {delivery['customer_name']} è stata {label.lower()}"
    await create_notification_internal(
        delivery["pharmacy_id"], "pharmacy", title, body_text,
        "delivery", {"delivery_id": delivery_id, "status": effective_status}
    )
    return await db.deliveries.find_one({"delivery_id": delivery_id}, {"_id": 0})


def _format_amount(delivery: dict) -> str:
    amount = delivery.get("amount")
    method = delivery.get("payment_method", "cash")
    if amount is None:
        return "importo non specificato"
    method_label = "POS" if method == "pos" else "Contanti"
    return f"{method_label} €{float(amount):.2f}"


@api_router.post("/deliveries/{delivery_id}/confirm-payment")
async def confirm_delivery_payment(delivery_id: str, request: Request, user: dict = Depends(get_current_user)):
    """La farmacia conferma di aver ricevuto l'incasso dal fattorino → consegna chiusa."""
    delivery = await db.deliveries.find_one({"delivery_id": delivery_id, "pharmacy_id": user["user_id"]}, {"_id": 0})
    if not delivery:
        raise HTTPException(status_code=404, detail="Consegna non trovata")
    if delivery.get("status") not in ["delivered_pending_confirmation", "delivered"]:
        raise HTTPException(status_code=400, detail="La consegna non è in attesa di conferma incasso")
    if delivery.get("payment_collected") is True and delivery.get("status") == "delivered":
        raise HTTPException(status_code=400, detail="Incasso già confermato")

    body = {}
    try:
        body = await request.json()
    except Exception:
        body = {}

    confirmed_amount = body.get("confirmed_amount")
    confirm_note = body.get("note")

    update_data = {
        "status": "delivered",
        "payment_collected": True,
        "payment_confirmed_at": datetime.now(timezone.utc).isoformat(),
        "payment_confirmed_by": user["user_id"],
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    if confirmed_amount is not None:
        try:
            update_data["confirmed_amount"] = float(confirmed_amount)
        except (TypeError, ValueError):
            pass
    if confirm_note:
        update_data["confirm_note"] = str(confirm_note)[:500]

    await db.deliveries.update_one({"delivery_id": delivery_id}, {"$set": update_data})

    # Notifica al fattorino
    if delivery.get("driver_id"):
        await manager.send_personal_message(
            {"type": "delivery_update", "delivery_id": delivery_id, "status": "delivered"},
            delivery["driver_id"], "driver"
        )
        await create_notification_internal(
            delivery["driver_id"], "driver",
            "Incasso confermato",
            f"La farmacia ha confermato l'incasso per {delivery['customer_name']}",
            "delivery", {"delivery_id": delivery_id, "status": "delivered"}
        )

    return await db.deliveries.find_one({"delivery_id": delivery_id}, {"_id": 0})


@api_router.post("/deliveries/{delivery_id}/dispute-payment")
async def dispute_delivery_payment(delivery_id: str, request: Request, user: dict = Depends(get_current_user)):
    """La farmacia segnala un problema con l'incasso (importo errato, contestazione)."""
    delivery = await db.deliveries.find_one({"delivery_id": delivery_id, "pharmacy_id": user["user_id"]}, {"_id": 0})
    if not delivery:
        raise HTTPException(status_code=404, detail="Consegna non trovata")
    body = await request.json()
    reason = body.get("reason") or "Contestazione incasso"
    update_data = {
        "status": "delivered_pending_confirmation",
        "payment_dispute": True,
        "payment_dispute_reason": str(reason)[:500],
        "payment_dispute_at": datetime.now(timezone.utc).isoformat(),
        "payment_collected": False,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.deliveries.update_one({"delivery_id": delivery_id}, {"$set": update_data})

    if delivery.get("driver_id"):
        await manager.send_personal_message(
            {"type": "delivery_dispute", "delivery_id": delivery_id, "reason": reason},
            delivery["driver_id"], "driver"
        )
        await create_notification_internal(
            delivery["driver_id"], "driver",
            "Contestazione incasso",
            f"La farmacia ha segnalato un problema su {delivery['customer_name']}: {reason}",
            "delivery", {"delivery_id": delivery_id}
        )

    return await db.deliveries.find_one({"delivery_id": delivery_id}, {"_id": 0})

# ============ MESSAGES ============

@api_router.get("/messages/conversations")
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

@api_router.put("/messages/{driver_id}/read")
async def mark_messages_read(driver_id: str, user: dict = Depends(get_current_user)):
    result = await db.messages.update_many(
        {"pharmacy_id": user["user_id"], "driver_id": driver_id, "sender_type": "driver", "is_read": False},
        {"$set": {"is_read": True}}
    )
    return {"updated": result.modified_count}

@api_router.get("/messages/{driver_id}")
async def get_messages(driver_id: str, user: dict = Depends(get_current_user)):
    messages = await db.messages.find({"pharmacy_id": user["user_id"], "driver_id": driver_id}, {"_id": 0}).sort("created_at", 1).to_list(500)
    await db.messages.update_many({"pharmacy_id": user["user_id"], "driver_id": driver_id, "sender_type": "driver"}, {"$set": {"is_read": True}})
    return messages

@api_router.post("/messages")
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

@api_router.put("/driver/messages/read")
async def mark_driver_messages_read(driver: dict = Depends(get_current_driver)):
    result = await db.messages.update_many(
        {"driver_id": driver["driver_id"], "sender_type": "pharmacy", "is_read": False},
        {"$set": {"is_read": True}}
    )
    return {"updated": result.modified_count}

@api_router.get("/driver/messages")
async def get_driver_messages(driver: dict = Depends(get_current_driver)):
    messages = await db.messages.find({"driver_id": driver["driver_id"]}, {"_id": 0}).sort("created_at", 1).to_list(500)
    await db.messages.update_many({"driver_id": driver["driver_id"], "sender_type": "pharmacy"}, {"$set": {"is_read": True}})
    return messages

@api_router.post("/driver/messages")
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

# ============ NOTIFICATIONS ============

async def create_notification_internal(user_id, user_type, title, message, notif_type, data=None):
    notification_data = {**(data or {})}
    notification_data.setdefault("url", build_notification_target_url(user_type, notif_type, notification_data))
    notif_data = {
        "notification_id": f"notif_{uuid.uuid4().hex[:12]}",
        "user_id": user_id, "user_type": user_type,
        "title": title, "message": message, "type": notif_type,
        "is_read": False, "data": notification_data,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.notifications.insert_one(notif_data)
    await manager.send_personal_message({"type": "notification", "notification": {k: v for k, v in notif_data.items() if k != "_id"}}, user_id, user_type)
    await send_web_push_notifications(user_id, user_type, notif_data)
    return notif_data

@api_router.post("/push/subscribe")
async def subscribe_push_notifications(request: Request, user: dict = Depends(get_current_user)):
    body = await request.json()
    return await upsert_push_subscription(user["user_id"], "pharmacy", body, request)


@api_router.delete("/push/subscribe")
async def unsubscribe_push_notifications(request: Request, user: dict = Depends(get_current_user)):
    body = await request.json() if request.headers.get("content-length") not in [None, "0"] else {}
    return await remove_push_subscription(user["user_id"], "pharmacy", body)


@api_router.get("/notifications")
async def get_notifications(user: dict = Depends(get_current_user)):
    return await db.notifications.find({"user_id": user["user_id"], "user_type": "pharmacy"}, {"_id": 0}).sort("created_at", -1).to_list(100)

@api_router.put("/notifications/{notification_id}/read")
async def mark_notification_read(notification_id: str, user: dict = Depends(get_current_user)):
    await db.notifications.update_one({"notification_id": notification_id, "user_id": user["user_id"]}, {"$set": {"is_read": True}})
    return {"status": "ok"}

@api_router.delete("/notifications/{notification_id}")
async def delete_notification(notification_id: str, user: dict = Depends(get_current_user)):
    result = await db.notifications.delete_one({"notification_id": notification_id, "user_id": user["user_id"], "user_type": "pharmacy"})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Notifica non trovata")
    return {"status": "deleted"}

@api_router.put("/notifications/read-all")
async def mark_all_notifications_read(user: dict = Depends(get_current_user)):
    await db.notifications.update_many({"user_id": user["user_id"], "user_type": "pharmacy"}, {"$set": {"is_read": True}})
    return {"status": "ok"}


@api_router.post("/notifications/test")
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


@api_router.post("/driver/push/subscribe")
async def subscribe_driver_push_notifications(request: Request, driver: dict = Depends(get_current_driver)):
    body = await request.json()
    return await upsert_push_subscription(driver["driver_id"], "driver", body, request)


@api_router.delete("/driver/push/subscribe")
async def unsubscribe_driver_push_notifications(request: Request, driver: dict = Depends(get_current_driver)):
    body = await request.json() if request.headers.get("content-length") not in [None, "0"] else {}
    return await remove_push_subscription(driver["driver_id"], "driver", body)


@api_router.get("/driver/notifications")
async def get_driver_notifications(driver: dict = Depends(get_current_driver)):
    return await db.notifications.find({"user_id": driver["driver_id"], "user_type": "driver"}, {"_id": 0}).sort("created_at", -1).to_list(100)

@api_router.put("/driver/notifications/{notification_id}/read")
async def mark_driver_notification_read(notification_id: str, driver: dict = Depends(get_current_driver)):
    await db.notifications.update_one(
        {"notification_id": notification_id, "user_id": driver["driver_id"], "user_type": "driver"},
        {"$set": {"is_read": True}}
    )
    return {"status": "ok"}

@api_router.put("/driver/notifications/read-all")
async def mark_all_driver_notifications_read(driver: dict = Depends(get_current_driver)):
    await db.notifications.update_many(
        {"user_id": driver["driver_id"], "user_type": "driver"},
        {"$set": {"is_read": True}}
    )
    return {"status": "ok"}

@api_router.delete("/driver/notifications/{notification_id}")
async def delete_driver_notification(notification_id: str, driver: dict = Depends(get_current_driver)):
    result = await db.notifications.delete_one({"notification_id": notification_id, "user_id": driver["driver_id"], "user_type": "driver"})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Notifica non trovata")
    return {"status": "deleted"}


@api_router.post("/driver/notifications/test")
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

# ============ STATISTICS ============

@api_router.get("/statistics")
async def get_statistics(user: dict = Depends(get_current_user)):
    pharmacy_id = user["user_id"]
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
    return {
        "customers": {"total": total_customers},
        "drivers": {"total": total_drivers, "active": active_drivers},
        "deliveries": {"total": total_deliveries, "pending": pending_deliveries, "active": active_deliveries, "completed": completed_deliveries, "cancelled": cancelled_deliveries, "today": today_deliveries, "today_completed": today_completed},
        "weekly": weekly_data,
        "priority": {}
    }

# ============ ARCHIVE ============

@api_router.get("/archive")
async def get_archive(page: int = 1, limit: int = 20, user: dict = Depends(get_current_user)):
    skip = (page - 1) * limit
    query = {"pharmacy_id": user["user_id"], "status": {"$in": ["delivered", "cancelled"]}}
    total = await db.deliveries.count_documents(query)
    deliveries = await db.deliveries.find(query, {"_id": 0}).sort("updated_at", -1).skip(skip).limit(limit).to_list(limit)
    return {"deliveries": deliveries, "total": total, "page": page, "pages": (total + limit - 1) // limit}

# ============ DOCTORS ============

@api_router.get("/doctors")
async def get_doctors(user: dict = Depends(get_current_user)):
    return await db.doctors_list.find({"pharmacy_id": user["user_id"]}, {"_id": 0}).sort("name", 1).to_list(500)

@api_router.post("/doctors")
async def create_doctor(doctor: DoctorCreate, user: dict = Depends(get_current_user)):
    doctor_data = {"doctor_id": f"doc_{uuid.uuid4().hex[:12]}", "pharmacy_id": user["user_id"], **doctor.dict(), "created_at": datetime.now(timezone.utc).isoformat()}
    await db.doctors_list.insert_one(doctor_data)
    return {k: v for k, v in doctor_data.items() if k != "_id"}

@api_router.put("/doctors/{doctor_id}")
async def update_doctor(doctor_id: str, request: Request, user: dict = Depends(get_current_user)):
    body = await request.json()
    result = await db.doctors_list.update_one({"doctor_id": doctor_id, "pharmacy_id": user["user_id"]}, {"$set": body})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Medico non trovato")
    return await db.doctors_list.find_one({"doctor_id": doctor_id}, {"_id": 0})

@api_router.delete("/doctors/{doctor_id}")
async def delete_doctor(doctor_id: str, user: dict = Depends(get_current_user)):
    result = await db.doctors_list.delete_one({"doctor_id": doctor_id, "pharmacy_id": user["user_id"]})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Medico non trovato")
    return {"message": "Medico eliminato"}

# ============ USEFUL NUMBERS ============

@api_router.get("/useful-numbers")
async def get_useful_numbers(user: dict = Depends(get_current_user)):
    return await db.useful_numbers.find({"pharmacy_id": user["user_id"]}, {"_id": 0}).sort("category", 1).to_list(500)

@api_router.post("/useful-numbers")
async def create_useful_number(number: UsefulNumberCreate, user: dict = Depends(get_current_user)):
    number_data = {"number_id": f"num_{uuid.uuid4().hex[:12]}", "pharmacy_id": user["user_id"], **number.dict(), "created_at": datetime.now(timezone.utc).isoformat()}
    await db.useful_numbers.insert_one(number_data)
    return {k: v for k, v in number_data.items() if k != "_id"}

@api_router.delete("/useful-numbers/{number_id}")
async def delete_useful_number(number_id: str, user: dict = Depends(get_current_user)):
    result = await db.useful_numbers.delete_one({"number_id": number_id, "pharmacy_id": user["user_id"]})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Numero non trovato")
    return {"message": "Numero eliminato"}

# ============ NOTES ============

@api_router.get("/notes")
async def get_notes(user: dict = Depends(get_current_user)):
    return await db.notes.find({"pharmacy_id": user["user_id"]}, {"_id": 0}).sort([("pinned", -1), ("updated_at", -1)]).to_list(500)

@api_router.post("/notes")
async def create_note(note: NoteCreate, user: dict = Depends(get_current_user)):
    note_data = {"note_id": f"note_{uuid.uuid4().hex[:12]}", "pharmacy_id": user["user_id"], **note.dict(), "created_at": datetime.now(timezone.utc).isoformat(), "updated_at": datetime.now(timezone.utc).isoformat()}
    await db.notes.insert_one(note_data)
    return {k: v for k, v in note_data.items() if k != "_id"}

@api_router.put("/notes/{note_id}")
async def update_note(note_id: str, request: Request, user: dict = Depends(get_current_user)):
    body = await request.json()
    body["updated_at"] = datetime.now(timezone.utc).isoformat()
    result = await db.notes.update_one({"note_id": note_id, "pharmacy_id": user["user_id"]}, {"$set": body})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Nota non trovata")
    return await db.notes.find_one({"note_id": note_id}, {"_id": 0})

@api_router.delete("/notes/{note_id}")
async def delete_note(note_id: str, user: dict = Depends(get_current_user)):
    result = await db.notes.delete_one({"note_id": note_id, "pharmacy_id": user["user_id"]})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Nota non trovata")
    return {"message": "Nota eliminata"}

# ============ REPORTS ============

@api_router.get("/reports")
async def get_reports(period: str = "month", user: dict = Depends(get_current_user)):
    pharmacy_id = user["user_id"]
    now = datetime.now(timezone.utc)
    if period == "week": start_date = now - timedelta(days=7)
    elif period == "year": start_date = now - timedelta(days=365)
    else: start_date = now - timedelta(days=30)
    deliveries = await db.deliveries.find({"pharmacy_id": pharmacy_id, "status": "delivered", "actual_delivery": {"$gte": start_date.isoformat()}}, {"_id": 0, "amount": 1, "customer_id": 1, "driver_id": 1, "payment_method": 1}).to_list(10000)
    total_revenue = sum(d.get("amount", 0) or 0 for d in deliveries)
    total_deliveries = len(deliveries)
    customer_counts = {}
    customer_revenue = {}
    for d in deliveries:
        cid = d.get("customer_id")
        if cid:
            customer_counts[cid] = customer_counts.get(cid, 0) + 1
            customer_revenue[cid] = customer_revenue.get(cid, 0) + (d.get("amount", 0) or 0)
    top_customer_ids = sorted(customer_counts.keys(), key=lambda x: customer_counts[x], reverse=True)[:5]
    top_customers = []
    for cid in top_customer_ids:
        customer = await db.customers.find_one({"customer_id": cid}, {"_id": 0, "name": 1})
        if customer:
            top_customers.append({"customer_id": cid, "name": customer["name"], "deliveries": customer_counts[cid], "revenue": customer_revenue[cid]})
    driver_counts = {}
    driver_revenue = {}
    for d in deliveries:
        did = d.get("driver_id")
        if did:
            driver_counts[did] = driver_counts.get(did, 0) + 1
            driver_revenue[did] = driver_revenue.get(did, 0) + (d.get("amount", 0) or 0)
    top_drivers = []
    for did in sorted(driver_counts.keys(), key=lambda x: driver_counts[x], reverse=True)[:5]:
        driver = await db.drivers.find_one({"driver_id": did}, {"_id": 0, "name": 1})
        if driver:
            top_drivers.append({"driver_id": did, "name": driver["name"], "deliveries": driver_counts[did], "revenue": driver_revenue.get(did, 0)})
    cash_count = sum(1 for d in deliveries if d.get("payment_method") == "cash")
    return {"period": period, "total_revenue": total_revenue, "total_deliveries": total_deliveries, "avg_order_value": total_revenue / total_deliveries if total_deliveries > 0 else 0, "top_customers": top_customers, "top_drivers": top_drivers, "payment_breakdown": {"cash": cash_count, "pos": total_deliveries - cash_count}}

@api_router.post("/integrations/winfarm/import")
async def winfarm_import(request: Request, user: dict = Depends(get_current_user)):
    """Endpoint generico per il bridge Winfarm: accetta una vendita e crea
    una delivery in stato `da_preparare`. Il farmacista la troverà su
    /deliveries pronta da assegnare. Tutti i campi sono opzionali tranne
    qualcosa che identifichi il cliente (customer_id, customer_phone o
    customer_name)."""
    body = await request.json()

    customer_id = body.get("customer_id")
    customer_phone = (body.get("customer_phone") or body.get("telefono") or "").strip()
    customer_name = (body.get("customer_name") or body.get("cliente") or "").strip()
    customer_address = body.get("customer_address") or body.get("indirizzo")
    amount = body.get("amount") or body.get("importo")
    payment_method = body.get("payment_method") or body.get("pagamento") or "cash"
    notes = body.get("notes") or body.get("note")
    external_ref = body.get("external_ref") or body.get("ricevuta") or body.get("scontrino")

    if not (customer_id or customer_phone or customer_name):
        raise HTTPException(status_code=400, detail="Specifica customer_id, customer_phone o customer_name")

    # Cerca cliente per id, telefono normalizzato o nome
    customer = None
    if customer_id:
        customer = await db.customers.find_one({"customer_id": customer_id, "pharmacy_id": user["user_id"]}, {"_id": 0})
    if not customer and customer_phone:
        digits = "".join(c for c in customer_phone if c.isdigit())
        if digits:
            # match per ultime 9 cifre (gestisce prefissi internazionali e formattazioni varie)
            tail = digits[-9:] if len(digits) >= 9 else digits
            customer = await db.customers.find_one(
                {"pharmacy_id": user["user_id"], "phone": {"$regex": tail + "$"}},
                {"_id": 0},
            )
    if not customer and customer_name:
        customer = await db.customers.find_one({"pharmacy_id": user["user_id"], "name": {"$regex": f"^{customer_name}$", "$options": "i"}}, {"_id": 0})

    # Se nessun match e abbiamo nome → crea cliente nuovo
    created_customer = False
    if not customer:
        if not customer_name:
            raise HTTPException(status_code=404, detail="Cliente non trovato; passa customer_name per crearlo")
        cid = f"cust_{uuid.uuid4().hex[:12]}"
        customer = {
            "customer_id": cid,
            "pharmacy_id": user["user_id"],
            "name": customer_name,
            "phone": customer_phone or "",
            "address": customer_address or "",
            "email": None, "fiscal_code": None, "birth_date": None, "notes": None,
            "customer_lat": None, "customer_lng": None, "place_id": None,
            "extra_phones": [],
            "created_at": datetime.now(timezone.utc).isoformat(),
            "imported_from": "winfarm",
        }
        await db.customers.insert_one(customer)
        customer.pop("_id", None)
        created_customer = True

    try:
        amount_val = float(amount) if amount is not None else None
    except (TypeError, ValueError):
        amount_val = None

    delivery_data = {
        "delivery_id": f"del_{uuid.uuid4().hex[:12]}",
        "pharmacy_id": user["user_id"],
        "customer_id": customer["customer_id"],
        "driver_id": None,
        "customer_name": customer["name"],
        "customer_phone": customer.get("phone") or "",
        "customer_address": customer.get("address") or "",
        "customer_lat": customer.get("customer_lat"),
        "customer_lng": customer.get("customer_lng"),
        "notes": notes,
        "status": "da_preparare",
        "payment_method": payment_method if payment_method in ["cash", "pos"] else "cash",
        "amount": amount_val,
        "amount_given": None,
        "change_due": None,
        "payment_collected": False,
        "scheduled_date": None,
        "scheduled_time": None,
        "priority": "normal",
        "estimated_delivery": None,
        "actual_delivery": None,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "auto_assigned": False,
        "imported_from": "winfarm",
        "external_ref": external_ref,
    }
    await db.deliveries.insert_one(delivery_data)

    # Notifica push/in-app
    await create_notification_internal(
        user["user_id"], "pharmacy",
        "Nuova consegna da Winfarm",
        f"{customer['name']} · {('€' + format(amount_val, '.2f')) if amount_val is not None else 'importo da definire'}",
        "delivery", {"delivery_id": delivery_data["delivery_id"]},
    )

    return {
        "delivery": {k: v for k, v in delivery_data.items() if k != "_id"},
        "customer_created": created_customer,
        "customer": customer,
    }


# ============ DRIVER SHIFTS ============

async def _shift_aggregate_totals(shift: dict) -> dict:
    """Compute totals from deliveries linked to a shift."""
    delivery_ids = shift.get("delivery_ids") or []
    deliveries = []
    if delivery_ids:
        deliveries = await db.deliveries.find(
            {"delivery_id": {"$in": delivery_ids}}, {"_id": 0}
        ).to_list(1000)
    cash_total = 0.0
    pos_total = 0.0
    delivered_count = 0
    cancelled_count = 0
    pending_confirmation = 0
    for d in deliveries:
        status = d.get("status")
        if status == "cancelled":
            cancelled_count += 1
            continue
        if status not in ["delivered", "delivered_pending_confirmation"]:
            continue
        delivered_count += 1
        if status == "delivered_pending_confirmation":
            pending_confirmation += 1
        amount = float(d.get("amount") or 0)
        if d.get("payment_method") == "pos":
            pos_total += amount
        else:
            cash_total += amount
    return {
        "deliveries": len(deliveries),
        "cash_total": round(cash_total, 2),
        "pos_total": round(pos_total, 2),
        "delivered_count": delivered_count,
        "cancelled_count": cancelled_count,
        "pending_confirmation": pending_confirmation,
        "deliveries_data": deliveries,
    }


async def _enrich_shift(shift: dict, include_deliveries: bool = False) -> dict:
    if not shift:
        return shift
    shift = {k: v for k, v in shift.items() if k != "_id"}
    totals_with_data = await _shift_aggregate_totals(shift)
    deliveries_data = totals_with_data.pop("deliveries_data", [])
    shift["totals"] = totals_with_data
    if include_deliveries:
        shift["deliveries"] = deliveries_data
    driver = await db.drivers.find_one(
        {"driver_id": shift.get("driver_id")}, {"_id": 0, "name": 1, "phone": 1, "vehicle_type": 1}
    )
    if driver:
        shift["driver_name"] = driver.get("name")
        shift["driver_phone"] = driver.get("phone")
    return shift


@api_router.get("/driver/shifts/current")
async def driver_current_shift(driver: dict = Depends(get_current_driver)):
    shift = await db.driver_shifts.find_one(
        {"driver_id": driver["driver_id"], "status": "open"}, {"_id": 0}
    )
    if not shift:
        return {"shift": None}
    # auto-attach deliveries assegnate al driver oggi che non sono già nel turno
    delivery_ids = set(shift.get("delivery_ids") or [])
    started_at = shift.get("started_at")
    extras = await db.deliveries.find(
        {
            "driver_id": driver["driver_id"],
            "updated_at": {"$gte": started_at},
        },
        {"_id": 0, "delivery_id": 1},
    ).to_list(500)
    new_ids = {d["delivery_id"] for d in extras} - delivery_ids
    if new_ids:
        delivery_ids |= new_ids
        await db.driver_shifts.update_one(
            {"shift_id": shift["shift_id"]},
            {"$set": {"delivery_ids": list(delivery_ids), "updated_at": datetime.now(timezone.utc).isoformat()}},
        )
        shift["delivery_ids"] = list(delivery_ids)
    return {"shift": await _enrich_shift(shift, include_deliveries=True)}


@api_router.post("/driver/shifts/start")
async def driver_start_shift(driver: dict = Depends(get_current_driver)):
    existing = await db.driver_shifts.find_one(
        {"driver_id": driver["driver_id"], "status": "open"}, {"_id": 0}
    )
    if existing:
        return {"shift": await _enrich_shift(existing, include_deliveries=True)}
    now = datetime.now(timezone.utc).isoformat()
    shift = {
        "shift_id": f"shf_{uuid.uuid4().hex[:12]}",
        "driver_id": driver["driver_id"],
        "pharmacy_id": driver["pharmacy_id"],
        "started_at": now,
        "ended_at": None,
        "status": "open",
        "delivery_ids": [],
        "driver_declared_cash": None,
        "driver_close_note": None,
        "settled_at": None,
        "settled_by": None,
        "settle_note": None,
        "discrepancy": None,
        "created_at": now,
        "updated_at": now,
    }
    await db.driver_shifts.insert_one(shift)
    await create_notification_internal(
        driver["pharmacy_id"], "pharmacy",
        "Turno fattorino iniziato",
        f"{driver.get('name', 'Il fattorino')} ha iniziato un turno",
        "shift", {"shift_id": shift["shift_id"], "driver_id": driver["driver_id"]},
    )
    return {"shift": await _enrich_shift(shift, include_deliveries=True)}


@api_router.post("/driver/shifts/close")
async def driver_close_shift(request: Request, driver: dict = Depends(get_current_driver)):
    body = {}
    try:
        body = await request.json()
    except Exception:
        body = {}
    declared_cash = body.get("declared_cash")
    note = body.get("note")
    shift = await db.driver_shifts.find_one(
        {"driver_id": driver["driver_id"], "status": "open"}, {"_id": 0}
    )
    if not shift:
        raise HTTPException(status_code=404, detail="Nessun turno aperto")

    # Aggancia tutte le consegne assegnate/aggiornate dopo l'inizio turno
    started_at = shift.get("started_at")
    extras = await db.deliveries.find(
        {
            "driver_id": driver["driver_id"],
            "$or": [
                {"updated_at": {"$gte": started_at}},
                {"created_at": {"$gte": started_at}},
            ],
        },
        {"_id": 0, "delivery_id": 1},
    ).to_list(500)
    delivery_ids = set(shift.get("delivery_ids") or [])
    for d in extras:
        delivery_ids.add(d["delivery_id"])

    now = datetime.now(timezone.utc).isoformat()
    update_data = {
        "status": "closed_by_driver",
        "ended_at": now,
        "delivery_ids": list(delivery_ids),
        "updated_at": now,
    }
    if declared_cash is not None:
        try:
            update_data["driver_declared_cash"] = round(float(declared_cash), 2)
        except (TypeError, ValueError):
            pass
    if note:
        update_data["driver_close_note"] = str(note)[:500]
    await db.driver_shifts.update_one({"shift_id": shift["shift_id"]}, {"$set": update_data})
    updated = await db.driver_shifts.find_one({"shift_id": shift["shift_id"]}, {"_id": 0})

    # Notifica farmacia
    enriched = await _enrich_shift(updated, include_deliveries=False)
    totals = enriched.get("totals", {})
    await manager.send_personal_message(
        {"type": "shift_closed", "shift_id": shift["shift_id"], "driver_id": driver["driver_id"]},
        driver["pharmacy_id"], "pharmacy",
    )
    await create_notification_internal(
        driver["pharmacy_id"], "pharmacy",
        "Turno fattorino chiuso · da confermare",
        f"{driver.get('name', 'Il fattorino')} ha chiuso il turno · contanti €{totals.get('cash_total', 0):.2f} su {totals.get('delivered_count', 0)} consegne",
        "shift", {"shift_id": shift["shift_id"], "driver_id": driver["driver_id"]},
    )
    return {"shift": enriched}


@api_router.get("/driver/shifts")
async def driver_list_shifts(driver: dict = Depends(get_current_driver), limit: int = 20):
    shifts = await db.driver_shifts.find(
        {"driver_id": driver["driver_id"]}, {"_id": 0}
    ).sort("started_at", -1).to_list(min(limit, 100))
    return [await _enrich_shift(s) for s in shifts]


@api_router.get("/shifts")
async def pharmacy_list_shifts(
    user: dict = Depends(get_current_user),
    driver_id: Optional[str] = None,
    status_filter: Optional[str] = None,
    limit: int = 50,
):
    query = {"pharmacy_id": user["user_id"]}
    if driver_id:
        query["driver_id"] = driver_id
    if status_filter:
        query["status"] = status_filter
    shifts = await db.driver_shifts.find(query, {"_id": 0}).sort("started_at", -1).to_list(min(limit, 200))
    return [await _enrich_shift(s) for s in shifts]


@api_router.get("/shifts/{shift_id}")
async def pharmacy_get_shift(shift_id: str, user: dict = Depends(get_current_user)):
    shift = await db.driver_shifts.find_one(
        {"shift_id": shift_id, "pharmacy_id": user["user_id"]}, {"_id": 0}
    )
    if not shift:
        raise HTTPException(status_code=404, detail="Turno non trovato")
    return await _enrich_shift(shift, include_deliveries=True)


@api_router.post("/shifts/{shift_id}/settle")
async def pharmacy_settle_shift(shift_id: str, request: Request, user: dict = Depends(get_current_user)):
    shift = await db.driver_shifts.find_one(
        {"shift_id": shift_id, "pharmacy_id": user["user_id"]}, {"_id": 0}
    )
    if not shift:
        raise HTTPException(status_code=404, detail="Turno non trovato")
    if shift.get("status") == "settled":
        raise HTTPException(status_code=400, detail="Turno già chiuso e confermato")

    body = {}
    try:
        body = await request.json()
    except Exception:
        body = {}
    confirmed_cash = body.get("confirmed_cash")
    note = body.get("note")
    confirm_all_deliveries = bool(body.get("confirm_all_deliveries", True))

    totals = await _shift_aggregate_totals(shift)
    expected_cash = totals.get("cash_total", 0)
    confirmed_cash_val = None
    discrepancy = None
    if confirmed_cash is not None:
        try:
            confirmed_cash_val = round(float(confirmed_cash), 2)
            discrepancy = round(confirmed_cash_val - expected_cash, 2)
        except (TypeError, ValueError):
            pass

    now = datetime.now(timezone.utc).isoformat()
    update_data = {
        "status": "settled",
        "settled_at": now,
        "settled_by": user["user_id"],
        "updated_at": now,
    }
    if confirmed_cash_val is not None:
        update_data["confirmed_cash"] = confirmed_cash_val
        update_data["expected_cash"] = expected_cash
        update_data["discrepancy"] = discrepancy
    if note:
        update_data["settle_note"] = str(note)[:500]

    await db.driver_shifts.update_one({"shift_id": shift_id}, {"$set": update_data})

    # Conferma tutti gli incassi delle consegne in pending_confirmation di questo turno
    if confirm_all_deliveries and shift.get("delivery_ids"):
        await db.deliveries.update_many(
            {
                "delivery_id": {"$in": shift["delivery_ids"]},
                "pharmacy_id": user["user_id"],
                "status": "delivered_pending_confirmation",
            },
            {
                "$set": {
                    "status": "delivered",
                    "payment_collected": True,
                    "payment_confirmed_at": now,
                    "payment_confirmed_by": user["user_id"],
                    "payment_confirmed_via_shift": shift_id,
                    "updated_at": now,
                }
            },
        )

    if shift.get("driver_id"):
        await manager.send_personal_message(
            {"type": "shift_settled", "shift_id": shift_id},
            shift["driver_id"], "driver",
        )
        await create_notification_internal(
            shift["driver_id"], "driver",
            "Turno chiuso e confermato",
            f"La farmacia ha confermato l'incasso del turno (€{expected_cash:.2f})",
            "shift", {"shift_id": shift_id},
        )

    updated = await db.driver_shifts.find_one({"shift_id": shift_id}, {"_id": 0})
    return await _enrich_shift(updated, include_deliveries=True)



@app.websocket("/ws/pharmacy/{user_id}")
async def websocket_pharmacy(websocket: WebSocket, user_id: str):
    await manager.connect(websocket, user_id, "pharmacy")
    try:
        while True:
            data = await websocket.receive_json()
            if data.get("type") == "ping":
                await websocket.send_json({"type": "pong"})
    except WebSocketDisconnect:
        manager.disconnect(websocket, user_id, "pharmacy")

@app.websocket("/ws/driver/{driver_id}")
async def websocket_driver(websocket: WebSocket, driver_id: str):
    await manager.connect(websocket, driver_id, "driver")
    try:
        while True:
            data = await websocket.receive_json()
            if data.get("type") == "ping":
                await websocket.send_json({"type": "pong"})
            elif data.get("type") == "location":
                driver = await db.drivers.find_one({"driver_id": driver_id}, {"_id": 0})
                if driver:
                    await manager.send_personal_message(
                        {"type": "driver_location", "driver_id": driver_id, "lat": data.get("lat"), "lng": data.get("lng")},
                        driver["pharmacy_id"], "pharmacy"
                    )
    except WebSocketDisconnect:
        manager.disconnect(websocket, driver_id, "driver")


# ============ CORS — FIX CRITICO ============
# allow_credentials=True è incompatibile con allow_origins=["*"].
# Se CORS_ORIGINS è "*" usiamo allow_all senza credentials (fallback sicuro per dev locale).
# In produzione impostare su Render: CORS_ORIGINS=https://tuo-frontend.vercel.app

_raw_origins = os.environ.get('CORS_ORIGINS', '*').strip()

if _raw_origins == '*':
    # Modalità sviluppo locale: nessun credentials, wildcard
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
    )
else:
    # Produzione: origins espliciti + credentials abilitati
    _origins_list = [o.strip() for o in _raw_origins.split(',') if o.strip()]
    app.add_middleware(
        CORSMiddleware,
        allow_origins=_origins_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

app.include_router(api_router)
async def safe_create_index(collection, keys, **kwargs):
    """Create an index, dropping any conflicting same-name index first."""
    import pymongo.errors as _pe
    name = kwargs.get("name")
    try:
        await collection.create_index(keys, **kwargs)
    except (_pe.OperationFailure, _pe.DuplicateKeyError) as exc:
        if name and "IndexKeySpecsConflict" in str(exc):
            try:
                await collection.drop_index(name)
                logger.info("Dropped conflicting index '%s' on %s — recreating.", name, collection.name)
                await collection.create_index(keys, **kwargs)
            except Exception as drop_exc:
                logger.warning("Could not recreate index '%s': %s", name, drop_exc)
        else:
            logger.warning("Index creation skipped (%s.%s): %s", collection.name, name or "?", exc)


@app.on_event("startup")
async def setup_indexes():
    import pymongo

    logger.info("Setting up MongoDB indexes...")

    for collection in [db.user_sessions, db.driver_sessions, db.admin_sessions]:
        now = datetime.now(timezone.utc)
        async for session in collection.find({}, {"_id": 1, "session_token": 1, "expires_at": 1}):
            expires_at = await normalize_session_expiry(collection, session)
            if expires_at:
                await collection.update_one({"_id": session["_id"]}, {"$set": {"expires_at": expires_at}})

        await collection.delete_many({"expires_at": {"$lt": now}})
        await safe_create_index(collection, [("expires_at", pymongo.ASCENDING)], expireAfterSeconds=0, name=f"{collection.name}_expires_ttl", background=True)

    # ── Sessions ──────────────────────────────────────────────────────────────
    await safe_create_index(db.user_sessions, [("session_token", pymongo.ASCENDING)], unique=True, name="session_token_idx", background=True)
    await safe_create_index(db.driver_sessions, [("session_token", pymongo.ASCENDING)], unique=True, name="drv_session_token_idx", background=True)
    await safe_create_index(db.admin_sessions, [("session_token", pymongo.ASCENDING)], unique=True, name="admin_session_token_idx", background=True)

    # ── Users (pharmacies) ────────────────────────────────────────────────────
    await safe_create_index(db.users, [("email", pymongo.ASCENDING)], unique=True, name="users_email_idx", background=True)
    await safe_create_index(db.users, [("user_id", pymongo.ASCENDING)], unique=True, name="users_user_id_idx", background=True)
    await safe_create_index(db.users, [("is_active", pymongo.ASCENDING), ("created_at", pymongo.DESCENDING)], name="users_active_created_idx", background=True)

    # ── Drivers ───────────────────────────────────────────────────────────────
    await safe_create_index(db.drivers, [("driver_id", pymongo.ASCENDING)], unique=True, name="drivers_driver_id_idx", background=True)
    await safe_create_index(db.drivers, [("email", pymongo.ASCENDING)], unique=True, sparse=True, name="drivers_email_uniq_idx", background=True)
    await safe_create_index(db.drivers, [("pharmacy_id", pymongo.ASCENDING), ("is_active", pymongo.ASCENDING), ("created_at", pymongo.DESCENDING)], name="drivers_pharm_active_created_idx", background=True)

    # ── Customers ─────────────────────────────────────────────────────────────
    await safe_create_index(db.customers, [("customer_id", pymongo.ASCENDING)], unique=True, name="customers_id_idx", background=True)
    await safe_create_index(db.customers, [("pharmacy_id", pymongo.ASCENDING), ("name", pymongo.ASCENDING)], name="customers_pharm_name_idx", background=True)
    await safe_create_index(db.customers, [("pharmacy_id", pymongo.ASCENDING), ("phone", pymongo.ASCENDING)], name="customers_pharm_phone_idx", background=True)
    await safe_create_index(db.customers,
        [("name", pymongo.TEXT), ("phone", pymongo.TEXT), ("email", pymongo.TEXT), ("address", pymongo.TEXT)],
        name="customers_text_search_idx", background=True, default_language="italian"
    )

    # ── Deliveries ────────────────────────────────────────────────────────────
    await safe_create_index(db.deliveries, [("delivery_id", pymongo.ASCENDING)], unique=True, name="deliveries_id_idx", background=True)
    await safe_create_index(db.deliveries, [("pharmacy_id", pymongo.ASCENDING), ("status", pymongo.ASCENDING), ("created_at", pymongo.DESCENDING)], name="deliveries_pharm_status_idx", background=True)
    await safe_create_index(db.deliveries, [("driver_id", pymongo.ASCENDING), ("status", pymongo.ASCENDING), ("created_at", pymongo.DESCENDING)], name="deliveries_driver_status_idx", background=True)
    await safe_create_index(db.deliveries, [("pharmacy_id", pymongo.ASCENDING), ("customer_id", pymongo.ASCENDING), ("created_at", pymongo.DESCENDING)], name="deliveries_pharm_customer_idx", background=True)
    await safe_create_index(db.deliveries, [("pharmacy_id", pymongo.ASCENDING), ("scheduled_date", pymongo.ASCENDING)], name="deliveries_scheduled_idx", sparse=True, background=True)
    await safe_create_index(db.deliveries, [("pharmacy_id", pymongo.ASCENDING), ("created_at", pymongo.DESCENDING)], name="deliveries_pharm_date_idx", background=True)
    await safe_create_index(db.deliveries,
        [("customer_name", pymongo.TEXT), ("customer_address", pymongo.TEXT), ("notes", pymongo.TEXT)],
        name="deliveries_text_search_idx", background=True, default_language="italian"
    )

    # ── Messages ──────────────────────────────────────────────────────────────
    await safe_create_index(db.messages, [("pharmacy_id", pymongo.ASCENDING), ("driver_id", pymongo.ASCENDING), ("created_at", pymongo.DESCENDING)], name="messages_pharm_driver_created_idx", background=True)
    await safe_create_index(db.messages, [("pharmacy_id", pymongo.ASCENDING), ("is_read", pymongo.ASCENDING)], name="messages_unread_idx", background=True)

    # ── Notifications ─────────────────────────────────────────────────────────
    await safe_create_index(db.notifications, [("user_id", pymongo.ASCENDING), ("user_type", pymongo.ASCENDING), ("created_at", pymongo.DESCENDING)], name="notifications_user_type_created_idx", background=True)
    await safe_create_index(db.notifications, [("user_id", pymongo.ASCENDING), ("is_read", pymongo.ASCENDING)], name="notifications_unread_idx", background=True)

    # ── Notes ─────────────────────────────────────────────────────────────────
    await safe_create_index(db.notes, [("pharmacy_id", pymongo.ASCENDING), ("pinned", pymongo.DESCENDING), ("created_at", pymongo.DESCENDING)], name="notes_pharm_pinned_created_idx", background=True)

    # ── Doctors list ──────────────────────────────────────────────────────────
    await safe_create_index(db.doctors_list, [("pharmacy_id", pymongo.ASCENDING), ("name", pymongo.ASCENDING)], name="doctors_pharm_name_idx", background=True)
    await safe_create_index(db.doctors_list, [("pharmacy_id", pymongo.ASCENDING), ("specialty", pymongo.ASCENDING)], name="doctors_pharm_specialty_idx", background=True)

    # ── Useful numbers ────────────────────────────────────────────────────────
    await safe_create_index(db.useful_numbers, [("pharmacy_id", pymongo.ASCENDING), ("category", pymongo.ASCENDING), ("name", pymongo.ASCENDING)], name="useful_numbers_pharm_category_name_idx", background=True)

    # ── Push subscriptions ────────────────────────────────────────────────────
    await safe_create_index(db.push_subscriptions, [("user_id", pymongo.ASCENDING), ("user_type", pymongo.ASCENDING), ("endpoint", pymongo.ASCENDING)], unique=True, name="push_subscriptions_user_type_endpoint_idx", background=True)
    await safe_create_index(db.push_subscriptions, [("updated_at", pymongo.DESCENDING)], name="push_subscriptions_updated_idx", background=True)

    if ADMIN_EMAIL and ADMIN_PASSWORD:
        logger.info("Super admin configured for %s", ADMIN_EMAIL)
    else:
        logger.warning("Super admin credentials not configured. Set ADMIN_EMAIL and ADMIN_PASSWORD (or SUPERADMIN_EMAIL and SUPERADMIN_PASSWORD).")

    logger.info("MongoDB indexes setup complete.")
@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
