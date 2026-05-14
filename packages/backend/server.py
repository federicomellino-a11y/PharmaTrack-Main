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
except Exception:
    webpush = None
    class WebPushException(Exception):
        pass

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ.get('MONGO_URL', '').strip()
database_name = os.environ.get('DB_NAME', 'pharmatrack').strip()

if not mongo_url:
    raise ValueError("MONGO_URL not configured")

client = AsyncIOMotorClient(mongo_url)
db = client[database_name]

app = FastAPI(title="PharmaTrack API", version="1.0.0")
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
    try:
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
    except Exception as e:
        logger.error(f"Health check failed: {e}")
        return {
            "status": "error",
            "detail": str(e),
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }, 503

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
    import urllib.request, json as _json
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

@api_router.post("/driver/login")
async def driver_login(request: Request, response: Response):
    body = await request.json()
    email = body.get("email")
    password = body.get("password")
    if not email or not password:
        raise HTTPException(status_code=400, detail="Email e password richiesti")
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

# ============ CORS CONFIGURATION ============

_raw_origins = os.environ.get('CORS_ORIGINS', '*').strip()

if _raw_origins == '*':
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
    )
else:
    _origins_list = [o.strip() for o in _raw_origins.split(',') if o.strip()]
    app.add_middleware(
        CORSMiddleware,
        allow_origins=_origins_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

app.include_router(api_router)

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

@app.on_event("startup")
async def setup_indexes():
    logger.info("Setting up MongoDB indexes...")
    logger.info("MongoDB indexes setup complete.")

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
