import logging
from fastapi import APIRouter, Depends

from app.core.funzioni_pro import richiedi_pro
from app.core.analytics import calcola_analytics
from app.core.cache import cache_get, cache_set

logger = logging.getLogger(__name__)
router = APIRouter()



@router.get("/analytics")
async def get_analytics(period: str = "month", user: dict = Depends(richiedi_pro("report_avanzati"))):
    """Aggregated KPIs for the pharmacy dashboard (cached)."""
    pharmacy_id = user["user_id"]

    cache_key = f"analytics:{pharmacy_id}:{period}"
    cached = await cache_get(cache_key)
    if cached is not None:
        return cached

    result = await calcola_analytics(pharmacy_id, period)

    await cache_set(cache_key, result)
    return result
