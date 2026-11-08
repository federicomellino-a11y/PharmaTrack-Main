"""Fasce orarie: la promessa al paziente deve essere una regola, non un testo libero."""
from datetime import datetime

import pytest

from app.core.fasce import descrivi_fascia, fascia_scaduta, valida_fascia


def test_fascia_completa_valida():
    assert valida_fascia("09:00", "12:00") == ("09:00", "12:00")


def test_solo_orario_senza_fine():
    assert valida_fascia("15:30", None) == ("15:30", None)


def test_nessuna_fascia():
    assert valida_fascia(None, None) == (None, None)


def test_fine_prima_dell_inizio_non_si_accetta():
    with pytest.raises(ValueError) as errore:
        valida_fascia("15:00", "12:00")
    assert "dopo l'inizio" in str(errore.value)


def test_formato_sbagliato_non_passa():
    with pytest.raises(ValueError):
        valida_fascia("ore nove", "12:00")


def test_di_notte_non_si_promette():
    with pytest.raises(ValueError) as errore:
        valida_fascia("03:00", "05:00")
    assert "06:00" in str(errore.value)


def test_fine_senza_inizio_non_ha_senso():
    with pytest.raises(ValueError):
        valida_fascia(None, "12:00")


def test_descrizione_leggibile():
    assert descrivi_fascia("09:00", "12:00") == "09:00–12:00"
    assert descrivi_fascia("09:00", None) == "09:00"
    assert descrivi_fascia(None, None) is None


def test_fascia_scaduta_solo_dopo_la_fine():
    dopo = datetime(2026, 11, 8, 12, 1)
    assert fascia_scaduta("09:00", "12:00", dopo) is True
    dentro = datetime(2026, 11, 8, 11, 0)
    assert fascia_scaduta("09:00", "12:00", dentro) is False
    senza = datetime(2026, 11, 8, 23, 0)
    assert fascia_scaduta(None, None, senza) is False


def test_una_promessa_di_ieri_e_scaduta_anche_di_mattina():
    """Senza il giorno, alle 10 del mattino una fascia 15-18 di ieri sembrava futura."""
    adesso = datetime(2026, 11, 8, 10, 0)
    assert fascia_scaduta("15:00", "18:00", adesso, "2026-11-07") is True


def test_una_promessa_di_domani_non_e_scaduta():
    adesso = datetime(2026, 11, 8, 23, 0)
    assert fascia_scaduta("09:00", "12:00", adesso, "2026-11-09") is False


def test_promessa_di_oggi_si_guarda_l_orario():
    adesso = datetime(2026, 11, 8, 19, 0)
    assert fascia_scaduta("15:00", "18:00", adesso, "2026-11-08") is True
    assert fascia_scaduta("15:00", "18:00", datetime(2026, 11, 8, 17, 0), "2026-11-08") is False


def test_giorno_illeggibile_non_fa_esplodere():
    adesso = datetime(2026, 11, 8, 19, 0)
    assert fascia_scaduta("15:00", "18:00", adesso, "non-una-data") is True
