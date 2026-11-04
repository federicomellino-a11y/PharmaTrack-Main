"""Segnalazioni di violazione Content-Security-Policy.

La CSP viaggia in modalita' solo-segnalazione: il browser non blocca niente ma
riferisce qui cosa avrebbe bloccato. Serve a scoprire sorgenti che dal codice
non si vedono (un iframe iniettato da Google, una tile servita da un dominio
diverso, un'estensione del browser) prima di trasformare la policy in
bloccante.
"""
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Request

from app.core.config import CSP_REPORT_RATE_LIMIT
from app.core.database import db
from app.core.limiter import limiter
from app.core.security import get_current_admin

logger = logging.getLogger(__name__)
router = APIRouter()

MAX_CAMPI = 300


def _estrai_report(body) -> dict | None:
    """Accetta entrambi i formati che i browser usano per segnalare."""
    if isinstance(body, list) and body:
        body = body[0]
    if not isinstance(body, dict):
        return None
    if isinstance(body.get("csp-report"), dict):
        return body["csp-report"]
    if isinstance(body.get("body"), dict):
        return body["body"]
    return None


def _testo(valore) -> str:
    return str(valore or "")[:MAX_CAMPI]


@router.post("/csp-report")
@limiter.limit(CSP_REPORT_RATE_LIMIT)
async def csp_report(request: Request) -> dict:
    """Endpoint pubblico: il browser non manda credenziali utili qui."""
    try:
        body = await request.json()
    except Exception:
        return {"ok": False}

    report = _estrai_report(body)
    if not report:
        return {"ok": True}

    direttiva = _testo(report.get("violated-directive") or report.get("effectiveDirective"))
    bloccato = _testo(report.get("blocked-uri") or report.get("blockedURL"))
    documento = _testo(report.get("document-uri") or report.get("documentURL"))

    logger.warning("CSP violazione: %s | %s | %s", direttiva or "?", bloccato or "inline", documento)

    # Una riga per coppia direttiva+URI con un contatore: una tabella di
    # violazioni grezze crescerebbe senza limite, questa resta leggibile.
    try:
        await db.csp_reports.update_one(
            {"direttiva": direttiva, "bloccato": bloccato},
            {
                "$inc": {"conteggio": 1},
                "$set": {
                    "ultimo_documento": documento,
                    "ultima_volta": datetime.now(timezone.utc),
                },
            },
            upsert=True,
        )
    except Exception as exc:  # una segnalazione non deve mai far fallire nulla
        logger.debug("CSP report non salvato: %s", exc)

    return {"ok": True}


@router.get("/csp-reports")
async def elenco_csp_reports(admin: dict = Depends(get_current_admin)) -> dict:
    """Vista riservata al super amministratore: cosa avrebbe bloccato la CSP."""
    voci = await db.csp_reports.find({}, {"_id": 0}).sort("conteggio", -1).to_list(100)
    return {"total": len(voci), "reports": voci}
