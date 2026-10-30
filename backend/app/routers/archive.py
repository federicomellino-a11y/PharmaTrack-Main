import logging
from fastapi import APIRouter, Depends

from app.core.database import db
from app.core.security import (
    get_current_user,
)

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/archive")
async def get_archive(page: int = 1, limit: int = 20, user: dict = Depends(get_current_user)):
    skip = (page - 1) * limit
    query = {"pharmacy_id": user["user_id"], "status": {"$in": ["delivered", "cancelled", "not_delivered"]}}
    total = await db.deliveries.count_documents(query)
    deliveries = await db.deliveries.find(query, {"_id": 0}).sort("updated_at", -1).skip(skip).limit(limit).to_list(limit)
    return {"deliveries": deliveries, "total": total, "page": page, "pages": (total + limit - 1) // limit}
