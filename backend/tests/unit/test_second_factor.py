"""Il secondo fattore per email: impronta, scadenza, tentativi."""
from datetime import datetime, timedelta, timezone

from app.core.second_factor import (
    TENTATIVI_MASSIMI,
    genera_codice,
    impronta_codice,
    nuovo_sale,
    scadenza,
    verdetto,
)


def _record(codice="123456", quando=None, tentativi=0):
    sale = nuovo_sale()
    return {
        "sale": sale,
        "impronta": impronta_codice(codice, sale),
        "scade": scadenza(quando),
        "tentativi": tentativi,
    }


def test_codice_sei_cifre_e_zeri_iniziali():
    for _ in range(50):
        codice = genera_codice()
        assert len(codice) == 6 and codice.isdigit()
    assert len("000042") == 6


def test_impronta_non_contiene_il_codice():
    sale = nuovo_sale()
    impronta = impronta_codice("123456", sale)
    assert "123456" not in impronta
    assert impronta_codice("123456", sale) == impronta
    assert impronta_codice("123457", sale) != impronta


def test_codice_giusto_passa():
    assert verdetto(_record("987654"), "987654") == "ok"


def test_codice_sbagliato_rifiutato():
    assert verdetto(_record("987654"), "000000") == "sbagliato"


def test_senza_record_e_assente():
    assert verdetto(None, "123456") == "assente"
    assert verdetto({}, "123456") == "assente"


def test_codice_scaduto():
    adesso = datetime.now(timezone.utc)
    record = _record("123456", quando=adesso - timedelta(minutes=11))
    assert verdetto(record, "123456", adesso=adesso) == "scaduto"


def test_troppi_tentativi_bruciano_il_codice():
    record = _record("123456", tentativi=TENTATIVI_MASSIMI)
    assert verdetto(record, "123456") == "tentativi"


def test_formati_strani_non_passano():
    record = _record("123456")
    for brutto in ("", None, "12345", "1234567", "abcdef"):
        assert verdetto(record, brutto) != "ok"
