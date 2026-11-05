"""Riconoscimento della vendita: il testo vero delle farmacie, non quello ideale."""
import os

os.environ.setdefault("MONGO_URL", "mongodb://127.0.0.1:27017")
os.environ.setdefault("DB_NAME", "pharmatrack_ci")
os.environ.setdefault("JWT_SECRET", "ci-placeholder")
os.environ.setdefault("SECRET_KEY", "ci-placeholder")

from app.core.winfarm_parse import estrai_vendita  # noqa: E402

VENDITA_CON_ETICHETTE = """Cliente: Mario Rossi
Indirizzo: Via Roma 12, Napoli
Telefono: 333 111 2233
Codice Fiscale: RSSMRA80A01F839X
Totale documento: EUR 18,50
Pagamento: Contanti
Ricetta: NRE 010A01234567"""


def test_vendita_con_etichette():
    esito = estrai_vendita(VENDITA_CON_ETICHETTE)
    campi = esito["campi"]
    assert campi["cliente"] == "Mario Rossi"
    assert campi["indirizzo"] == "Via Roma 12, Napoli"
    assert campi["telefono"] == "3331112233"
    assert campi["codice_fiscale"] == "RSSMRA80A01F839X"
    assert campi["importo"] == 18.50
    assert campi["pagamento"] == "cash"
    assert "010A01234567" in campi["ricette"]
    assert esito["utilizzabile"] is True


def test_griglia_copiata_con_tab():
    testo = "Cliente\tAnna Verdi\t\nIndirizzo\tCorso Umberto 33, Salerno\nTel\t081 555 6677\nTotale\t42,00"
    campi = estrai_vendita(testo)["campi"]
    assert campi["cliente"] == "Anna Verdi"
    assert campi["indirizzo"] == "Corso Umberto 33, Salerno"
    assert campi["telefono"] == "0815556677"
    assert campi["importo"] == 42.0


def test_importi_all_italiana():
    for testo, atteso in [
        ("Totale: 1.234,56", 1234.56),
        ("Totale: 1234,56", 1234.56),
        ("Totale complessivo EUR 18,5", 18.5),
        ("Importo: 7,00", 7.0),
    ]:
        assert estrai_vendita(testo)["campi"]["importo"] == atteso, testo


def test_telefono_con_prefisso_internazionale():
    campi = estrai_vendita("Cliente: Luca Bianchi\nIndirizzo: Via Napoli 4, Roma\nTel: +39 347 123 4567")["campi"]
    assert campi["telefono"] == "3471234567"


def test_pagamento_satispay_e_carta():
    base = "Cliente: Sara Neri\nIndirizzo: Via Dante 9, Milano\n"
    assert estrai_vendita(base + "Pagamento: Satispay")["campi"]["pagamento"] == "satispay"
    assert estrai_vendita(base + "Pagamento: Bancomat")["campi"]["pagamento"] == "card"
    assert estrai_vendita(base + "Pagamento: POS")["campi"]["pagamento"] == "card"


def test_testo_inutile_non_esplode_e_non_inventa():
    esito = estrai_vendita("ciao come va? nessun dato utile qui dentro")
    assert esito["utilizzabile"] is False
    assert esito["campi"]["cliente"] is None
    assert esito["campi"]["indirizzo"] is None
    assert esito["campi"]["importo"] is None


def test_via_senza_numero_non_e_un_indirizzo():
    campi = estrai_vendita("Cliente: Paolo Gialli\nVia: da concordare")["campi"]
    assert campi["indirizzo"] is None


def test_importo_assurdo_scartato():
    assert estrai_vendita("Totale: 999999")["campi"]["importo"] is None
