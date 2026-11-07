import os
import logging

import sentry_sdk
from fastapi import HTTPException
from sentry_sdk.integrations.fastapi import FastApiIntegration
from sentry_sdk.integrations.starlette import StarletteIntegration

logger = logging.getLogger(__name__)


def scarta_errori_di_business(evento, hint):
    """Non manda a Sentry le risposte 4xx: sono regole, non guasti.

    Serve per 402 (limite del piano) e 403 (permessi): sono comportamenti
    voluti, e con gli abbonamenti attivi il 402 diventerebbe rumore quotidiano.
    """
    info = (hint or {}).get("exc_info")
    if info and len(info) > 1 and isinstance(info[1], HTTPException):
        if getattr(info[1], "status_code", 500) < 500:
            return None
    return evento


def init_sentry() -> bool:
    """Initialize Sentry only when SENTRY_DSN is set (graceful no-op otherwise)."""
    dsn = os.getenv("SENTRY_DSN", "").strip()
    if not dsn:
        return False

    environment = os.getenv("SENTRY_ENVIRONMENT") or os.getenv("ENVIRONMENT") or "development"
    init_kwargs = {
        "dsn": dsn,
        "environment": environment,
        "integrations": [
            # Solo i guasti (5xx) sono errori. Un 403 o un 402 sono regole di
            # prodotto: "spetta al titolare", "piano esaurito". Segnarli come
            # errori riempie Sentry di allarmi falsi e nasconde quelli veri.
            StarletteIntegration(transaction_style="endpoint", failed_request_status_codes={*range(500, 599)}),
            FastApiIntegration(transaction_style="endpoint", failed_request_status_codes={*range(500, 599)}),
        ],
        "send_default_pii": False,
        "before_send": scarta_errori_di_business,
    }

    rate_str = os.getenv("SENTRY_TRACES_SAMPLE_RATE", "").strip()
    if rate_str:
        try:
            rate = float(rate_str)
            if 0.0 < rate <= 1.0:
                init_kwargs["traces_sample_rate"] = rate
        except ValueError:
            pass

    sentry_sdk.init(**init_kwargs)
    logger.info("Sentry initialized (environment=%s)", environment)
    return True


def capture_exception(exc: Exception) -> None:
    if sentry_sdk.Hub.current.client is not None:
        sentry_sdk.capture_exception(exc)
