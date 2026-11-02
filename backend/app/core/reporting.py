"""Logica di aggregazione pura dei report.

Sta fuori dal router per due motivi: si puo' verificare con test unitari senza
FastAPI ne' database, e la rotta resta leggibile.
"""


def aggregate_report_totals(deliveries: list) -> dict:
    """Aggregazioni pure sui dati di un periodo, senza toccare il database.

    Estratta dalla rotta per poter essere verificata con test unitari: e' la
    parte dove un errore si vede nel fatturato mostrato alla farmacia.
    """
    total_revenue = sum(d.get("amount", 0) or 0 for d in deliveries)
    payment_split = {
        "cash": {"revenue": 0.0, "count": 0},
        "pos": {"revenue": 0.0, "count": 0},
        "other": {"revenue": 0.0, "count": 0},
    }
    daily_map = {}
    customer_counts = {}
    customer_revenue = {}
    driver_counts = {}
    driver_revenue = {}
    for d in deliveries:
        importo = d.get("amount") or 0
        method = d.get("payment_method") if d.get("payment_method") in ("cash", "pos") else "other"
        payment_split[method]["revenue"] = round(payment_split[method]["revenue"] + importo, 2)
        payment_split[method]["count"] += 1

        ref = d.get("actual_delivery") or d.get("updated_at") or d.get("created_at")
        if ref:
            day = str(ref)[:10]
            bucket = daily_map.setdefault(day, {"revenue": 0.0, "count": 0})
            bucket["revenue"] = round(bucket["revenue"] + importo, 2)
            bucket["count"] += 1

        cid = d.get("customer_id")
        if cid:
            customer_counts[cid] = customer_counts.get(cid, 0) + 1
            customer_revenue[cid] = customer_revenue.get(cid, 0) + importo
        did = d.get("driver_id")
        if did:
            driver_counts[did] = driver_counts.get(did, 0) + 1
            driver_revenue[did] = driver_revenue.get(did, 0) + importo

    return {
        "total_revenue": total_revenue,
        "total_deliveries": len(deliveries),
        "payment_split": payment_split,
        "daily_revenue": [{"date": k, **v} for k, v in sorted(daily_map.items())],
        "customer_counts": customer_counts,
        "customer_revenue": customer_revenue,
        "driver_counts": driver_counts,
        "driver_revenue": driver_revenue,
    }
