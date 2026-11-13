"""Il mittente non validato: l'invio che sembra riuscito e non arriva.

Il 13/11/2026 la console admin non mandava piu' il codice di accesso. Brevo
accettava l'invio (201) e scartava il messaggio dopo, perche' SMTP_FROM era
`noreply@pharmatrack.app`, mai validato. L'applicazione registrava "successo"
e /api/health diceva che le email funzionavano. Questi test tengono fermo il
contrario: un mittente non validato blocca l'invio e si vede.
"""
import json
import os

import pytest

os.environ.setdefault("MONGO_URL", "mongodb://127.0.0.1:27017")
os.environ.setdefault("DB_NAME", "Cluster0")

from app.core import notifications
from app.core.notifications import mittente_verdetto

ELENCO_BUONO = json.dumps({
    "senders": [
        {"id": 1, "name": "PharmaTrack", "email": "federicomellino@gmail.com", "active": True},
    ]
})


def test_mittente_validato():
    esito = mittente_verdetto(200, ELENCO_BUONO, "federicomellino@gmail.com")
    assert esito["ok"] is True
    assert esito["errore"] is None


def test_il_confronto_ignora_maiuscole_e_spazi():
    esito = mittente_verdetto(200, ELENCO_BUONO, "  FedericoMellino@Gmail.com ")
    assert esito["ok"] is True


def test_mittente_non_presente_nell_elenco():
    esito = mittente_verdetto(200, ELENCO_BUONO, "noreply@pharmatrack.app")
    assert esito["ok"] is False
    assert "noreply@pharmatrack.app" in esito["errore"]


def test_mittente_disattivato_non_vale():
    spento = json.dumps({"senders": [
        {"id": 1, "email": "federicomellino@gmail.com", "active": False},
    ]})
    assert mittente_verdetto(200, spento, "federicomellino@gmail.com")["ok"] is False


def test_chiave_rifiutata_non_blocca_ma_segnala():
    esito = mittente_verdetto(401, '{"message":"Key not found"}', "federicomellino@gmail.com")
    assert esito["ok"] is None
    assert "401" in esito["errore"]


def test_rete_giu_non_blocca_ma_segnala():
    assert mittente_verdetto(None, "timeout", "x@y.it")["ok"] is None


def test_risposta_illeggibile_non_blocca():
    assert mittente_verdetto(200, "<html>", "x@y.it")["ok"] is None


class _Risposta:
    def __init__(self, status_code, text):
        self.status_code = status_code
        self.text = text


class _ClientFinto:
    def __init__(self, risposta):
        self._risposta = risposta

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_):
        return False

    async def get(self, *_a, **_k):
        return self._risposta

    async def post(self, *_a, **_k):
        return self._risposta


@pytest.fixture
def anyio_backend():
    return "asyncio"


@pytest.fixture
def brevo_api(monkeypatch):
    """Prepara lo stato: chiave API Brevo, mittente indicato, cache vuota."""
    monkeypatch.setattr(notifications, "SMTP_PASSWORD", "xkeysib-finta")
    monkeypatch.setattr(notifications, "SMTP_FROM", "noreply@pharmatrack.app")
    monkeypatch.setattr(notifications, "SMTP_HOST", "smtp-relay.brevo.com")
    monkeypatch.setattr(notifications, "SMTP_USERNAME", "federicomellino@gmail.com")
    monkeypatch.setitem(notifications.STATO_EMAIL, "ultimo_errore", None)
    monkeypatch.setitem(notifications.STATO_EMAIL, "ultimo_successo", None)
    monkeypatch.setitem(notifications.STATO_EMAIL, "mittente", None)
    return monkeypatch


@pytest.mark.anyio
async def test_con_il_mittente_non_validato_non_si_invia_niente(brevo_api):
    spedite = []

    class ClientSpia(_ClientFinto):
        async def post(self, *_a, **_k):
            spedite.append(1)
            return _Risposta(201, "{}")

    brevo_api.setattr(notifications.httpx, "AsyncClient", lambda **_: ClientSpia(_Risposta(200, ELENCO_BUONO)))

    inviata = await notifications.send_transactional_email(
        "federicomellino@gmail.com", "PharmaTrack: codice di accesso", "123456",
    )
    assert inviata is False
    assert spedite == [], "con un mittente non validato non si deve nemmeno provare a inviare"
    assert notifications.STATO_EMAIL["ultimo_successo"] is None
    assert notifications.STATO_EMAIL["ultimo_errore"] is not None
    assert "pharmatrack.app" in notifications.STATO_EMAIL["ultimo_errore"]["errore"]


@pytest.mark.anyio
async def test_con_il_mittente_validato_si_invia(brevo_api):
    brevo_api.setattr(notifications, "SMTP_FROM", "federicomellino@gmail.com")
    brevo_api.setattr(notifications.httpx, "AsyncClient", lambda **_: _ClientFinto(_Risposta(200, ELENCO_BUONO)))

    inviata = await notifications.send_transactional_email(
        "federicomellino@gmail.com", "PharmaTrack: codice di accesso", "123456",
    )
    assert inviata is True
    assert notifications.STATO_EMAIL["ultimo_successo"] is not None
    assert notifications.STATO_EMAIL["ultimo_errore"] is None


@pytest.mark.anyio
async def test_il_controllo_del_mittente_resta_in_cache(brevo_api):
    chiamate = []

    class ClientConta(_ClientFinto):
        async def get(self, *_a, **_k):
            chiamate.append(1)
            return _Risposta(200, ELENCO_BUONO)

    brevo_api.setattr(notifications.httpx, "AsyncClient", lambda **_: ClientConta(_Risposta(200, ELENCO_BUONO)))

    primo = await notifications.verifica_mittente(forza=True)
    secondo = await notifications.verifica_mittente()
    assert primo["ok"] is False  # mittente di partenza non validato
    assert secondo is primo
    assert len(chiamate) == 1, "la seconda verifica deve leggere la cache"


@pytest.mark.anyio
async def test_la_salute_dice_la_verita_sul_mittente(brevo_api):
    from app.routers import health

    class _Database:
        async def command(self, *_a, **_k):
            return {"ok": 1}

    brevo_api.setattr(health, "db", _Database())
    brevo_api.setattr(health, "SMTP_FROM", "noreply@pharmatrack.app")
    brevo_api.setitem(notifications.STATO_EMAIL, "mittente", {"ok": False, "errore": "non validato"})
    corpo = await health.public_health()
    assert corpo["email_mittente_validato"] is False
    assert corpo["email_mittente"] == "noreply@pharmatrack.app"


def test_la_verifica_di_produzione_boccia_il_mittente_non_validato():
    """Se /api/health dice "mittente non validato", il workflow deve diventare rosso."""
    import importlib.util
    from pathlib import Path

    percorso = Path(__file__).resolve().parents[3] / ".github" / "scripts" / "verifica_produzione.py"
    specifica = importlib.util.spec_from_file_location("verifica_produzione", percorso)
    modulo = importlib.util.module_from_spec(specifica)
    specifica.loader.exec_module(modulo)

    salute = {
        "status": "ok", "database": "Cluster0", "email_provider": "brevo-api",
        "email_mittente": "noreply@pharmatrack.app", "email_mittente_validato": False,
        "admin_configured": True, "push_configured": True, "smtp_configured": True,
        "sentry_configured": True,
    }
    modulo.chiama = lambda *_a, **_k: (200, json.dumps(salute), {})
    modulo.problemi.clear()
    modulo.fatti.clear()
    modulo.controlla_salute()
    assert any("non e' validato" in p for p in modulo.problemi)

    salute["email_mittente_validato"] = True
    modulo.chiama = lambda *_a, **_k: (200, json.dumps(salute), {})
    modulo.problemi.clear()
    modulo.controlla_salute()
    assert modulo.problemi == []
