"""Raccolta errori del frontend.

Senza dipendere da servizi esterni: gli errori non gestiti del browser e le
schermate bianche finiscono in MongoDB, cosi' restano diagnosticabili anche
prima di collegare Sentry (basta impostare SENTRY_DSN sul backend).
"""
import logging
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Request

from app.core.database import db

logger = logging.getLogger(__name__)
router = APIRouter()

MAX_FIELD = 4000


@router.post("/client-error")
async def report_client_error(request: Request) -> dict:
    """Riceve un errore dal frontend (endpoint pubblico, payload già limitato)."""
    try:
        body = await request.json()
    except Exception:
        return {"ok": False, "detail": "Payload non valido"}
    if not isinstance(body, dict):
        return {"ok": False, "detail": "Payload non valido"}

    message = str(body.get("message") or "").strip()
    if not message:
        return {"ok": False, "detail": "Messaggio mancante"}

    context = body.get("context")
    entry = {
        "error_id": f"err_{uuid.uuid4().hex[:12]}",
        "message": message[:MAX_FIELD],
        "stack": str(body.get("stack") or "")[:MAX_FIELD],
        "url": str(body.get("url") or "")[:1000],
        "level": str(body.get("level") or "error")[:32],
        "context": context if isinstance(context, dict) else {},
        "user_agent": (request.headers.get("user-agent") or "")[:500],
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    try:
        await db.client_errors.insert_one(dict(entry))
    except Exception:
        logger.exception("Impossibile salvare l'errore del client")
        return {"ok": False}
    logger.warning("client error [%s] %s @ %s", entry["level"], entry["message"][:200], entry["url"])
    return {"ok": True, "error_id": entry["error_id"]}
