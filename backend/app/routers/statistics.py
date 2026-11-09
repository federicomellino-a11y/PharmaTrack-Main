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
    result = {
        "customers": {"total": total_customers},
        "drivers": {"total": total_drivers, "active": active_drivers},
        "deliveries": {"total": total_deliveries, "pending": pending_deliveries, "active": active_deliveries, "completed": completed_deliveries, "cancelled": cancelled_deliveries, "today": today_deliveries, "today_completed": today_completed},
        "weekly": weekly_data,
        "priority": priority_breakdown,
        "today_money": incasso_oggi,
    }
    await cache_set(cache_key, result)
    return result
