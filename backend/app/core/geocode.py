"""Geocodifica con fallback progressivo per indirizzi italiani.

Google Places a volte non restituisce coordinate per civici in comuni piccoli
(es. Volla, NA). Qui si prova prima l'indirizzo completo, poi senza civico,
poi solo comune: si ottiene comunque un punto utile per la mappa e il tracking.
"""
import logging
import re
from typing import List, Optional, Tuple

import httpx

logger = logging.getLogger(__name__)

NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
HEADERS = {
    "User-Agent": "PharmaTrack/1.0 (gestionale consegne farmacie)",
    "Accept-Language": "it",
}
TIMEOUT = 6.0


def _variants(address: str) -> List[str]:
    """Indirizzo completo, poi senza civico, poi solo comune."""
    addr = (address or "").strip()
    if not addr:
        return []

    out: List[str] = [addr]

    # 1) senza civico: rimuove numeri isolati (es. "Via Roma 5, Volla" -> "Via Roma, Volla")
    no_civic = re.sub(r"\b\d{1,4}\s?[a-zA-Z]?\b", " ", addr)
    no_civic = re.sub(r"\s{2,}", " ", no_civic)
    no_civic = re.sub(r"\s+,", ",", no_civic).strip(" ,")
    if no_civic and no_civic not in out:
        out.append(no_civic)

    # 2) solo comune: ultimo segmento utile ("Volla, NA" / "Volla")
    parts = [p.strip() for p in re.split(r"[,\-]", addr) if p.strip()]
    for candidate in reversed(parts):
        if candidate and not re.fullmatch(r"[\d\s/]+", candidate) and len(candidate) > 2:
            if candidate not in out:
                out.append(candidate)
            break

    return out


async def ensure_coords(address: Optional[str]) -> Tuple[Optional[float], Optional[float]]:
    """Ritorna (lat, lng) per l'indirizzo, oppure (None, None) senza sollevare errori."""
    queries = _variants(address or "")
    if not queries:
        return None, None

    async with httpx.AsyncClient(timeout=TIMEOUT, headers=HEADERS) as client:
        for i, query in enumerate(queries):
            try:
                res = await client.get(NOMINATIM_URL, params={
                    "q": query, "format": "json", "limit": 1,
                    "addressdetails": 0, "countrycodes": "it",
                })
                if res.status_code != 200:
                    continue
                data = res.json()
                if not data:
                    continue
                lat = float(data[0]["lat"])
                lng = float(data[0]["lon"])
                logger.info("Geocode '%s' -> %.5f, %.5f (variante %d)", query, lat, lng, i)
                return lat, lng
            except Exception as exc:  # noqa: BLE001 — la geocodifica non deve mai bloccare
                logger.warning("Geocode fallito per '%s': %s", query, exc)
            # rispetto del rate limit pubblico Nominatim (1 req/s)
            await _sleep()
    logger.info("Nessuna coordinata trovata per '%s'", address)
    return None, None


async def _sleep() -> None:
    import asyncio
    await asyncio.sleep(1.0)
