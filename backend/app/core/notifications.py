import os
import json
import asyncio
import smtplib
import ssl
import uuid
import logging
from datetime import datetime, timezone
from typing import Optional
from email.message import EmailMessage
import httpx
from fastapi import HTTPException, Request

from app.core.database import db
from app.core.websocket import manager
from app.core.config import (
    VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT,
    SMTP_HOST, SMTP_PORT, SMTP_USERNAME, SMTP_PASSWORD, SMTP_FROM,
    SMTP_USE_TLS, SMTP_USE_SSL,
)

try:
    from pywebpush import webpush, WebPushException
except Exception:  # pragma: no cover
    webpush = None

    class WebPushException(Exception):
        pass

logger = logging.getLogger(__name__)


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
