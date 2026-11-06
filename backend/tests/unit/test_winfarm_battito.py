"""Il programma deve poter dire "sono vivo" e aggiornarsi da solo.

Due regole semplici, ma sbagliarle costa caro: dire "collegato" quando il PC e'
spento manda la farmacia a cercare un guasto che non c'e', e un aggiornamento
che non parte lascia in giro versioni vecchie senza che nessuno lo sappia.
"""
from datetime import datetime, timedelta, timezone

from app.routers.integrations import (
    VERSIONE_PULSANTE, client_online, serve_aggiornamento,
)


def test_un_client_vecchio_si_aggiorna():
    assert serve_aggiornamento(VERSIONE_PULSANTE - 1) is True


def test_un_client_aggiornato_non_si_tocca():
    assert serve_aggiornamento(VERSIONE_PULSANTE) is False
    assert serve_aggiornamento(VERSIONE_PULSANTE + 1) is False


def test_un_client_che_non_dichiara_la_versione_si_aggiorna():
    """La prima release non mandava la versione: va portata al passo."""
    assert serve_aggiornamento(None) is True
    assert serve_aggiornamento("") is True
    assert serve_aggiornamento("boh") is True


def test_la_versione_arriva_anche_come_testo():
    assert serve_aggiornamento(str(VERSIONE_PULSANTE)) is False


def test_un_battito_recente_vuol_dire_collegato():
    adesso = datetime(2026, 11, 6, 14, 30, tzinfo=timezone.utc)
    assert client_online((adesso - timedelta(minutes=2)).isoformat(), adesso) is True


def test_dopo_qualche_minuto_di_silenzio_non_e_piu_collegato():
    adesso = datetime(2026, 11, 6, 14, 30, tzinfo=timezone.utc)
    assert client_online((adesso - timedelta(minutes=20)).isoformat(), adesso) is False


def test_senza_battito_non_si_dice_collegato():
    assert client_online(None) is False
    assert client_online("") is False
    assert client_online("non una data") is False


def test_un_battito_senza_fuso_non_fa_esplodere_il_confronto():
    adesso = datetime(2026, 11, 6, 14, 30, tzinfo=timezone.utc)
    assert client_online("2026-11-06T14:28:00", adesso) is True
