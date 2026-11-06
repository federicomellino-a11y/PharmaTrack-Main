import logging
from datetime import datetime, timezone, timedelta
from zoneinfo import ZoneInfo
from fastapi import APIRouter, Depends

from app.core.database import db
from app.core.security import get_current_user
from app.core.cache import cache_get, cache_set

logger = logging.getLogger(__name__)
router = APIRouter()

_DELIVERED = ["delivered", "delivered_pending_confirmation"]
ROME_TZ = ZoneInfo("Europe/Rome")


@router.get("/analytics")
async def get_analytics(period: str = "month", user: dict = Depends(get_current_user)):
    """Aggregated KPIs for the pharmacy dashboard (cached)."""
    pharmacy_id = user["user_id"]
    days = {"week": 7, "month": 30, "quarter": 90, "year": 365}.get(period, 30)

    cache_key = f"analytics:{pharmacy_id}:{period}"
    cached = await cache_get(cache_key)
    if cached is not None:
        return cached

    start = (datetime.now(timezone.utc) - timedelta(days=days)).replace(
        hour=0, minute=0, second=0, microsecond=0
    )
    base = {"pharmacy_id": pharmacy_id, "created_at": {"$gte": start.isoformat()}}

    # Revenue + payment split over delivered orders
    pipeline = [
        {"$match": {**base, "status": {"$in": _DELIVERED}}},
        {"$group": {
            "_id": "$payment_method",
            "revenue": {"$sum": {"$ifNull": ["$amount", 0]}},
            "count": {"$sum": 1},
        }},
    ]
    payment_split = {}
    total_revenue = 0.0
    delivered_count = 0
    async for row in db.deliveries.aggregate(pipeline):
        method = row.get("_id") or "cash"
        rev = round(float(row.get("revenue") or 0), 2)
        payment_split[method] = {"revenue": rev, "count": row.get("count", 0)}
        total_revenue += rev
        delivered_count += row.get("count", 0)

    # Daily revenue trend
    trend_pipeline = [
        {"$match": {**base, "status": {"$in": _DELIVERED}}},
        {"$group": {
            "_id": {"$substr": ["$created_at", 0, 10]},
            "revenue": {"$sum": {"$ifNull": ["$amount", 0]}},
            "count": {"$sum": 1},
        }},
        {"$sort": {"_id": 1}},
    ]
    daily = [
        {"date": r["_id"], "revenue": round(float(r.get("revenue") or 0), 2), "count": r.get("count", 0)}
        async for r in db.deliveries.aggregate(trend_pipeline)
    ]

    # Top customers by completed deliveries
    top_pipeline = [
        {"$match": {**base, "status": {"$in": _DELIVERED}}},
        {"$group": {
            "_id": "$customer_id",
            "customer_name": {"$first": "$customer_name"},
            "deliveries": {"$sum": 1},
            "revenue": {"$sum": {"$ifNull": ["$amount", 0]}},
        }},
        {"$sort": {"deliveries": -1}},
        {"$limit": 5},
    ]
    top_customers = [
        {"customer_id": r["_id"], "name": r.get("customer_name"), "deliveries": r.get("deliveries", 0),
         "revenue": round(float(r.get("revenue") or 0), 2)}
        async for r in db.deliveries.aggregate(top_pipeline)
    ]

    # Driver performance
    driver_pipeline = [
        {"$match": {**base, "status": {"$in": _DELIVERED}, "driver_id": {"$ne": None}}},
        {"$group": {"_id": "$driver_id", "deliveries": {"$sum": 1},
                    "revenue": {"$sum": {"$ifNull": ["$amount", 0]}}}},
        {"$sort": {"deliveries": -1}},
    ]
    driver_perf = []
    async for r in db.deliveries.aggregate(driver_pipeline):
        drv = await db.drivers.find_one({"driver_id": r["_id"]}, {"_id": 0, "name": 1})
        driver_perf.append({
            "driver_id": r["_id"],
            "name": drv.get("name") if drv else "—",
            "deliveries": r.get("deliveries", 0),
            "revenue": round(float(r.get("revenue") or 0), 2),
        })

    total_in_period = await db.deliveries.count_documents(base)
    cancelled = await db.deliveries.count_documents({**base, "status": "cancelled"})
    completion_rate = round((delivered_count / total_in_period * 100), 1) if total_in_period else 0.0
    avg_order = round((total_revenue / delivered_count), 2) if delivered_count else 0.0

    # --- Tempi di consegna, motivi, orari, pazienti da richiamare ---
    # Una lettura sola dei campi che servono, poi i conti in Python: sono poche
    # migliaia di righe e la leggibilita' vale piu' di un pipeline complicato.
    dettagli = await db.deliveries.find(
        {"pharmacy_id": pharmacy_id, "created_at": {"$gte": start.isoformat()}},
        {"_id": 0, "status": 1, "created_at": 1, "actual_delivery": 1, "driver_id": 1,
         "customer_id": 1, "customer_name": 1, "failure_reason": 1},
    ).to_list(10000)

    tempi = []
    motivi = {}
    per_ora = {ora: 0 for ora in range(6, 22)}
    giorni = ("lun", "mar", "mer", "gio", "ven", "sab", "dom")
    per_giorno = {giorno: 0 for giorno in giorni}

    for consegna in dettagli:
        inizio = consegna.get("created_at")
        if inizio:
            try:
                locale = datetime.fromisoformat(str(inizio).replace("Z", "+00:00")).astimezone(ROME_TZ)
                per_ora[locale.hour] = per_ora.get(locale.hour, 0) + 1
                per_giorno[giorni[locale.weekday()]] += 1
            except (TypeError, ValueError):
                pass
        if consegna.get("status") == "not_delivered":
            motivo = (consegna.get("failure_reason") or "Non specificato").strip() or "Non specificato"
            motivi[motivo] = motivi.get(motivo, 0) + 1
        fine = consegna.get("actual_delivery")
        if inizio and fine and consegna.get("status") in _DELIVERED:
            try:
                minuti = (datetime.fromisoformat(str(fine).replace("Z", "+00:00"))
                          - datetime.fromisoformat(str(inizio).replace("Z", "+00:00"))).total_seconds() / 60
            except (TypeError, ValueError):
                continue
            # oltre mezza giornata non e' un tempo di consegna, e' un dato sporco
            if 0 <= minuti <= 720:
                tempi.append((minuti, consegna.get("driver_id")))

    ordinati = sorted(t[0] for t in tempi)
    tempi_per_fattorino = {}
    for minuti, did in tempi:
        if not did:
            continue
        voce = tempi_per_fattorino.setdefault(did, {"somma": 0.0, "quanti": 0})
        voce["somma"] += minuti
        voce["quanti"] += 1
    tempi_fattorini = []
    for did, voce in tempi_per_fattorino.items():
        fattorino = await db.drivers.find_one({"driver_id": did}, {"_id": 0, "name": 1})
        if fattorino:
            tempi_fattorini.append({
                "name": fattorino["name"],
                "avg_minutes": round(voce["somma"] / voce["quanti"], 1),
                "count": voce["quanti"],
            })
    tempi_fattorini.sort(key=lambda x: x["avg_minutes"])

    # Chi ordinava spesso e non ordina da un pezzo: la terapia continua,
    # l'importo cambia, quindi si richiama la persona e non l'ordine.
    ultimi = {}
    for consegna in await db.deliveries.find(
        {"pharmacy_id": pharmacy_id, "status": {"$in": _DELIVERED}},
        {"_id": 0, "customer_id": 1, "customer_name": 1, "actual_delivery": 1, "created_at": 1},
    ).to_list(10000):
        cid = consegna.get("customer_id")
        riferimento = consegna.get("actual_delivery") or consegna.get("created_at")
        if not cid or not riferimento:
            continue
        voce = ultimi.setdefault(cid, {"nome": consegna.get("customer_name") or "", "volte": 0, "ultima": None})
        voce["volte"] += 1
        if voce["ultima"] is None or str(riferimento) > voce["ultima"]:
            voce["ultima"] = str(riferimento)

    adesso = datetime.now(timezone.utc)
    da_richiamare = []
    for cid, voce in ultimi.items():
        if voce["volte"] < 2 or not voce["ultima"]:
            continue
        try:
            quando = datetime.fromisoformat(voce["ultima"].replace("Z", "+00:00"))
        except ValueError:
            continue
        giorni_passati = (adesso - quando).days
        if giorni_passati >= 45:
            da_richiamare.append({
                "customer_id": cid, "name": voce["nome"], "deliveries": voce["volte"],
                "days_since": giorni_passati, "last_delivery": voce["ultima"][:10],
            })
    da_richiamare.sort(key=lambda x: -x["days_since"])

    # Il collo di bottiglia di oggi: consegne aperte senza nessuno sopra.
    senza_fattorino = await db.deliveries.count_documents({
        "pharmacy_id": pharmacy_id,
        "status": {"$in": ["da_preparare", "pronta", "pending"]},
        "driver_id": None,
    })
    ora_di_punta = max(per_ora, key=lambda ora: per_ora[ora]) if any(per_ora.values()) else None
    giorno_di_punta = max(per_giorno, key=lambda giorno: per_giorno[giorno]) if any(per_giorno.values()) else None

    result = {
        "period": period,
        "days": days,
        "summary": {
            "total_revenue": round(total_revenue, 2),
            "delivered_count": delivered_count,
            "total_deliveries": total_in_period,
            "cancelled": cancelled,
            "completion_rate": completion_rate,
            "avg_order_value": avg_order,
        },
        "payment_split": payment_split,
        "daily_revenue": daily,
        "top_customers": top_customers,
        "driver_performance": driver_perf,
        "delivery_times": {
            "avg_minutes": round(sum(t[0] for t in tempi) / len(tempi), 1) if tempi else 0,
            "median_minutes": round(ordinati[len(ordinati) // 2], 1) if ordinati else 0,
            "sampled": len(tempi),
            "by_driver": tempi_fattorini,
        },
        "failures": {
            "total": sum(motivi.values()),
            "by_reason": sorted([{"reason": k, "count": v} for k, v in motivi.items()], key=lambda x: -x["count"])[:6],
        },
        "by_hour": [{"hour": ora, "count": quanti} for ora, quanti in sorted(per_ora.items())],
        "by_weekday": [{"day": giorno, "count": per_giorno[giorno]} for giorno in giorni],
        "busiest": {"hour": ora_di_punta, "weekday": giorno_di_punta},
        "open_without_driver": senza_fattorino,
        "lapsed_customers": da_richiamare[:10],
    }

    await cache_set(cache_key, result)
    return result
