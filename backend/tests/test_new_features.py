"""Test di non regressione per le funzioni aggiunte a fine ottobre 2026.

Sono test di contratto: girano contro l'API configurata in REACT_APP_BACKEND_URL
(come gli altri test del progetto) e verificano validazioni e codici di errore,
senza creare dati che restino nel database.
"""
import os

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL")
if not BASE_URL:
    try:
        with open("/app/frontend/.env") as handle:
            for line in handle:
                if line.startswith("REACT_APP_BACKEND_URL="):
                    BASE_URL = line.split("=", 1)[1].strip()
                    break
    except Exception:
        BASE_URL = None
BASE_URL = (BASE_URL or "https://pharmatrack-api.onrender.com/api").rstrip("/")

TIMEOUT = 45


def _get(path):
    return requests.get(f"{BASE_URL}{path}", timeout=TIMEOUT)


def _post(path, payload=None, headers=None):
    return requests.post(f"{BASE_URL}{path}", json=payload, headers=headers or {}, timeout=TIMEOUT)


def test_health_reports_services():
    response = _get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    # Sentry deve risultare configurato in produzione
    assert data.get("sentry_configured") is True
    assert data.get("sentry_environment") == "production"


def test_monitoring_config_exposes_dsn_only_when_enabled():
    response = _get("/monitoring/config")
    assert response.status_code == 200
    data = response.json()
    assert data["enabled"] is True
    assert isinstance(data["sentry_dsn"], str) and data["sentry_dsn"].startswith("https://")


def test_client_error_requires_message():
    response = _post("/client-error", {})
    assert response.status_code == 200
    assert response.json()["ok"] is False


def test_client_error_accepts_valid_payload():
    response = _post("/client-error", {
        "message": "test automatico di non regressione",
        "context": {"scope": "pytest"},
        "level": "info",
    })
    assert response.status_code == 200
    body = response.json()
    assert body["ok"] is True
    assert body["error_id"].startswith("err_")


@pytest.mark.parametrize("path", [
    "/deliveries/repair-coordinates",
    "/deliveries/nonexistent/restore",
])
def test_endpoints_require_authentication(path):
    response = _post(path, {})
    assert response.status_code in (401, 403)


def test_chat_edit_validates_empty_body():
    # senza sessione deve comunque rifiutare prima di toccare i dati
    response = requests.put(f"{BASE_URL}/messages/abc/edit", json={"content": ""}, timeout=TIMEOUT)
    assert response.status_code in (401, 403, 404, 405, 422)
