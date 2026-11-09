"""Come nasce una consegna, in un posto solo.

La stessa struttura di 25 campi era scritta due volte: in
`routers/deliveries.py` (consegna creata dalla farmacia) e in
`routers/integrations.py` (consegna importata da Winfarm). Le due copie erano
gia' divergenti: quella Winfarm non aveva `nre` ne' `client_meta`, quella della
farmacia non aveva `imported_from`. Chi aggiunge un campo domani deve trovarlo
qui, non in due file.

Questo modulo non tocca il database: prende i valori, calcola il resto e
restituisce il documento. Chi lo usa decide se inserirlo, notificarlo o
rifiutarlo.
"""

from datetime import datetime, timezone


def calcola_resto(payment_method, amount, amount_given):
    """Il resto esiste solo per un pagamento in contanti con entrambe le cifre."""
    if payment_method == "cash" and amount is not None and amount_given is not None:
        return amount_given - amount
    return None


def costruisci_consegna(
    *,
    pharmacy_id: str,
    customer: dict,
    delivery_id: str,
    payment_method: str,
    amount=None,
    amount_given=None,
    driver_id=None,
    notes=None,
    scheduled_date=None,
    scheduled_time=None,
    slot_to=None,
    priority="normal",
    nre=None,
    client_meta=None,
    external_ref=None,
    imported_from=None,
    adesso=None,
) -> dict:
    """Il documento di una consegna nuova, con lo stato iniziale di coda.

    `status` e' sempre "da_preparare": l'assegnazione e' un passo separato, anche
    quando un fattorino e' gia' scelto.

    Le due strade (farmacia e Winfarm) producono lo stesso insieme di chiavi: la
    consegna scritta a mano ha `imported_from` a None, quella importata a
    "winfarm". Prima la chiave mancava del tutto nelle consegne della farmacia,
    e chi leggeva il documento doveva sapere da dove veniva per sapere se
    aspettarsi quel campo.
    """
    momento = adesso or datetime.now(timezone.utc).isoformat()

    consegna = {
        "delivery_id": delivery_id,
        "pharmacy_id": pharmacy_id,
        "customer_id": customer["customer_id"],
        "driver_id": driver_id,
        "customer_name": customer["name"],
        "customer_phone": customer.get("phone") or "",
        "customer_address": customer.get("address") or "",
        "customer_lat": customer.get("customer_lat"),
        "customer_lng": customer.get("customer_lng"),
        "notes": notes,
        "status": "da_preparare",
        "payment_method": payment_method,
        "amount": amount,
        "amount_given": amount_given,
        "change_due": calcola_resto(payment_method, amount, amount_given),
        "payment_collected": False,
        "scheduled_date": scheduled_date,
        "scheduled_time": scheduled_time,
        "slot_to": slot_to,
        "priority": priority,
        "estimated_delivery": None,
        "actual_delivery": None,
        "created_at": momento,
        "updated_at": momento,
        "auto_assigned": False,
        "nre": nre or None,
        "client_meta": client_meta or None,
        "external_ref": external_ref or None,
        "imported_from": imported_from or None,
    }
    return consegna
