"""I filtri dell'archivio: la regola, senza database.

Il difetto che ha generato questo file: la casella di ricerca dell'Archivio
filtrava soltanto le 20 righe della pagina, quindi chi cercava un cliente di
un mese prima riceveva "Nessuna consegna trovata". Qui si prova che
l'interrogazione comprende tutti i documenti archiviati e che i filtri
arrivano al database, non alla pagina.
"""

from app.core.archivio import (
    CAMPI_RICERCA,
    LUNGHEZZA_MASSIMA_RICERCA,
    filtro_archivio,
    limiti_pagina,
)
from app.core.delivery_lifecycle import ARCHIVED_STATUSES


def test_senza_filtri_prende_tutto_l_archivio_della_farmacia():
    query = filtro_archivio("farm-1")
    assert query["pharmacy_id"] == "farm-1"
    assert set(query["status"]["$in"]) == set(ARCHIVED_STATUSES)
    assert set(query) == {"pharmacy_id", "status"}


def test_lo_stato_riconosciuto_resta_uno_solo():
    query = filtro_archivio("farm-1", status="cancelled")
    assert query["status"] == "cancelled"


def test_lo_stato_inventato_non_svuota_l_archivio():
    query = filtro_archivio("farm-1", status="qualcosa")
    assert set(query["status"]["$in"]) == set(ARCHIVED_STATUSES)


def test_la_ricerca_guarda_tutti_i_campi_utili():
    query = filtro_archivio("farm-1", testo="mario")
    campi = [next(iter(condizione)) for condizione in query["$or"]]
    assert sorted(campi) == sorted(CAMPI_RICERCA)
    for condizione in query["$or"]:
        valore = next(iter(condizione.values()))
        assert valore == {"$regex": "mario", "$options": "i"}


def test_la_ricerca_ignora_spazi_e_ripetizioni():
    assert "mario" in filtro_archivio("farm-1", testo="  mario  ")["$or"][0]["customer_name"]["$regex"]


def test_la_ricerca_non_e_un_espressione_regolare():
    """Una parentesi scritta per sbaglio non deve far esplodere il backend."""
    query = filtro_archivio("farm-1", testo="ditta (rossi) *")
    schema = query["$or"][0]["customer_name"]["$regex"]
    assert "\\(" in schema and "\\*" in schema
    assert "(" not in schema.replace("\\(", "")


def test_la_ricerca_assente_o_di_soli_spazi_non_filtra():
    assert "$or" not in filtro_archivio("farm-1", testo="   ")
    assert "$or" not in filtro_archivio("farm-1", testo=None)


def test_la_ricerca_troppo_lunga_si_taglia():
    query = filtro_archivio("farm-1", testo="a" * 300)
    assert query["$or"][0]["customer_name"]["$regex"] == "a" * LUNGHEZZA_MASSIMA_RICERCA


def test_il_fattorino_e_il_pagamento_passano_al_database():
    query = filtro_archivio("farm-1", driver_id="drv-9", pagamento="pos")
    assert query["driver_id"] == "drv-9"
    assert query["payment_method"] == "pos"


def test_fattorino_vuoto_e_pagamento_inventato_non_filtrano():
    query = filtro_archivio("farm-1", driver_id="  ", pagamento="assegno")
    assert "driver_id" not in query
    assert "payment_method" not in query


def test_il_periodo_parte_dalla_mezzanotte_italiana():
    """Il 1 novembre a Roma e' mezzanotte meno un'ora in UTC (ora solare)."""
    query = filtro_archivio("farm-1", dal="2026-11-01")
    assert query["$expr"] == {"$gte": [{"$ifNull": ["$actual_delivery", "$updated_at"]}, "2026-10-31T23:00:00+00:00"]}


def test_il_giorno_finale_e_compreso_tutto():
    query = filtro_archivio("farm-1", dal="2026-11-01", al="2026-11-14")
    assert query["$expr"]["$and"][1] == {
        "$lt": [{"$ifNull": ["$actual_delivery", "$updated_at"]}, "2026-11-14T23:00:00+00:00"]
    }


def test_d_estate_il_confine_segue_l_ora_legale():
    query = filtro_archivio("farm-1", al="2026-07-01")
    assert query["$expr"] == {"$lt": [{"$ifNull": ["$actual_delivery", "$updated_at"]}, "2026-07-01T22:00:00+00:00"]}


def test_una_data_scritta_male_non_filtra_e_non_rompe():
    query = filtro_archivio("farm-1", dal="ieri", al="14/11/2026")
    assert "$expr" not in query


def test_la_pagina_non_puo_diventare_zero_ne_illimitata():
    assert limiti_pagina(0, 0) == (1, 20)  # 0 vale "non indicato"
    assert limiti_pagina(-3, 5000) == (1, 500)
    assert limiti_pagina(2, 20) == (2, 20)
