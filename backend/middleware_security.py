"""Security middleware for FastAPI application."""
from fastapi import Request, HTTPException
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
