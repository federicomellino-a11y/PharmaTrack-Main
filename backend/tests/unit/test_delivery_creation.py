"""La consegna nasce in un posto solo.

Le due creazioni (farmacia e import Winfarm) costruivano lo stesso documento di
25 campi in due file diversi, gia' divergenti: quella Winfarm non aveva `nre` ne'
`client_meta`, quella della farmacia non aveva `imported_from`. Questi test
fissano il comportamento di entrambe, cosi' la prossima aggiunta non puo'
finire in una sola delle due.
"""

import inspect

from app.core.delivery_creation import calcola_resto, costruisci_consegna
from app.routers import deliveries as router_deliveries
from app.routers import integrations as router_integrations

CLIENTE = {"customer_id": "cust_1", "name": "Anna Rossi", "phone": "3331234567", "address": "Via Roma 1"}


def _consegna(**extra):
    base = dict(
        pharmacy_id="farma_1",
        customer=CLIENTE,
        delivery_id="del_abc",
        payment_method="cash",
        adesso="2026-11-09T10:00:00+00:00",
    )
    base.update(extra)
    return costruisci_consegna(**base)


def test_parte_dalla_coda_e_con_i_campi_vuoti_azzerati():
    consegna = _consegna()
    assert consegna["status"] == "da_preparare"
    assert consegna["auto_assigned"] is False
    assert consegna["payment_collected"] is False
    assert consegna["estimated_delivery"] is None and consegna["actual_delivery"] is None
    assert consegna["created_at"] == consegna["updated_at"] == "2026-11-09T10:00:00+00:00"


def test_resto_solo_in_contanti_con_entrambe_le_cifre():
    assert _consegna(amount=8, amount_given=10)["change_due"] == 2
    assert _consegna(amount=8)["change_due"] is None
    assert _consegna(amount_given=10)["change_due"] is None
    assert _consegna(payment_method="pos", amount=8, amount_given=10)["change_due"] is None
    assert calcola_resto("cash", None, 10) is None


def test_la_farmacia_non_ha_imported_from_il_bot_si():
    assert "imported_from" not in _consegna()
    consegna = _consegna(imported_from="winfarm")
    assert consegna["imported_from"] == "winfarm"
    assert consegna["nre"] is None and consegna["client_meta"] is None


def test_campi_facoltativi_vuoti_diventano_none():
    consegna = _consegna(nre="", client_meta=None, external_ref="")
    assert consegna["nre"] is None
    assert consegna["client_meta"] is None
    assert consegna["external_ref"] is None


def test_cliente_senza_telefono_non_rompe_l_import():
    cliente = {"customer_id": "cust_2", "name": "Mario", "address": "Via Verdi 3"}
    consegna = costruisci_consegna(
        pharmacy_id="farma_1", customer=cliente, delivery_id="del_x",
        payment_method="cash", imported_from="winfarm",
    )
    assert consegna["customer_phone"] == ""
    assert consegna["customer_address"] == "Via Verdi 3"


def test_le_due_creazioni_usano_il_costruttore():
    for router in (router_deliveries, router_integrations):
        sorgente = inspect.getsource(router)
        assert "costruisci_consegna(" in sorgente, f"{router.__name__} costruisce la consegna a mano"
        assert '"delivery_id": f"del_{uuid' not in sorgente, f"{router.__name__} ha ancora il documento scritto dentro"
