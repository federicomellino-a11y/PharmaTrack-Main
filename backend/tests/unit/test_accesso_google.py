"""'Accedi con Google' deve funzionare, e solo con token emessi per PharmaTrack.

Fino all'11 novembre 2026 la rotta usava `request` senza riceverlo (errore 500 a
ogni accesso) e, senza GOOGLE_CLIENT_ID, accettava token di qualunque app.
"""
from __future__ import annotations

import os

import pytest

os.environ.setdefault("MONGO_URL", "mongodb://127.0.0.1:27017")
os.environ.setdefault("DB_NAME", "pharmatrack_test")

from fastapi import HTTPException  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from _finto_db import FintoDb  # noqa: E402
from app.routers.pharmacy_auth import controlla_token_google  # noqa: E402

CLIENT_ID = "123-pharmatrack.apps.googleusercontent.com"
BUONO = {"aud": CLIENT_ID, "iss": "https://accounts.google.com", "email": "farmacia@example.it",
         "email_verified": "true", "sub": "42", "name": "Farmacia Rossi"}


def _codice(payload, client_id=CLIENT_ID):
    with pytest.raises(HTTPException) as errore:
        controlla_token_google(payload, client_id)
    return errore.value.status_code


def test_token_buono_restituisce_l_email():
    assert controlla_token_google(BUONO, CLIENT_ID) == "farmacia@example.it"


def test_senza_client_id_si_rifiuta():
    assert _codice(BUONO, client_id="") == 503


def test_token_di_un_altra_app_rifiutato():
    assert _codice({**BUONO, "aud": "altra-app"}) == 401


def test_emittente_diverso_da_google_rifiutato():
    assert _codice({**BUONO, "iss": "https://falso.example"}) == 401


def test_email_non_verificata_rifiutata():
    assert _codice({**BUONO, "email_verified": "false"}) == 401
    assert _codice({k: v for k, v in BUONO.items() if k != "email_verified"}) == 401


@pytest.fixture
def client(monkeypatch):
    import server
    from app.core.limiter import limiter
    from app.routers import pharmacy_auth

    finto = FintoDb()
    monkeypatch.setattr(pharmacy_auth, "db", finto)
    monkeypatch.setattr(pharmacy_auth, "_leggi_token_google", lambda _c: dict(BUONO))
    monkeypatch.setattr(limiter, "enabled", False)
    monkeypatch.setenv("GOOGLE_CLIENT_ID", CLIENT_ID)
    return TestClient(server.app), finto


def test_l_accesso_con_google_apre_la_sessione(client):
    c, finto = client
    risposta = c.post("/api/auth/google", json={"credential": "token"})
    assert risposta.status_code == 200, risposta.text
    assert risposta.json()["email"] == "farmacia@example.it"
    assert "session_token" in risposta.cookies
    assert len(finto.user_sessions.docs) == 1


def test_senza_client_id_la_rotta_risponde_503(client, monkeypatch):
    c, _ = client
    monkeypatch.delenv("GOOGLE_CLIENT_ID")
    monkeypatch.delenv("VITE_GOOGLE_CLIENT_ID", raising=False)
    assert c.post("/api/auth/google", json={"credential": "token"}).status_code == 503


def test_il_nuovo_account_google_riceve_il_piano_iniziale(client):
    c, finto = client
    assert c.post("/api/auth/google", json={"credential": "token"}).status_code == 200
    utente = finto.users.docs[0]
    assert utente["piano"] == "prova"
    assert utente["prova_scadenza"] and utente["piano_attivato_il"]
