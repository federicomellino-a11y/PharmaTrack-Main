"""La serratura dei piani: cosa resta aperto e cosa si chiude, senza spegnere nessuno."""
from datetime import datetime, timezone, timedelta

from app.core.funzioni_pro import (
    FUNZIONI, elenco_funzioni, funzioni_sbloccate, verifica_funzione,
)
from app.core.piani import GIORNI_PROVA, nuovo_profilo_piano, piano_corrente

ADESSO = datetime(2026, 11, 10, 9, 0, tzinfo=timezone.utc)


def _piano(profilo, giorni_dopo=0):
    return piano_corrente(profilo, ADESSO + timedelta(days=giorni_dopo))


def test_account_senza_piano_non_ha_serrature():
    """Gli account nati prima dei piani continuano a usare tutto."""
    piano = _piano({"email": "vecchia@farmacia.it"})
    assert funzioni_sbloccate(piano) is True
    for chiave in FUNZIONI:
        assert verifica_funzione(piano, chiave) is None


def test_durante_la_prova_le_funzioni_pro_sono_aperte():
    """Una prova che non mostra le funzioni Pro non vende niente."""
    piano = _piano(nuovo_profilo_piano(ADESSO))
    assert piano["piano"] == "prova"
    assert piano["scaduto"] is False
    assert funzioni_sbloccate(piano) is True
    assert verifica_funzione(piano, "analisi_cliente") is None


def test_ultimo_giorno_di_prova_si_usa_ancora_tutto():
    piano = _piano(nuovo_profilo_piano(ADESSO), GIORNI_PROVA - 1)
    assert funzioni_sbloccate(piano) is True


def test_a_prova_finita_le_funzioni_pro_si_chiudono_con_il_motivo():
    piano = _piano(nuovo_profilo_piano(ADESSO), GIORNI_PROVA + 1)
    assert funzioni_sbloccate(piano) is False
    motivo = verifica_funzione(piano, "ricorrenze")
    assert motivo
    assert "Professional" in motivo
    assert "Impostazioni" in motivo
    # Il motivo dice anche che i dati non si perdono: chi paga non deve temere di perderli.
    assert "dati già salvati restano" in motivo


def test_i_piani_a_pagamento_tengono_tutto_aperto():
    for chiave in ("pro", "catena"):
        piano = _piano({"piano": chiave})
        assert piano["scaduto"] is False
        assert funzioni_sbloccate(piano) is True
        assert verifica_funzione(piano, "report_avanzati") is None


def test_chiave_sconosciuta_non_chiude_niente():
    """Meglio lasciar passare che bloccare per un refuso in una chiave."""
    piano = _piano(nuovo_profilo_piano(ADESSO), GIORNI_PROVA + 1)
    assert verifica_funzione(piano, "funzione_che_non_esiste") is None


def test_elenco_funzioni_racconta_cosa_e_aperto():
    chiuso = elenco_funzioni(_piano(nuovo_profilo_piano(ADESSO), GIORNI_PROVA + 1))
    assert {voce["chiave"] for voce in chiuso} == set(FUNZIONI)
    assert all(voce["sbloccata"] is False for voce in chiuso)
    assert all(voce["nome"] and voce["descrizione"] and voce["dove"] for voce in chiuso)

    aperto = elenco_funzioni(_piano(nuovo_profilo_piano(ADESSO)))
    assert all(voce["sbloccata"] is True for voce in aperto)
