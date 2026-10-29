"""Geocodifica di riserva: Google (se configurato) poi Nominatim + Photon.

Usata quando il client non manda le coordinate: prova Google Geocoding
(civici precisi, location_type ROOFTOP) e, se la chiave manca o fallisce,
ripiega su OpenStreetMap e Photon. Non solleva mai eccezioni.
"""
import logging
import os
import re
from typing import Optional, Tuple

import httpx

logger = logging.getLogger(__name__)

GOOGLE_KEY = os.environ.get("GOOGLE_MAPS_API_KEY") or os.environ.get("GOOGLE_GEOCODING_API_KEY") or ""
GOOGLE_GEOCODE_URL = "https://maps.googleapis.com/maps/api/geocode/json"
NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
PHOTON_URL = "https://photon.komoot.io/api/"
HEADERS = {
    "User-Agent": "PharmaTrack/1.0 (gestionale consegne farmacie)",
    "Accept-Language": "it",
}
TIMEOUT = 8.0
GOOGLE_PRECISE = {"ROOFTOP", "RANGE_INTERPOLATED"}


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


async def _google_lookup(client: httpx.AsyncClient, candidates) -> Optional[Tuple[float, float, str]]:
    """(lat, lng, precisione) dal primo candidato non vuoto di Google."""
    if not GOOGLE_KEY:
        return None
    fallback = None
    for candidate in candidates:
        if not candidate:
            continue
        try:
            res = await client.get(GOOGLE_GEOCODE_URL, params={
                "address": candidate, "key": GOOGLE_KEY, "language": "it", "region": "it",
            })
            if res.status_code != 200:
                continue
            data = res.json()
            if data.get("status") != "OK" or not data.get("results"):
                logger.info("Google geocode '%s': %s", candidate, data.get("status"))
                continue
            row = data["results"][0]
            loc = (row.get("geometry") or {}).get("location") or {}
            location_type = (row.get("geometry") or {}).get("location_type")
            found = (float(loc["lat"]), float(loc["lng"]),
                     "civico" if location_type in GOOGLE_PRECISE else "via")
            if found[2] == "civico":
                return found
            fallback = fallback or found
        except Exception as exc:  # noqa: BLE001
            logger.warning("Google geocode errore per '%s': %s", candidate, exc)
    return fallback


async def ensure_coords_with_source(address: Optional[str]) -> Tuple[Optional[float], Optional[float], Optional[str]]:
    """(lat, lng, fonte) con la miglior precisione disponibile."""
    street, civic, city = _split(address or "")
    if not (street or city):
        return None, None, None

    google_candidates = [address]
    if street and civic and city:
        google_candidates.append(f"{street} {civic}, {city}")
    if street and city:
        google_candidates.append(f"{street}, {city}")
    if city:
        google_candidates.append(city)

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
        google = await _google_lookup(client, google_candidates)
        if google:
            return google[0], google[1], "google"

        for precision, url, params in attempts:
            try:
                res = await client.get(url, params=params)
                if res.status_code != 200:
                    continue
                data = res.json()
                if url == NOMINATIM_URL:
                    if data:
                        return float(data[0]["lat"]), float(data[0]["lon"]), "nominatim_fallback"
                else:
                    features = (data or {}).get("features") or []
                    if features:
                        coords = (features[0].get("geometry") or {}).get("coordinates") or []
                        if len(coords) >= 2:
                            return float(coords[1]), float(coords[0]), "photon_fallback"
            except Exception as exc:  # noqa: BLE001 — non bloccare mai il salvataggio
                logger.warning("Geocode %s fallito per '%s': %s", precision, address, exc)
    logger.info("Nessuna coordinata per '%s'", address)
    return None, None, None


async def ensure_coords(address: Optional[str]) -> Tuple[Optional[float], Optional[float]]:
    """Compatibilita': solo (lat, lng)."""
    lat, lng, _ = await ensure_coords_with_source(address)
    return lat, lng
