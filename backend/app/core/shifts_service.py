import logging
from datetime import datetime, timezone
from app.core.database import db

logger = logging.getLogger(__name__)


async def _attach_delivery_to_open_shift(driver_id: str, delivery_id: str):
    """If driver has an open shift, append this delivery to delivery_ids."""
    shift = await db.driver_shifts.find_one(
        {"driver_id": driver_id, "status": "open"},
        {"_id": 0, "shift_id": 1, "delivery_ids": 1},
    )
    if not shift:
        return
    delivery_ids = set(shift.get("delivery_ids") or [])
    if delivery_id in delivery_ids:
        return
    delivery_ids.add(delivery_id)
    await db.driver_shifts.update_one(
        {"shift_id": shift["shift_id"]},
        {"$set": {"delivery_ids": list(delivery_ids), "updated_at": datetime.now(timezone.utc).isoformat()}},
    )



async def _shift_aggregate_totals(shift: dict) -> dict:
    """Compute totals from deliveries linked to a shift."""
    delivery_ids = shift.get("delivery_ids") or []
    deliveries = []
    if delivery_ids:
        deliveries = await db.deliveries.find(
            {"delivery_id": {"$in": delivery_ids}}, {"_id": 0}
        ).to_list(1000)
    cash_total = 0.0
    pos_total = 0.0
    delivered_count = 0
    cancelled_count = 0
    pending_confirmation = 0
    for d in deliveries:
        status = d.get("status")
        if status == "cancelled":
            cancelled_count += 1
            continue
        if status not in ["delivered", "delivered_pending_confirmation"]:
            continue
        delivered_count += 1
        if status == "delivered_pending_confirmation":
            pending_confirmation += 1
        amount = float(d.get("amount") or 0)
        if d.get("payment_method") == "pos":
            pos_total += amount
        else:
            cash_total += amount
    return {
        "deliveries": len(deliveries),
        "cash_total": round(cash_total, 2),
        "pos_total": round(pos_total, 2),
        "delivered_count": delivered_count,
        "cancelled_count": cancelled_count,
        "pending_confirmation": pending_confirmation,
        "deliveries_data": deliveries,
    }


async def _enrich_shift(shift: dict, include_deliveries: bool = False) -> dict:
    if not shift:
        return shift
    shift = {k: v for k, v in shift.items() if k != "_id"}
    totals_with_data = await _shift_aggregate_totals(shift)
    deliveries_data = totals_with_data.pop("deliveries_data", [])
    shift["totals"] = totals_with_data
    if include_deliveries:
        shift["deliveries"] = deliveries_data
    driver = await db.drivers.find_one(
        {"driver_id": shift.get("driver_id")}, {"_id": 0, "name": 1, "phone": 1, "vehicle_type": 1}
    )
    if driver:
        shift["driver_name"] = driver.get("name")
        shift["driver_phone"] = driver.get("phone")
    return shift
