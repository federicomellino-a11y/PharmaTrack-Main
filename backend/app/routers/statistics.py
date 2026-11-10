import logging
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends

from app.core.clock import ROME_TZ
from app.core.database import db
from app.core.security import (
    get_current_user,
)
from app.core.cache import cache_get, cache_set
from app.core.delivery_lifecycle import BILLED_STATUSES, STATI_CONSEGNATI
from app.core.reporting import minuti_consegna

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/statistics")
async def get_statistics(user: dict = Depends(get_current_user)):
    pharmacy_id = user["user_id"]
    cache_key = f"statistics:{pharmacy_id}"
    cached = await cache_get(cache_key)
    if cached is not None:
        return cached
    total_customers = await db.customers.count_documents({"pharmacy_id": pharmacy_id})
    total_drivers = await db.drivers.count_documents({"pharmacy_id": pharmacy_id})
    active_drivers = await db.drivers.count_documents({"pharmacy_id": pharmacy_id, "is_active": True})
    total_deliveries = await db.deliveries.count_documents({"pharmacy_id": pharmacy_id})
    pending_deliveries = await db.deliveries.count_documents({"pharmacy_id": pharmacy_id, "status": {"$in": ["da_preparare", "pronta", "pending"]}})
    active_deliveries = await db.deliveries.count_documents({"pharmacy_id": pharmacy_id, "status": {"$in": ["assigned", "picked_up", "in_transit"]}})
    completed_deliveries = await db.deliveries.count_documents({"pharmacy_id": pharmacy_id, "status": "delivered"})
    cancelled_deliveries = await db.deliveries.count_documents({"pharmacy_id": pharmacy_id, "status": "cancelled"})
    now_local = datetime.now(ROME_TZ)
    today_start = now_local.replace(hour=0, minute=0, second=0, microsecond=0).astimezone(timezone.utc)
    today_deliveries = await db.deliveries.count_documents({"pharmacy_id": pharmacy_id, "created_at": {"$gte": today_start.isoformat()}})
    today_completed = await db.deliveries.count_documents({"pharmacy_id": pharmacy_id, "status": {"$in": list(STATI_CONSEGNATI)}, "actual_delivery": {"$gte": today_start.isoformat()}})
    weekly_data = []
    for i in range(6, -1, -1):
        day = datetime.now(ROME_TZ) - timedelta(days=i)
        day_start = day.replace(hour=0, minute=0, second=0, microsecond=0).astimezone(timezone.utc)
        day_end = day_start + timedelta(days=1)
        count = await db.deliveries.count_documents({"pharmacy_id": pharmacy_id, "created_at": {"$gte": day_start.isoformat(), "$lt": day_end.isoformat()}})
        completed = await db.deliveries.count_documents({"pharmacy_id": pharmacy_id, "status": {"$in": list(STATI_CONSEGNATI)}, "actual_delivery": {"$gte": day_start.isoformat(), "$lt": day_end.isoformat()}})
        weekly_data.append({"date": day_start.strftime("%Y-%m-%d"), "day": day_start.strftime("%a"), "total": count, "completed": completed})
    # --- Cassa di oggi: quanto e' entrato, diviso contanti e POS ---
    # Serve al banco alla sera: si guarda un numero, non si ricostruisce.
    incasso_oggi = {"cash": 0.0, "pos": 0.0, "total": 0.0, "count": 0}
    for consegna in await db.deliveries.find(
        {
            "pharmacy_id": pharmacy_id,
            "status": {"$in": list(BILLED_STATUSES)},
            "actual_delivery": {"$gte": today_start.isoformat()},
        },
        {"_id": 0, "amount": 1, "payment_method": 1},
    ).to_list(2000):
        importo = consegna.get("amount") or 0
        metodo = consegna.get("payment_method") if consegna.get("payment_method") in ("cash", "pos") else "pos"
        incasso_oggi[metodo] = round(incasso_oggi[metodo] + importo, 2)
        incasso_oggi["total"] = round(incasso_oggi["total"] + importo, 2)
        incasso_oggi["count"] += 1

    priority_breakdown = {}
    for level in ("low", "normal", "high", "urgent"):
        priority_breakdown[level] = await db.deliveries.count_documents({
            "pharmacy_id": pharmacy_id,
            "priority": level,
            "status": {"$nin": ["delivered", "cancelled", "not_delivered"]},
        })
    # --- Il mese in corso: la frase che il titolare ripete al telefono ---
    # "Questo mese: 312 consegne, 4.210 euro, 14 minuti di media." I dati
    # esistevano sparsi fra report e turni; qui si leggono in un numero solo.
    inizio_mese = now_local.replace(day=1, hour=0, minute=0, second=0, microsecond=0).astimezone(timezone.utc)
    mese = {"deliveries": 0, "revenue": 0.0, "avg_minutes": None}
    durate = []
    for consegna in await db.deliveries.find(
        {
            "pharmacy_id": pharmacy_id,
            "status": {"$in": list(BILLED_STATUSES)},
            "actual_delivery": {"$gte": inizio_mese.isoformat()},
        },
        {"_id": 0, "amount": 1, "created_at": 1, "actual_delivery": 1},
    ).to_list(5000):
        mese["deliveries"] += 1
        mese["revenue"] = round(mese["revenue"] + (consegna.get("amount") or 0), 2)
        minuti = minuti_consegna(consegna.get("created_at"), consegna.get("actual_delivery"))
        if minuti is not None:
            durate.append(minuti)
    if durate:
        mese["avg_minutes"] = int(round(sum(durate) / len(durate)))

    result = {
        "customers": {"total": total_customers},
        "drivers": {"total": total_drivers, "active": active_drivers},
        "deliveries": {"total": total_deliveries, "pending": pending_deliveries, "active": active_deliveries, "completed": completed_deliveries, "cancelled": cancelled_deliveries, "today": today_deliveries, "today_completed": today_completed},
        "weekly": weekly_data,
        "priority": priority_breakdown,
        "today_money": incasso_oggi,
        "month": mese,
    }
    await cache_set(cache_key, result)
    return result
