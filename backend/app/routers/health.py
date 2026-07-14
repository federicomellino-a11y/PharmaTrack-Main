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
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@router.get("/push/config")
async def get_push_config():
    return {
        "enabled": push_notifications_enabled(),
        "public_key": VAPID_PUBLIC_KEY if push_notifications_enabled() else None,
        "subject": VAPID_SUBJECT if push_notifications_enabled() else None,
    }
