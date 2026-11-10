"""Analisi del singolo paziente: i conti che finiscono nella scheda cliente."""
from datetime import date

from app.core.analisi_cliente import (
    analisi_cliente,
    confronto_con_farmacia,
    fascia_preferita,
    giorno_preferito,
    serie_mensile,
)

OGGI = date(2026, 11, 10)


def consegna(quando, importo=20.0, status="delivered", da=None, a=None):
    return {"created_at": f"{quando}T10:00:00+00:00", "amount": importo,
            "status": status, "scheduled_time": da, "slot_to": a}


def test_conta_solo_le_consegnate():
    esito = analisi_cliente([
        consegna("2026-11-02", 20),
        consegna("2026-11-03", 99, status="cancelled"),
        consegna("2026-11-04", 50, status="pronta"),
    ], oggi=OGGI)
    assert esito["ordini_conclusi"] == 1
    assert esito["speso_totale"] == 20


def test_spesa_media_arrotondata():
    esito = analisi_cliente([consegna("2026-11-01", 10), consegna("2026-11-02", 15)], oggi=OGGI)
    assert esito["spesa_media"] == 12.5


def test_serie_mensile_ha_sei_mesi_e_gli_zeri():
    serie = serie_mensile([consegna("2026-11-02", 20)], mesi=6, oggi=OGGI)
    assert len(serie) == 6
    assert [m["mese"] for m in serie] == ["2026-06", "2026-07", "2026-08",
                                           "2026-09", "2026-10", "2026-11"]
    assert serie[-1]["consegne"] == 1
    assert serie[0]["consegne"] == 0
    # un mese vuoto resta nella serie: il grafico non deve saltarlo
    assert serie[0]["speso"] == 0


def test_serie_che_attraversa_l_anno():
    serie = serie_mensile([], mesi=3, oggi=date(2027, 1, 15))
    assert [m["mese"] for m in serie] == ["2026-11", "2026-12", "2027-01"]


def test_le_consegne_fuori_finestra_non_entrano():
    serie = serie_mensile([consegna("2026-01-05", 20)], mesi=3, oggi=OGGI)
    assert all(m["consegne"] == 0 for m in serie)


def test_fascia_preferita_e_quella_piu_usata():
    esito = fascia_preferita([
        consegna("2026-11-01", da="15:00", a="18:00"),
        consegna("2026-11-02", da="15:00", a="18:00"),
        consegna("2026-11-03", da="09:00", a="12:00"),
    ])
    assert esito["etichetta"] == "15:00–18:00"
    assert esito["quantita"] == 2


def test_fascia_preferita_vuota_senza_storia():
    assert fascia_preferita([consegna("2026-11-01")]) is None


def test_giorno_preferito():
    # 2026-11-02 e' un lunedi', 2026-11-05 un giovedi'
    esito = giorno_preferito([consegna("2026-11-02"), consegna("2026-11-05"), consegna("2026-11-05")])
    assert esito == {"giorno": "giovedì", "quantita": 2}


def test_confronto_sopra_la_media():
    esito = confronto_con_farmacia(30, 20)
    assert esito["differenza_percento"] == 50.0
    assert esito["sopra_la_media"] is True


def test_confronto_sotto_la_media():
    esito = confronto_con_farmacia(10, 20)
    assert esito["differenza_percento"] == -50.0
    assert esito["sopra_la_media"] is False


def test_confronto_senza_media_di_farmacia():
    assert confronto_con_farmacia(10, None) is None
    assert confronto_con_farmacia(None, 20) is None


def test_tendenza_del_mese_rispetto_al_precedente():
    esito = analisi_cliente([
        consegna("2026-10-05", 20),
        consegna("2026-11-05", 30),
    ], oggi=OGGI)
    # ottobre 20, novembre 30: +50%
    assert esito["tendenza_mese_percento"] == 50.0


def test_tendenza_assente_con_un_mese_solo():
    esito = analisi_cliente([consegna("2026-11-05", 20)], oggi=OGGI)
    assert esito["tendenza_mese_percento"] is None


def test_paziente_senza_storia_non_rompe_niente():
    esito = analisi_cliente([], oggi=OGGI)
    assert esito["ordini_conclusi"] == 0
    assert esito["spesa_media"] is None
    assert len(esito["serie_mensile"]) == 6
    assert esito["confronto"] is None
