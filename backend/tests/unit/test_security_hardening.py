"""Header di sicurezza e visibilita' della documentazione in produzione."""
import importlib

from fastapi import FastAPI
from fastapi.testclient import TestClient

from middleware_security import SecurityHeadersMiddleware


def _app_con_middleware():
    app = FastAPI()
    app.add_middleware(SecurityHeadersMiddleware)

    @app.get("/ping")
    def ping():
        return {"ok": True}

    return app


def test_hsts_presente_sulle_risposte():
    client = TestClient(_app_con_middleware())
    risposta = client.get("/ping")

    assert risposta.status_code == 200
    assert risposta.headers["strict-transport-security"] == "max-age=31536000; includeSubDomains"


def test_header_storici_ancora_presenti():
    client = TestClient(_app_con_middleware())
    h = client.get("/ping").headers

    assert h["x-content-type-options"] == "nosniff"
    assert h["x-frame-options"] == "DENY"
    assert h["referrer-policy"] == "strict-origin-when-cross-origin"
    assert "geolocation=()" in h["permissions-policy"]


def test_produzione_riconosciuta_da_ENVIRONMENT(monkeypatch):
    monkeypatch.setenv("ENVIRONMENT", "production")
    from app.core import config

    ricaricato = importlib.reload(config)
    try:
        assert ricaricato.IS_PRODUCTION is True
        assert ricaricato.ENVIRONMENT == "production"
    finally:
        monkeypatch.delenv("ENVIRONMENT", raising=False)
        importlib.reload(config)


def test_ambiente_locale_non_e_produzione(monkeypatch):
    monkeypatch.delenv("ENVIRONMENT", raising=False)
    monkeypatch.delenv("SENTRY_ENVIRONMENT", raising=False)
    from app.core import config

    ricaricato = importlib.reload(config)
    try:
        assert ricaricato.IS_PRODUCTION is False
        assert ricaricato.ENVIRONMENT == "development"
    finally:
        importlib.reload(config)
