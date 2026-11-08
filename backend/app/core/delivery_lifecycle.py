"""Regole di vita di una consegna: archiviazione, ripristino, annullamento.

Sta fuori dai router perche' e' la parte dove un errore si vede sui soldi della
farmacia: se una consegna ripristinata resta nei report, o se una annullata
continua a comparire nel giro del fattorino, il danno e' immediato e silenzioso.
Qui dentro non si tocca il database: entrano dict, escono dict, quindi si
verifica con test unitari.
"""

# Stati che stanno in archivio (chiusi in un modo o nell'altro).
ARCHIVED_STATUSES = ("delivered", "delivered_pending_confirmation", "cancelled", "not_delivered")

# Stati in cui la consegna e' ancora "viva" per la farmacia e per il fattorino.
ACTIVE_STATUSES = ("da_preparare", "pronta", "pending", "assigned", "picked_up", "in_transit")

# Stati che valgono come incasso: la consegna e' chiusa e i soldi sono entrati,
# oppure sono per strada dal fattorino. E' l'elenco che i report contano come
# fatturato, quindi deve esistere in un posto solo.
BILLED_STATUSES = ("delivered", "delivered_pending_confirmation")

# Consegne che la farmacia deve ancora seguire: in corso piu' quelle consegnate
# con l'incasso non ancora confermato.
FOLLOW_UP_STATUSES = ACTIVE_STATUSES + ("delivered_pending_confirmation",)

# Stati da cui si puo' annullare: tutto tranne cio' che e' gia' annullato.
CANCELLABLE_STATUSES = ("da_preparare", "pronta", "pending", "assigned", "picked_up", "in_transit",
                        "delivered_pending_confirmation", "delivered", "not_delivered")

# Campi che testimoniano un incasso: se una consegna consegnata viene riaperta
# vanno azzerati, altrimenti i report continuano a contarla come incassata.
SETTLED_FIELDS = ("actual_delivery", "delivered_at", "cash_confirmed", "cash_confirmed_at",
                  "confirmed_at", "confirmed_by")


def resolve_restore_target(delivery: dict) -> str:
    """A quale stato torna una consegna ripristinata.

    Se conosciamo lo stato precedente e questo e' uno stato attivo, si torna li'
    (cosi' il fattorino ritrova la consegna dov'era). Altrimenti si riparte da
    'pronta', che e' il default sicuro: in negozio, da assegnare.
    """
    previous = delivery.get("previous_status")
    if previous in ACTIVE_STATUSES:
        # Se lo stato dice "in mano al fattorino" ma non c'e' un fattorino,
        # tornare a 'pronta' evita una consegna fantasma che nessuno vede.
        if previous in ("assigned", "picked_up", "in_transit") and not delivery.get("driver_id"):
            return "pronta"
        return previous
    return "pronta"


def can_restore(status: str) -> bool:
    return status in ARCHIVED_STATUSES


def can_cancel(status: str) -> bool:
    return status in CANCELLABLE_STATUSES and status != "cancelled"


def can_hard_delete(status: str) -> bool:
    """Si cancella davvero solo cio' che e' gia' chiuso.

    Una consegna ancora in giro non si elimina: prima si annulla, cosi' il
    fattorino viene avvisato e i report si aggiornano. La cancellazione fisica
    resta per le righe sbagliate che nessuno vuole piu' vedere.
    """
    return status in ("cancelled", "not_delivered")


def build_cancel_updates(delivery: dict, reason: str, now_iso: str, actor_id: str) -> dict:
    """Campi da scrivere quando la farmacia annulla una consegna."""
    return {
        "status": "cancelled",
        "previous_status": delivery.get("status"),
        "cancelled_at": now_iso,
        "cancelled_by": actor_id,
        "cancellation_reason": (reason or "").strip() or None,
        "updated_at": now_iso,
        # Ripristinare un annullamento non deve riportare in vita l'incasso.
        "restored_at": None,
    }


def build_restore_updates(delivery: dict, target: str, now_iso: str) -> dict:
    """Campi da scrivere quando una consegna viene ripristinata dall'archivio."""
    updates = {
        "status": target,
        "previous_status": None,
        "cancelled_at": None,
        "cancelled_by": None,
        "cancellation_reason": None,
        "failure_reason": None,
        "restored_at": now_iso,
        "restored_from_status": delivery.get("status"),
        "updated_at": now_iso,
    }
    # Una consegna riaperta non ha piu' un incasso: se restassero i campi di
    # consegna, i report la conterebbero due volte (una nel passato, una quando
    # verra' chiusa davvero).
    for field in SETTLED_FIELDS:
        updates[field] = None
    return updates


def archive_marker(delivery: dict) -> str | None:
    """Etichetta da mostrare in archivio: 'ripristinata', 'annullata' o niente.

    In archivio finiscono solo consegne chiuse, ma una consegna puo' portare i
    segni di un giro precedente (ripristinata e poi riconsegnata, oppure
    annullata dopo un ripristino): la farmacia deve poterlo vedere.
    """
    if delivery.get("status") == "cancelled":
        return "annullata"
    if delivery.get("restored_at"):
        return "ripristinata"
    return None


def build_photo_cleanup(photos: list[dict] | None) -> dict:
    """Cosa va cancellato quando una consegna viene eliminata davvero.

    Le foto di una consegna cancellata restano altrimenti per sempre: la riga
    in delivery_photos e il file su Cloudinary continuano a occupare spazio e
    non c'e' piu' niente che li colleghi a qualcosa. Restituisce gli
    identificativi dei file e quante righe aspettarsi, cosi' chi cancella sa
    cosa sta per sparire prima di farlo.
    """
    elenco = photos or []
    return {
        "public_ids": [
            f["cloudinary_public_id"]
            for f in elenco
            if isinstance(f, dict) and f.get("cloudinary_public_id")
        ],
        "righe": len(elenco),
    }
