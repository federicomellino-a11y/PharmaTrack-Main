"""Ricorrenze e richiami: il calcolo delle tre liste, senza database.

Le regole provate qui sono quelle decise con Federico: l'ultimo ordine fa
ripartire il conteggio, una consegna annullata non conta, una ricorrenza
scaduta resta "da fare" invece di sparire.
"""
from datetime import date, timedelta

from app.core.ricorrenze import (
    GIORNI_RICHIAMO,
    raggruppa,
    ultimo_ordine_per_cliente,
)

OGGI = date(2026, 11, 10)


def cliente(customer_id="c1", name="Anna Verdi", **extra):
    base = {"customer_id": customer_id, "name": name, "phone": "3331112222",
            "address": "Via Roma 12", "is_active": True}
    base.update(extra)
    return base


def consegna(customer_id="c1", giorni_fa=10, status="delivered"):
    return {
        "customer_id": customer_id,
        "status": status,
        "created_at": (OGGI - timedelta(days=giorni_fa)).isoformat() + "T09:00:00+00:00",
    }


def test_ultimo_ordine_ignora_le_annullate():
    ultimi = ultimo_ordine_per_cliente([
        consegna(giorni_fa=40),
        consegna(giorni_fa=2, status="cancelled"),
    ])
    assert ultimi["c1"] == OGGI - timedelta(days=40)


def test_ultimo_ordine_tiene_il_piu_recente():
    ultimi = ultimo_ordine_per_cliente([consegna(giorni_fa=40), consegna(giorni_fa=5)])
    assert ultimi["c1"] == OGGI - timedelta(days=5)


def test_ricorrenza_scaduta_finisce_nei_da_fare():
    esito = raggruppa(
        [cliente(ricorrenza_attiva=True, ricorrenza_giorni=30, ricorrenza_da="2026-09-01")],
        [consegna(giorni_fa=40)],
        oggi=OGGI,
    )
    assert len(esito["da_fare"]) == 1
    voce = esito["da_fare"][0]
    # la partenza e' l'ultimo ordine (1/10), non la data del modulo (1/9)
    assert voce["prossima"] == "2026-10-31"
    assert voce["giorni_di_ritardo"] == 10
    assert esito["richiami"] == []


def test_ricorrenza_di_oggi_e_da_fare_non_in_arrivo():
    esito = raggruppa(
        [cliente(ricorrenza_attiva=True, ricorrenza_giorni=10)],
        [consegna(giorni_fa=10)],
        oggi=OGGI,
    )
    assert len(esito["da_fare"]) == 1
    assert esito["da_fare"][0]["giorni_di_ritardo"] == 0
    assert esito["in_arrivo"] == []


def test_ricorrenza_entro_sette_giorni_finisce_in_arrivo():
    esito = raggruppa(
        [cliente(ricorrenza_attiva=True, ricorrenza_giorni=30)],
        [consegna(giorni_fa=25)],
        oggi=OGGI,
    )
    assert esito["in_arrivo"][0]["prossima"] == "2026-11-15"
    assert esito["in_arrivo"][0]["giorni_alla_prossima"] == 5
    assert esito["da_fare"] == []


def test_ricorrenza_lontana_non_compare():
    esito = raggruppa(
        [cliente(ricorrenza_attiva=True, ricorrenza_giorni=30)],
        [consegna(giorni_fa=2)],
        oggi=OGGI,
    )
    assert esito["da_fare"] == [] and esito["in_arrivo"] == []


def test_paziente_con_ricorrenza_non_finisce_nei_richiami():
    esito = raggruppa(
        [cliente(ricorrenza_attiva=True, ricorrenza_giorni=90)],
        [consegna(giorni_fa=120)],
        oggi=OGGI,
    )
    assert esito["richiami"] == []
    assert len(esito["da_fare"]) == 1


def test_paziente_sparito_finisce_nei_richiami():
    esito = raggruppa([cliente()], [consegna(giorni_fa=GIORNI_RICHIAMO + 3)], oggi=OGGI)
    assert len(esito["richiami"]) == 1
    assert esito["richiami"][0]["giorni_da_ultimo_ordine"] == GIORNI_RICHIAMO + 3


def test_paziente_recente_non_e_un_richiamo():
    esito = raggruppa([cliente()], [consegna(giorni_fa=30)], oggi=OGGI)
    assert esito["richiami"] == []


def test_chi_non_ha_mai_ordinato_conta_dall_iscrizione():
    esito = raggruppa(
        [cliente(created_at="2026-08-01T10:00:00+00:00")],
        [],
        oggi=OGGI,
    )
    assert len(esito["richiami"]) == 1
    assert esito["richiami"][0]["giorni_da_ultimo_ordine"] == (OGGI - date(2026, 8, 1)).days


def test_cliente_disattivato_non_compare():
    esito = raggruppa([cliente(is_active=False)], [consegna(giorni_fa=90)], oggi=OGGI)
    assert esito["richiami"] == []


def test_la_fascia_diventa_testo_leggibile():
    esito = raggruppa(
        [cliente(ricorrenza_attiva=True, ricorrenza_giorni=30, ricorrenza_da="15:00", ricorrenza_a="18:00")],
        [consegna(giorni_fa=40)],
        oggi=OGGI,
    )
    assert esito["da_fare"][0]["fascia"] == "15:00–18:00"


def test_ordinamento_da_fare_prima_il_piu_in_ritardo():
    esito = raggruppa(
        [
            cliente("c1", "Uno", ricorrenza_attiva=True, ricorrenza_giorni=30),
            cliente("c2", "Due", ricorrenza_attiva=True, ricorrenza_giorni=30),
        ],
        [consegna("c1", giorni_fa=40), consegna("c2", giorni_fa=70)],
        oggi=OGGI,
    )
    assert [v["name"] for v in esito["da_fare"]] == ["Due", "Uno"]


def test_totali_allineati_alle_liste():
    esito = raggruppa(
        [cliente(ricorrenza_attiva=True, ricorrenza_giorni=30), cliente("c2", "Due")],
        [consegna(giorni_fa=40), consegna("c2", giorni_fa=100)],
        oggi=OGGI,
    )
    assert esito["totali"] == {
        "da_fare": len(esito["da_fare"]),
        "in_arrivo": len(esito["in_arrivo"]),
        "richiami": len(esito["richiami"]),
    }
    assert esito["oggi"] == OGGI.isoformat()
