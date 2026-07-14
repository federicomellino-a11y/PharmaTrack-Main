import logging
from fastapi import Request
from fastapi.responses import JSONResponse
from slowapi.errors import RateLimitExceeded
from app.core.sentry import capture_exception

logger = logging.getLogger(__name__)


async def rate_limit_handler(request: Request, exc: RateLimitExceeded):
    return JSONResponse(
        status_code=429,
        content={"detail": "Troppi tentativi, riprova tra qualche minuto"},
    )


async def unhandled_exception_handler(request: Request, exc: Exception):
    """Catch-all so unexpected errors return a consistent JSON shape ({detail})
    instead of a bare 500, while staying compatible with existing clients."""
    logger.exception("Unhandled error on %s %s", request.method, request.url.path)
    capture_exception(exc)
    return JSONResponse(
        status_code=500,
        content={"detail": "Errore interno del server"},
    )


def register_exception_handlers(app):
    app.add_exception_handler(Exception, unhandled_exception_handler)
