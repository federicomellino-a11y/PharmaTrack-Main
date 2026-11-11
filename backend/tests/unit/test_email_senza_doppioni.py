"""Mario@ e mario@ sono la stessa casella: un solo account, e si entra comunque.

Fino all'11 novembre 2026 registrazione e login confrontavano l'email cosi'
com'era scritta: Mario@farmacia.it e mario@farmacia.it diventavano due account.
"""
from __future__ import annotations

import os

import pytest

os.environ.setdefault("MONGO_URL", "mongodb://127.0.0.1:27017")
os.environ.setdefault("DB_NAME", "pharmatrack_test")

from fastapi.testclient import TestClient  # noqa: E402

from _finto_db import FintoDb  # noqa: E402
from app.core.security import normalizza_email  # noqa: E402

DATI = {"email": "Mario.Rossi@Farmacia.it", "password": "Password123!", "name": "Mario",
        "pharmacy_name": "Farmacia Rossi", "pharmacy_address": "Via Roma 1", "pharmacy_phone": "0212345"}


@pytest.fixture
def ambiente(monkeypatch):
    import server
    from app.core import security
    from app.core.limiter import limiter
    from app.routers import driver_auth, pharmacy_auth

    finto = FintoDb()
    for modulo in (security, pharmacy_auth, driver_auth):
        monkeypatch.setattr(modulo, "db", finto)

    async def _niente_email(*_a, **_k):
        return True

    monkeypatch.setattr(pharmacy_auth, "send_transactional_email", _niente_email)
    monkeypatch.setattr(limiter, "enabled", False)
    return TestClient(server.app), finto


def test_normalizza_toglie_maiuscole_e_spazi():
    assert normalizza_email("  Mario@Farmacia.IT ") == "mario@farmacia.it"
    assert normalizza_email(None) == ""


def test_la_registrazione_salva_in_minuscolo(ambiente):
    client, db = ambiente
    risposta = client.post("/api/auth/register", json=DATI)
    assert risposta.status_code == 200, risposta.text
    assert db.users.docs[0]["email"] == "mario.rossi@farmacia.it"
    assert db.user_sessions.docs[0]["user_agent"] is not None  # sessione aperta da _apri_sessione


def test_la_stessa_email_con_altre_maiuscole_non_crea_un_doppione(ambiente):
    client, db = ambiente
    assert client.post("/api/auth/register", json=DATI).status_code == 200
    doppione = client.post("/api/auth/register", json={**DATI, "email": "mario.rossi@farmacia.it"})
    assert doppione.status_code == 400
    assert len(db.users.docs) == 1


def test_si_entra_scrivendo_l_email_con_maiuscole_diverse(ambiente):
    client, _ = ambiente
    client.post("/api/auth/register", json=DATI)
    login = client.post("/api/auth/login", json={"email": "MARIO.ROSSI@farmacia.IT", "password": DATI["password"]})
    assert login.status_code == 200, login.text


def test_un_account_vecchio_salvato_con_le_maiuscole_entra_ancora(ambiente):
    client, db = ambiente
    from app.core.passwords import hash_password
    db.users.docs.append({"user_id": "user_vecchio", "email": "Vecchia@Farmacia.it",
                          "password_hash": hash_password("Password123!"), "is_active": True})
    login = client.post("/api/auth/login", json={"email": "vecchia@farmacia.it", "password": "Password123!"})
    assert login.status_code == 200, login.text
    doppione = client.post("/api/auth/register", json={**DATI, "email": "vecchia@farmacia.it"})
    assert doppione.status_code == 400


def test_il_fattorino_entra_senza_badare_alle_maiuscole(ambiente):
    client, db = ambiente
    from app.core.passwords import hash_password
    db.users.docs.append({"user_id": "user_a", "is_active": True})
    db.drivers.docs.append({"driver_id": "drv_a", "pharmacy_id": "user_a", "email": "luca@fattorino.it",
                            "password_hash": hash_password("Driver123!"), "is_active": True})
    login = client.post("/api/driver/login", json={"email": "Luca@Fattorino.it", "password": "Driver123!"})
    assert login.status_code == 200, login.text
