"""Centralized error handlers for consistent error responses."""
from fastapi import FastAPI, HTTPException, Request
from starlette.responses import JSONResponse
from pydantic import ValidationError
from datetime import datetime, timezone
import logging

logger = logging.getLogger(__name__)


class AppError(Exception):
    """Base application error."""

    def __init__(self, message: str, code: int = 500, details: dict = None):
        self.message = message
        self.code = code
        self.details = details or {}
        super().__init__(self.message)


class ValidationAppError(AppError):
    """Validation error."""

    def __init__(self, message: str, details: dict = None):
        super().__init__(message, code=422, details=details)


class NotFoundError(AppError):
    """Resource not found."""

    def __init__(self, resource: str, identifier: str = None):
        msg = f"{resource} not found"
        if identifier:
            msg += f" ({identifier})"
        super().__init__(msg, code=404)


class AuthenticationError(AppError):
    """Authentication failed."""

    def __init__(self, message: str = "Authentication failed"):
        super().__init__(message, code=401)


class AuthorizationError(AppError):
    """Authorization failed (user is authenticated but not authorized)."""

    def __init__(self, message: str = "Insufficient permissions"):
        super().__init__(message, code=403)


class ConflictError(AppError):
    """Resource conflict (e.g., duplicate entry)."""

    def __init__(self, message: str):
        super().__init__(message, code=409)


class RateLimitError(AppError):
    """Rate limit exceeded."""

    def __init__(self, message: str = "Too many requests"):
        super().__init__(message, code=429)


def register_error_handlers(app: FastAPI):
    """
    Register error handlers on FastAPI app.
    """

    @app.exception_handler(HTTPException)
    async def http_exception_handler(request: Request, exc: HTTPException):
        return JSONResponse(
            status_code=exc.status_code,
            content={
                "error": {
                    "code": exc.status_code,
                    "message": exc.detail,
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                }
            },
        )

    @app.exception_handler(ValidationError)
    async def validation_error_handler(request: Request, exc: ValidationError):
        errors = {}
        for error in exc.errors():
            field = ".".join(str(x) for x in error["loc"][1:])
            errors[field] = error["msg"]
        return JSONResponse(
            status_code=422,
            content={
                "error": {
                    "code": 422,
                    "message": "Validation error",
                    "details": errors,
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                }
            },
        )

    @app.exception_handler(AppError)
    async def app_error_handler(request: Request, exc: AppError):
        response = {
            "error": {
                "code": exc.code,
                "message": exc.message,
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }
        }
        if exc.details:
            response["error"]["details"] = exc.details
        return JSONResponse(status_code=exc.code, content=response)

    @app.exception_handler(Exception)
    async def generic_exception_handler(request: Request, exc: Exception):
        logger.error(f"Unhandled exception: {exc}", exc_info=True)
        return JSONResponse(
            status_code=500,
            content={
                "error": {
                    "code": 500,
                    "message": "Internal server error",
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                }
            },
        )
