import logging
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends

from app.core.database import db
from app.core.security import get_current_user
from app.core.cache import cache_get, cache_set

logger = logging.getLogger(__name__)
router = APIRouter()

_DELIVERED = ["delivered", "delivered_pending_confirmation"]


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
    }

    await cache_set(cache_key, result)
    return result
