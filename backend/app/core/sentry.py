import os
import logging

import sentry_sdk
from sentry_sdk.integrations.fastapi import FastApiIntegration
from sentry_sdk.integrations.starlette import StarletteIntegration

logger = logging.getLogger(__name__)


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
            StarletteIntegration(transaction_style="endpoint", failed_request_status_codes={403, *range(500, 599)}),
            FastApiIntegration(transaction_style="endpoint", failed_request_status_codes={403, *range(500, 599)}),
        ],
        "send_default_pii": False,
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
