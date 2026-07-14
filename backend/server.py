import os
import logging
from datetime import datetime, timezone

from fastapi import FastAPI, APIRouter, WebSocket, WebSocketDisconnect
from starlette.middleware.cors import CORSMiddleware
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

from app.core.database import db, client, database_name
from app.core.websocket import manager
from app.core.security import normalize_session_expiry
from app.core.config import ADMIN_EMAIL, ADMIN_PASSWORD
from app.core.logging_config import setup_logging
from app.core.errors import register_exception_handlers
from app.core.limiter import limiter
from app.core.errors import rate_limit_handler
from app.core.sentry import init_sentry

from app.routers import (
    health, pharmacy_auth, admin, driver_auth, customers, drivers,
    deliveries, driver_deliveries, messages, notifications, statistics,
    archive, doctors, useful_numbers, notes, reports, integrations, shifts,
    analytics,
)

setup_logging()
init_sentry()
logger = logging.getLogger(__name__)

app = FastAPI(
    title="PharmaTrack API",
    version="1.0.0",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json",
    description=(
        "API per la gestione delle consegne a domicilio della farmacia: "
        "consegne, fattorini, clienti, turni & cassa, chat real-time, "
        "notifiche push e integrazione con il gestionale Winfarm."
    ),
    contact={"name": "PharmaTrack", "email": "support@pharmatrack.app"},
    openapi_tags=[
        {"name": "health", "description": "Stato del servizio e configurazione push."},
        {"name": "auth", "description": "Autenticazione farmacia (login, registrazione, password)."},
        {"name": "admin", "description": "Console super amministratore."},
        {"name": "driver-auth", "description": "Autenticazione fattorino e posizione."},
        {"name": "customers", "description": "Anagrafica clienti."},
        {"name": "drivers", "description": "Gestione fattorini e statistiche."},
        {"name": "deliveries", "description": "Consegne lato farmacia (CRUD)."},
        {"name": "driver-deliveries", "description": "Consegne lato fattorino e conferma incassi."},
        {"name": "messages", "description": "Chat farmacia ↔ fattorino."},
        {"name": "notifications", "description": "Notifiche in-app e push."},
        {"name": "statistics", "description": "KPI dashboard."},
        {"name": "archive", "description": "Storico consegne."},
        {"name": "doctors", "description": "Rubrica medici."},
        {"name": "useful-numbers", "description": "Numeri utili."},
        {"name": "notes", "description": "Block notes."},
        {"name": "reports", "description": "Report periodici."},
        {"name": "integrations", "description": "Bridge Winfarm e integrazioni esterne."},
        {"name": "shifts", "description": "Turni fattorino e riconciliazione cassa."},
        {"name": "analytics", "description": "KPI aggregati e trend (cache opzionale Redis)."},
    ],
)

# Rate limiting (anti brute-force su login)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, rate_limit_handler)
app.add_middleware(SlowAPIMiddleware)

# Gestione errori standardizzata
register_exception_handlers(app)

# ============ ROUTERS ============
_ROUTER_TAGS = {
    "health": "health", "pharmacy_auth": "auth", "admin": "admin",
    "driver_auth": "driver-auth", "customers": "customers", "drivers": "drivers",
    "deliveries": "deliveries", "driver_deliveries": "driver-deliveries",
    "messages": "messages", "notifications": "notifications", "statistics": "statistics",
    "archive": "archive", "doctors": "doctors", "useful_numbers": "useful-numbers",
    "notes": "notes", "reports": "reports", "integrations": "integrations", "shifts": "shifts",
    "analytics": "analytics",
}
api_router = APIRouter(prefix="/api")
for module in [
    health, pharmacy_auth, admin, driver_auth, customers, drivers,
    deliveries, driver_deliveries, messages, notifications, statistics,
    archive, doctors, useful_numbers, notes, reports, integrations, shifts,
    analytics,
]:
    tag = _ROUTER_TAGS.get(module.__name__.split(".")[-1])
    api_router.include_router(module.router, tags=[tag] if tag else None)


# ============ WEBSOCKETS ============
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


# ============ DB INDEXES / LIFECYCLE ============
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

    # ── Sessions ──
    await safe_create_index(db.user_sessions, [("session_token", pymongo.ASCENDING)], unique=True, name="session_token_idx", background=True)
    await safe_create_index(db.driver_sessions, [("session_token", pymongo.ASCENDING)], unique=True, name="drv_session_token_idx", background=True)
    await safe_create_index(db.admin_sessions, [("session_token", pymongo.ASCENDING)], unique=True, name="admin_session_token_idx", background=True)

    # ── Users (pharmacies) ──
    await safe_create_index(db.users, [("email", pymongo.ASCENDING)], unique=True, name="users_email_idx", background=True)
    await safe_create_index(db.users, [("user_id", pymongo.ASCENDING)], unique=True, name="users_user_id_idx", background=True)
    await safe_create_index(db.users, [("is_active", pymongo.ASCENDING), ("created_at", pymongo.DESCENDING)], name="users_active_created_idx", background=True)

    # ── Drivers ──
    await safe_create_index(db.drivers, [("driver_id", pymongo.ASCENDING)], unique=True, name="drivers_driver_id_idx", background=True)
    await safe_create_index(db.drivers, [("email", pymongo.ASCENDING)], unique=True, sparse=True, name="drivers_email_uniq_idx", background=True)
    await safe_create_index(db.drivers, [("pharmacy_id", pymongo.ASCENDING), ("is_active", pymongo.ASCENDING), ("created_at", pymongo.DESCENDING)], name="drivers_pharm_active_created_idx", background=True)

    # ── Customers ──
    await safe_create_index(db.customers, [("customer_id", pymongo.ASCENDING)], unique=True, name="customers_id_idx", background=True)
    await safe_create_index(db.customers, [("pharmacy_id", pymongo.ASCENDING), ("name", pymongo.ASCENDING)], name="customers_pharm_name_idx", background=True)
    await safe_create_index(db.customers, [("pharmacy_id", pymongo.ASCENDING), ("phone", pymongo.ASCENDING)], name="customers_pharm_phone_idx", background=True)
    await safe_create_index(db.customers,
        [("name", pymongo.TEXT), ("phone", pymongo.TEXT), ("email", pymongo.TEXT), ("address", pymongo.TEXT)],
        name="customers_text_search_idx", background=True, default_language="italian"
    )

    # ── Deliveries ──
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

    # ── Messages ──
    await safe_create_index(db.messages, [("pharmacy_id", pymongo.ASCENDING), ("driver_id", pymongo.ASCENDING), ("created_at", pymongo.DESCENDING)], name="messages_pharm_driver_created_idx", background=True)
    await safe_create_index(db.messages, [("pharmacy_id", pymongo.ASCENDING), ("is_read", pymongo.ASCENDING)], name="messages_unread_idx", background=True)

    # ── Notifications ──
    await safe_create_index(db.notifications, [("user_id", pymongo.ASCENDING), ("user_type", pymongo.ASCENDING), ("created_at", pymongo.DESCENDING)], name="notifications_user_type_created_idx", background=True)
    await safe_create_index(db.notifications, [("user_id", pymongo.ASCENDING), ("is_read", pymongo.ASCENDING)], name="notifications_unread_idx", background=True)

    # ── Notes ──
    await safe_create_index(db.notes, [("pharmacy_id", pymongo.ASCENDING), ("pinned", pymongo.DESCENDING), ("created_at", pymongo.DESCENDING)], name="notes_pharm_pinned_created_idx", background=True)

    # ── Doctors list ──
    await safe_create_index(db.doctors_list, [("pharmacy_id", pymongo.ASCENDING), ("name", pymongo.ASCENDING)], name="doctors_pharm_name_idx", background=True)
    await safe_create_index(db.doctors_list, [("pharmacy_id", pymongo.ASCENDING), ("specialty", pymongo.ASCENDING)], name="doctors_pharm_specialty_idx", background=True)

    # ── Useful numbers ──
    await safe_create_index(db.useful_numbers, [("pharmacy_id", pymongo.ASCENDING), ("category", pymongo.ASCENDING), ("name", pymongo.ASCENDING)], name="useful_numbers_pharm_category_name_idx", background=True)

    # ── Push subscriptions ──
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
