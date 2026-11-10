"""La geocodifica e' pubblica, ma non gratis.

/api/geocode/search e /api/geocode/resolve non chiedono la sessione perche'
servono anche durante la registrazione. Dietro hanno Nominatim, Photon e, se la
chiave e' configurata, Google Geocoding, che si paga a richiesta: senza un tetto
per IP chiunque puo' prosciugare la quota o farsi bloccare da OSM.

Questi test tengono il tetto attaccato alle rotte. Se qualcuno toglie il
decoratore, il primo test cade; se qualcuno alza il limite oltre il ragionevole,
cade il controllo sulle costanti; se il tetto non funziona davvero, cade quello
sul 429.
"""
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from slowapi.errors import RateLimitExceeded

from app.core.errors import rate_limit_handler
from app.core.limiter import limiter
from app.routers import geocode as geo


def _app() -> FastAPI:
    app = FastAPI()
    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, rate_limit_handler)
    app.include_router(geo.router, prefix="/api")
    return app


@pytest.fixture(autouse=True)
def _azzzera_contatori():
    limiter.reset()
    yield
    limiter.reset()


def test_le_due_rotte_hanno_un_limite_registrato():
    registrati = getattr(limiter, "_route_limits", {})
    assert "app.routers.geocode.geocode_search" in registrati
    assert "app.routers.geocode.geocode_resolve" in registrati


def test_i_limiti_restano_larghi_per_uso_vero_e_stretti_per_uno_script():
    def per_minuto(valore: str) -> int:
        quantita, _, unita = valore.partition("/")
        assert unita == "minute", valore
        return int(quantita)

    assert 10 <= per_minuto(geo.GEOCODE_SEARCH_LIMIT) <= 120
    assert 10 <= per_minuto(geo.GEOCODE_RESOLVE_LIMIT) <= 120


def test_oltre_il_tetto_la_ricerca_risponde_429(monkeypatch):
    # Nessuna rete: le due sorgenti vere vengono sostituite da funzioni vuote.
    async def nessun_risultato(*_args, **_kwargs):
        return []

    monkeypatch.setattr(geo, "_nominatim", nessun_risultato)
    monkeypatch.setattr(geo, "_photon", nessun_risultato)
    monkeypatch.setattr(geo, "google_enabled", lambda: False)

    client = TestClient(_app())
    tetto = int(geo.GEOCODE_SEARCH_LIMIT.split("/")[0])

    for _ in range(tetto):
        risposta = client.get("/api/geocode/search", params={"q": "via roma 10"})
        assert risposta.status_code == 200

    oltre = client.get("/api/geocode/search", params={"q": "via roma 10"})
    assert oltre.status_code == 429
    assert "Troppi tentativi" in oltre.json()["detail"]


def test_il_tetto_della_ricerca_non_blocca_la_risoluzione(monkeypatch):
    # I due contatori sono separati: finire i suggerimenti non deve impedire di
    # ottenere le coordinate di un indirizzo che l'utente ha gia' scritto.
    async def nessun_risultato(*_args, **_kwargs):
        return []

    monkeypatch.setattr(geo, "_nominatim", nessun_risultato)
    monkeypatch.setattr(geo, "_photon", nessun_risultato)
    monkeypatch.setattr(geo, "google_enabled", lambda: False)
    client = TestClient(_app())

    tetto = int(geo.GEOCODE_SEARCH_LIMIT.split("/")[0])
    for _ in range(tetto + 1):
        client.get("/api/geocode/search", params={"q": "via roma 10"})

    risposta = client.get("/api/geocode/resolve", params={"address": "via roma 10"})
    assert risposta.status_code != 429
