import hashlib
import os
import uuid
import logging
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, HTTPException, Depends, Request, Response

from app.core.database import db
from app.core.passwords import hash_password, needs_rehash, verify_password
from app.core.config import APP_BASE_URL, FORGOT_RATE_LIMIT, LOGIN_RATE_LIMIT, REGISTER_RATE_LIMIT, RESET_RATE_LIMIT
from app.core.piani import nuovo_profilo_piano
from app.core.security import (
    get_current_user, clear_cookie_variants, delete_pharmacy_account_data,
    normalizza_email, trova_per_email,
)
from app.core.websocket import richiudi_canali_revocati
from app.core.notifications import (
    send_transactional_email,
)
from app.models.schemas import ChangePasswordRequest, ForgotPasswordRequest, GoogleAuthRequest, PharmacyLogin, PharmacyRegister, ResetPasswordRequest, VerifyEmailRequest

from app.core.limiter import limiter

logger = logging.getLogger(__name__)
router = APIRouter()


async def _send_verification_email(user_id: str, email: str, name: str) -> str:
    token = uuid.uuid4().hex
    expires_at = datetime.now(timezone.utc) + timedelta(hours=24)
    await db.email_verifications.delete_many({"user_id": user_id})
    await db.email_verifications.insert_one({
        "user_id": user_id,
        "token": token,
        "expires_at": expires_at.isoformat(),
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    verify_url = f"{APP_BASE_URL}/verify-email?token={token}"
    html_body = f"""
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
      <h2 style="color:#0d9488">PharmaTrack — Verifica la tua email</h2>
      <p>Ciao <strong>{name}</strong>,</p>
      <p>Grazie per esserti registrato. Conferma il tuo indirizzo email per completare l'attivazione dell'account.</p>
      <p style="margin:24px 0">
        <a href="{verify_url}" style="background:#0d9488;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold">
          Verifica email
        </a>
      </p>
      <p style="color:#666;font-size:13px">Il link scade tra 24 ore. Se non ti sei registrato, ignora questa email.</p>
    </div>
    """
    text_body = f"Ciao {name},\n\nVerifica la tua email su PharmaTrack:\n{verify_url}\n\nIl link scade tra 24 ore."
    sent = await send_transactional_email(email, "Verifica la tua email — PharmaTrack", text_body, html_body)
    if not sent:
        logger.info("SMTP non configurato – verify URL: %s", verify_url)
    return verify_url


@router.post("/auth/register")
@limiter.limit(REGISTER_RATE_LIMIT)
async def register(request: Request, data: PharmacyRegister, response: Response):
    email = normalizza_email(data.email)
    existing = await trova_per_email(db.users, email)
    if existing:
        raise HTTPException(status_code=400, detail="Email già registrata")
    
    password_hash = hash_password(data.password)
    user_id = f"user_{uuid.uuid4().hex[:12]}"
    
    new_user = {
        "user_id": user_id,
        "email": email,
        "role": "pharmacy",
        "name": data.name,
        "password_hash": password_hash,
        "picture": None,
        "is_active": True,
        "email_verified": False,
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
        "created_at": datetime.now(timezone.utc).isoformat(),
        **nuovo_profilo_piano(),
    }
    await db.users.insert_one(new_user)
    await _send_verification_email(user_id, email, data.name)

    session_token = await _apri_sessione(request, user_id)
    
    response.set_cookie(key="session_token", value=session_token, httponly=True,
                        secure=True, samesite="none", path="/", max_age=7*24*60*60)
    
    return {k: v for k, v in new_user.items() if k not in ["_id", "password_hash"]}

@router.post("/auth/login")
@limiter.limit(LOGIN_RATE_LIMIT)
async def login(request: Request, data: PharmacyLogin, response: Response):
    user = await trova_per_email(db.users, data.email)
    if not user:
        raise HTTPException(status_code=401, detail="Credenziali non valide")
    
    if not verify_password(data.password, user.get("password_hash", "")):
        raise HTTPException(status_code=401, detail="Credenziali non valide")
    # Ri-hash trasparente: un hash con costo vecchio viene aggiornato adesso che
    # la password in chiaro e' disponibile, senza disturbare l'utente.
    if needs_rehash(user.get("password_hash", "")):
        try:
            await db.users.update_one(
                {"user_id": user["user_id"]},
                {"$set": {"password_hash": hash_password(data.password)}},
            )
        except Exception:
            logger.exception("ri-hash della password fallito per %s", user.get("user_id"))
    if user.get("is_active", True) is False:
        raise HTTPException(status_code=403, detail="Account disattivato")
    
    session_token = await _apri_sessione(request, user["user_id"])
    
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
        sessione = await db.user_sessions.find_one({"session_token": session_token}, {"_id": 0, "user_id": 1})
        await db.user_sessions.delete_many({"session_token": session_token})
        if sessione:
            await richiudi_canali_revocati("pharmacy", sessione["user_id"])
    clear_cookie_variants(response, "session_token")
    return {"message": "Logged out"}

@router.post("/auth/forgot-password")
@limiter.limit(FORGOT_RATE_LIMIT)
async def forgot_password(request: Request, data: ForgotPasswordRequest):
    user = await trova_per_email(db.users, data.email)
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

    reset_url = f"{APP_BASE_URL}/reset-password?token={reset_token}"
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

    email_sent = await send_transactional_email(user["email"], "Recupero password PharmaTrack", text_body, html_body)
    if not email_sent:
        logger.info("SMTP non configurato – reset URL: %s", reset_url)

    return {"message": "Se l'email esiste, riceverai le istruzioni"}


@router.post("/auth/reset-password")
@limiter.limit(RESET_RATE_LIMIT)
async def reset_password(request: Request, data: ResetPasswordRequest):
    record = await db.password_reset_tokens.find_one({"token": data.token})
    if not record:
        raise HTTPException(status_code=400, detail="Link non valido o già utilizzato")

    expires_at = datetime.fromisoformat(record["expires_at"])
    if datetime.now(timezone.utc) > expires_at:
        await db.password_reset_tokens.delete_one({"token": data.token})
        raise HTTPException(status_code=400, detail="Link scaduto. Richiedine uno nuovo")

    if len(data.new_password) < 8:
        raise HTTPException(status_code=422, detail="La password deve contenere almeno 8 caratteri")

    new_hash = hash_password(data.new_password)
    await db.users.update_one({"user_id": record["user_id"]}, {"$set": {"password_hash": new_hash}})
    await db.password_reset_tokens.delete_one({"token": data.token})
    await db.user_sessions.delete_many({"user_id": record["user_id"]})
    await richiudi_canali_revocati("pharmacy", record["user_id"])
    return {"message": "Password aggiornata con successo"}


@router.post("/auth/verify-email")
async def verify_email(data: VerifyEmailRequest):
    record = await db.email_verifications.find_one({"token": data.token})
    if not record:
        raise HTTPException(status_code=400, detail="Link di verifica non valido o già utilizzato")
    expires_at = datetime.fromisoformat(record["expires_at"])
    if datetime.now(timezone.utc) > expires_at:
        await db.email_verifications.delete_one({"token": data.token})
        raise HTTPException(status_code=400, detail="Link di verifica scaduto. Richiedine uno nuovo")
    await db.users.update_one({"user_id": record["user_id"]}, {"$set": {"email_verified": True}})
    await db.email_verifications.delete_many({"user_id": record["user_id"]})
    return {"message": "Email verificata con successo"}


@router.post("/auth/resend-verification")
@limiter.limit(FORGOT_RATE_LIMIT)
async def resend_verification(request: Request, user: dict = Depends(get_current_user)):
    if user.get("email_verified"):
        return {"message": "Email già verificata"}
    await _send_verification_email(user["user_id"], user["email"], user.get("name") or "")
    return {"message": "Email di verifica inviata"}


@router.get("/auth/google/config")
async def google_config():
    """Client ID pubblico: il frontend lo usa per 'Continua con Google'."""
    client_id = os.environ.get("GOOGLE_CLIENT_ID") or os.environ.get("VITE_GOOGLE_CLIENT_ID") or ""
    return {"client_id": client_id, "enabled": bool(client_id)}


GOOGLE_ISSUERS = ("accounts.google.com", "https://accounts.google.com")


def _leggi_token_google(credential: str) -> dict:
    import urllib.parse
    import urllib.request
    import json as _json
    url = "https://oauth2.googleapis.com/tokeninfo?id_token=" + urllib.parse.quote(credential, safe="")
    with urllib.request.urlopen(url, timeout=5) as r:
        return _json.loads(r.read().decode())


def controlla_token_google(payload: dict, client_id: str) -> str:
    """Il token deve essere per PharmaTrack, emesso da Google, con email confermata."""
    if not client_id:
        raise HTTPException(status_code=503, detail="Accesso con Google non configurato")
    if payload.get("aud") != client_id or payload.get("iss") not in GOOGLE_ISSUERS:
        raise HTTPException(status_code=401, detail="Token Google non valido per questa applicazione")
    email = payload.get("email")
    if not email:
        raise HTTPException(status_code=400, detail="Email non disponibile dall'account Google")
    if str(payload.get("email_verified")).lower() != "true":
        raise HTTPException(status_code=401, detail="Email Google non verificata")
    return email


@router.post("/auth/google")
@limiter.limit(LOGIN_RATE_LIMIT)
async def google_auth(request: Request, data: GoogleAuthRequest, response: Response):
    import asyncio
    google_client_id = os.environ.get("GOOGLE_CLIENT_ID") or os.environ.get("VITE_GOOGLE_CLIENT_ID") or ""
    if not google_client_id:
        raise HTTPException(status_code=503, detail="Accesso con Google non configurato")
    try:
        payload = await asyncio.to_thread(_leggi_token_google, data.credential)
    except Exception as exc:
        logger.error("Google token verification failed: %s", exc)
        raise HTTPException(status_code=401, detail="Token Google non valido")

    email = normalizza_email(controlla_token_google(payload, google_client_id))

    user = await trova_per_email(db.users, email)

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
            **nuovo_profilo_piano(),
        }
        await db.users.insert_one(user)
    elif user.get("is_active", True) is False:
        raise HTTPException(status_code=403, detail="Account disattivato")

    session_token = await _apri_sessione(request, user["user_id"])
    response.set_cookie(key="session_token", value=session_token, httponly=True,
                        secure=True, samesite="none", path="/", max_age=7*24*60*60)
    return {k: v for k, v in user.items() if k not in ["_id", "password_hash"]}


# ---------- Sessioni ----------

def _etichetta_dispositivo(user_agent: str) -> str:
    """Un nome che si riconosce in elenco: "iPhone · Safari", "PC · Chrome"."""
    ua = (user_agent or "").lower()
    if not ua:
        return "Dispositivo sconosciuto"
    if "iphone" in ua:
        dispositivo = "iPhone"
    elif "ipad" in ua:
        dispositivo = "iPad"
    elif "android" in ua:
        dispositivo = "Android"
    elif "macintosh" in ua or "mac os" in ua:
        dispositivo = "Mac"
    elif "windows" in ua:
        dispositivo = "PC Windows"
    elif "linux" in ua:
        dispositivo = "PC Linux"
    else:
        dispositivo = "Dispositivo"

    if "edg/" in ua:
        browser = "Edge"
    elif "opr/" in ua or "opera" in ua:
        browser = "Opera"
    elif "chrome" in ua or "crios" in ua:
        browser = "Chrome"
    elif "firefox" in ua or "fxios" in ua:
        browser = "Firefox"
    elif "safari" in ua:
        browser = "Safari"
    else:
        browser = "browser"
    return f"{dispositivo} · {browser}"


async def _apri_sessione(request: Request, user_id: str) -> str:
    """Apre una sessione senza chiudere quelle degli altri dispositivi.

    Prima ogni login cancellava tutte le sessioni dell'utente: entrare dal
    telefono buttava fuori il PC del banco. Adesso le sessioni convivono, e la
    farmacia puo' vederle e chiuderle da Impostazioni.
    """
    session_token = f"sess_{uuid.uuid4().hex}"
    await db.user_sessions.insert_one({
        "user_id": user_id,
        "session_token": session_token,
        "user_agent": (request.headers.get("user-agent") or "")[:300],
        "expires_at": datetime.now(timezone.utc) + timedelta(days=7),
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    # Pulizia opportunistica: le sessioni scadute di questo utente non servono.
    await db.user_sessions.delete_many({
        "user_id": user_id,
        "expires_at": {"$lt": datetime.now(timezone.utc)},
    })
    return session_token


def _id_sessione(session_token: str) -> str:
    """Identificativo pubblico di una sessione: non e' il token e non lo rivela."""
    return hashlib.sha256(str(session_token).encode()).hexdigest()[:12]


async def _sessioni_utente(request: Request) -> tuple:
    token_corrente = request.cookies.get("session_token")
    if not token_corrente:
        intestazione = request.headers.get("Authorization") or ""
        if intestazione.startswith("Bearer "):
            token_corrente = intestazione.split(" ", 1)[1]
    corrente = await db.user_sessions.find_one({"session_token": token_corrente}, {"_id": 0})
    if not corrente:
        raise HTTPException(status_code=401, detail="Invalid session")
    righe = await db.user_sessions.find(
        {"user_id": corrente["user_id"]}, {"_id": 0}
    ).sort("created_at", -1).to_list(50)
    return righe, token_corrente


@router.get("/auth/sessions")
async def elenco_sessioni(request: Request, user: dict = Depends(get_current_user)):
    righe, token_corrente = await _sessioni_utente(request)
    return [
        {
            "id": _id_sessione(riga.get("session_token")),
            "dispositivo": _etichetta_dispositivo(riga.get("user_agent")),
            "created_at": riga.get("created_at"),
            "corrente": riga.get("session_token") == token_corrente,
        }
        for riga in righe
    ]


@router.post("/auth/sessions/revoke")
async def revoca_sessioni(request: Request, user: dict = Depends(get_current_user)):
    """Chiude le altre sessioni, o una sola se arriva il suo id."""
    body = await request.json() if request.headers.get("content-length") not in (None, "0") else {}
    righe, token_corrente = await _sessioni_utente(request)
    richiesto = (body or {}).get("session_id")
    if richiesto:
        token = next((r["session_token"] for r in righe if _id_sessione(r.get("session_token")) == richiesto), None)
        if not token:
            raise HTTPException(status_code=404, detail="Sessione non trovata")
        if token == token_corrente:
            raise HTTPException(status_code=422, detail="Questa e' la sessione che stai usando: per uscire, esci.")
        await db.user_sessions.delete_one({"session_token": token})
        await richiudi_canali_revocati("pharmacy", user["user_id"])
        return {"chiuse": 1, "restano": len(righe) - 1}
    altre = [r["session_token"] for r in righe if r.get("session_token") != token_corrente]
    if altre:
        await db.user_sessions.delete_many({"session_token": {"$in": altre}})
        await richiudi_canali_revocati("pharmacy", user["user_id"])
    return {"chiuse": len(altre), "restano": 1}


@router.post("/auth/change-password")
async def change_password(request: Request, data: ChangePasswordRequest, user: dict = Depends(get_current_user)):
    """Cambio password da dentro l'app, senza passare dalla mail.

    Chiude anche le altre sessioni: se la password era nota a qualcun altro,
    quel qualcuno non deve restare dentro con la sessione gia' aperta.
    """
    # La password da cambiare e' quella dell'account della sessione: si
    # rilegge dal token, non da user["user_id"], che arriva dal DB.
    righe, token_corrente = await _sessioni_utente(request)
    corrente = next((r for r in righe if r.get("session_token") == token_corrente), None)
    if not corrente:
        raise HTTPException(status_code=401, detail="Invalid session")
    proprietario = corrente["user_id"]
    utente = await db.users.find_one({"user_id": proprietario}, {"_id": 0, "password_hash": 1})
    if not utente or not verify_password(data.current_password, utente.get("password_hash", "")):
        raise HTTPException(status_code=400, detail="La password attuale non e' corretta")
    if len(data.new_password) < 8:
        raise HTTPException(status_code=422, detail="La password deve contenere almeno 8 caratteri")
    if data.current_password == data.new_password:
        raise HTTPException(status_code=422, detail="La nuova password e' identica a quella attuale")
    await db.users.update_one(
        {"user_id": proprietario},
        {"$set": {"password_hash": hash_password(data.new_password)}},
    )
    await db.user_sessions.delete_many({
        "user_id": proprietario,
        "session_token": {"$ne": token_corrente},
    })
    await richiudi_canali_revocati("pharmacy", proprietario)
    return {"message": "Password aggiornata"}


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
