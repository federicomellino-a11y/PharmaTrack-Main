"""Test unitari puri (nessuna rete, nessun database) sulle aggregazioni dei report."""
from app.core.reporting import aggregate_report_totals


def _consegna(**kw):
    base = {
        "amount": 10.0,
        "payment_method": "cash",
        "actual_delivery": "2026-11-02T10:00:00Z",
        "customer_id": "cli_1",
        "driver_id": "drv_1",
    }
    base.update(kw)
    return base


def test_somma_il_fatturato_di_tutte_le_consegne():
    dati = aggregate_report_totals([_consegna(amount=12.5), _consegna(amount=7.5)])
    assert dati["total_revenue"] == 20.0
    assert dati["total_deliveries"] == 2


def test_importi_nulli_non_rompono_la_somma():
    dati = aggregate_report_totals([_consegna(amount=None), _consegna(amount=5)])
    assert dati["total_revenue"] == 5
    assert dati["total_deliveries"] == 2


def test_ripartizione_contanti_pos_e_altro():
    dati = aggregate_report_totals([
        _consegna(amount=10, payment_method="cash"),
        _consegna(amount=15, payment_method="pos"),
        _consegna(amount=5, payment_method="bonifico"),
    ])
    assert dati["payment_split"]["cash"] == {"revenue": 10.0, "count": 1}
    assert dati["payment_split"]["pos"] == {"revenue": 15.0, "count": 1}
    assert dati["payment_split"]["other"] == {"revenue": 5.0, "count": 1}


def test_serie_giornaliera_ordinata_e_aggregata():
    dati = aggregate_report_totals([
        _consegna(amount=10, actual_delivery="2026-11-02T12:00:00Z"),
        _consegna(amount=5, actual_delivery="2026-11-01T09:00:00Z"),
        _consegna(amount=2.5, actual_delivery="2026-11-02T18:00:00Z"),
    ])
    assert [r["date"] for r in dati["daily_revenue"]] == ["2026-11-01", "2026-11-02"]
    assert dati["daily_revenue"][1]["revenue"] == 12.5
    assert dati["daily_revenue"][1]["count"] == 2


def test_usa_updated_at_quando_manca_actual_delivery():
    dati = aggregate_report_totals([
        {"amount": 3, "payment_method": "cash", "updated_at": "2026-10-31T23:30:00Z"},
    ])
    assert dati["daily_revenue"][0]["date"] == "2026-10-31"


def test_conteggi_per_cliente_e_fattorino():
    dati = aggregate_report_totals([
        _consegna(amount=10, customer_id="cli_1", driver_id="drv_1"),
        _consegna(amount=20, customer_id="cli_1", driver_id="drv_2"),
        _consegna(amount=5, customer_id="cli_2", driver_id="drv_1"),
    ])
    assert dati["customer_counts"]["cli_1"] == 2
    assert dati["customer_revenue"]["cli_1"] == 30
    assert dati["driver_counts"]["drv_1"] == 2
    assert dati["driver_revenue"]["drv_2"] == 20


def test_consegne_senza_cliente_o_fattorino_non_creano_voci():
    dati = aggregate_report_totals([
        _consegna(customer_id=None, driver_id=None),
    ])
    assert dati["customer_counts"] == {}
    assert dati["driver_counts"] == {}
    assert dati["total_revenue"] == 10.0


def test_lista_vuota_restituisce_struttura_valida():
    dati = aggregate_report_totals([])
    assert dati["total_revenue"] == 0
    assert dati["total_deliveries"] == 0
    assert dati["daily_revenue"] == []
    assert dati["payment_split"]["cash"] == {"revenue": 0.0, "count": 0}
