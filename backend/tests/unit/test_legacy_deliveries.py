"""Il passo che allinea telefono e indirizzo dei documenti consegna vecchi."""
import asyncio

from app.core.delivery_creation import costruisci_consegna
from app.core.legacy_deliveries import CAMPI_TESTO, allinea_testi_consegne


class _Collezione:
    def __init__(self, da_toccare):
        self.da_toccare = da_toccare
        self.chiamate = []

    async def update_many(self, filtro, aggiornamento):
        self.chiamate.append((filtro, aggiornamento))
        toccati = self.da_toccare.pop(next(iter(filtro)), 0)

        class _Esito:
            modified_count = toccati

        return _Esito()


class _Db:
    def __init__(self, da_toccare):
        self.deliveries = _Collezione(da_toccare)


def test_tocca_solo_i_campi_garantiti_stringa():
    db = _Db({"customer_phone": 3, "customer_address": 2})

    modificati = asyncio.run(allinea_testi_consegne(db))

    assert modificati == 5
    assert [c[0] for c in db.deliveries.chiamate] == [{campo: None} for campo in CAMPI_TESTO]
    assert [c[1] for c in db.deliveries.chiamate] == [{"$set": {campo: ""}} for campo in CAMPI_TESTO]


def test_secondo_giro_non_cambia_niente():
    db = _Db({})

    assert asyncio.run(allinea_testi_consegne(db)) == 0


def test_ogni_campo_allineato_e_davvero_stringa_nel_costruttore():
    """Se domani il costruttore smette di garantire un campo, questo test lo dice."""
    consegna = costruisci_consegna(
        pharmacy_id="ph-1",
        delivery_id="del-1",
        customer={"customer_id": "c-1", "name": "Anna", "phone": None, "address": None},
        driver_id=None,
        notes="",
        payment_method="cash",
        amount=10.0,
        amount_given=None,
        priority="normale",
        scheduled_date=None,
        scheduled_time=None,
        slot_to=None,
    )

    for campo in CAMPI_TESTO:
        assert consegna[campo] == "", f"{campo} non e' piu' garantito stringa"
