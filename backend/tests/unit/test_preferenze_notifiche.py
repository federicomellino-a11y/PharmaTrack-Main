"""Le notifiche si possono spegnere per famiglia, non solo tutte insieme.

Prima esistevano due soli interruttori (notifiche browser, suoni) mentre il
backend mandava push per consegne, turni e import: chi voleva silenzio sui
turni doveva spegnere tutto. Queste regole decidono cosa passa.
"""
from app.core.notifications import (
    EVENTI_NOTIFICHE,
    evento_consentito,
    notifiche_browser_accese,
    preferenze_eventi,
)


def test_senza_preferenze_e_tutto_acceso():
    assert preferenze_eventi({}) == {"delivery": True, "shift": True}


def test_la_farmacia_spegne_i_turni_e_tiene_le_consegne():
    utente = {"settings": {"notifiche_eventi": {"shift": False}}}
    assert evento_consentito(utente, "delivery") is True
    assert evento_consentito(utente, "shift") is False


def test_i_tipi_fuori_elenco_passano_sempre():
    utente = {"settings": {"notifiche_eventi": {"delivery": False, "shift": False}}}
    assert evento_consentito(utente, "test") is True
    assert "test" not in EVENTI_NOTIFICHE


def test_un_valore_storto_non_silenzia_gli_avvisi():
    """Nel JSON puo' finire di tutto: solo un False esplicito spegne."""
    utente = {"settings": {"notifiche_eventi": {"delivery": "no", "shift": 0}}}
    assert preferenze_eventi(utente) == {"delivery": True, "shift": True}


def test_settings_assenti_o_sporchi_non_fanno_esplodere_niente():
    for utente in ({}, {"settings": None}, {"settings": {"notifiche_eventi": None}}, None):
        assert preferenze_eventi(utente) == {"delivery": True, "shift": True}


def test_interruttore_browser_spento_spegne_solo_le_push():
    assert notifiche_browser_accese({}) is True
    assert notifiche_browser_accese({"settings": {"notifications_enabled": False}}) is False
    assert notifiche_browser_accese({"settings": {"notifications_enabled": True}}) is True
