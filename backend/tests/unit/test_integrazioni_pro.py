"""La serratura delle Integrazioni ferma il lavoro, non la spia.

Import e riconoscimento rispondono 402 a prova finita; stato, battito e
aggiornamento del programma restano aperti, altrimenti il PC gia' installato in
farmacia smetterebbe di farsi sentire.
"""
from datetime import datetime, timedelta, timezone

import pytest
from fastapi import HTTPException

from app.core.piani import nuovo_profilo_piano
from app.routers.integrations import _blocca_se_integrazioni_chiuse

ADESSO = datetime(2026, 11, 13, 9, 0, tzinfo=timezone.utc)
PROVA_FINITA = {
    "user_id": "u-farmacia-1",
    "piano": "prova",
    "prova_scadenza": (ADESSO - timedelta(days=5)).isoformat(),
}


def test_import_bloccato_a_prova_finita():
    with pytest.raises(HTTPException) as errore:
        _blocca_se_integrazioni_chiuse(PROVA_FINITA)
    assert errore.value.status_code == 402
    assert errore.value.detail["codice"] == "funzione_pro"
    assert errore.value.detail["funzione"] == "integrazioni"


def test_durante_la_prova_l_import_resta_aperto():
    _blocca_se_integrazioni_chiuse({**nuovo_profilo_piano(ADESSO), "user_id": "u-farmacia-1"})


def test_account_senza_piano_non_si_spegne():
    _blocca_se_integrazioni_chiuse({"user_id": "u-vecchia"})
