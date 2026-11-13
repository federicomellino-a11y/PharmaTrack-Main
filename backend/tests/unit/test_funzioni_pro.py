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


def test_tracking_e_turni_sono_pro_come_gli_altri():
    """Chiesti da Federico l'11/11: tracking e turni-cassa salgono nel Professional."""
    piano = _piano(nuovo_profilo_piano(ADESSO), GIORNI_PROVA + 1)
    assert verifica_funzione(piano, "tracking_live")
    assert verifica_funzione(piano, "turni_cassa")
    aperto = _piano(nuovo_profilo_piano(ADESSO))
    assert verifica_funzione(aperto, "tracking_live") is None
    assert verifica_funzione(aperto, "turni_cassa") is None


def test_multisede_non_ha_lucchetto_perche_non_esiste():
    """Si promette, non si blocca: una funzione che non c'è non va chiusa."""
    piano = _piano(nuovo_profilo_piano(ADESSO), GIORNI_PROVA + 1)
    assert verifica_funzione(piano, "multisede") is None
    voce = [f for f in elenco_funzioni(piano) if f["chiave"] == "multisede"][0]
    assert voce["in_arrivo"] is True


def test_elenco_funzioni_racconta_cosa_e_aperto():
    chiuso = elenco_funzioni(_piano(nuovo_profilo_piano(ADESSO), GIORNI_PROVA + 1))
    assert {voce["chiave"] for voce in chiuso} == set(FUNZIONI)
    assert all(voce["sbloccata"] is False for voce in chiuso)
    assert all(voce["nome"] and voce["descrizione"] and voce["dove"] for voce in chiuso)

    aperto = elenco_funzioni(_piano(nuovo_profilo_piano(ADESSO)))
    assert all(voce["sbloccata"] is True for voce in aperto)


def test_integrazioni_sono_pro_perche_fanno_risparmiare_tempo():
    """Chiesto da Federico il 13/11: le Integrazioni salgono nel Professional."""
    chiuso = _piano(nuovo_profilo_piano(ADESSO), GIORNI_PROVA + 1)
    motivo = verifica_funzione(chiuso, "integrazioni")
    assert motivo and "Professional" in motivo
    assert verifica_funzione(_piano(nuovo_profilo_piano(ADESSO)), "integrazioni") is None
    voce = [f for f in elenco_funzioni(chiuso) if f["chiave"] == "integrazioni"][0]
    assert voce["sbloccata"] is False
    assert voce["in_arrivo"] is False
    # L'account nato prima dei piani continua a lavorare come prima.
    assert verifica_funzione(_piano({"email": "vecchia@farmacia.it"}), "integrazioni") is None
