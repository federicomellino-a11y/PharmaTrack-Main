"""La password admin si confronta a tempo costante, e serve giusta insieme all'email."""
from __future__ import annotations

import os

os.environ.setdefault("MONGO_URL", "mongodb://127.0.0.1:27017")
os.environ.setdefault("DB_NAME", "pharmatrack_test")

from app.routers import admin  # noqa: E402


def test_credenziali_admin(monkeypatch):
    monkeypatch.setattr(admin, "ADMIN_EMAIL", "admin@example.it")
    monkeypatch.setattr(admin, "ADMIN_PASSWORD", "Segreta-àè1")
    assert admin.credenziali_admin_giuste("admin@example.it", "Segreta-àè1")
    assert not admin.credenziali_admin_giuste("admin@example.it", "Segreta-àè2")
    assert not admin.credenziali_admin_giuste("altro@example.it", "Segreta-àè1")
    assert not admin.credenziali_admin_giuste(None, None)


def test_il_confronto_usa_hmac():
    import inspect
    assert "compare_digest" in inspect.getsource(admin.credenziali_admin_giuste)


def test_niente_middleware_morti():
    from app.core import security_middleware
    assert not hasattr(security_middleware, "RateLimitMiddleware")
    assert not hasattr(security_middleware, "InputSanitizationMiddleware")
