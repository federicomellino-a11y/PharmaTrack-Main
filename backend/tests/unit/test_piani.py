"""Piani e limiti: il blocco deve arrivare tardi e mai rompere chi lavora."""
from datetime import datetime, timezone, timedelta

from app.core.piani import (
    GIORNI_PROVA, inizio_mese, nuovo_profilo_piano, piano_corrente,
    verifica_consegne, verifica_fattorini,
)

ADESSO = datetime(2026, 11, 7, 12, 0, tzinfo=timezone.utc)


def test_chi_non_ha_piano_non_ha_limiti():
    """Gli account nati prima dei piani devono continuare a lavorare."""
    piano = piano_corrente({"email": "vecchia@farmacia.it"}, ADESSO)
    assert piano["piano"] is None
    assert piano["limiti"]["max_consegne_mese"] is None
    assert verifica_consegne(piano, 99999) is None
    assert verifica_fattorini(piano, 99999) is None


def test_la_prova_conta_i_giorni_e_scade():
    profilo = nuovo_profilo_piano(ADESSO)
    assert profilo["piano"] == "prova"
    piano = piano_corrente(profilo, ADESSO + timedelta(days=GIORNI_PROVA + 1))
    assert piano["scaduto"] is True
    motivo = verifica_consegne(piano, 0)
    assert motivo and "prova è finita" in motivo


def test_ultimo_giorno_di_prova_si_lavora_ancora():
    profilo = nuovo_profilo_piano(ADESSO)
    piano = piano_corrente(profilo, ADESSO + timedelta(days=GIORNI_PROVA - 1))
    assert piano["scaduto"] is False
    assert verifica_consegne(piano, 10) is None


def test_i_tetti_del_piano_fermano_al_numero_giusto():
    pro = {"piano": "pro", "prova_scadenza": None}
    piano = piano_corrente(pro, ADESSO)
    assert verifica_consegne(piano, 1999) is None
    assert verifica_consegne(piano, 2000) is not None
    assert verifica_fattorini(piano, 4) is None
    assert verifica_fattorini(piano, 5) is not None


def test_piano_sconosciuto_ricade_sulla_prova():
    piano = piano_corrente({"piano": "inventato"}, ADESSO)
    assert piano["piano"] == "prova"
    assert piano["limiti"]["max_fattorini"] == 3


def test_scadenza_leggibile_anche_come_testo_iso():
    piano = piano_corrente({"piano": "prova", "prova_scadenza": "2026-11-10T12:00:00Z"}, ADESSO)
    assert piano["giorni_rimasti"] == 3
    assert piano["scaduto"] is False


def test_inizio_mese_e_il_primo_giorno():
    assert inizio_mese(ADESSO).day == 1
    assert inizio_mese(ADESSO).hour == 0
