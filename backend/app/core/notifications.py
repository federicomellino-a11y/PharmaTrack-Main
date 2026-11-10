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

# Ultimo esito di invio, per non lasciare che un provider morto passi in silenzio:
# prima l'unica traccia era una riga di log che nessuno leggeva.
STATO_EMAIL = {"ultimo_errore": None, "ultimo_successo": None}


def email_provider() -> str:
    """Quale strada usa l'invio: chiave API Brevo, chiave SMTP Brevo, SMTP generico o niente."""
    chiave = SMTP_PASSWORD or ""
    if chiave.startswith("xkeysib-"):
        return "brevo-api"
    if chiave.startswith("xsmtpsib-"):
        return "brevo-smtp"
    if SMTP_HOST and SMTP_USERNAME and chiave:
        return "smtp"
    return "non configurato"


def brevo_verdict(status_code: Optional[int], body: Optional[str]) -> dict:
    """Interpreta la risposta di /v3/account. Separata dalla rete per poterla testare."""
    if status_code == 200:
        return {"ok": True, "stato": 200, "errore": None}
    testo = (body or "").strip()[:200]
    if status_code == 401:
        return {
            "ok": False,
            "stato": 401,
            "errore": "Brevo rifiuta la chiave API (401)" + (": " + testo if testo else ""),
        }
    if status_code is None:
        return {"ok": False, "stato": None, "errore": "Brevo non raggiungibile" + (": " + testo if testo else "")}
    return {"ok": False, "stato": status_code, "errore": f"Brevo ha risposto {status_code}" + (": " + testo if testo else "")}


def registra_esito_email(ok: bool, dettaglio: Optional[str] = None) -> None:
    adesso = datetime.now(timezone.utc).isoformat()
    if ok:
        STATO_EMAIL["ultimo_successo"] = adesso
        STATO_EMAIL["ultimo_errore"] = None
    else:
        STATO_EMAIL["ultimo_errore"] = {"quando": adesso, "errore": (dettaglio or "")[:300]}


def _smtp_login_ok() -> bool:
    contesto = ssl.create_default_context()
    try:
        if SMTP_USE_SSL:
            with smtplib.SMTP_SSL(SMTP_HOST, SMTP_PORT, context=contesto, timeout=10) as server:
                server.login(SMTP_USERNAME, SMTP_PASSWORD)
        else:
            with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=10) as server:
                if SMTP_USE_TLS:
                    server.starttls(context=contesto)
                server.login(SMTP_USERNAME, SMTP_PASSWORD)
        return True
    except Exception as exc:
        logger.warning("Login SMTP di verifica fallito: %s", exc)
        return False


async def check_email_provider() -> dict:
    """Chiede al provider se le credenziali valgono davvero, senza mandare nessuna email."""
    provider = email_provider()
    if provider == "brevo-api":
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.get(
                    "https://api.brevo.com/v3/account", headers={"api-key": SMTP_PASSWORD}
                )
            esito = brevo_verdict(resp.status_code, resp.text)
        except Exception as exc:
            esito = brevo_verdict(None, str(exc))
        esito["provider"] = provider
        return esito
    if provider in ("brevo-smtp", "smtp"):
        ok = await asyncio.to_thread(_smtp_login_ok)
        return {
            "provider": provider,
            "ok": ok,
            "stato": 200 if ok else 401,
            "errore": None if ok else "Login SMTP rifiutato dal server",
        }
    return {
        "provider": provider,
        "ok": False,
        "stato": None,
        "errore": "Credenziali email non configurate (mancano SMTP_FROM o SMTP_PASSWORD)",
    }


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


def documento_sottoscrizione(user_id: str, user_type: str, endpoint: str,
                              subscription: dict, user_agent: str | None,
                              now: str | None = None) -> dict:
    """Costruisce l'aggiornamento della sottoscrizione push.

    `created_at` sta SOLO in `$setOnInsert`. Prima era anche in `$set` e Mongo
    rispondeva "Updating the path 'created_at' would create a conflict at
    'created_at'" con un 500: il browser lo mostrava come errore CORS, perche'
    su un 500 non gestito il middleware CORS non aggiunge le intestazioni.
    """
    momento = now or datetime.now(timezone.utc).isoformat()
    return {
        "$set": {
            "user_id": user_id,
            "user_type": user_type,
            "endpoint": endpoint,
            "subscription": subscription,
            "user_agent": user_agent,
            "updated_at": momento,
        },
        "$setOnInsert": {"created_at": momento},
    }


async def upsert_push_subscription(user_id: str, user_type: str, payload: dict, request: Request) -> dict:
    subscription = payload.get("subscription") if isinstance(payload, dict) else None
    endpoint = subscription.get("endpoint") if isinstance(subscription, dict) else None
    keys = subscription.get("keys") if isinstance(subscription, dict) else None

    if not endpoint or not isinstance(keys, dict) or not keys.get("p256dh") or not keys.get("auth"):
        raise HTTPException(status_code=400, detail="Sottoscrizione push non valida")

    aggiornamento = documento_sottoscrizione(
        user_id, user_type, endpoint, subscription, request.headers.get("user-agent"),
    )
    await db.push_subscriptions.update_one(
        {"user_id": user_id, "user_type": user_type, "endpoint": endpoint},
        aggiornamento,
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


# Le famiglie di avvisi che la farmacia puo' accendere e spegnere da sola.
# Il tipo interno resta quello scritto nelle chiamate (delivery, shift): qui
# c'e' solo la traduzione in una scelta comprensibile a chi non legge il codice.
EVENTI_NOTIFICHE = {
    "delivery": "Consegne",
    "shift": "Turni",
    "message": "Messaggi",
}


def preferenze_eventi(user: dict) -> dict:
    """Cosa la farmacia vuole ricevere. Assente significa acceso."""
    preferenze = ((user or {}).get("settings") or {}).get("notifiche_eventi") or {}
    # Solo un False scritto davvero spegne: un valore storto nel JSON non deve
    # silenziare gli avvisi di una farmacia.
    return {chiave: preferenze.get(chiave, True) is not False for chiave in EVENTI_NOTIFICHE}


def evento_consentito(user: dict, notif_type: str) -> bool:
    """Un evento spento non produce ne' notifica in app ne' push.

    Spenta la campanella, il registro degli avvisi resta: le notifiche gia'
    ricevute non si toccano, semplicemente non se ne aggiungono di nuove per
    quella famiglia. I tipi non elencati in EVENTI_NOTIFICHE passano sempre.
    """
    if notif_type not in EVENTI_NOTIFICHE:
        return True
    return preferenze_eventi(user)[notif_type]


def notifiche_browser_accese(user: dict) -> bool:
    return ((user or {}).get("settings") or {}).get("notifications_enabled", True) is not False


# Ore di silenzio: se la farmacia non compila niente, valgono queste. Il
# silenzio comincia la sera e finisce la mattina, quindi scavalca la mezzanotte.
SILENZIO_DA_DEFAULT = "21:30"
SILENZIO_A_DEFAULT = "07:30"


def _minuti_da_orario(valore) -> Optional[int]:
    """'21:30' -> 1290. Qualunque altra cosa -> None (e il silenzio non si applica)."""
    try:
        ore, minuti = str(valore).strip().split(":")[:2]
        ore, minuti = int(ore), int(minuti)
    except (TypeError, ValueError):
        return None
    if not (0 <= ore <= 23 and 0 <= minuti <= 59):
        return None
    return ore * 60 + minuti


def in_orario_silenzio(settings: dict, adesso: Optional[datetime] = None) -> bool:
    """Vero se adesso la farmacia non vuole essere svegliata.

    Vale per le push, cioe' per il telefono che suona: la campanella dentro
    l'app resta, cosi' aprendo si trova comunque cosa e' successo. Un orario
    scritto male non silenzia niente: meglio un avviso di troppo che una
    consegna persa per un campo vuoto.
    """
    impostazioni = settings or {}
    if impostazioni.get("silenzio_attivo") is not True:
        return False
    da = _minuti_da_orario(impostazioni.get("silenzio_da") or SILENZIO_DA_DEFAULT)
    a = _minuti_da_orario(impostazioni.get("silenzio_a") or SILENZIO_A_DEFAULT)
    if da is None or a is None or da == a:
        return False
    if adesso is None:
        from app.core.clock import adesso as adesso_italia
        adesso = adesso_italia()
    elif adesso.tzinfo is None:
        from app.core.clock import ROME_TZ
        adesso = adesso.replace(tzinfo=ROME_TZ)
    else:
        from app.core.clock import ROME_TZ
        adesso = adesso.astimezone(ROME_TZ)
    ora = adesso.hour * 60 + adesso.minute
    if da < a:
        return da <= ora < a
    return ora >= da or ora < a


async def _impostazioni_destinatario(user_id: str, user_type: str) -> dict:
    """Il fattorino non ha le preferenze della farmacia: solo la farmacia le ha."""
    if user_type != "pharmacy":
        return {}
    utente = await db.users.find_one({"user_id": user_id}, {"settings": 1, "_id": 0})
    return utente or {}


async def send_web_push_notifications(user_id: str, user_type: str, notif_data: dict) -> dict:
    if not push_notifications_enabled():
        return {"sent": 0, "disabled": True}

    impostazioni = await _impostazioni_destinatario(user_id, user_type)

    # Chi ha spento le notifiche browser resta senza push, ma continua a vedere
    # la campanella: le due cose sono sempre state due interruttori diversi e
    # finora il secondo non veniva guardato da nessuno.
    if not notifiche_browser_accese(impostazioni):
        return {"sent": 0, "disabled": True, "motivo": "notifiche spente dall'utente"}

    # Non disturbare: di notte il telefono tace, l'avviso resta in app. Vale
    # solo per la farmacia, che e' l'unica ad avere un orario di lavoro.
    if user_type == "pharmacy" and in_orario_silenzio(impostazioni):
        return {"sent": 0, "disabled": True, "motivo": "orario di non disturbo"}

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
                registra_esito_email(True)
                return True
            logger.error("Brevo API error to %s: %s %s", to_address, resp.status_code, resp.text)
            registra_esito_email(False, f"Brevo {resp.status_code}: {resp.text}")
            return False
        except Exception as exc:
            logger.error("Brevo API exception to %s: %s", to_address, exc)
            registra_esito_email(False, f"Brevo eccezione: {exc}")
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
    if not evento_consentito(await _impostazioni_destinatario(user_id, user_type), notif_type):
        return None
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
