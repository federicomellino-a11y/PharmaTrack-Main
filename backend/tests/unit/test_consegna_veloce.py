"""Consegna veloce: l'eseguibile per il PC e la chiave che si può revocare.

La chiave del PC vive nell'header `X-Bridge-Token` e vale per /parse, /bridge,
/heartbeat e per il download del programma. Fino a oggi non si poteva
rigenerare: se il file di configurazione finiva dove non doveva, l'unica via era
cambiare l'account. Questi test tengono ferme le tre cose che rendono utile la
rotazione: la chiave vecchia smette di valere, quella nuova vale, e il programma
che si riscarica riceve la configurazione già compilata.
"""
from __future__ import annotations

import io
import os
import zipfile

import pytest

os.environ.setdefault("MONGO_URL", "mongodb://127.0.0.1:27017")
os.environ.setdefault("DB_NAME", "pharmatrack_test")

from fastapi import HTTPException  # noqa: E402

from _finto_db import FintoDb  # noqa: E402
from app.routers import integrations  # noqa: E402


class FintaRichiesta:
    """Quello che serve a queste rotte: header e query string."""

    def __init__(self, headers=None, query=None):
        self.headers = headers or {}
        self.query_params = query or {}


def _farmacia(token="wf_vecchia"):
    db = FintoDb()
    db.users.docs.append({
        "user_id": "u1",
        "name": "Farmacia Rossi",
        "pharmacy_name": "Farmacia Rossi",
        "bridge_token": token,
        "bridge_last_seen": "2026-11-13T20:00:00+00:00",
        "bridge_version": 6,
        "bridge_host": "PC-BANCO",
    })
    return db


def test_l_anteprima_non_mostra_la_chiave_intera():
    assert integrations.anteprima_token(None) is None
    anteprima = integrations.anteprima_token("wf_abcdefghilmnopqrstuvwxyz")
    assert anteprima.startswith("wf_ab") and anteprima.endswith("wxyz")
    assert "abcdefghilmno" not in anteprima


@pytest.mark.anyio
async def test_rigenerare_la_chiave_ne_crea_una_nuova_e_pulisce_lo_stato(monkeypatch):
    db = _farmacia()
    monkeypatch.setattr(integrations, "db", db)

    esito = await integrations.winfarm_token_rotate(
        FintaRichiesta(), user={"user_id": "u1", "bridge_token": "wf_vecchia"})

    utente = db.users.docs[0]
    assert esito["ok"] is True
    assert esito["token_preview"] == integrations.anteprima_token(utente["bridge_token"])
    assert utente["bridge_token"] != "wf_vecchia"
    assert utente["bridge_token"].startswith("wf_")
    # il PC vecchio non risulta più collegato: prima di rifare il battito non lo è
    assert utente["bridge_last_seen"] is None
    assert utente["bridge_version"] is None


@pytest.mark.anyio
async def test_la_chiave_vecchia_non_apre_piu_niente(monkeypatch):
    db = _farmacia()
    monkeypatch.setattr(integrations, "db", db)
    await integrations.winfarm_token_rotate(
        FintaRichiesta(), user={"user_id": "u1", "bridge_token": "wf_vecchia"})
    nuova = db.users.docs[0]["bridge_token"]

    with pytest.raises(HTTPException) as vecchia:
        await integrations._bridge_pharmacy(FintaRichiesta(headers={"X-Bridge-Token": "wf_vecchia"}))
    assert vecchia.value.status_code == 401

    farmacia = await integrations._bridge_pharmacy(FintaRichiesta(headers={"X-Bridge-Token": nuova}))
    assert farmacia["user_id"] == "u1"


@pytest.fixture
def eseguibile(monkeypatch, tmp_path):
    file = tmp_path / "consegna-veloce.exe"
    file.write_bytes(b"MZ-programma-di-prova")
    monkeypatch.setattr(integrations, "ESEGUIBILE_DESKTOP", file)
    return file


@pytest.mark.anyio
async def test_il_programma_si_aggiorna_scaricando_solo_l_eseguibile(eseguibile, monkeypatch):
    db = _farmacia(token="wf_buona")
    monkeypatch.setattr(integrations, "db", db)

    risposta = await integrations.winfarm_app_download(
        FintaRichiesta(headers={"X-Bridge-Token": "wf_buona"}, query={"formato": "exe"}))

    assert risposta.body == b"MZ-programma-di-prova"
    assert 'filename="consegna-veloce.exe"' in risposta.headers["Content-Disposition"]


@pytest.mark.anyio
async def test_lo_zip_arriva_gia_configurato_con_chiave_e_indirizzo(eseguibile, monkeypatch):
    import json

    db = _farmacia(token="wf_buona")
    monkeypatch.setattr(integrations, "db", db)

    risposta = await integrations.winfarm_app_download(
        FintaRichiesta(headers={"X-Bridge-Token": "wf_buona"}, query={"base": "https://esempio.test"}))

    assert 'filename="pharmatrack-consegna-veloce.zip"' in risposta.headers["Content-Disposition"]
    with zipfile.ZipFile(io.BytesIO(risposta.body)) as archivio:
        nomi = set(archivio.namelist())
        assert nomi == {"consegna-veloce.exe", "consegna-veloce.json"}
        assert archivio.read("consegna-veloce.exe") == b"MZ-programma-di-prova"
        configurazione = json.loads(archivio.read("consegna-veloce.json"))
    assert configurazione["bridge_token"] == "wf_buona"
    assert configurazione["base_url"] == "https://esempio.test"
    assert configurazione["farmacia"] == "Farmacia Rossi"
    # la stessa versione che il battito dichiara come ultima
    assert configurazione["versione"] == integrations.VERSIONE_PULSANTE


@pytest.mark.anyio
async def test_senza_eseguibile_la_rotta_lo_dice_invece_di_dare_un_file_vuoto(tmp_path, monkeypatch):
    monkeypatch.setattr(integrations, "ESEGUIBILE_DESKTOP", tmp_path / "manca.exe")
    db = _farmacia(token="wf_buona")
    monkeypatch.setattr(integrations, "db", db)

    with pytest.raises(HTTPException) as errore:
        await integrations.winfarm_app_download(
            FintaRichiesta(headers={"X-Bridge-Token": "wf_buona"}, query={"formato": "exe"}))
    assert errore.value.status_code == 503


def test_l_eseguibile_e_nel_repository():
    """Il file che le farmacie scaricano deve esserci davvero, non essere un segnaposto."""
    percorso = integrations.ESEGUIBILE_DESKTOP
    if not percorso.exists():
        pytest.skip("eseguibile non presente in questo checkout")
    dati = percorso.read_bytes()
    assert dati[:2] == b"MZ", "non è un eseguibile Windows"
    assert len(dati) > 1_000_000, "sembra troncato"
