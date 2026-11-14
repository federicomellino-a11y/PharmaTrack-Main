"""I filtri dell'archivio consegne, scritti una volta sola e senza database.

La pagina Archivio cercava soltanto tra le 20 righe che aveva gia' caricato:
chi cercava un cliente di settembre non lo trovava e concludeva che non c'era.
Adesso la ricerca la fa il database su tutti i documenti archiviati, e questa
e' la regola che costruisce l'interrogazione: essendo pura si prova senza
Mongo, e il router non decide niente per conto suo.

Tre scelte che vale la pena conoscere:

- Il periodo si legge sulla data in cui la consegna e' stata chiusa, cioe' la
  stessa che l'archivio stampa in alto a destra (`actual_delivery`, con ripiego
  su `updated_at`). Cosi' il filtro e la data che si vede sulla riga coincidono.
- Le date arrivano come giorno italiano ("2026-11-01"): il confine e' la
  mezzanotte di Roma, non quella UTC. Altrimenti un filtro "oggi" alle 00:30
  mostrerebbe le consegne di ieri sera.
- Un filtro che non riconosciamo viene ignorato invece di far fallire la
  pagina: `status` lo faceva gia' prima, e una richiesta difettosa non deve
  svuotare l'archivio sotto gli occhi della farmacia.
"""

from __future__ import annotations

import re
from datetime import date, datetime, timedelta, timezone
from typing import Optional

from app.core.clock import ROME_TZ
from app.core.delivery_lifecycle import ARCHIVED_STATUSES

# Campi su cui cerca la casella dell'archivio. Il telefono sta qui perche' al
# banco si cerca spesso "quello del 333...", e il numero di ricetta perche' e'
# il riferimento che la farmacia ha in mano quando arriva il cliente.
CAMPI_RICERCA = ("customer_name", "customer_address", "customer_phone", "notes", "nre")

# Metodi di pagamento ammessi: gli stessi valori che scrive la cassa.
PAGAMENTI = ("cash", "pos", "other")

# Data di chiusura della consegna: quella mostrata in cima alla riga.
CAMPO_DATA = {"$ifNull": ["$actual_delivery", "$updated_at"]}

# Oltre questa lunghezza una ricerca e' un incollaggio per sbaglio, non una
# ricerca: si taglia invece di costruire una regex enorme.
LUNGHEZZA_MASSIMA_RICERCA = 80


def _confine(giorno: Optional[str], fine: bool = False) -> Optional[str]:
    """Da "2026-11-01" all'istante ISO (UTC) di inizio o fine giornata a Roma.

    La fine e' esclusa: e' la mezzanotte del giorno dopo, cosi' il filtro
    "dal 1 al 14" comprende tutto il 14 senza giochi di 23:59:59.
    """
    if not giorno:
        return None
    try:
        letto = date.fromisoformat(str(giorno).strip()[:10])
    except ValueError:
        return None
    inizio = datetime(letto.year, letto.month, letto.day, tzinfo=ROME_TZ)
    if fine:
        inizio += timedelta(days=1)
    return inizio.astimezone(timezone.utc).isoformat()


def filtro_archivio(
    pharmacy_id: str,
    status: Optional[str] = None,
    testo: Optional[str] = None,
    driver_id: Optional[str] = None,
    pagamento: Optional[str] = None,
    dal: Optional[str] = None,
    al: Optional[str] = None,
) -> dict:
    """L'interrogazione Mongo dell'archivio per una farmacia.

    `dal` e `al` sono giorni italiani ("AAAA-MM-GG") e comprendono tutto il
    giorno indicato.
    """
    query: dict = {"pharmacy_id": pharmacy_id}

    if status and status in ARCHIVED_STATUSES:
        query["status"] = status
    else:
        query["status"] = {"$in": list(ARCHIVED_STATUSES)}

    if driver_id and str(driver_id).strip():
        query["driver_id"] = str(driver_id).strip()

    if pagamento and pagamento in PAGAMENTI:
        query["payment_method"] = pagamento

    cercato = (testo or "").strip()[:LUNGHEZZA_MASSIMA_RICERCA]
    if cercato:
        # re.escape: il testo lo scrive chi cerca, non e' un'espressione
        # regolare. Senza escape una parentesi fa rispondere 500.
        schema = re.escape(cercato)
        query["$or"] = [{campo: {"$regex": schema, "$options": "i"}} for campo in CAMPI_RICERCA]

    condizioni = []
    da = _confine(dal)
    a = _confine(al, fine=True)
    if da:
        condizioni.append({"$gte": [CAMPO_DATA, da]})
    if a:
        condizioni.append({"$lt": [CAMPO_DATA, a]})
    if condizioni:
        # $expr perche' il confronto e' dentro un $ifNull: senza, Mongo
        # pretenderebbe di confrontare `actual_delivery` e `updated_at`
        # come se fossero entrambi presenti.
        query["$expr"] = {"$and": condizioni} if len(condizioni) > 1 else condizioni[0]

    return query


def limiti_pagina(page: int, limit: int) -> tuple[int, int]:
    """Pagina e limite resi innocui: il massimo copre anche l'export (500)."""
    pagina = max(1, int(page or 1))
    limite = max(1, min(int(limit or 20), 500))
    return pagina, limite
