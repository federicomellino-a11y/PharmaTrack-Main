"""Il canale in tempo reale si apre solo a chi e' davvero quella farmacia o quel fattorino.

Fino all'11 novembre 2026 /ws/pharmacy/{id} e /ws/driver/{id} accettavano chiunque
conoscesse un id: senza login si leggevano chat, notifiche e posizioni di
un'altra farmacia, e si mandavano posizioni false a nome di un fattorino.
"""
from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone

import pytest

os.environ.setdefault("MONGO_URL", "mongodb://127.0.0.1:27017")
os.environ.setdefault("DB_NAME", "pharmatrack_test")

from fastapi.testclient import TestClient  # noqa: E402
from starlette.websockets import WebSocketDisconnect  # noqa: E402

from _finto_db import FintoDb  # noqa: E402

NOSTRA = "https://pharmatrack.vercel.app"


@pytest.fixture
def ambiente(monkeypatch):
    import server
    from app.core import security, websocket
    from app.core.websocket import ConnectionManager

    finto = FintoDb()
    monkeypatch.setattr(security, "db", finto)
    nuovo = ConnectionManager()
    monkeypatch.setattr(server, "manager", nuovo)
    monkeypatch.setattr(websocket, "manager", nuovo)
    monkeypatch.setattr(server, "_ORIGINI_CONSENTITE", [NOSTRA])
    scade = datetime.now(timezone.utc) + timedelta(days=1)
    for uid in ("user_a", "user_b"):
        finto.users.docs.append({"user_id": uid, "is_active": True})
        finto.user_sessions.docs.append({"user_id": uid, "session_token": f"sess_{uid}", "expires_at": scade})
    finto.drivers.docs.append({"driver_id": "drv_a", "pharmacy_id": "user_a", "is_active": True})
    finto.driver_sessions.docs.append({"driver_id": "drv_a", "session_token": "dsess_a", "expires_at": scade})
    return TestClient(server.app), nuovo


def _rifiutato(client, url, **kwargs):
    with pytest.raises(WebSocketDisconnect) as errore:
        with client.websocket_connect(url, **kwargs):
            pass
    assert errore.value.code == 1008


def test_senza_login_il_canale_della_farmacia_resta_chiuso(ambiente):
    client, _ = ambiente
    _rifiutato(client, "/ws/pharmacy/user_a")


def test_senza_login_il_canale_del_fattorino_resta_chiuso(ambiente):
    client, _ = ambiente
    _rifiutato(client, "/ws/driver/drv_a")


def test_con_la_propria_sessione_si_entra(ambiente):
    client, _ = ambiente
    client.cookies.set("session_token", "sess_user_a")
    with client.websocket_connect("/ws/pharmacy/user_a", headers={"origin": NOSTRA}) as ws:
        ws.send_json({"type": "ping"})
        assert ws.receive_json() == {"type": "pong"}


def test_non_si_ascolta_un_altra_farmacia(ambiente):
    client, _ = ambiente
    client.cookies.set("session_token", "sess_user_b")
    _rifiutato(client, "/ws/pharmacy/user_a")


def test_un_sito_altrui_non_usa_il_cookie_della_farmacia(ambiente):
    client, _ = ambiente
    client.cookies.set("session_token", "sess_user_a")
    _rifiutato(client, "/ws/pharmacy/user_a", headers={"origin": "https://sito-cattivo.example"})


def test_non_si_finge_un_fattorino(ambiente):
    client, _ = ambiente
    client.cookies.set("session_token", "sess_user_a")
    _rifiutato(client, "/ws/driver/drv_a")


def test_la_posizione_del_fattorino_arriva_alla_sua_farmacia(ambiente):
    client, _ = ambiente
    farmacia = TestClient(client.app)
    farmacia.cookies.set("session_token", "sess_user_a")
    client.cookies.set("driver_session_token", "dsess_a")
    with farmacia.websocket_connect("/ws/pharmacy/user_a") as ws_farmacia:
        with client.websocket_connect("/ws/driver/drv_a") as ws_fattorino:
            ws_fattorino.send_json({"type": "location", "lat": 45.1, "lng": 9.2})
            ws_fattorino.send_json({"type": "ping"})
            assert ws_fattorino.receive_json() == {"type": "pong"}
        assert ws_farmacia.receive_json() == {"type": "driver_location", "driver_id": "drv_a", "lat": 45.1, "lng": 9.2}


def test_pc_e_telefono_ricevono_entrambi(ambiente):
    client, manager = ambiente
    pc, telefono = TestClient(client.app), TestClient(client.app)
    for c in (pc, telefono):
        c.cookies.set("session_token", "sess_user_a")
    with pc.websocket_connect("/ws/pharmacy/user_a") as ws_pc:
        with telefono.websocket_connect("/ws/pharmacy/user_a") as ws_tel:
            assert len(manager.user_sockets["pharmacy_user_a"]) == 2
            ws_tel.send_json({"type": "ping"})
            assert ws_tel.receive_json() == {"type": "pong"}
        # Il telefono si e' chiuso: il PC resta collegato e ancora raggiungibile.
        ws_pc.send_json({"type": "ping"})
        assert ws_pc.receive_json() == {"type": "pong"}
        assert len(manager.user_sockets["pharmacy_user_a"]) == 1
    assert "pharmacy_user_a" not in manager.user_sockets


class _SocketFinto:
    def __init__(self, rotto=False):
        self.ricevuti, self.rotto = [], rotto

    async def accept(self):
        pass

    async def send_json(self, messaggio):
        if self.rotto:
            raise RuntimeError("chiuso")
        self.ricevuti.append(messaggio)


@pytest.mark.anyio
async def test_un_messaggio_arriva_a_ogni_schermo_aperto():
    from app.core.websocket import ConnectionManager
    m = ConnectionManager()
    pc, telefono, morto = _SocketFinto(), _SocketFinto(), _SocketFinto(rotto=True)
    for s in (pc, telefono, morto):
        await m.connect(s, "user_a", "pharmacy")
    await m.send_personal_message({"type": "new_message"}, "user_a", "pharmacy")
    assert pc.ricevuti == telefono.ricevuti == [{"type": "new_message"}]
    assert morto not in m.user_sockets["pharmacy_user_a"]


@pytest.fixture
def anyio_backend():
    return "asyncio"
