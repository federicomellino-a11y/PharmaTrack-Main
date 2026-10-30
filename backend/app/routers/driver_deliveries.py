import logging
from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, HTTPException, Depends, Request

from app.core.database import db
from app.core.websocket import manager
from app.core.security import (
    get_current_user, get_current_driver,
)
from app.core.notifications import (
    create_notification_internal,
)
from app.core.shifts_service import (
    _attach_delivery_to_open_shift,
)

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/driver/deliveries")
async def get_driver_deliveries(status: Optional[str] = None, driver: dict = Depends(get_current_driver)):
    query = {"driver_id": driver["driver_id"]}
    if status:
        if status == "active":
            query["status"] = {"$in": ["assigned", "picked_up", "in_transit"]}
        elif status == "completed":
            query["status"] = {"$in": ["delivered", "cancelled"]}
        else:
            query["status"] = status
    items = await db.deliveries.find(query, {"_id": 0}).sort("created_at", -1).to_list(100)
    if status in (None, "active") or not status:
        rank = {"urgent": 0, "high": 1, "normal": 2, "low": 3}
        items.sort(key=lambda d: (rank.get(d.get("priority") or "normal", 2), d.get("scheduled_time") or "99:99", d.get("created_at") or ""))
    return items

@router.put("/driver/deliveries/{delivery_id}/status")
async def update_delivery_status_driver(delivery_id: str, request: Request, driver: dict = Depends(get_current_driver)):
    body = await request.json()
    new_status = body.get("status")
    if new_status not in ["picked_up", "in_transit", "delivered", "cancelled", "not_delivered"]:
        raise HTTPException(status_code=400, detail="Stato non valido")
    delivery = await db.deliveries.find_one({"delivery_id": delivery_id, "driver_id": driver["driver_id"]}, {"_id": 0})
    if not delivery:
        raise HTTPException(status_code=404, detail="Consegna non trovata")

    # Aggancia automaticamente la consegna al turno aperto del driver
    await _attach_delivery_to_open_shift(driver["driver_id"], delivery_id)

    # Driver "delivered" → diventa pending_confirmation (la farmacia deve confermare l'incasso)
    effective_status = "delivered_pending_confirmation" if new_status == "delivered" else new_status
    update_data = {"status": effective_status, "updated_at": datetime.now(timezone.utc).isoformat()}
    if new_status == "not_delivered":
        update_data["failure_reason"] = (body.get("failure_reason") or "Non specificato")[:200]
        update_data["previous_status"] = delivery.get("status")
    if new_status == "delivered":
        update_data["actual_delivery"] = datetime.now(timezone.utc).isoformat()
        update_data["delivered_by_driver_at"] = datetime.now(timezone.utc).isoformat()
        # POS: pagamento già transitato, ma serve comunque conferma del bigliettino → resta pending_confirmation
        # cash: serve consegna fisica del contante → resta pending_confirmation
    await db.deliveries.update_one({"delivery_id": delivery_id}, {"$set": update_data})
    try:
        await db.audit_log.insert_one({
            "delivery_id": delivery_id,
            "pharmacy_id": delivery["pharmacy_id"],
            "actor_type": "driver",
            "actor_id": driver["driver_id"],
            "action": "status",
            "changes": {"from_status": delivery.get("status"), "to_status": effective_status,
                        "failure_reason": update_data.get("failure_reason")},
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
    except Exception:
        pass
    status_labels = {
        "picked_up": "Ritirata",
        "in_transit": "In consegna",
        "delivered_pending_confirmation": "Consegnata · in attesa incasso",
        "cancelled": "Annullata",
        "not_delivered": "Non consegnata",
    }
    label = status_labels.get(effective_status, effective_status)
    await manager.send_personal_message(
        {"type": "delivery_update", "delivery_id": delivery_id, "status": effective_status, "driver_id": driver["driver_id"]},
        delivery["pharmacy_id"], "pharmacy"
    )
    if effective_status == "delivered_pending_confirmation":
        title = "Consegna effettuata · conferma incasso"
        body_text = f"{delivery['customer_name']} – conferma incasso ({_format_amount(delivery)})"
    else:
        title = f"Consegna {label}"
        body_text = f"La consegna per {delivery['customer_name']} è stata {label.lower()}"
    await create_notification_internal(
        delivery["pharmacy_id"], "pharmacy", title, body_text,
        "delivery", {"delivery_id": delivery_id, "status": effective_status}
    )
    return await db.deliveries.find_one({"delivery_id": delivery_id}, {"_id": 0})


def _format_amount(delivery: dict) -> str:
    amount = delivery.get("amount")
    method = delivery.get("payment_method", "cash")
    if amount is None:
        return "importo non specificato"
    method_label = "POS" if method == "pos" else "Contanti"
    return f"{method_label} €{float(amount):.2f}"


@router.post("/deliveries/{delivery_id}/confirm-payment")
async def confirm_delivery_payment(delivery_id: str, request: Request, user: dict = Depends(get_current_user)):
    """La farmacia conferma di aver ricevuto l'incasso dal fattorino → consegna chiusa."""
    delivery = await db.deliveries.find_one({"delivery_id": delivery_id, "pharmacy_id": user["user_id"]}, {"_id": 0})
    if not delivery:
        raise HTTPException(status_code=404, detail="Consegna non trovata")
    if delivery.get("status") not in ["delivered_pending_confirmation", "delivered"]:
        raise HTTPException(status_code=400, detail="La consegna non è in attesa di conferma incasso")
    if delivery.get("payment_collected") is True and delivery.get("status") == "delivered":
        raise HTTPException(status_code=400, detail="Incasso già confermato")

    body = {}
    try:
        body = await request.json()
    except Exception:
        body = {}

    confirmed_amount = body.get("confirmed_amount")
    confirm_note = body.get("note")

    update_data = {
        "status": "delivered",
        "payment_collected": True,
        "payment_confirmed_at": datetime.now(timezone.utc).isoformat(),
        "payment_confirmed_by": user["user_id"],
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    if confirmed_amount is not None:
        try:
            update_data["confirmed_amount"] = float(confirmed_amount)
        except (TypeError, ValueError):
            pass
    if confirm_note:
        update_data["confirm_note"] = str(confirm_note)[:500]

    await db.deliveries.update_one({"delivery_id": delivery_id}, {"$set": update_data})

    # Notifica al fattorino
    if delivery.get("driver_id"):
        await manager.send_personal_message(
            {"type": "delivery_update", "delivery_id": delivery_id, "status": "delivered"},
            delivery["driver_id"], "driver"
        )
        await create_notification_internal(
            delivery["driver_id"], "driver",
            "Incasso confermato",
            f"La farmacia ha confermato l'incasso per {delivery['customer_name']}",
            "delivery", {"delivery_id": delivery_id, "status": "delivered"}
        )

    return await db.deliveries.find_one({"delivery_id": delivery_id}, {"_id": 0})


@router.post("/deliveries/{delivery_id}/dispute-payment")
async def dispute_delivery_payment(delivery_id: str, request: Request, user: dict = Depends(get_current_user)):
    """La farmacia segnala un problema con l'incasso (importo errato, contestazione)."""
    delivery = await db.deliveries.find_one({"delivery_id": delivery_id, "pharmacy_id": user["user_id"]}, {"_id": 0})
    if not delivery:
        raise HTTPException(status_code=404, detail="Consegna non trovata")
    body = await request.json()
    reason = body.get("reason") or "Contestazione incasso"
    update_data = {
        "status": "delivered_pending_confirmation",
        "payment_dispute": True,
        "payment_dispute_reason": str(reason)[:500],
        "payment_dispute_at": datetime.now(timezone.utc).isoformat(),
        "payment_collected": False,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.deliveries.update_one({"delivery_id": delivery_id}, {"$set": update_data})

    if delivery.get("driver_id"):
        await manager.send_personal_message(
            {"type": "delivery_dispute", "delivery_id": delivery_id, "reason": reason},
            delivery["driver_id"], "driver"
        )
        await create_notification_internal(
            delivery["driver_id"], "driver",
            "Contestazione incasso",
            f"La farmacia ha segnalato un problema su {delivery['customer_name']}: {reason}",
            "delivery", {"delivery_id": delivery_id}
        )

    return await db.deliveries.find_one({"delivery_id": delivery_id}, {"_id": 0})
