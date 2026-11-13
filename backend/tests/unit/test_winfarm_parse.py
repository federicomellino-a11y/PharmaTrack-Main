"""Riconoscimento della vendita: il testo vero delle farmacie, non quello ideale."""
import os

os.environ.setdefault("MONGO_URL", "mongodb://127.0.0.1:27017")
os.environ.setdefault("DB_NAME", "pharmatrack_ci")
os.environ.setdefault("JWT_SECRET", "ci-placeholder")
os.environ.setdefault("SECRET_KEY", "ci-placeholder")

from app.core.winfarm_parse import estrai_vendita, estrai_vendita_da_controlli  # noqa: E402

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


# Il testo qui sotto non e' inventato: e' quello letto via OCR da uno screenshot
# vero della schermata di vendita di Winfarm (la riga in alto, la griglia, i
# pannelli e i pulsanti in basso). Serve a verificare che il riconoscimento
# regga il layout reale, comprese le sue stranezze.
SCHERMATA_SENZA_CLIENTE = """Vendita del 05/11/2026 | Terminale SERVER | Operatore: OPERATORE GENERICO | Cliente: CLIENTE GENERICO
89 | A | del 05/11/2026 | Scontrino Non Fiscale
Check Ev. Ant. | Multipezzi | Gestione Resi | D.P.C. | Anomalie | Equivalenti | Non Ordinare | Prenotato | Sospeso
Descrizione | Cl. | Cat. | Q.ta | Pre. | Ord. | G.T. | Listino EUR | Iva | Sconto EUR | Parziale EUR | Totale EUR | Tipo
GASTROTUSS25STICK20MLSCIR | C | 0 | 1 | -1 | 21,80 | 10 | 0,00 | 21,80 | 21,80 | LIB
In Corso [Vendita Libera] | 21,80
Info Aggiuntive | Prezzo M.IMS | 20,59 | -6%
Segnalazioni
Costo Med. | 13,60 | C.F. | Cerca =
31,38 %
Pos. | ATC/GMP | 7BB1 | Codice | 952100295
Regione Campania (15) | Docum. | Shopper | Quote | 0,00 | Ticket | 0,00
Libera | 21,80
Tipo | DISPOSITIVO MEDICO
21,80
Vendita Aperta | Cliente Aperto
Totale Pezzi 1
Storico Cliente
Similari | Equivalenti | AIFA | Cancella | Canc.Tutto | Andam. | Info Prod. | Scontrino | Uscita"""

SCHERMATA_CON_CLIENTE = SCHERMATA_SENZA_CLIENTE.replace(
    "Cliente: CLIENTE GENERICO", "Cliente: ROSSI MARIO"
).replace("C.F. | Cerca =", "C.F. | RSSMRA80A01F839X | Cerca =")


def test_schermata_vera_senza_cliente():
    esito = estrai_vendita(SCHERMATA_SENZA_CLIENTE)
    campi = esito["campi"]
    # "CLIENTE GENERICO" non e' un cliente: e' l'assenza di un cliente
    assert campi["cliente"] is None
    assert esito["utilizzabile"] is False
    # il totale grande in basso, senza etichetta accanto
    assert campi["importo"] == 21.80
    assert campi["indirizzo"] is None
    assert esito["intestazione"]["data_vendita"] == "05/11/2026"
    assert esito["intestazione"]["terminale"] == "server"
    assert esito["intestazione"]["vendita_libera"] is True


def test_schermata_vera_con_cliente_e_cf():
    esito = estrai_vendita(SCHERMATA_CON_CLIENTE)
    campi = esito["campi"]
    assert campi["cliente"] == "ROSSI MARIO"
    # con cliente e importo la consegna si puo' fare: l'indirizzo arriva
    # dall'anagrafica di PharmaTrack, non dalla schermata di Winfarm
    assert esito["utilizzabile"] is True
    assert esito["indirizzo_da_chiedere"] is True
    assert campi["codice_fiscale"] == "RSSMRA80A01F839X"
    assert campi["importo"] == 21.80


def test_prezzi_della_griglia_non_diventano_il_totale():
    """Senza i pulsanti di stato il numero isolato non basta: meglio niente che sbagliato."""
    testo = "GASTROTUSS25STICK20MLSCIR | 21,80\nInfo Aggiuntive | Prezzo M.IMS | 20,59"
    assert estrai_vendita(testo)["campi"]["importo"] is None


def test_rumore_ocr_non_crea_un_cliente_inesistente():
    """Il testo vero letto da uno screenshot a bassa risoluzione sbaglia le lettere.

    Se l'OCR legge "CUENTE GENERICO" e lo si prende per buono, nasce una
    consegna per un cliente che non esiste. Meglio nessun cliente che uno falso.
    """
    rumore = ("Vend ta de U5/11/2U2b | Terminsle SERVER | Operatore: OPERAIORE GENERICU "
              "| Clienter CUENTE GENERICO\n21,80\nVendita Aperta | Cliente Aperto")
    esito = estrai_vendita(rumore)
    assert esito["campi"]["cliente"] is None
    assert esito["utilizzabile"] is False
    assert esito["campi"]["importo"] == 21.80


def test_intestazione_di_colonna_non_e_un_numero_di_ricetta():
    campi = estrai_vendita("Cat. Ricetta | Presc.\nCliente: ROSSI MARIO\nTotale: 5,00")["campi"]
    assert campi["ricette"] is None


def test_fiducia_usa_il_nome_del_campo():
    esito = estrai_vendita("Cliente: ROSSI MARIO\nC.F. RSSMRA80A01F839X")
    assert esito["fiducia"]["codice_fiscale"] == "alta"
    assert "cf" not in esito["fiducia"]


def test_testo_ocr_completo_della_schermata_vera():
    """Il transcript OCR integrale dello screenshot, congelato come prova.

    Contiene anche righe come "Storico Cliente | ?": l'etichetta c'e' ma il
    valore no, e non deve diventare un cliente chiamato "?".
    """
    from pathlib import Path

    testo = (Path(__file__).parent / "fixtures" / "winfarm_vendita_ocr.txt").read_text(encoding="utf-8")
    esito = estrai_vendita(testo)
    assert esito["campi"]["cliente"] is None
    assert esito["campi"]["importo"] == 21.80
    assert esito["utilizzabile"] is False
    assert esito["indirizzo_da_chiedere"] is True


# --- Lettura dall'accessibilita' di Windows ---------------------------------
# Winfarm espone i testi dei controlli: questo e' il dump vero di una vendita
# con cliente selezionato (115 controlli, 66 con un testo), catturato con
# wf-probe.ps1 su una schermata di vendita reale.

def _controlli_con_cliente() -> list[str]:
    import json
    from pathlib import Path

    percorso = Path(__file__).parent / "fixtures" / "winfarm_controlli_cliente.json"
    return json.loads(percorso.read_text(encoding="utf-8"))


def test_accessibilita_legge_cliente_cf_e_totale():
    esito = estrai_vendita_da_controlli(_controlli_con_cliente())
    campi = esito["campi"]
    assert campi["cliente"] == "MELLINO FEDERICO"
    assert campi["codice_fiscale"] == "MLLFRC91D21F839X"
    assert campi["importo"] == 14.90
    assert esito["utilizzabile"] is True
    assert esito["fonte"] == "accessibilita"
    assert esito["intestazione"]["numero_cliente"] == "217"
    assert esito["intestazione"]["totale_pezzi"] == 1
    assert esito["intestazione"]["vendita_aperta"] is True


def test_accessibilita_non_confonde_i_pulsanti_con_il_cliente():
    """Senza cliente selezionato restano solo i pulsanti di stato."""
    controlli = ["Vendita Aperta", "Cliente Aperto", "Cliente N. 217", "14,90"]
    esito = estrai_vendita_da_controlli(controlli)
    assert esito["campi"]["cliente"] is None
    assert esito["utilizzabile"] is False
    assert esito["intestazione"]["numero_cliente"] == "217"


def test_accessibilita_ignora_i_prezzi_di_costo():
    """I costi portano il simbolo € e le percentuali il %: non sono il totale."""
    controlli = ["9,70 €", "28,41 %", "0,00", "14,90", "0,00"]
    assert estrai_vendita_da_controlli(controlli)["campi"]["importo"] == 14.90


def test_accessibilita_senza_numeri_non_inventa_un_importo():
    esito = estrai_vendita_da_controlli(["Vendita Aperta", "Cliente Aperto"])
    assert esito["campi"]["importo"] is None
    assert esito["utilizzabile"] is False


def test_accessibilita_vuota_non_esplode():
    esito = estrai_vendita_da_controlli([])
    assert esito["utilizzabile"] is False
    assert esito["righe_lette"] == 0


def _p(t, x, y, w=60, h=22):
    return {"t": t, "x": x, "y": y, "w": w, "h": h}


# Posizioni prese dalla schermata vera di Winfarm (1920x1080, vendita del 13/11/2026).
PAROLE_VENDITA = [
    _p("Descrizione", 213, 128, 92, 18), _p("Cl.", 527, 128, 22, 18), _p("Cat.", 588, 128, 30, 18),
    _p("Q.tà", 694, 128, 34, 18), _p("Totale", 1354, 128, 50, 18),
    _p("CARDIOASPIRIN*30CPR", 20, 160, 270), _p("GAST", 306, 160, 60), _p("100MG", 380, 160, 82),
    _p("A", 528, 160, 16), _p("Rip", 586, 160, 36), _p("1", 724, 160, 10), _p("2,58", 1395, 160, 48), _p("LIB", 1465, 160, 36),
    _p("TACHIPIRINA*20CPR", 20, 200, 240), _p("1000MG", 270, 200, 90), _p("C", 528, 200, 16), _p("2", 724, 200, 10),
    _p("In", 20, 240, 20), _p("Corso", 48, 240, 60), _p("[Vendita", 118, 240, 90), _p("Libera]", 216, 240, 80), _p("3", 724, 240, 10),
    _p("Segnalazioni", 470, 486, 120), _p("ACIDO", 172, 645, 60), _p("ACETILSALICILICO", 240, 645, 150),
]


def test_prodotti_letti_dalla_griglia():
    from app.core.winfarm_parse import prodotti_da_parole, testo_prodotti
    prodotti = prodotti_da_parole(PAROLE_VENDITA)
    assert prodotti == [
        {"nome": "CARDIOASPIRIN*30CPR GAST 100MG", "quantita": 1},
        {"nome": "TACHIPIRINA*20CPR 1000MG", "quantita": 2},
    ]
    assert testo_prodotti(prodotti) == "CARDIOASPIRIN*30CPR GAST 100MG; 2x TACHIPIRINA*20CPR 1000MG"


def test_prodotti_con_dati_rotti_non_esplodono():
    from app.core.winfarm_parse import prodotti_da_parole
    assert prodotti_da_parole(None) == []
    assert prodotti_da_parole(["x", {"t": "ciao"}, {"t": "y", "x": 1}]) == []
    # Una parola sola con le coordinate buone e' comunque un prodotto letto:
    # meglio un nome senza quantita' che una vendita senza niente.
    assert prodotti_da_parole([_p("CARDIOASPIRIN", 20, 160)]) == [{"nome": "CARDIOASPIRIN", "quantita": None}]


def test_prodotti_tutte_le_righe_della_vendita():
    """Una vendita con cinque farmaci deve arrivare con cinque voci, non con una."""
    from app.core.winfarm_parse import prodotti_da_parole
    nomi = ["TAVEGIL*20CPR", "OKI*30CPR", "AULIN*30CPR 100MG", "MOMENT*24CPR 200MG", "ENTEROGERMINA*10FL"]
    parole = [_p("Descrizione", 213, 128, 92, 18), _p("Cl.", 527, 128, 22, 18),
              _p("Q.tà", 694, 128, 34, 18), _p("Totale", 1354, 128, 50, 18)]
    for indice, nome in enumerate(nomi):
        y = 160 + indice * 40
        parole += [_p(nome, 20, y, 240), _p("A", 528, y, 16), _p("1", 724, y, 10), _p("5,90", 1395, y, 48)]
    parole.append(_p("Segnalazioni", 470, 486, 120))
    letti = prodotti_da_parole(parole)
    assert [p["nome"] for p in letti] == nomi
    assert all(p["quantita"] == 1 for p in letti)


def test_prodotti_senza_intestazione_leggono_lo_stesso_le_righe():
    """Se l'OCR si mangia la testata "Descrizione" i nomi non devono sparire."""
    from app.core.winfarm_parse import prodotti_da_parole
    prodotti = prodotti_da_parole([p for p in PAROLE_VENDITA if p["t"] != "Descrizione"])
    assert [p["nome"] for p in prodotti] == ["CARDIOASPIRIN*30CPR GAST 100MG", "TACHIPIRINA*20CPR 1000MG"]


def test_prodotti_righe_ripetute_e_intestazioni_non_contano():
    from app.core.winfarm_parse import prodotti_da_parole
    righe = [_p("Descrizione", 213, 128, 92, 18), _p("Cl.", 527, 128, 22, 18), _p("Cat.", 588, 128, 30, 18)]
    for y in (160, 200):  # lo stesso prodotto letto due volte dall'OCR
        righe += [_p("TAVEGIL*20CPR", 20, y, 240), _p("A", 528, y, 16), _p("1", 724, y, 10)]
    assert prodotti_da_parole(righe) == [{"nome": "TAVEGIL*20CPR", "quantita": 1}]


def test_testo_prodotti_non_taglia_un_nome_a_meta():
    from app.core.winfarm_parse import testo_prodotti
    prodotti = [{"nome": "FARMACO" + str(i) + "*" + "X" * 40, "quantita": 1} for i in range(20)]
    testo = testo_prodotti(prodotti)
    assert len(testo) <= 400
    assert testo.endswith(prodotti[len(testo.split("; ")) - 1]["nome"])
