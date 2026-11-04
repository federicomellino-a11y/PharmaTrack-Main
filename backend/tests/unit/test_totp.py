"""Il secondo fattore deve seguire lo standard, non un'implementazione a occhio."""
from app.core.totp import genera_codice, nuovo_segreto, uri_attivazione, verifica_codice

# Vettori di prova dell'RFC 6238, appendice B, con seme ASCII "12345678901234567890".
SEME = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ"


def test_vettori_rfc6238_a_sei_cifre():
    assert genera_codice(SEME, 59) == "287082"
    assert genera_codice(SEME, 1111111109) == "081804"
    assert genera_codice(SEME, 1234567890) == "005924"
    assert genera_codice(SEME, 2000000000) == "279037"


def test_codice_corretto_accettato():
    assert verifica_codice(SEME, "287082", quando=59) is True


def test_codice_del_passo_prima_accettato():
    """Un telefono indietro di mezzo minuto non deve bloccare il login."""
    assert verifica_codice(SEME, genera_codice(SEME, 600 - 30), quando=600) is True


def test_codice_di_due_passi_prima_rifiutato():
    """Oltre un passo di tolleranza il codice e' vecchio: la finestra resta stretta."""
    assert verifica_codice(SEME, genera_codice(SEME, 600 - 60), quando=600) is False


def test_codice_sbagliato_rifiutato():
    assert verifica_codice(SEME, "000000", quando=59) is False


def test_formati_strani_rifiutati():
    for brutto in (None, "", "12345", "1234567", "abcdef", "12 34 56a"):
        assert verifica_codice(SEME, brutto, quando=59) is False


def test_spazi_nel_codice_tollerati():
    assert verifica_codice(SEME, " 287 082 ", quando=59) is True


def test_segreto_nuovo_e_uri():
    segreto = nuovo_segreto()
    assert len(segreto) >= 30
    assert "=" not in segreto
    codice = genera_codice(segreto)
    assert verifica_codice(segreto, codice) is True
    uri = uri_attivazione(segreto, "Admin@superadmin.it")
    assert uri.startswith("otpauth://totp/PharmaTrack:")
    assert segreto in uri
