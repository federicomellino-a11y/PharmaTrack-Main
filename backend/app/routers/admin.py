import hmac
import uuid
import logging
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, HTTPException, Depends, Request, Response

from app.core.database import db
from app.core.websocket import manager, richiudi_canali_revocati
from app.core.config import (
    ADMIN_EMAIL, ADMIN_NAME, ADMIN_PASSWORD, LOGIN_RATE_LIMIT, ADMIN_TOTP_SECRET, ALERT_EMAIL,
    ADMIN_2FA_EMAIL,
)
from app.core.totp import verifica_codice
from app.core.second_factor import (
    TENTATIVI_MASSIMI, genera_codice, impronta_codice, nuovo_sale, scadenza, verdetto,
)
from app.core.security import (
    get_current_admin, normalize_session_expiry, clear_cookie_variants,
    delete_pharmacy_account_data,
)
from app.core.notifications import (
    send_transactional_email, push_notifications_enabled, check_email_provider,
)
from app.models.schemas import AdminUserStatusUpdate

from app.core.limiter import limiter
from pydantic import BaseModel, Field
from typing import Literal, Optional
from app.core.piani import nuova_assegnazione, piano_corrente
from app.core.funzioni_pro import funzioni_sbloccate


class AdminLoginLoose(BaseModel):
    """Login admin: nessuna validazione di formato, la password e' quella configurata."""
    email: str
    password: str
    # Secondo fattore: obbligatorio solo se ADMIN_TOTP_SECRET e' impostato.
    totp: str = ""

class AdminCodiceEmail(BaseModel):
    """Secondo passo del login: solo il codice arrivato per email."""
    codice: str


logger = logging.getLogger(__name__)
router = APIRouter()


def stato_piano(utente: dict) -> dict:
    piano = piano_corrente(utente)
    return {**piano, "pro": funzioni_sbloccate(piano)}


def credenziali_admin_giuste(email: str, password: str) -> bool:
    """Confronto a tempo costante: il tempo di risposta non rivela quanto si e' vicini."""
    email_ok = hmac.compare_digest((email or "").encode(), (ADMIN_EMAIL or "").encode())
    password_ok = hmac.compare_digest((password or "").encode(), (ADMIN_PASSWORD or "").encode())
    return email_ok and password_ok


@router.post("/admin/login")
@limiter.limit(LOGIN_RATE_LIMIT)
async def admin_login(request: Request, data: AdminLoginLoose, response: Response):
    if not ADMIN_EMAIL or not ADMIN_PASSWORD:
        raise HTTPException(status_code=503, detail="Super amministratore non configurato")
    if not credenziali_admin_giuste(data.email, data.password):
        raise HTTPException(status_code=401, detail="Credenziali admin non valide")
    # Secondo fattore. Tre modi, in ordine di preferenza:
    # 1) TOTP configurato: il codice arriva dall'app, niente da spedire;
    # 2) codice per email: si manda adesso e la sessione si crea al passo due;
    # 3) niente di configurato: password e basta, come prima.
    if ADMIN_TOTP_SECRET:
        if not verifica_codice(ADMIN_TOTP_SECRET, data.totp):
            raise HTTPException(
                status_code=401,
                detail="Codice di verifica a 6 cifre mancante o non valido",
            )
    elif ADMIN_2FA_EMAIL:
        return await _manda_codice_email(response)

    return await _crea_sessione_admin(response)


async def _crea_sessione_admin(response: Response) -> dict:
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

class AllarmeAdmin(BaseModel):
    """Messaggio di allarme dagli automatismi (testo semplice, limitato)."""
    oggetto: str
    testo: str


@router.post("/admin/alerts/notify")
async def admin_allarme(data: AllarmeAdmin, admin: dict = Depends(get_current_admin)):
    """Manda all'amministratore un allarme generato dagli automatismi.

    GitHub Actions non puo' scrivere a Brevo: gli indirizzi dei runner non sono
    in allowlist e cambiano a ogni esecuzione. Il backend invece ha un indirizzo
    autorizzato, quindi l'allarme passa da qui.
    """
    oggetto = (data.oggetto or "").strip()[:150]
    testo = (data.testo or "").strip()[:8000]
    if not oggetto or not testo:
        raise HTTPException(status_code=400, detail="Oggetto e testo sono obbligatori")
    destinatario = ALERT_EMAIL or ADMIN_EMAIL
    inviata = await send_transactional_email(destinatario, oggetto, testo)
    try:
        await db.audit_log.insert_one({
            "audit_id": f"aud_{datetime.now(timezone.utc).timestamp():.0f}",
            "entity": "sistema", "entity_id": "allarme", "action": "alert_notify",
            "actor": (admin or {}).get("email"), "actor_role": "super_admin",
            "detail": {"oggetto": oggetto, "inviata": inviata, "a": destinatario},
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
    except Exception:  # pragma: no cover
        logger.warning("audit dell'allarme non registrato")
    if not inviata:
        raise HTTPException(status_code=502, detail="Invio non riuscito")
    return {"inviata": True, "a": destinatario}


async def _manda_codice_email(response: Response) -> dict:
    """Genera il codice, lo manda per email e dice al client di attendere il passo due."""
    if not (ALERT_EMAIL or ADMIN_EMAIL):
        raise HTTPException(status_code=503, detail="Nessun indirizzo per il codice di verifica")
    destinatario = ALERT_EMAIL or ADMIN_EMAIL
    codice = genera_codice()
    sale = nuovo_sale()
    try:
        await db.admin_2fa.delete_many({"admin_email": ADMIN_EMAIL})
        await db.admin_2fa.insert_one({
            "admin_email": ADMIN_EMAIL,
            "sale": sale,
            "impronta": impronta_codice(codice, sale),
            "tentativi": 0,
            "creato": datetime.now(timezone.utc),
            "scade": scadenza(),
        })
    except Exception as exc:  # pragma: no cover - dipende dal database
        logger.error("codice di verifica non salvato: %s", exc)
        raise HTTPException(status_code=503, detail="Codice di verifica non disponibile")

    testo = (
        f"Il tuo codice di accesso a PharmaTrack e' {codice}.\n\n"
        f"Vale {10} minuti e una sola volta. Se non hai provato ad accedere tu, "
        "qualcuno ha la password della console: cambiala su Render."
    )
    inviata = await send_transactional_email(destinatario, "PharmaTrack: codice di accesso", testo)
    if not inviata:
        await db.admin_2fa.delete_many({"admin_email": ADMIN_EMAIL})
        raise HTTPException(status_code=502, detail="Codice non inviato: posta non disponibile")

    response.status_code = 202
    return {"secondo_fattore": "email", "destinatario": destinatario}


@router.post("/admin/login/2fa")
@limiter.limit(LOGIN_RATE_LIMIT)
async def admin_login_secondo_passo(
    request: Request, data: AdminCodiceEmail, response: Response,
):
    """Secondo passo: verifica il codice e solo allora apre la sessione."""
    if not ADMIN_2FA_EMAIL:
        raise HTTPException(status_code=404, detail="Secondo fattore non attivo")

    record = await db.admin_2fa.find_one({"admin_email": ADMIN_EMAIL}, {"_id": 0})
    esito = verdetto(record, data.codice)

    if esito == "ok":
        await db.admin_2fa.delete_many({"admin_email": ADMIN_EMAIL})
        return await _crea_sessione_admin(response)

    if esito in ("assente", "scaduto", "tentativi"):
        await db.admin_2fa.delete_many({"admin_email": ADMIN_EMAIL})
        raise HTTPException(
            status_code=401,
            detail="Codice scaduto o non piu' valido: accedi di nuovo per riceverne un altro",
        )

    # codice sbagliato: il tentativo si conta, e al quinto il codice muore
    await db.admin_2fa.update_one(
        {"admin_email": ADMIN_EMAIL}, {"$inc": {"tentativi": 1}},
    )
    rimasti = max(0, TENTATIVI_MASSIMI - (int(record.get("tentativi") or 0) + 1))
    raise HTTPException(
        status_code=401,
        detail=f"Codice non corretto. Tentativi rimasti: {rimasti}",
    )


@router.get("/admin/email/status")
async def admin_email_status(admin: dict = Depends(get_current_admin)):
    """Verifica dal vivo le credenziali del provider email, senza inviare nulla."""
    return await check_email_provider()


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
        item["piano_stato"] = stato_piano(item)
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

    user["piano_stato"] = stato_piano(user)
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
        await richiudi_canali_revocati("pharmacy", user_id)
        for driver_id in driver_ids:
            await richiudi_canali_revocati("driver", driver_id)

    user = await db.users.find_one({"user_id": user_id}, {"_id": 0, "password_hash": 0})
    return user

class AssegnaPro(BaseModel):
    """Funzioni Pro decise dall'amministratore: accese (con o senza scadenza), spente o automatiche."""
    stato: Literal["attivo", "spento", "automatico"]
    mesi: Optional[int] = Field(default=None, ge=1, le=36)
    scadenza: Optional[str] = Field(default=None, max_length=32)


@router.put("/admin/users/{user_id}/pro")
async def admin_assegna_pro(user_id: str, data: AssegnaPro, admin: dict = Depends(get_current_admin)):
    try:
        assegnazione = nuova_assegnazione(data.stato, data.mesi, data.scadenza)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    modifica = {"$set": {"pro_admin": assegnazione}} if assegnazione else {"$unset": {"pro_admin": ""}}
    result = await db.users.update_one({"user_id": user_id}, modifica)
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Utente non trovato")
    user = await db.users.find_one({"user_id": user_id}, {"_id": 0, "password_hash": 0})
    user["piano_stato"] = stato_piano(user)
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
            "chat_threads": {
                "description": "Thread di chat (piu' conversazioni per fattorino)",
                "primary_keys": ["conversation_id"],
                "important_fields": ["pharmacy_id", "driver_id", "number", "status", "last_message", "last_message_at", "created_at", "closed_at"],
            },
            "photo_files": {
                "description": "Foto POD su GridFS locale (fallback senza Cloudinary)",
                "primary_keys": ["photo_id"],
                "important_fields": ["delivery_id", "pharmacy_id", "driver_id", "content_type", "size", "created_at"],
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
