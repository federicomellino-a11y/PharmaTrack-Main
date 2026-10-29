"""Geocodifica di riserva con fallback progressivo (Nominatim + Photon).

Usata quando il client non ha coordinate: OSM in Italia spesso non ha il
civico, quindi si prova il civico strutturato, poi Photon, poi la via, poi il
comune. Non solleva mai eccezioni: al massimo ritorna (None, None).
"""
import logging
import re
from typing import Optional, Tuple

import httpx

logger = logging.getLogger(__name__)

NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
PHOTON_URL = "https://photon.komoot.io/api/"
HEADERS = {
    "User-Agent": "PharmaTrack/1.0 (gestionale consegne farmacie)",
    "Accept-Language": "it",
}
TIMEOUT = 8.0


def _split(address: str):
    """(via, civico, comune) anche senza virgole: "Via Roma 12 Volla"."""
    addr = re.sub(r"\s{2,}", " ", (address or "").strip())
    if not addr:
        return None, None, None

    parts = [p.strip() for p in addr.split(",") if p.strip()]
    if len(parts) >= 2:
        street_part, city_part = parts[0], parts[-1]
    else:
        m = re.search(r"\b\d{1,4}\s?[a-zA-Z]?\b", addr)
        if m and m.start() > 0 and addr[m.end():].strip():
            street_part = f"{addr[:m.start()].strip(' ,')} {m.group(0).strip()}"
            city_part = addr[m.end():].strip(" ,")
        else:
            street_part, city_part = addr, ""

    m2 = re.match(r"^(.*?)[,\s]+(\d{1,4}\s?[a-zA-Z]?)$", street_part)
    if m2:
        street, civic = m2.group(1).strip(), m2.group(2).strip()
    else:
        street, civic = street_part, None
    city = re.sub(r"\(?\b[A-Z]{2}\b\)?", "", city_part).strip(" ,()")
    return (street or None), civic, (city or None)


async def ensure_coords(address: Optional[str]) -> Tuple[Optional[float], Optional[float]]:
    """(lat, lng) per l'indirizzo, con la miglior precisione disponibile."""
    street, civic, city = _split(address or "")
    if not (street or city):
        return None, None

    attempts = []
    if street and civic and city:
        attempts.append(("civico", NOMINATIM_URL, {"street": f"{civic} {street}", "city": city, "format": "json", "limit": 1, "countrycodes": "it"}))
    attempts.append(("indirizzo", NOMINATIM_URL, {"q": address, "format": "json", "limit": 1, "countrycodes": "it"}))
    if street and city:
        attempts.append(("via", NOMINATIM_URL, {"street": street, "city": city, "format": "json", "limit": 1, "countrycodes": "it"}))
    attempts.append(("indirizzo", PHOTON_URL, {"q": address, "limit": 1, "lang": "it"}))
    if street and city:
        attempts.append(("via", PHOTON_URL, {"q": f"{street} {city}", "limit": 1, "lang": "it"}))
    if city:
        attempts.append(("comune", NOMINATIM_URL, {"q": city, "format": "json", "limit": 1, "countrycodes": "it"}))

    async with httpx.AsyncClient(timeout=TIMEOUT, headers=HEADERS) as client:
        for precision, url, params in attempts:
            try:
                res = await client.get(url, params=params)
                if res.status_code != 200:
                    continue
                data = res.json()
                if url == NOMINATIM_URL:
                    if data:
                        return float(data[0]["lat"]), float(data[0]["lon"])
                else:
                    features = (data or {}).get("features") or []
                    if features:
                        coords = (features[0].get("geometry") or {}).get("coordinates") or []
                        if len(coords) >= 2:
                            return float(coords[1]), float(coords[0])
            except Exception as exc:  # noqa: BLE001 — non bloccare mai il salvataggio
                logger.warning("Geocode %s fallito per '%s': %s", precision, address, exc)
    logger.info("Nessuna coordinata per '%s'", address)
    return None, None
