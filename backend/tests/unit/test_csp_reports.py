"""Endpoint che raccoglie le violazioni CSP in modalita' solo-segnalazione."""
import os

# Valori finti, solo per poter importare l'app: in CI non c'e' MONGO_URL e
# senza queste righe la raccolta dei test si interrompe. Il database non viene
# mai interrogato davvero, e se la scrittura fallisce l'endpoint la ignora.
os.environ.setdefault("MONGO_URL", "mongodb://127.0.0.1:27017")
os.environ.setdefault("DB_NAME", "pharmatrack_ci")
os.environ.setdefault("JWT_SECRET", "ci-placeholder")
os.environ.setdefault("SECRET_KEY", "ci-placeholder")

from fastapi.testclient import TestClient  # noqa: E402

from app.routers.csp_reports import _estrai_report  # noqa: E402


def test_formato_csp_report():
    corpo = {"csp-report": {"violated-directive": "img-src", "blocked-uri": "https://x.test/a.png"}}
    assert _estrai_report(corpo)["violated-directive"] == "img-src"


def test_formato_reporting_api():
    corpo = [{"type": "csp-violation", "body": {"effectiveDirective": "script-src", "blockedURL": "inline"}}]
    assert _estrai_report(corpo)["effectiveDirective"] == "script-src"


def test_corpi_inutili_non_esplodono():
    for corpo in [None, {}, [], "testo", 42, [{}]]:
        assert _estrai_report(corpo) is None


def test_endpoint_accetta_entrambi_i_formati():
    import server

    client = TestClient(server.app, raise_server_exceptions=False)
    primo = client.post(
        "/api/csp-report",
        json={"csp-report": {"violated-directive": "connect-src", "blocked-uri": "https://a.test"}},
        headers={"Content-Type": "application/csp-report"},
    )
    secondo = client.post(
        "/api/csp-report",
        json=[{"type": "csp-violation", "body": {"effectiveDirective": "img-src", "blockedURL": "data:"}}],
        headers={"Content-Type": "application/reports+json"},
    )
    assert primo.status_code == 200 and primo.json()["ok"] is True
    assert secondo.status_code == 200 and secondo.json()["ok"] is True


def test_payload_rotto_non_genera_errore():
    import server

    client = TestClient(server.app, raise_server_exceptions=False)
    risposta = client.post("/api/csp-report", content=b"non-json", headers={"Content-Type": "application/json"})
    assert risposta.status_code == 200
    assert risposta.json()["ok"] is False


def test_elenco_riservato_all_admin():
    import server

    client = TestClient(server.app, raise_server_exceptions=False)
    risposta = client.get("/api/csp-reports")
    assert risposta.status_code in (401, 503)
