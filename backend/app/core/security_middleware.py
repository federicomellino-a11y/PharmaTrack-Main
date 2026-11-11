"""Security middleware for FastAPI application."""
from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse
from datetime import datetime, timezone
import logging

logger = logging.getLogger(__name__)


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """
    Add security headers to all HTTP responses:
    - X-Content-Type-Options: nosniff (prevent MIME type sniffing)
    - X-Frame-Options: DENY (prevent clickjacking)
    - X-XSS-Protection: 1; mode=block (legacy XSS protection)
    - Referrer-Policy: strict-origin-when-cross-origin
    - Content-Security-Policy: restrictive CSP
    - Permissions-Policy: disable dangerous APIs
    """

    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)

        # Prevent MIME type sniffing
        response.headers["X-Content-Type-Options"] = "nosniff"

        # Prevent clickjacking
        response.headers["X-Frame-Options"] = "DENY"

        # Legacy XSS protection
        response.headers["X-XSS-Protection"] = "1; mode=block"

        # Referrer policy
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"

        # Forza HTTPS per un anno: l'API gira solo dietro TLS (Render) e senza
        # questo header il primo accesso puo' viaggiare in chiaro.
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"

        # Disable dangerous browser features
        response.headers["Permissions-Policy"] = (
            "geolocation=(), camera=(), microphone=(), payment=()"
        )

        # Basic CSP (can be tightened based on needs)
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; "
            "script-src 'self' 'unsafe-inline'; "
            "style-src 'self' 'unsafe-inline'; "
            "img-src 'self' data: https:; "
            "font-src 'self'; "
            "connect-src 'self' https:; "
            "frame-ancestors 'none'"
        )

        return response


class RateLimitMiddleware(BaseHTTPMiddleware):
    """
    Simple in-memory rate limiting per IP address.
    WARNING: This is basic and not suitable for multi-instance deployments.
    For production, use Redis-based rate limiting.
    """

    def __init__(self, app, requests_per_minute: int = 60):
        super().__init__(app)
        self.requests_per_minute = requests_per_minute
        self.request_counts = {}  # {ip: [(timestamp, count)]}

    async def dispatch(self, request: Request, call_next):
        client_ip = request.client.host if request.client else "unknown"
        now = datetime.now(timezone.utc).timestamp()
        minute_ago = now - 60

        # Clean up old entries
        if client_ip in self.request_counts:
            self.request_counts[client_ip] = [
                t for t in self.request_counts[client_ip] if t > minute_ago
            ]
        else:
            self.request_counts[client_ip] = []

        # Check limit
        if len(self.request_counts[client_ip]) >= self.requests_per_minute:
            logger.warning(f"Rate limit exceeded for IP {client_ip}")
            return JSONResponse(
                status_code=429,
                content={
                    "error": {
                        "code": 429,
                        "message": "Too many requests. Please retry after a minute.",
                        "timestamp": datetime.now(timezone.utc).isoformat(),
                    }
                },
            )

        # Record request
        self.request_counts[client_ip].append(now)

        response = await call_next(request)
        return response


class InputSanitizationMiddleware(BaseHTTPMiddleware):
    """
    Prevent common injection attacks by validating request headers and URL parameters.
    """

    DANGEROUS_PATTERNS = [
        b"<script",
        b"javascript:",
        b"onclick=",
        b"onerror=",
        b"--",  # SQL comment
        b"' OR ",  # SQL injection
        b'" OR ',  # SQL injection
    ]

    async def dispatch(self, request: Request, call_next):
        # Check URL and headers for dangerous patterns
        url = str(request.url).lower().encode()
        for pattern in self.DANGEROUS_PATTERNS:
            if pattern in url:
                logger.warning(f"Potential injection in URL: {request.url}")
                return JSONResponse(
                    status_code=400,
                    content={
                        "error": {
                            "code": 400,
                            "message": "Invalid request format",
                            "timestamp": datetime.now(timezone.utc).isoformat(),
                        }
                    },
                )

        response = await call_next(request)
        return response


def origini_consentite(valore: str | None) -> list[str] | None:
    """Legge CORS_ORIGINS. None significa "qualsiasi" (solo sviluppo locale)."""
    grezzo = (valore or "").strip()
    if not grezzo or grezzo == "*":
        return None
    return [o.strip().rstrip("/") for o in grezzo.split(",") if o.strip()]


def origini_per_ambiente(valore: str | None, produzione: bool) -> list[str] | None:
    """In produzione CORS_ORIGINS e' obbligatorio: senza, CORS e difesa CSRF
    accetterebbero qualsiasi sito. Meglio non partire (Render tiene in piedi
    la versione precedente) che partire aperti."""
    consentite = origini_consentite(valore)
    if produzione and consentite is None:
        raise RuntimeError(
            "CORS_ORIGINS mancante o '*' in produzione: impostalo su Render "
            "con gli indirizzi del frontend (es. https://pharmatrack.vercel.app)."
        )
    return consentite


def origine_ammessa(origine: str, consentite: list[str] | None) -> bool:
    """Confronta un'origine con l'elenco ammesso. Senza elenco passa tutto."""
    if consentite is None:
        return True
    return (origine or "").rstrip("/") in consentite


class OriginCheckMiddleware(BaseHTTPMiddleware):
    """Difesa CSRF: una richiesta che modifica dati deve venire da un'origine nostra.

    Il cookie di sessione e SameSite=None, quindi il browser lo manda anche su
    richieste che partono da un altro sito. Qui si guarda l'header Origin che il
    browser aggiunge da solo e che una pagina altrui non puo' falsificare. Le
    richieste senza Origin (curl, job, test) restano ammesse: non sono CSRF,
    perche' un CSRF ha sempre un browser dietro.
    """

    METODI_CHE_SCRIVONO = {"POST", "PUT", "PATCH", "DELETE"}

    def __init__(self, app, consentite=None):
        super().__init__(app)
        self.consentite = consentite

    async def dispatch(self, request: Request, call_next):
        if request.method in self.METODI_CHE_SCRIVONO:
            origine = request.headers.get("origin")
            if origine and not origine_ammessa(origine, self.consentite):
                logger.warning("Origine rifiutata su %s %s: %s", request.method, request.url.path, origine)
                return JSONResponse(
                    status_code=403,
                    content={"detail": "Origine non ammessa"},
                )
        return await call_next(request)
