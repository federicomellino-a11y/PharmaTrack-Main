import math
import uuid
import logging
import hashlib
import secrets
from datetime import datetime, timezone, timedelta
from typing import Optional, List
from fastapi import APIRouter, HTTPException, Depends, Response, Body

from app.core.clock import adesso
from app.core.database import db
from cloudinary_config import PhotoManager
from app.core.websocket import manager
# (nessun uso di app.core.config)
from app.core.fasce import descrivi_fascia, fascia_scaduta, valida_fascia
from app.core.piani import piano_corrente, inizio_mese, verifica_consegne
from app.core.security import (
    get_current_user,
)
from app.core.notifications import (
    create_notification_internal,
)
from app.core.shifts_service import (
    _attach_delivery_to_open_shift,
)
from app.core.delivery_creation import costruisci_consegna
from app.core.delivery_lifecycle import FOLLOW_UP_STATUSES
from app.core.delivery_lifecycle import ARCHIVED_STATUSES
from app.core.delivery_lifecycle import (
    build_cancel_updates,
    build_photo_cleanup,
    build_restore_updates,
    can_cancel,
    can_hard_delete,
    can_restore,
    resolve_restore_target,
    valuta_cambio_stato,
    build_phase_updates,
    build_force_updates,
)
from app.models.schemas import DeliveryCreate, DeliveryUpdate

logger = logging.getLogger(__name__)
router = APIRouter()


WORKFLOW_STATUSES = set(FOLLOW_UP_STATUSES) | set(ARCHIVED_STATUSES)


async def _log_delivery_audit(delivery, actor_type, actor_id, action, changes=None):
    """Traccia chi cambia cosa su una consegna."""
    try:
        await db.audit_log.insert_one({
            "delivery_id": delivery.get("delivery_id"),
            "pharmacy_id": delivery.get("pharmacy_id"),
            "actor_type": actor_type,
            "actor_id": actor_id,
            "action": action,
            "changes": changes or {},
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
    except Exception:  # l'audit non deve mai bloccare l'operazione principale
        logger.exception("audit log fallito per %s", delivery.get("delivery_id"))

ETA_ROAD_FACTOR = 1.35
ETA_AVG_SPEED_KMH = 24.0


def _haversine_km(lat1, lng1, lat2, lng2):
    radius = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlng = math.radians(lng2 - lng1)
    a = (math.sin(dlat / 2) ** 2
         + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlng / 2) ** 2)
    return 2 * radius * math.asin(math.sqrt(a))


def _parse_iso(value):
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except Exception:
        return None


def _enrich_with_eta(items, drivers_by_id):
    """Distanza e tempo stimato dal fattorino assegnato a ogni consegna attiva."""
    now = datetime.now(timezone.utc)
    for item in items:
        driver = drivers_by_id.get(item.get("driver_id") or "")
        if not driver:
            continue
        last_update = _parse_iso(driver.get("last_location_update"))
        if last_update:
            if last_update.tzinfo is None:
                last_update = last_update.replace(tzinfo=timezone.utc)
            item["driver_location_age_minutes"] = max(0, int(round((now - last_update).total_seconds() / 60)))
        lat, lng = driver.get("current_lat"), driver.get("current_lng")
        if lat is None or lng is None:
            continue
        if item.get("customer_lat") is None or item.get("customer_lng") is None:
            continue
        km = _haversine_km(float(lat), float(lng), float(item["customer_lat"]), float(item["customer_lng"]))
        if km > 50:
            # coordinate probabilmente approssimate al centro citta: meglio nessuna stima
            continue
        item["driver_distance_km"] = round(km, 1)
        item["driver_eta_minutes"] = max(1, int(round(km * ETA_ROAD_FACTOR / ETA_AVG_SPEED_KMH * 60)))
    return items



@router.get("/deliveries")
async def get_deliveries(response: Response, status: Optional[str] = None, driver_id: Optional[str] = None, limit: int = 500, offset: int = 0, user: dict = Depends(get_current_user)):
    query = {"pharmacy_id": user["user_id"]}
    if status:
        if status == "active":
            query["status"] = {"$in": list(FOLLOW_UP_STATUSES)}
        elif status == "pending_confirmation":
            query["status"] = "delivered_pending_confirmation"
        elif status == "completed":
            query["status"] = {"$in": ["delivered", "cancelled", "not_delivered"]}
        else:
            query["status"] = status
    if driver_id:
        query["driver_id"] = driver_id
    safe_limit = max(1, min(int(limit or 500), 2000))
    safe_offset = max(0, int(offset or 0))
    total = await db.deliveries.count_documents(query)
    response.headers["X-Total-Count"] = str(total)
    response.headers["X-Result-Count"] = str(safe_limit)
    items = await db.deliveries.find(query, {"_id": 0}).sort("created_at", -1).skip(safe_offset).to_list(safe_limit)
    driver_ids = {item.get("driver_id") for item in items if item.get("driver_id")}
    if driver_ids:
        drivers = await db.drivers.find(
            {"pharmacy_id": user["user_id"], "driver_id": {"$in": list(driver_ids)}},
            {"_id": 0, "driver_id": 1, "current_lat": 1, "current_lng": 1, "last_location_update": 1},
        ).to_list(200)
        _enrich_with_eta(items, {d["driver_id"]: d for d in drivers})
    return items

@router.post("/deliveries")
async def create_delivery(delivery: DeliveryCreate, user: dict = Depends(get_current_user)):
    # Limite del piano: si ferma la creazione, non la lettura né la chiusura di
    # quello che è già aperto. Chi ha un piano vecchio senza campo "piano" passa.
    farmacia = await db.users.find_one({"user_id": user["user_id"]}, {"_id": 0, "piano": 1, "prova_scadenza": 1}) or {}
    piano = piano_corrente(farmacia)
    if piano.get("piano"):
        usate = await db.deliveries.count_documents({
            "pharmacy_id": user["user_id"],
            "created_at": {"$gte": inizio_mese().isoformat()},
        })
        motivo = verifica_consegne(piano, usate)
        if motivo:
            raise HTTPException(status_code=402, detail=motivo)

    try:
        inizio_fascia, fine_fascia = valida_fascia(delivery.scheduled_time, getattr(delivery, "slot_to", None))
    except ValueError as errore:
        raise HTTPException(status_code=422, detail=str(errore))

    customer = await db.customers.find_one({"customer_id": delivery.customer_id, "pharmacy_id": user["user_id"]}, {"_id": 0})
    if not customer:
        raise HTTPException(status_code=404, detail="Cliente non trovato")

    if delivery.payment_method == "cash" and delivery.amount is not None and delivery.amount_given is not None and delivery.amount_given < delivery.amount:
        raise HTTPException(status_code=400, detail="Il pagato con non può essere inferiore all'importo")

    # Stessa vendita, stesso scontrino: una consegna sola. Il riferimento arriva
    # dal pulsante magico e vale anche se la consegna viene completata a mano.
    if delivery.external_ref:
        gia = await db.deliveries.find_one({
            "pharmacy_id": user["user_id"],
            "external_ref": delivery.external_ref,
        }, {"_id": 0, "delivery_id": 1})
        if gia:
            raise HTTPException(status_code=409, detail="Questa vendita è già stata importata")

    # Fattorino predefinito dal profilo: viene solo preselezionato.
    # La consegna resta comunque in "da preparare" finche' non viene confermata.
    selected_driver_id = delivery.driver_id or (user.get("settings") or {}).get("default_driver_id")
    assigned_driver = None
    if selected_driver_id:
        assigned_driver = await db.drivers.find_one({
            "driver_id": selected_driver_id,
            "pharmacy_id": user["user_id"],
            "is_active": True,
        }, {"_id": 0, "driver_id": 1, "name": 1})
        if delivery.driver_id and not assigned_driver:
            raise HTTPException(status_code=400, detail="Fattorino selezionato non valido o non attivo")
        if not delivery.driver_id and not assigned_driver:
            selected_driver_id = None

    # V19: smistamento automatico (opt-in via settings.assignment_mode = "least_loaded").
    # Default "manual": se il farmacista non sceglie un fattorino, la consegna resta in coda.
    assignment_mode = (user.get("settings") or {}).get("assignment_mode", "manual")
    if not selected_driver_id and assignment_mode == "least_loaded":
        candidates = await db.drivers.find({"pharmacy_id": user["user_id"], "is_active": True}, {"_id": 0, "driver_id": 1, "name": 1}).to_list(50)
        if candidates:
            open_shift_ids = set()
            async for sh in db.driver_shifts.find({"pharmacy_id": user["user_id"], "status": "open"}, {"_id": 0, "driver_id": 1}):
                open_shift_ids.add(sh.get("driver_id"))
            pool = [c for c in candidates if c["driver_id"] in open_shift_ids] or candidates
            best, best_load = None, None
            for c in pool:
                load = await db.deliveries.count_documents({
                    "pharmacy_id": user["user_id"],
                    "driver_id": c["driver_id"],
                    "status": {"$in": ["assigned", "picked_up", "in_transit", "da_preparare", "pronta"]},
                })
                if best is None or load < best_load:
                    best, best_load = c, load
            if best:
                selected_driver_id, assigned_driver = best["driver_id"], best

    delivery_data = costruisci_consegna(
        pharmacy_id=user["user_id"],
        customer=customer,
        delivery_id=f"del_{uuid.uuid4().hex[:12]}",
        driver_id=assigned_driver["driver_id"] if assigned_driver else None,
        notes=delivery.notes,
        payment_method=delivery.payment_method,
        amount=delivery.amount,
        amount_given=delivery.amount_given,
        scheduled_date=delivery.scheduled_date,
        scheduled_time=inizio_fascia,
        slot_to=fine_fascia,
        priority=delivery.priority,
        nre=getattr(delivery, "nre", None),
        client_meta=getattr(delivery, "client_meta", None),
        external_ref=delivery.external_ref,
    )
    await db.deliveries.insert_one(delivery_data)
    # Log audit NRE (tracciabilità legale, Garante 2025)
    if delivery_data.get("nre"):
        await db.audit_log.insert_one({
            "audit_id": f"aud_{uuid.uuid4().hex[:12]}",
            "entity": "delivery", "entity_id": delivery_data["delivery_id"],
            "action": "nre_set", "actor": user["user_id"], "actor_role": "pharmacy",
            "detail": {"nre_prefix": str(delivery_data["nre"])[:4] + "***"},
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
    if assigned_driver:
        await _attach_delivery_to_open_shift(assigned_driver["driver_id"], delivery_data["delivery_id"])
        await manager.send_personal_message({"type": "new_delivery", "delivery_id": delivery_data["delivery_id"]}, assigned_driver["driver_id"], "driver")
        await create_notification_internal(assigned_driver["driver_id"], "driver", "Nuova consegna assegnata", f"Hai una nuova consegna per {delivery_data['customer_name']}", "delivery", {"delivery_id": delivery_data["delivery_id"]})
    return {k: v for k, v in delivery_data.items() if k != "_id"}

ROME_CENTROID = (41.9028, 12.4964)


def _coords_need_repair(lat, lng) -> bool:
    """True se mancano o sono il centro citta' usato come ripiego."""
    if lat is None or lng is None:
        return True
    try:
        return abs(float(lat) - ROME_CENTROID[0]) < 0.001 and abs(float(lng) - ROME_CENTROID[1]) < 0.001
    except (TypeError, ValueError):
        return True


@router.post("/deliveries/repair-coordinates")
async def repair_delivery_coordinates(user: dict = Depends(get_current_user)):
    """Ricalcola le coordinate delle consegne ancora aperte, una per una.

    Serve dopo aver corretto l'indirizzo di un cliente: le consegne gia' create
    conservano le coordinate copiate al momento dell'inserimento.
    """
    from app.routers.geocode import geocode_resolve

    query = {"pharmacy_id": user["user_id"], "status": {"$nin": ["delivered", "cancelled"]}}
    cursor = db.deliveries.find(
        query,
        {"_id": 0, "delivery_id": 1, "customer_address": 1, "customer_lat": 1, "customer_lng": 1},
    )

    checked = 0
    fixed = 0
    failed: List[str] = []

    async for delivery in cursor:
        address = (delivery.get("customer_address") or "").strip()
        if not address:
            continue
        if not _coords_need_repair(delivery.get("customer_lat"), delivery.get("customer_lng")):
            continue

        checked += 1
        try:
            resolved = await geocode_resolve(address=address)
        except Exception:
            logger.exception("Riparazione coordinate fallita per %s", address)
            failed.append(address)
            continue

        new_lat = resolved.get("lat") if isinstance(resolved, dict) else None
        new_lng = resolved.get("lng") if isinstance(resolved, dict) else None
        if new_lat is None or new_lng is None:
            failed.append(address)
            continue

        await db.deliveries.update_one(
            {"delivery_id": delivery["delivery_id"], "pharmacy_id": user["user_id"]},
            {"$set": {
                "customer_lat": new_lat,
                "customer_lng": new_lng,
                "coordinates_repaired_at": datetime.now(timezone.utc).isoformat(),
            }},
        )
        fixed += 1

    logger.info("Riparazione coordinate: controllate %s, corrette %s, fallite %s", checked, fixed, len(failed))
    return {
        "checked": checked,
        "fixed": fixed,
        "failed_count": len(failed),
        "failed_addresses": failed[:10],
    }


@router.get("/deliveries/{delivery_id}")
async def get_delivery(delivery_id: str, user: dict = Depends(get_current_user)):
    delivery = await db.deliveries.find_one({"delivery_id": delivery_id, "pharmacy_id": user["user_id"]}, {"_id": 0})
    if not delivery:
        raise HTTPException(status_code=404, detail="Consegna non trovata")
    return delivery

@router.put("/deliveries/{delivery_id}")
async def update_delivery(delivery_id: str, update: DeliveryUpdate, user: dict = Depends(get_current_user)):
    delivery = await db.deliveries.find_one({"delivery_id": delivery_id, "pharmacy_id": user["user_id"]}, {"_id": 0})
    if not delivery:
        raise HTTPException(status_code=404, detail="Consegna non trovata")
    update_data = {"updated_at": datetime.now(timezone.utc).isoformat()}
    # Se cambia l'orario, la fascia deve restare coerente: si valida prima di scrivere.
    if update.scheduled_time is not None or getattr(update, "slot_to", None) is not None:
        try:
            inizio_nuovo, fine_nuova = valida_fascia(
                update.scheduled_time if update.scheduled_time is not None else delivery.get("scheduled_time"),
                update.slot_to if getattr(update, "slot_to", None) is not None else delivery.get("slot_to"),
            )
        except ValueError as errore:
            raise HTTPException(status_code=422, detail=str(errore))
        update_data["scheduled_time"] = inizio_nuovo
        update_data["slot_to"] = fine_nuova
    if update.driver_id is not None:
        # Il fattorino deve appartenere a QUESTA farmacia: senza il controllo
        # una farmacia poteva assegnare una consegna al fattorino di un'altra,
        # che si sarebbe ritrovato nome, telefono e indirizzo del paziente
        # altrui nella propria lista.
        own_driver = await db.drivers.find_one(
            {"driver_id": update.driver_id, "pharmacy_id": user["user_id"]},
            {"_id": 0, "driver_id": 1},
        )
        if not own_driver:
            raise HTTPException(status_code=400, detail="Fattorino non valido per questa farmacia")
        update_data["driver_id"] = update.driver_id
        if delivery["status"] in ["pending", "da_preparare", "pronta"]:
            update_data["status"] = "assigned"
            update_data.update(build_phase_updates(
                "assigned", datetime.now(timezone.utc).isoformat()))
    if update.status is not None:
        effective_driver_id = update.driver_id if update.driver_id is not None else delivery.get("driver_id")
        if update.status == "in_transit" and not effective_driver_id:
            raise HTTPException(status_code=400, detail="Assegna prima un fattorino per avviare la consegna")
        if update.status not in WORKFLOW_STATUSES:
            raise HTTPException(status_code=400, detail="Stato non valido")
        esito = valuta_cambio_stato(
            delivery.get("status"),
            update.status,
            ruolo="farmacia",
            forzato=bool(getattr(update, "force", False)),
            motivo=getattr(update, "force_reason", None),
        )
        if not esito["ok"]:
            raise HTTPException(status_code=409, detail=esito["errore"])
        adesso_iso = datetime.now(timezone.utc).isoformat()
        update_data["status"] = update.status
        if update.status != delivery.get("status"):
            update_data.update(build_phase_updates(update.status, adesso_iso))
        if esito["forzato"]:
            update_data.update(build_force_updates(
                getattr(update, "force_reason", ""), adesso_iso, user["user_id"]))
        if update.status in ("cancelled", "not_delivered") and delivery.get("status") not in ("cancelled", "not_delivered"):
            update_data["previous_status"] = delivery.get("status") or "pronta"
            update_data["cancelled_at"] = datetime.now(timezone.utc).isoformat()
            if update.status == "not_delivered":
                update_data["failure_reason"] = (getattr(update, "failure_reason", None) or "Non specificato")[:200]
        if update.status == "delivered":
            update_data["actual_delivery"] = datetime.now(timezone.utc).isoformat()
    if update.notes is not None: update_data["notes"] = update.notes
    if getattr(update, "failure_reason", None) and update.status not in ("cancelled", "not_delivered"):
        update_data["failure_reason"] = update.failure_reason[:200]
    if update.payment_method is not None: update_data["payment_method"] = update.payment_method
    if update.amount is not None: update_data["amount"] = update.amount
    if update.amount_given is not None:
        update_data["amount_given"] = update.amount_given
        amount = update.amount if update.amount is not None else delivery.get("amount", 0)
        payment_method = update.payment_method if update.payment_method is not None else delivery.get("payment_method")
        if payment_method == "cash" and amount is not None and update.amount_given is not None and update.amount_given < amount:
            raise HTTPException(status_code=400, detail="Il pagato con non può essere inferiore all'importo")
        if amount is not None:
            update_data["change_due"] = update.amount_given - amount
    if update.payment_collected is not None: update_data["payment_collected"] = update.payment_collected
    if update.scheduled_date is not None: update_data["scheduled_date"] = update.scheduled_date
    if update.scheduled_time is not None: update_data["scheduled_time"] = update.scheduled_time
    if update.priority is not None: update_data["priority"] = update.priority
    await db.deliveries.update_one({"delivery_id": delivery_id}, {"$set": update_data})
    if update.driver_id:
        await _attach_delivery_to_open_shift(update.driver_id, delivery_id)
        await manager.send_personal_message({"type": "new_delivery", "delivery_id": delivery_id}, update.driver_id, "driver")
        await create_notification_internal(update.driver_id, "driver", "Nuova consegna assegnata", f"Hai una nuova consegna per {delivery['customer_name']}", "delivery", {"delivery_id": delivery_id})
    updated = await db.deliveries.find_one({"delivery_id": delivery_id}, {"_id": 0})
    await _log_delivery_audit(
        updated or delivery,
        "pharmacy",
        user["user_id"],
        "update",
        {
            "from_status": delivery.get("status"),
            "to_status": update_data.get("status", delivery.get("status")),
            "fields": sorted([k for k in update_data.keys() if k not in ("updated_at",)]),
        },
    )
    return updated


@router.post("/deliveries/{delivery_id}/restore")
async def restore_delivery(delivery_id: str, user: dict = Depends(get_current_user)):
    """Riporta in giro una consegna archiviata.

    Vale anche per una consegna segnata "consegnata" per sbaglio: prima era
    rifiutato, quindi l'errore piu' comune in farmacia (chiudere la consegna
    sbagliata) non si poteva correggere e falsava il fatturato del giorno.
    """
    delivery = await db.deliveries.find_one(
        {"delivery_id": delivery_id, "pharmacy_id": user["user_id"]}, {"_id": 0}
    )
    if not delivery:
        raise HTTPException(status_code=404, detail="Consegna non trovata")
    if not can_restore(delivery.get("status")):
        raise HTTPException(
            status_code=400,
            detail="Solo le consegne in archivio (consegnate, annullate o non consegnate) possono essere ripristinate",
        )

    now = datetime.now(timezone.utc).isoformat()
    target = resolve_restore_target(delivery)
    updates = build_restore_updates(delivery, target, now)
    await db.deliveries.update_one(
        {"delivery_id": delivery_id, "pharmacy_id": user["user_id"]}, {"$set": updates}
    )
    ripristinata = await db.deliveries.find_one({"delivery_id": delivery_id}, {"_id": 0})
    await _log_delivery_audit(
        ripristinata or delivery, "pharmacy", user["user_id"], "restore",
        {"from_status": delivery.get("status"), "to_status": target},
    )
    if delivery.get("driver_id"):
        await manager.send_personal_message(
            {"type": "delivery_update", "delivery_id": delivery_id, "status": target, "reason": "restored"},
            delivery["driver_id"], "driver",
        )
        await create_notification_internal(
            delivery["driver_id"], "driver", "Consegna ripristinata",
            f"La consegna per {delivery.get('customer_name')} e' di nuovo attiva",
            "delivery", {"delivery_id": delivery_id},
        )
    return ripristinata


@router.post("/deliveries/{delivery_id}/cancel")
async def cancel_delivery(
    delivery_id: str,
    payload: Optional[dict] = Body(default=None),
    user: dict = Depends(get_current_user),
):
    """Annulla una consegna conservando stato precedente e motivo.

    E' la via "morbida" alla cancellazione: la riga resta in archivio con
    l'etichetta "annullata", esce da report e statistiche, e il fattorino
    viene avvisato subito invece di ritrovarsi una consegna fantasma.
    """
    delivery = await db.deliveries.find_one(
        {"delivery_id": delivery_id, "pharmacy_id": user["user_id"]}, {"_id": 0}
    )
    if not delivery:
        raise HTTPException(status_code=404, detail="Consegna non trovata")
    if not can_cancel(delivery.get("status")):
        raise HTTPException(status_code=400, detail="Questa consegna non puo' essere annullata")

    motivo = (payload or {}).get("reason") if isinstance(payload, dict) else None
    now = datetime.now(timezone.utc).isoformat()
    updates = build_cancel_updates(delivery, motivo, now, user["user_id"])
    await db.deliveries.update_one(
        {"delivery_id": delivery_id, "pharmacy_id": user["user_id"]}, {"$set": updates}
    )
    annullata = await db.deliveries.find_one({"delivery_id": delivery_id}, {"_id": 0})
    await _log_delivery_audit(
        annullata or delivery, "pharmacy", user["user_id"], "cancel",
        {"from_status": delivery.get("status"), "to_status": "cancelled", "reason": updates.get("cancellation_reason")},
    )
    if delivery.get("driver_id"):
        await manager.send_personal_message(
            {"type": "delivery_update", "delivery_id": delivery_id, "status": "cancelled", "reason": "cancelled"},
            delivery["driver_id"], "driver",
        )
        await create_notification_internal(
            delivery["driver_id"], "driver", "Consegna annullata",
            f"La consegna per {delivery.get('customer_name')} e' stata annullata dalla farmacia",
            "delivery", {"delivery_id": delivery_id},
        )
    return annullata


@router.delete("/deliveries/{delivery_id}")
async def delete_delivery(delivery_id: str, user: dict = Depends(get_current_user)):
    """Cancella davvero una consegna, ma solo se e' gia' chiusa.

    Una consegna ancora in giro non si elimina: prima si annulla, cosi' il
    fattorino lo sa e i report si aggiornano. La riga eliminata lascia una
    traccia nell'audit, perche' sparisce da ogni elenco e nessuno saprebbe piu'
    che esisteva.
    """
    delivery = await db.deliveries.find_one(
        {"delivery_id": delivery_id, "pharmacy_id": user["user_id"]}, {"_id": 0}
    )
    if not delivery:
        raise HTTPException(status_code=404, detail="Consegna non trovata")
    if not can_hard_delete(delivery.get("status")):
        raise HTTPException(
            status_code=400,
            detail="Solo le consegne annullate o non consegnate possono essere eliminate: annulla prima quella attiva",
        )
    await _log_delivery_audit(
        delivery, "pharmacy", user["user_id"], "delete",
        {
            "customer_name": delivery.get("customer_name"),
            "status": delivery.get("status"),
            "amount": delivery.get("amount"),
            "driver_id": delivery.get("driver_id"),
        },
    )
    # Le foto vanno portate via insieme alla consegna: senza questo passaggio
    # la riga in delivery_photos e il file su Cloudinary restano orfani e
    # nessuno li cancella piu'.
    foto = await db.delivery_photos.find({"delivery_id": delivery_id}, {"_id": 0}).to_list(200)
    pulizia = build_photo_cleanup(foto)
    for public_id in pulizia["public_ids"]:
        try:
            await PhotoManager.delete_delivery_photo(
                public_id=public_id, pharmacy_id=user["user_id"],
            )
        except Exception as e:  # noqa: BLE001 — un errore di Cloudinary non deve bloccare la cancellazione
            logger.warning(f"Cloudinary delete failed for delivery {delivery_id}: {e}")
    if pulizia["righe"]:
        await db.delivery_photos.delete_many({"delivery_id": delivery_id})

    result = await db.deliveries.delete_one(
        {"delivery_id": delivery_id, "pharmacy_id": user["user_id"]}
    )
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Consegna non trovata")
    if delivery.get("driver_id"):
        await manager.send_personal_message(
            {"type": "delivery_removed", "delivery_id": delivery_id}, delivery["driver_id"], "driver"
        )
    return {"message": "Consegna eliminata"}


# ============ PUBLIC TRACKING LINK (GDPR-minimized) ============
TRACKING_TTL_HOURS = 72


def _adesso_roma() -> datetime:
    """Ora italiana (vedi app/core/clock.py)."""
    return adesso()


@router.post("/deliveries/{delivery_id}/share-link")
async def create_delivery_share_link(delivery_id: str, user: dict = Depends(get_current_user)):
    """Generate a public tracking token (72h TTL). Only the SHA-256 hash is stored."""
    delivery = await db.deliveries.find_one(
        {"delivery_id": delivery_id, "pharmacy_id": user["user_id"]}
    )
    if not delivery:
        raise HTTPException(status_code=404, detail="Consegna non trovata")
    if delivery.get("status") in ("delivered", "cancelled"):
        raise HTTPException(status_code=400, detail="Consegna già chiusa")

    token = secrets.token_urlsafe(16)
    token_hash = hashlib.sha256(token.encode()).hexdigest()
    expires_at = datetime.now(timezone.utc) + timedelta(hours=TRACKING_TTL_HOURS)
    await db.deliveries.update_one(
        {"delivery_id": delivery_id},
        {"$set": {
            "tracking_token_hash": token_hash,
            "tracking_expires_at": expires_at.isoformat(),
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }},
    )
    return {"token": token, "expires_at": expires_at.isoformat(), "expires_in_hours": TRACKING_TTL_HOURS}


@router.get("/public/tracking/{token}")
async def public_delivery_tracking(token: str):
    """Public, minimal tracking status. No auth, no PII beyond first name."""
    token_hash = hashlib.sha256(token.encode()).hexdigest()
    delivery = await db.deliveries.find_one({"tracking_token_hash": token_hash})
    if not delivery:
        raise HTTPException(status_code=404, detail="Link non valido")

    expires_at = delivery.get("tracking_expires_at")
    if expires_at:
        try:
            if datetime.fromisoformat(expires_at) < datetime.now(timezone.utc):
                raise HTTPException(status_code=410, detail="Link scaduto")
        except ValueError:
            pass

    pharmacy = await db.users.find_one(
        {"user_id": delivery.get("pharmacy_id")},
        {"pharmacy_name": 1, "pharmacy_phone": 1, "_id": 0},
    )
    first_name = (delivery.get("customer_name") or "").split(" ")[0] or "Cliente"
    return {
        "customer_first_name": first_name,
        "status": delivery.get("status"),
        "updated_at": delivery.get("updated_at"),
        "pharmacy_name": (pharmacy or {}).get("pharmacy_name") or "Farmacia",
        "pharmacy_phone": (pharmacy or {}).get("pharmacy_phone"),
        "has_pod": bool(delivery.get("pod_confirmed_at")),
        "slot": descrivi_fascia(delivery.get("scheduled_time"), delivery.get("slot_to")),
        # Il giorno promesso: la data programmata se c'e', altrimenti quello in
        # cui la consegna e' nata (una fascia senza data vale per oggi).
        "slot_late": fascia_scaduta(
            delivery.get("scheduled_time"),
            delivery.get("slot_to"),
            _adesso_roma(),
            delivery.get("scheduled_date") or delivery.get("created_at"),
        ),
    }

@router.get("/deliveries/{delivery_id}/audit")
async def get_delivery_audit(delivery_id: str, user: dict = Depends(get_current_user)):
    """Storico delle modifiche di una consegna, dalla piu' recente."""
    delivery = await db.deliveries.find_one(
        {"delivery_id": delivery_id, "pharmacy_id": user["user_id"]}, {"_id": 0, "delivery_id": 1}
    )
    if not delivery:
        raise HTTPException(status_code=404, detail="Consegna non trovata")
    entries = await db.audit_log.find(
        {"delivery_id": delivery_id}, {"_id": 0}
    ).sort("created_at", -1).to_list(50)
    return entries

