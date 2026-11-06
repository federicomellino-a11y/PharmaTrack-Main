"""Chi e' il cliente, e con che cosa si paga.

Due regole decise con Federico: il cliente si cerca prima per codice fiscale e
poi per nome e cognome, e non si crea mai un cliente alla cieca; il pagamento
si traduce in un vocabolario solo, senza che un POS diventi contanti.
"""
import re

from app.routers.integrations import (
    filtri_cliente, normalizza_cf, normalizza_pagamento,
)

FARMACIA = "farmacia_1"


# --- Ricerca del cliente ----------------------------------------------------

def test_il_codice_fiscale_viene_prima_del_nome():
    filtri = filtri_cliente(FARMACIA, {
        "cliente": "MELLINO FEDERICO",
        "codice_fiscale": "MLLFRC91D21F839X",
    })
    assert "fiscal_code" in filtri[0]
    assert "name" in filtri[1]


def test_senza_codice_fiscale_si_parte_dal_nome():
    filtri = filtri_cliente(FARMACIA, {"cliente": "MELLINO FEDERICO"})
    assert "name" in filtri[0]


def test_il_codice_cliente_esplicito_comanda_su_tutto():
    filtri = filtri_cliente(FARMACIA, {"customer_id": "cust_1", "codice_fiscale": "MLLFRC91D21F839X"})
    assert filtri[0]["customer_id"] == "cust_1"


def test_il_telefono_e_l_ultima_spiaggia():
    filtri = filtri_cliente(FARMACIA, {
        "cliente": "MELLINO FEDERICO", "telefono": "+39 333 123 4567"})
    assert "phone" in filtri[-1]
    # si confrontano le ultime nove cifre: +39 e spazi non devono impedire l'incontro
    assert filtri[-1]["phone"]["$regex"] == "331234567$"


def test_un_cognome_con_parentesi_non_rompe_la_ricerca():
    """Senza re.escape un nome come "ROSSI (FARMACIA)" non troverebbe nulla."""
    modello = filtri_cliente(FARMACIA, {"cliente": "ROSSI (FARMACIA)"})[0]["name"]["$regex"]
    assert re.search(modello, "ROSSI (FARMACIA)", re.IGNORECASE)
    assert not re.search(modello, "ROSSI FARMACIA", re.IGNORECASE)


def test_un_codice_fiscale_troncato_non_guida_la_ricerca():
    assert normalizza_cf("MLLFRC91D") is None
    assert normalizza_cf("MLLFRC91D21F839X") == "MLLFRC91D21F839X"
    assert normalizza_cf("mllfrc91d21f839x") == "MLLFRC91D21F839X"


def test_senza_dati_sul_cliente_non_si_cerca_niente():
    assert filtri_cliente(FARMACIA, {}) == []


# --- Pagamento --------------------------------------------------------------

def test_il_pos_resta_pos():
    """Il difetto da chiudere: "card" diventava contanti in silenzio."""
    for parola in ("card", "POS", "pos", "carta", "bancomat", "elettronico"):
        assert normalizza_pagamento(parola) == "pos", parola


def test_i_contanti_restano_contanti():
    for parola in ("cash", "contanti", "Contanti"):
        assert normalizza_pagamento(parola) == "cash", parola


def test_una_parola_mai_vista_non_diventa_contanti():
    """Meglio "altro" (si vede) che "cash" (non si vede e falsa la cassa)."""
    assert normalizza_pagamento("buoni pasto") == "other"


def test_senza_pagamento_il_predefinito_e_contanti():
    assert normalizza_pagamento(None) == "cash"
