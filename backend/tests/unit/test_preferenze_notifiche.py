"""Le notifiche si possono spegnere per famiglia, non solo tutte insieme.

Prima esistevano due soli interruttori (notifiche browser, suoni) mentre il
backend mandava push per consegne, turni e import: chi voleva silenzio sui
turni doveva spegnere tutto. Queste regole decidono cosa passa.
"""
from datetime import datetime

from app.core.clock import ROME_TZ
from app.core.notifications import (
    EVENTI_NOTIFICHE,
    evento_consentito,
    in_orario_silenzio,
    notifiche_browser_accese,
    preferenze_eventi,
)

TUTTI_ACCESI = {"delivery": True, "shift": True, "message": True}


def test_senza_preferenze_e_tutto_acceso():
    assert preferenze_eventi({}) == TUTTI_ACCESI


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
    assert preferenze_eventi(utente) == TUTTI_ACCESI


def test_settings_assenti_o_sporchi_non_fanno_esplodere_niente():
    for utente in ({}, {"settings": None}, {"settings": {"notifiche_eventi": None}}, None):
        assert preferenze_eventi(utente) == TUTTI_ACCESI


def test_interruttore_browser_spento_spegne_solo_le_push():
    assert notifiche_browser_accese({}) is True
    assert notifiche_browser_accese({"settings": {"notifications_enabled": False}}) is False
    assert notifiche_browser_accese({"settings": {"notifications_enabled": True}}) is True


def test_i_messaggi_dei_fattorini_hanno_il_loro_interruttore():
    utente = {"settings": {"notifiche_eventi": {"message": False}}}
    assert evento_consentito(utente, "message") is False
    assert evento_consentito(utente, "delivery") is True


def _alle(ore, minuti):
    return datetime(2026, 11, 10, ore, minuti, tzinfo=ROME_TZ)


def test_silenzio_spento_di_default():
    assert in_orario_silenzio({}) is False
    assert in_orario_silenzio({"silenzio_attivo": False}) is False
    assert in_orario_silenzio({"silenzio_attivo": "si"}) is False


def test_silenzio_che_scavalca_la_mezzanotte():
    impostazioni = {"silenzio_attivo": True, "silenzio_da": "21:30", "silenzio_a": "07:30"}
    assert in_orario_silenzio(impostazioni, _alle(23, 0)) is True
    assert in_orario_silenzio(impostazioni, _alle(3, 0)) is True
    assert in_orario_silenzio(impostazioni, _alle(7, 29)) is True
    assert in_orario_silenzio(impostazioni, _alle(7, 30)) is False
    assert in_orario_silenzio(impostazioni, _alle(12, 0)) is False


def test_silenzio_tutto_dentro_la_giornata():
    impostazioni = {"silenzio_attivo": True, "silenzio_da": "13:00", "silenzio_a": "15:00"}
    assert in_orario_silenzio(impostazioni, _alle(14, 0)) is True
    assert in_orario_silenzio(impostazioni, _alle(16, 0)) is False


def test_orario_scritto_male_non_silenzia_niente():
    for impostazioni in (
        {"silenzio_attivo": True, "silenzio_da": "ventuno", "silenzio_a": "07:30"},
        {"silenzio_attivo": True, "silenzio_da": "21:30", "silenzio_a": "dopo cena"},
        {"silenzio_attivo": True, "silenzio_da": "21:30", "silenzio_a": "21:30"},
    ):
        assert in_orario_silenzio(impostazioni, _alle(23, 0)) is False


def test_un_orario_lasciato_vuoto_vale_il_predefinito():
    """Il campo vuoto non e' un errore: vuol dire "non l'ho toccato", e le ore
    di silenzio restano quelle di serie (21:30 - 07:30)."""
    impostazioni = {"silenzio_attivo": True, "silenzio_da": "21:00", "silenzio_a": ""}
    assert in_orario_silenzio(impostazioni, _alle(23, 0)) is True
    assert in_orario_silenzio(impostazioni, _alle(9, 0)) is False
