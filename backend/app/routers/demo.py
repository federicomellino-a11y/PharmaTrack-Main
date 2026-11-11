"""Accesso alla demo senza credenziali nel browser.

Perché esiste
-------------
Fino all'11 novembre le credenziali dell'account demo stavano dentro
`LandingPage.jsx`, quindi nel JavaScript che chiunque scarica: `test@farmaciaprova.it`
/ `Test1234!` erano leggibili da chiunque aprisse il bundle. Ora il browser
chiede al server "apri la demo come farmacia" e il server decide quale account
è quello demo e gli apre la sessione.

Nessuna password vive nel codice: qui si cerca solo l'email dell'account demo
(`DEMO_PHARMACY_EMAIL`, `DEMO_DRIVER_EMAIL`) e si chiama la stessa apertura di
sessione del login normale. Se gli account demo non esistono più, l'endpoint
risponde 503 e i pulsanti dicono che la demo non è disponibile, invece di
lasciare il visitatore davanti a un errore incomprensibile.

Cosa NON è: non è una scorciatoia per entrare in un tenant qualsiasi. Gli
account sono quelli demo e basta, la rotta è a rate limit come le altre
pubbliche, e la sessione che apre è una sessione normale (7 giorni, revocabile
da Impostazioni → Sessioni).
"""
from __future__ import annotations

import logging
import re

from fastapi import APIRouter, HTTPException, Request, Response

from app.core.config import DEMO_DRIVER_EMAIL, DEMO_PHARMACY_EMAIL, PUBLIC_WRITE_RATE_LIMIT
from app.core.database import db
from app.core.limiter import limiter
from app.routers.driver_auth import apri_sessione_fattorino
from app.routers.pharmacy_auth import _apri_sessione

logger = logging.getLogger(__name__)
router = APIRouter()

RUOLI = ("pharmacy", "driver")
COOKIE_FARMACIA = "session_token"
COOKIE_FATTORINO = "driver_session_token"
MAX_AGE = 7 * 24 * 60 * 60


def email_demo(ruolo: str) -> str:
    """L'email dell'account demo per il ruolo richiesto (funzione pura)."""
    if ruolo == "pharmacy":
        return (DEMO_PHARMACY_EMAIL or "").strip()
    if ruolo == "driver":
        return (DEMO_DRIVER_EMAIL or "").strip()
    raise ValueError(f"ruolo demo sconosciuto: {ruolo!r}")


async def _trova_per_email(collezione, email: str) -> dict | None:
    """Come il login: prima l'email esatta, poi senza badare alle maiuscole."""
    documento = await collezione.find_one({"email": email}, {"_id": 0})
    if documento:
        return documento
    return await collezione.find_one(
        {"email": {"$regex": f"^{re.escape(email)}$", "$options": "i"}}, {"_id": 0}
    )


@router.post("/auth/demo")
@limiter.limit(PUBLIC_WRITE_RATE_LIMIT)
async def demo_login(request: Request, response: Response):
    try:
        corpo = await request.json()
    except Exception:
        corpo = {}
    ruolo = str((corpo or {}).get("ruolo") or "").strip()
    if ruolo not in RUOLI:
        raise HTTPException(status_code=422, detail="ruolo deve essere 'pharmacy' o 'driver'")

    email = email_demo(ruolo)
    if not email:
        logger.warning("demo richiesta ma DEMO_%s_EMAIL non impostata", ruolo.upper())
        raise HTTPException(status_code=503, detail="Demo non disponibile")

    if ruolo == "pharmacy":
        utente = await _trova_per_email(db.users, email)
        if not utente or utente.get("is_active", True) is False:
            raise HTTPException(status_code=503, detail="Demo non disponibile")
        token = await _apri_sessione(request, utente["user_id"])
        response.set_cookie(
            key=COOKIE_FARMACIA, value=token, httponly=True,
            secure=True, samesite="none", path="/", max_age=MAX_AGE,
        )
        logger.info("demo farmacia aperta da %s", request.client.host if request.client else "?")
        return {k: v for k, v in utente.items() if k != "password_hash"}

    fattorino = await _trova_per_email(db.drivers, email)
    if not fattorino or not fattorino.get("is_active", True):
        raise HTTPException(status_code=503, detail="Demo non disponibile")
    farmacia = await db.users.find_one(
        {"user_id": fattorino.get("pharmacy_id")}, {"_id": 0, "user_id": 1, "is_active": 1}
    )
    if not farmacia or farmacia.get("is_active", True) is False:
        raise HTTPException(status_code=503, detail="Demo non disponibile")

    token = await apri_sessione_fattorino(fattorino["driver_id"])
    response.set_cookie(
        key=COOKIE_FATTORINO, value=token, httponly=True,
        secure=True, samesite="none", path="/", max_age=MAX_AGE,
    )
    logger.info("demo fattorino aperta da %s", request.client.host if request.client else "?")
    return {k: v for k, v in fattorino.items() if k != "password_hash"}
