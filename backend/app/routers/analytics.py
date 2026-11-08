import logging
from fastapi import APIRouter, Depends

from app.core.security import get_current_user
from app.core.analytics import calcola_analytics
from app.core.cache import cache_get, cache_set

logger = logging.getLogger(__name__)
router = APIRouter()



@router.get("/analytics")
async def get_analytics(period: str = "month", user: dict = Depends(get_current_user)):
    """Aggregated KPIs for the pharmacy dashboard (cached)."""
    pharmacy_id = user["user_id"]

    cache_key = f"analytics:{pharmacy_id}:{period}"
    cached = await cache_get(cache_key)
    if cached is not None:
        return cached

    result = await calcola_analytics(pharmacy_id, period)

    await cache_set(cache_key, result)
    return result
