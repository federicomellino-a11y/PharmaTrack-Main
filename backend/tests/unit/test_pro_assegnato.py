"""L'amministratore accende o spegne le funzioni Pro di una farmacia, con una scadenza."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest

from app.core.funzioni_pro import funzioni_sbloccate, verifica_funzione
from app.core.piani import nuova_assegnazione, piano_corrente, verifica_consegne

ADESSO = datetime(2026, 1, 31, 10, 0, tzinfo=timezone.utc)
PROVA_FINITA = {"piano": "prova", "prova_scadenza": (ADESSO - timedelta(days=5)).isoformat()}
IN_PROVA = {"piano": "prova", "prova_scadenza": (ADESSO + timedelta(days=5)).isoformat()}


def _con(utente, stato, **k):
    return {**utente, "pro_admin": nuova_assegnazione(stato, adesso=ADESSO, **k)}


def test_senza_scelta_vale_la_regola_di_sempre():
    assert not funzioni_sbloccate(piano_corrente(PROVA_FINITA, ADESSO))
    assert funzioni_sbloccate(piano_corrente(IN_PROVA, ADESSO))
    assert funzioni_sbloccate(piano_corrente({}, ADESSO))


def test_pro_acceso_riapre_tutto_anche_a_prova_finita():
    piano = piano_corrente(_con(PROVA_FINITA, "attivo", mesi=1), ADESSO)
    assert funzioni_sbloccate(piano)
    assert piano["piano"] == "pro" and not piano["scaduto"]
    assert verifica_consegne(piano, 0) is None
    for chiave in ("analisi_cliente", "ricorrenze", "report_avanzati", "tracking_live", "turni_cassa"):
        assert verifica_funzione(piano, chiave) is None


def test_alla_scadenza_si_spegne_da_solo():
    utente = _con(PROVA_FINITA, "attivo", mesi=1)
    assert utente["pro_admin"]["scadenza"].startswith("2026-02-28")
    dopo = ADESSO + timedelta(days=40)
    piano = piano_corrente(utente, dopo)
    assert piano["assegnazione"] is None
    assert not funzioni_sbloccate(piano)


def test_durate():
    assert nuova_assegnazione("attivo", mesi=12, adesso=ADESSO)["scadenza"].startswith("2027-01-31")
    assert nuova_assegnazione("attivo", adesso=ADESSO)["scadenza"] is None
    assert nuova_assegnazione("attivo", scadenza="2026-03-15", adesso=ADESSO)["scadenza"].startswith("2026-03-15T23:59:59")
    assert nuova_assegnazione("automatico", adesso=ADESSO) is None
    with pytest.raises(ValueError):
        nuova_assegnazione("attivo", scadenza="2025-01-01", adesso=ADESSO)
    with pytest.raises(ValueError):
        nuova_assegnazione("attivo", scadenza="non-una-data", adesso=ADESSO)


def test_pro_spento_chiude_anche_in_prova_e_sugli_account_vecchi():
    assert not funzioni_sbloccate(piano_corrente(_con(IN_PROVA, "spento"), ADESSO))
    vecchio = piano_corrente(_con({}, "spento"), ADESSO)
    assert not funzioni_sbloccate(vecchio)
    # i limiti di lavoro non cambiano: si chiudono solo le funzioni Pro
    assert vecchio["limiti"]["max_consegne_mese"] is None


def test_account_senza_limiti_con_pro_acceso_tiene_i_suoi_limiti():
    piano = piano_corrente(_con({}, "attivo", mesi=3), ADESSO)
    assert piano["piano"] is None and piano["limiti"]["max_fattorini"] is None
    assert funzioni_sbloccate(piano)


def test_la_rotta_admin_esiste_ed_e_protetta(monkeypatch):
    from app.core import security

    # La CI non deve dipendere dalle credenziali admin configurate nell'ambiente.
    monkeypatch.setattr(security, "ADMIN_EMAIL", "admin@example.invalid")
    monkeypatch.setattr(security, "ADMIN_PASSWORD", "password-di-test")

    from fastapi.testclient import TestClient
    import server

    risposta = TestClient(server.app).put("/api/admin/users/user_x/pro", json={"stato": "attivo", "mesi": 1})
    assert risposta.status_code == 401
