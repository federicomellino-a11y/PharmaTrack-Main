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


# ── Difesa CSRF: l'origine delle richieste che scrivono ──────────────────────

from middleware_security import OriginCheckMiddleware, origine_ammessa, origini_consentite  # noqa: E402


def _app_con_origine(consentite=None):
    app = FastAPI()
    app.add_middleware(OriginCheckMiddleware, consentite=consentite)

    @app.post("/scrive")
    def scrive():
        return {"ok": True}

    @app.get("/legge")
    def legge():
        return {"ok": True}

    return TestClient(app)


def test_origine_nostra_passa():
    client = _app_con_origine(["https://pharmatrack-zeta.vercel.app"])
    risposta = client.post("/scrive", headers={"Origin": "https://pharmatrack-zeta.vercel.app"})
    assert risposta.status_code == 200


def test_origine_estranea_rifiutata_su_post():
    client = _app_con_origine(["https://pharmatrack-zeta.vercel.app"])
    risposta = client.post("/scrive", headers={"Origin": "https://evil.example"})
    assert risposta.status_code == 403


def test_origine_estranea_ignorata_su_lettura():
    """Una GET non modifica niente: bloccarla romperebbe solo i browser."""
    client = _app_con_origine(["https://pharmatrack-zeta.vercel.app"])
    assert client.get("/legge", headers={"Origin": "https://evil.example"}).status_code == 200


def test_senza_origine_passa():
    """curl e i job non mandano Origin e non possono fare CSRF."""
    client = _app_con_origine(["https://pharmatrack-zeta.vercel.app"])
    assert client.post("/scrive").status_code == 200


def test_senza_elenco_passa_tutto():
    client = _app_con_origine(origini_consentite("*"))
    assert client.post("/scrive", headers={"Origin": "https://qualsiasi.example"}).status_code == 200


def test_elenco_origini_con_spazi_e_slash():
    assert origini_consentite("https://a.example, https://b.example/") == ["https://a.example", "https://b.example"]
    assert origine_ammessa("https://b.example/", ["https://a.example", "https://b.example"]) is True
    assert origine_ammessa("https://c.example", ["https://a.example"]) is False
