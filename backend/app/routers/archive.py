import logging
from typing import Optional
from fastapi import APIRouter, Depends

from app.core.database import db
from app.core.delivery_lifecycle import ARCHIVED_STATUSES, archive_marker
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
    user: dict = Depends(get_current_user),
):
    """Storico delle consegne chiuse.

    Ogni riga porta con se' l'etichetta di cosa le e' successo (`marker`):
    "annullata" se e' stata cancellata, "ripristinata" se e' gia' stata riaperta
    una volta e poi richiusa. Serve a chi guarda l'archivio per capire se una
    consegna e' stata corretta, senza dover aprire l'audit.
    """
    skip = (page - 1) * limit
    query = {"pharmacy_id": user["user_id"]}
    if status and status in ARCHIVED_STATUSES:
        query["status"] = status
    else:
        query["status"] = {"$in": list(ARCHIVED_STATUSES)}
    total = await db.deliveries.count_documents(query)
    deliveries = await db.deliveries.find(query, {"_id": 0}).sort("updated_at", -1).skip(skip).limit(limit).to_list(limit)
    for delivery in deliveries:
        delivery["marker"] = archive_marker(delivery)
    return {"deliveries": deliveries, "total": total, "page": page, "pages": (total + limit - 1) // limit}
