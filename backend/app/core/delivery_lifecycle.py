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
# L'elenco non si ricopia: lo decide la tabella delle transizioni (una regola sola).
# Un elenco a parte diceva che si poteva annullare anche una consegna gia' incassata
# o gia' archiviata, mentre il PUT generico lo rifiutava: due verita' sullo stesso gesto.

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
    return "cancelled" in stati_successivi(status, "farmacia")


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


# --- Fasi e transizioni ---------------------------------------------------
#
# Una consegna passa da sei fasi prima di incassare. Fino a ieri il passaggio da
# una all'altra non era governato: la farmacia poteva mandare una consegna da
# "consegnata" a "da preparare" con un PUT, e i report la contavano o non la
# contavano piu' senza dirlo a nessuno. Qui la sequenza e' scritta una volta.

# L'orario che segna ogni fase: senza, non si puo' misurare dove si perde tempo
# (preparazione, attesa del fattorino, giro, conferma dell'incasso).
FASE_ORARI = {
    "pronta": "pronta_at",
    "assigned": "assigned_at",
    "picked_up": "picked_up_at",
    "in_transit": "departed_at",
    "delivered_pending_confirmation": "delivered_by_driver_at",
    "delivered": "confirmed_at",
}

# La sequenza della farmacia. 'pending' resta in uscita: e' il doppione storico
# di 'da_preparare' e sta gia' sparendo dal resto del codice.
TRANSIZIONI = {
    "da_preparare": ("pronta", "assigned", "cancelled"),
    "pending": ("pronta", "assigned", "cancelled"),
    "pronta": ("assigned", "picked_up", "cancelled"),
    # Dal banco il fattorino ha gia' ritirato: la farmacia puo' portare avanti
    # una consegna affidata direttamente "in giro" senza il passo intermedio.
    "assigned": ("picked_up", "in_transit", "pronta", "cancelled", "not_delivered"),
    "picked_up": ("in_transit", "delivered_pending_confirmation", "not_delivered", "cancelled"),
    "in_transit": ("delivered_pending_confirmation", "not_delivered", "cancelled"),
    # Da "consegnata in attesa di incasso" si torna indietro solo se la farmacia
    # contesta il pagamento: la consegna e' di nuovo in giro.
    "delivered_pending_confirmation": ("delivered", "in_transit", "not_delivered"),
    # Incassata: si riapre solo per contestare l'incasso (importo sbagliato,
    # contante mai arrivato), che la riporta in attesa di conferma.
    "delivered": ("delivered_pending_confirmation",),
    "not_delivered": (),
    "cancelled": (),
}

# Il fattorino ha una sequenza piu' stretta: puo' solo far avanzare il giro.
TRANSIZIONI_FATTORINO = {
    "assigned": ("picked_up", "not_delivered", "cancelled"),
    "picked_up": ("in_transit", "delivered_pending_confirmation", "not_delivered", "cancelled"),
    "in_transit": ("delivered_pending_confirmation", "not_delivered", "cancelled"),
}


def normalizza_stato(stato_attuale, nuovo):
    """'delivered' vuol dire due cose a seconda di dove sei.

    Da una consegna ancora in giro (in consegna, ritirata) 'delivered' e' il
    fatto che il pacco sia arrivato: si registra come 'delivered_pending_confirmation',
    perche' l'incasso non e' ancora confermato. Da 'delivered_pending_confirmation'
    invece 'delivered' e' proprio l'incasso, e resta se stesso.
    """
    if nuovo == "delivered" and stato_attuale not in ("delivered_pending_confirmation", "delivered"):
        return "delivered_pending_confirmation"
    return nuovo


def stati_successivi(stato: str, ruolo: str = "farmacia") -> tuple:
    """Gli stati in cui si puo' andare da qui, per questo ruolo."""
    tabella = TRANSIZIONI_FATTORINO if ruolo == "fattorino" else TRANSIZIONI
    return tabella.get(stato, ())


def valuta_cambio_stato(stato_attuale, nuovo, ruolo: str = "farmacia",
                        forzato: bool = False, motivo: str | None = None) -> dict:
    """Se il cambio si puo' fare, e cosa serve per farlo.

    La farmacia resta padrona dello stato: puo' forzare un passaggio non previsto,
    ma solo dichiarandolo con un motivo, che finisce nel documento e nell'audit.
    Il fattorino no: il suo giro ha una sequenza e basta, perche' da li' non vede
    ne' i soldi ne' la cassa.
    """
    if not nuovo:
        return {"ok": False, "forzato": False, "errore": "Stato mancante"}
    if nuovo == stato_attuale:
        return {"ok": True, "forzato": False, "errore": None}
    # 'delivered' detto da una consegna ancora in giro e' la consegna fatta,
    # non l'incasso: si giudica e si registra come "consegnata da incassare".
    nuovo = normalizza_stato(stato_attuale, nuovo)
    ammessi = stati_successivi(stato_attuale, ruolo)
    if nuovo in ammessi:
        return {"ok": True, "forzato": False, "errore": None}
    prossimi = ", ".join(ammessi) if ammessi else "nessuno"
    if ruolo == "fattorino":
        return {"ok": False, "forzato": False,
                "errore": f"Da '{stato_attuale}' il fattorino puo' passare solo a: {prossimi}"}
    if not forzato:
        return {
            "ok": False,
            "forzato": False,
            "errore": (f"Passaggio '{stato_attuale}' -> '{nuovo}' non previsto. "
                       f"Da qui si va in: {prossimi}. Per una correzione volontaria "
                       "ripeti la richiesta con force=true e un motivo."),
        }
    if not (motivo or "").strip():
        return {"ok": False, "forzato": False,
                "errore": "Per forzare il cambio di stato serve un motivo"}
    return {"ok": True, "forzato": True, "errore": None}


def orario_di_fase(stato: str) -> str | None:
    return FASE_ORARI.get(stato)


def build_phase_updates(stato: str, now_iso: str) -> dict:
    """L'orario della fase che si sta aprendo (niente, per gli stati senza fase)."""
    campo = FASE_ORARI.get(stato)
    return {campo: now_iso} if campo else {}


def build_force_updates(motivo: str, now_iso: str, actor_id: str) -> dict:
    """I segni di una correzione voluta: chi, quando e perche'."""
    return {
        "status_forced_at": now_iso,
        "status_forced_by": actor_id,
        "status_forced_reason": (motivo or "").strip()[:200],
    }
