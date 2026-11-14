import logging
from typing import Optional
from fastapi import APIRouter, Depends

from app.core.database import db
from app.core.archivio import filtro_archivio, limiti_pagina
from app.core.delivery_lifecycle import archive_marker
from app.core.security import (
    get_current_user,
)

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/archive")
async def get_archive(
    page: int = 1,
    limit: int = 20,
    status: Optional[str] = None,
    q: Optional[str] = None,
    driver_id: Optional[str] = None,
    payment_method: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    user: dict = Depends(get_current_user),
):
    """Storico delle consegne chiuse.

    Ricerca e filtri li fa il database su tutti i documenti archiviati: prima
    la casella filtrava soltanto le righe della pagina gia' caricata, quindi un
    cliente di due mesi fa sembrava non essere mai passato.

    Ogni riga porta con se' l'etichetta di cosa le e' successo (`marker`):
    "annullata" se e' stata cancellata, "ripristinata" se e' gia' stata riaperta
    una volta e poi richiusa. Serve a chi guarda l'archivio per capire se una
    consegna e' stata corretta, senza dover aprire l'audit.
    """
    page, limit = limiti_pagina(page, limit)
    skip = (page - 1) * limit
    query = filtro_archivio(
        user["user_id"],
        status=status,
        testo=q,
        driver_id=driver_id,
        pagamento=payment_method,
        dal=date_from,
        al=date_to,
    )
    total = await db.deliveries.count_documents(query)
    deliveries = await db.deliveries.find(query, {"_id": 0}).sort("updated_at", -1).skip(skip).limit(limit).to_list(limit)
    for delivery in deliveries:
        delivery["marker"] = archive_marker(delivery)
    return {"deliveries": deliveries, "total": total, "page": page, "pages": (total + limit - 1) // limit}
