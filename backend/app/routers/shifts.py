import os
import json
import uuid
import logging
import bcrypt
from datetime import datetime, timezone, timedelta
from typing import Optional, List, Dict, Any
import httpx
from fastapi import APIRouter, HTTPException, Depends, Request, Response

from app.core.database import db, client, database_name
from app.core.websocket import manager
from app.core.config import *
from app.core.security import (
    get_current_user, get_current_driver, get_current_admin,
    normalize_session_expiry, clear_cookie_variants, delete_pharmacy_account_data,
)
from app.core.notifications import (
    create_notification_internal, send_transactional_email, send_web_push_notifications,
    push_notifications_enabled, build_notification_target_url,
    upsert_push_subscription, remove_push_subscription,
)
from app.core.shifts_service import (
    _attach_delivery_to_open_shift, _shift_aggregate_totals, _enrich_shift,
)
from app.models.schemas import *

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/driver/shifts/current")
async def driver_current_shift(driver: dict = Depends(get_current_driver)):
    shift = await db.driver_shifts.find_one(
        {"driver_id": driver["driver_id"], "status": "open"}, {"_id": 0}
    )
    if not shift:
        return {"shift": None}
    # auto-attach deliveries assegnate al driver oggi che non sono già nel turno
    delivery_ids = set(shift.get("delivery_ids") or [])
    started_at = shift.get("started_at")
    extras = await db.deliveries.find(
        {
            "driver_id": driver["driver_id"],
            "updated_at": {"$gte": started_at},
        },
        {"_id": 0, "delivery_id": 1},
    ).to_list(500)
    new_ids = {d["delivery_id"] for d in extras} - delivery_ids
    if new_ids:
        delivery_ids |= new_ids
        await db.driver_shifts.update_one(
            {"shift_id": shift["shift_id"]},
            {"$set": {"delivery_ids": list(delivery_ids), "updated_at": datetime.now(timezone.utc).isoformat()}},
        )
        shift["delivery_ids"] = list(delivery_ids)
    return {"shift": await _enrich_shift(shift, include_deliveries=True)}


@router.post("/driver/shifts/start")
async def driver_start_shift(driver: dict = Depends(get_current_driver)):
    existing = await db.driver_shifts.find_one(
        {"driver_id": driver["driver_id"], "status": "open"}, {"_id": 0}
    )
    if existing:
        return {"shift": await _enrich_shift(existing, include_deliveries=True)}
    now = datetime.now(timezone.utc).isoformat()
    shift = {
        "shift_id": f"shf_{uuid.uuid4().hex[:12]}",
        "driver_id": driver["driver_id"],
        "pharmacy_id": driver["pharmacy_id"],
        "started_at": now,
        "ended_at": None,
        "status": "open",
        "delivery_ids": [],
        "driver_declared_cash": None,
        "driver_close_note": None,
        "settled_at": None,
        "settled_by": None,
        "settle_note": None,
        "discrepancy": None,
        "created_at": now,
        "updated_at": now,
    }
    await db.driver_shifts.insert_one(shift)
    await create_notification_internal(
        driver["pharmacy_id"], "pharmacy",
        "Turno fattorino iniziato",
        f"{driver.get('name', 'Il fattorino')} ha iniziato un turno",
        "shift", {"shift_id": shift["shift_id"], "driver_id": driver["driver_id"]},
    )
    return {"shift": await _enrich_shift(shift, include_deliveries=True)}


@router.post("/driver/shifts/close")
async def driver_close_shift(request: Request, driver: dict = Depends(get_current_driver)):
    body = {}
    try:
        body = await request.json()
    except Exception:
        body = {}
    declared_cash = body.get("declared_cash")
    note = body.get("note")
    shift = await db.driver_shifts.find_one(
        {"driver_id": driver["driver_id"], "status": "open"}, {"_id": 0}
    )
    if not shift:
        raise HTTPException(status_code=404, detail="Nessun turno aperto")

    # Aggancia tutte le consegne assegnate/aggiornate dopo l'inizio turno
    started_at = shift.get("started_at")
    extras = await db.deliveries.find(
        {
            "driver_id": driver["driver_id"],
            "$or": [
                {"updated_at": {"$gte": started_at}},
                {"created_at": {"$gte": started_at}},
            ],
        },
        {"_id": 0, "delivery_id": 1},
    ).to_list(500)
    delivery_ids = set(shift.get("delivery_ids") or [])
    for d in extras:
        delivery_ids.add(d["delivery_id"])

    now = datetime.now(timezone.utc).isoformat()
    update_data = {
        "status": "closed_by_driver",
        "ended_at": now,
        "delivery_ids": list(delivery_ids),
        "updated_at": now,
    }
    if declared_cash is not None:
        try:
            update_data["driver_declared_cash"] = round(float(declared_cash), 2)
        except (TypeError, ValueError):
            pass
    if note:
        update_data["driver_close_note"] = str(note)[:500]
    await db.driver_shifts.update_one({"shift_id": shift["shift_id"]}, {"$set": update_data})
    updated = await db.driver_shifts.find_one({"shift_id": shift["shift_id"]}, {"_id": 0})

    # Notifica farmacia
    enriched = await _enrich_shift(updated, include_deliveries=False)
    totals = enriched.get("totals", {})
    await manager.send_personal_message(
        {"type": "shift_closed", "shift_id": shift["shift_id"], "driver_id": driver["driver_id"]},
        driver["pharmacy_id"], "pharmacy",
    )
    await create_notification_internal(
        driver["pharmacy_id"], "pharmacy",
        "Turno fattorino chiuso · da confermare",
        f"{driver.get('name', 'Il fattorino')} ha chiuso il turno · contanti €{totals.get('cash_total', 0):.2f} su {totals.get('delivered_count', 0)} consegne",
        "shift", {"shift_id": shift["shift_id"], "driver_id": driver["driver_id"]},
    )
    return {"shift": enriched}


@router.get("/driver/shifts")
async def driver_list_shifts(driver: dict = Depends(get_current_driver), limit: int = 20):
    shifts = await db.driver_shifts.find(
        {"driver_id": driver["driver_id"]}, {"_id": 0}
    ).sort("started_at", -1).to_list(min(limit, 100))
    return [await _enrich_shift(s) for s in shifts]


@router.get("/shifts")
async def pharmacy_list_shifts(
    user: dict = Depends(get_current_user),
    driver_id: Optional[str] = None,
    status_filter: Optional[str] = None,
    limit: int = 50,
):
    query = {"pharmacy_id": user["user_id"]}
    if driver_id:
        query["driver_id"] = driver_id
    if status_filter:
        query["status"] = status_filter
    shifts = await db.driver_shifts.find(query, {"_id": 0}).sort("started_at", -1).to_list(min(limit, 200))
    return [await _enrich_shift(s) for s in shifts]


@router.get("/shifts/{shift_id}")
async def pharmacy_get_shift(shift_id: str, user: dict = Depends(get_current_user)):
    shift = await db.driver_shifts.find_one(
        {"shift_id": shift_id, "pharmacy_id": user["user_id"]}, {"_id": 0}
    )
    if not shift:
        raise HTTPException(status_code=404, detail="Turno non trovato")
    return await _enrich_shift(shift, include_deliveries=True)


@router.post("/shifts/{shift_id}/settle")
async def pharmacy_settle_shift(shift_id: str, request: Request, user: dict = Depends(get_current_user)):
    shift = await db.driver_shifts.find_one(
        {"shift_id": shift_id, "pharmacy_id": user["user_id"]}, {"_id": 0}
    )
    if not shift:
        raise HTTPException(status_code=404, detail="Turno non trovato")
    if shift.get("status") == "settled":
        raise HTTPException(status_code=400, detail="Turno già chiuso e confermato")

    body = {}
    try:
        body = await request.json()
    except Exception:
        body = {}
    confirmed_cash = body.get("confirmed_cash")
    note = body.get("note")
    confirm_all_deliveries = bool(body.get("confirm_all_deliveries", True))

    totals = await _shift_aggregate_totals(shift)
    expected_cash = totals.get("cash_total", 0)
    confirmed_cash_val = None
    discrepancy = None
    if confirmed_cash is not None:
        try:
            confirmed_cash_val = round(float(confirmed_cash), 2)
            discrepancy = round(confirmed_cash_val - expected_cash, 2)
        except (TypeError, ValueError):
            pass

    now = datetime.now(timezone.utc).isoformat()
    update_data = {
        "status": "settled",
        "settled_at": now,
        "settled_by": user["user_id"],
        "updated_at": now,
    }
    if confirmed_cash_val is not None:
        update_data["confirmed_cash"] = confirmed_cash_val
        update_data["expected_cash"] = expected_cash
        update_data["discrepancy"] = discrepancy
    if note:
        update_data["settle_note"] = str(note)[:500]

    await db.driver_shifts.update_one({"shift_id": shift_id}, {"$set": update_data})

    # Conferma tutti gli incassi delle consegne in pending_confirmation di questo turno
    if confirm_all_deliveries and shift.get("delivery_ids"):
        await db.deliveries.update_many(
            {
                "delivery_id": {"$in": shift["delivery_ids"]},
                "pharmacy_id": user["user_id"],
                "status": "delivered_pending_confirmation",
            },
            {
                "$set": {
                    "status": "delivered",
                    "payment_collected": True,
                    "payment_confirmed_at": now,
                    "payment_confirmed_by": user["user_id"],
                    "payment_confirmed_via_shift": shift_id,
                    "updated_at": now,
                }
            },
        )

    if shift.get("driver_id"):
        await manager.send_personal_message(
            {"type": "shift_settled", "shift_id": shift_id},
            shift["driver_id"], "driver",
        )
        await create_notification_internal(
            shift["driver_id"], "driver",
            "Turno chiuso e confermato",
            f"La farmacia ha confermato l'incasso del turno (€{expected_cash:.2f})",
            "shift", {"shift_id": shift_id},
        )

    updated = await db.driver_shifts.find_one({"shift_id": shift_id}, {"_id": 0})
    return await _enrich_shift(updated, include_deliveries=True)


