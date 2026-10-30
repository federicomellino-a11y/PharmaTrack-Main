import os
import logging
from datetime import datetime, timezone
from fastapi import APIRouter

from app.core.database import db, database_name
from app.core.config import *
from app.core.notifications import (
    push_notifications_enabled,
)
from app.models.schemas import *

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/health")
async def public_health():
    await db.command("ping")
    return {
        "status": "ok",
        "database": database_name,
        "admin_configured": bool(ADMIN_EMAIL and ADMIN_PASSWORD),
        "push_configured": push_notifications_enabled(),
        "smtp_configured": bool(SMTP_FROM and SMTP_PASSWORD),
        "google_auth_configured": bool(os.getenv("GOOGLE_CLIENT_ID") or os.getenv("VITE_GOOGLE_CLIENT_ID")),
        "sentry_configured": bool(os.getenv("SENTRY_DSN")),
        "sentry_environment": (os.getenv("SENTRY_ENVIRONMENT") or os.getenv("ENVIRONMENT") or "") or None,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@router.get("/push/config")
async def get_push_config():
    return {
        "enabled": push_notifications_enabled(),
        "public_key": VAPID_PUBLIC_KEY if push_notifications_enabled() else None,
        "subject": VAPID_SUBJECT if push_notifications_enabled() else None,
    }

@router.get("/monitoring/config")
async def monitoring_config():
    """DSN pubblico per gli errori del browser (Sentry lo considera non segreto)."""
    dsn = (os.getenv("SENTRY_DSN") or "").strip()
    return {"sentry_dsn": dsn or None, "enabled": bool(dsn)}
