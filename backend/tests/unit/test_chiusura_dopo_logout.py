"""Il canale in tempo reale si chiude appena la sessione non vale piu'.

Fino all'11 novembre 2026 un canale gia' aperto restava vivo dopo logout,
revoca dalle Impostazioni o disattivazione dell'account.
"""
from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone

import pytest

os.environ.setdefault("MONGO_URL", "mongodb://127.0.0.1:27017")
os.environ.setdefault("DB_NAME", "pharmatrack_test")

from fastapi.testclient import TestClient  # noqa: E402

from _finto_db import FintoDb  # noqa: E402


class _Canale:
    def __init__(self, cookie: dict):
        self.cookies, self.headers = cookie, {}
        self.chiuso_con = None

    async def accept(self):
        pass

    async def send_json(self, _m):
        pass

    async def close(self, code=1000):
        self.chiuso_con = code


@pytest.fixture
def ambiente(monkeypatch):
    from app.core import security, websocket

    db = FintoDb()
    monkeypatch.setattr(security, "db", db)
    m = websocket.ConnectionManager()
    monkeypatch.setattr(websocket, "manager", m)
    scade = datetime.now(timezone.utc) + timedelta(days=1)
    db.users.docs.append({"user_id": "user_a", "is_active": True})
    db.drivers.docs.append({"driver_id": "drv_a", "pharmacy_id": "user_a", "is_active": True})
    for token in ("sess_pc", "sess_tel"):
        db.user_sessions.docs.append({"user_id": "user_a", "session_token": token, "expires_at": scade})
    db.driver_sessions.docs.append({"driver_id": "drv_a", "session_token": "dsess", "expires_at": scade})
    return db, m, websocket


@pytest.mark.anyio
async def test_revocare_una_sessione_chiude_solo_il_suo_canale(ambiente):
    db, m, websocket = ambiente
    pc, tel = _Canale({"session_token": "sess_pc"}), _Canale({"session_token": "sess_tel"})
    await m.connect(pc, "user_a", "pharmacy")
    await m.connect(tel, "user_a", "pharmacy")

    await db.user_sessions.delete_one({"session_token": "sess_tel"})
    assert await websocket.richiudi_canali_revocati("pharmacy", "user_a") == 1

    assert tel.chiuso_con == websocket.CHIUSURA_SESSIONE_REVOCATA == 4401
    assert pc.chiuso_con is None
    assert m.user_sockets["pharmacy_user_a"] == [pc]


@pytest.mark.anyio
async def test_il_controllo_periodico_chiude_sessioni_scadute_e_account_disattivati(ambiente):
    db, m, websocket = ambiente
    pc = _Canale({"session_token": "sess_pc"})
    fattorino = _Canale({"driver_session_token": "dsess"})
    await m.connect(pc, "user_a", "pharmacy")
    await m.connect(fattorino, "drv_a", "driver")

    db.user_sessions.docs[0]["expires_at"] = datetime.now(timezone.utc) - timedelta(minutes=1)
    db.drivers.docs[0]["is_active"] = False
    assert await websocket.richiudi_canali_revocati() == 2
    assert pc.chiuso_con == fattorino.chiuso_con == 4401
    assert m.user_sockets == {}


@pytest.mark.anyio
async def test_una_sessione_valida_non_viene_toccata(ambiente):
    _db, m, websocket = ambiente
    pc = _Canale({"session_token": "sess_pc"})
    await m.connect(pc, "user_a", "pharmacy")
    assert await websocket.richiudi_canali_revocati() == 0
    assert pc.chiuso_con is None


@pytest.mark.parametrize("rotta, corpo, cookie, attesa", [
    ("/api/auth/logout", None, ("session_token", "sess_pc"), ("pharmacy", "user_a")),
    ("/api/auth/sessions/revoke", {}, ("session_token", "sess_pc"), ("pharmacy", "user_a")),
    ("/api/driver/logout", None, ("driver_session_token", "dsess"), ("driver", "drv_a")),
])
def test_logout_e_revoca_chiudono_il_canale(ambiente, monkeypatch, rotta, corpo, cookie, attesa):
    db, _m, _ws = ambiente
    import server
    from app.routers import driver_auth, pharmacy_auth

    chiamate = []

    async def _registra(tipo, uid):
        chiamate.append((tipo, uid))

    for modulo in (pharmacy_auth, driver_auth):
        monkeypatch.setattr(modulo, "db", db)
        monkeypatch.setattr(modulo, "richiudi_canali_revocati", _registra)
    client = TestClient(server.app)
    client.cookies.set(*cookie)
    risposta = client.post(rotta, json=corpo) if corpo is not None else client.post(rotta)
    assert risposta.status_code == 200, risposta.text
    assert attesa in chiamate


@pytest.fixture
def anyio_backend():
    return "asyncio"
