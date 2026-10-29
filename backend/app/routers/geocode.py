"""Geocodifica indirizzi: Nominatim (OSM) + Photon, con fallback sul civico.

OSM in Italia spesso non ha il numero civico: se manca si prova Photon, poi la
via senza numero, poi il comune. La risposta mantiene il civico scritto
dall'utente e segnala la precisione ottenuta (civico / via / comune).
"""
import logging
import os
import re
from typing import Any, Dict, List, Optional

import httpx
from fastapi import APIRouter, HTTPException, Query

logger = logging.getLogger(__name__)
router = APIRouter()

NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
PHOTON_URL = "https://photon.komoot.io/api/"
HEADERS = {"User-Agent": "PharmaTrack/1.0 (gestionale consegne farmacie)", "Accept-Language": "it"}
TIMEOUT = 8.0

# Se configurata, Google Geocoding/Places ha la precedenza (civici piu' precisi)
GOOGLE_KEY = os.environ.get("GOOGLE_MAPS_API_KEY") or os.environ.get("GOOGLE_GEOCODING_API_KEY") or ""
GOOGLE_GEOCODE_URL = "https://maps.googleapis.com/maps/api/geocode/json"
GOOGLE_AUTOCOMPLETE_URL = "https://maps.googleapis.com/maps/api/place/autocomplete/json"
GOOGLE_PRECISE = {"ROOFTOP", "RANGE_INTERPOLATED"}


def google_enabled() -> bool:
    return bool(GOOGLE_KEY)


async def _google_geocode(client: "httpx.AsyncClient", address: str) -> Optional[Dict[str, Any]]:
    try:
        res = await client.get(GOOGLE_GEOCODE_URL, params={
            "address": address, "key": GOOGLE_KEY, "language": "it", "region": "it",
        })
        if res.status_code != 200:
            return None
        data = res.json()
        if data.get("status") != "OK" or not data.get("results"):
            logger.info("Google geocode '%s': %s", address, data.get("status"))
            return None
        row = data["results"][0]
        geo = row.get("geometry") or {}
        loc = geo.get("location") or {}
        location_type = geo.get("location_type")
        return {
            "lat": float(loc.get("lat")), "lng": float(loc.get("lng")),
            "label": row.get("formatted_address"),
            "precision": "civico" if location_type in GOOGLE_PRECISE else "via",
            "provider": "google", "location_type": location_type,
            "house_number": next((c["long_name"] for c in row.get("address_components", []) if "street_number" in c.get("types", [])), None),
        }
    except Exception as exc:  # noqa: BLE001
        logger.warning("Google geocode error: %s", exc)
        return None


async def _google_autocomplete(client: "httpx.AsyncClient", query: str, limit: int) -> List[Dict[str, Any]]:
    try:
        res = await client.get(GOOGLE_AUTOCOMPLETE_URL, params={
            "input": query, "key": GOOGLE_KEY, "language": "it",
            "components": "country:it", "types": "address",
        })
        if res.status_code != 200:
            return []
        data = res.json()
        out = []
        for pred in (data.get("predictions") or [])[:limit]:
            fmt = pred.get("structured_formatting") or {}
            out.append({
                "place_id": pred.get("place_id"),
                "description": pred.get("description"),
                "structured_formatting": {
                    "main_text": fmt.get("main_text") or pred.get("description", ""),
                    "secondary_text": fmt.get("secondary_text") or "",
                },
                "lat": None, "lng": None,
                "provider": "google", "_nominatim": True,
            })
        return out
    except Exception as exc:  # noqa: BLE001
        logger.warning("Google autocomplete error: %s", exc)
        return []


def strip_civic(street: str) -> str:
    return re.sub(r"\s{2,}", " ", street).strip()


def _clean(address: str) -> str:
    return re.sub(r"\s{2,}", " ", (address or "").strip())


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


async def _nominatim(client: httpx.AsyncClient, params: Dict[str, Any]) -> List[Dict[str, Any]]:
    try:
        res = await client.get(NOMINATIM_URL, params={**params, "format": "json", "addressdetails": 1, "countrycodes": "it"})
        if res.status_code != 200:
            return []
        return res.json() or []
    except Exception as exc:  # noqa: BLE001
        logger.warning("Nominatim error: %s", exc)
        return []


async def _photon(client: httpx.AsyncClient, query: str, limit: int = 6) -> List[Dict[str, Any]]:
    try:
        res = await client.get(PHOTON_URL, params={"q": query, "lang": "it", "limit": limit})
        if res.status_code != 200:
            return []
        return (res.json() or {}).get("features", [])
    except Exception as exc:  # noqa: BLE001
        logger.warning("Photon error: %s", exc)
        return []


def _photon_item(feature: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    props = feature.get("properties") or {}
    coords = (feature.get("geometry") or {}).get("coordinates") or []
    if len(coords) < 2:
        return None
    lng, lat = coords[0], coords[1]
    street = props.get("street") or props.get("name") or ""
    num = props.get("housenumber") or ""
    city = props.get("city") or props.get("town") or props.get("village") or props.get("district") or ""
    postcode = props.get("postcode") or ""
    label = ", ".join([p for p in [
        f"{street} {num}".strip() or None,
        postcode, city,
    ] if p]) or props.get("name", "")
    return {
        "place_id": f"photon:{props.get('osm_id', label)}",
        "description": label,
        "structured_formatting": {
            "main_text": f"{street} {num}".strip() or label,
            "secondary_text": ", ".join([p for p in [city, postcode] if p]),
        },
        "lat": lat,
        "lng": lng,
        "house_number": num or None,
        "provider": "photon",
        "_nominatim": True,
    }


@router.get("/geocode/search")
async def geocode_search(q: str = Query(..., min_length=3), limit: int = 6) -> List[Dict[str, Any]]:
    """Suggerimenti indirizzo unendo OpenStreetMap e Photon (più civici trovati)."""
    street, civic, city = _split(q)
    out: List[Dict[str, Any]] = []
    async with httpx.AsyncClient(timeout=TIMEOUT, headers=HEADERS) as client:
        if google_enabled():
            predictions = await _google_autocomplete(client, q, limit)
            if predictions:
                return predictions
        rows = await _nominatim(client, {"q": q, "limit": limit})
        for item in rows:
            addr = item.get("address") or {}
            road = addr.get("road") or ""
            num = addr.get("house_number") or ""
            town = addr.get("city") or addr.get("town") or addr.get("village") or addr.get("municipality") or ""
            postcode = addr.get("postcode") or ""
            out.append({
                "place_id": str(item.get("place_id")),
                "description": item.get("display_name"),
                "structured_formatting": {
                    "main_text": f"{road} {num}".strip() or (item.get("display_name") or "").split(",")[0],
                    "secondary_text": ", ".join([p for p in [town, postcode] if p]),
                },
                "lat": float(item["lat"]), "lng": float(item["lon"]),
                "house_number": num or None, "provider": "nominatim",
                "_nominatim": True,
            })

        # Photon: se OSM non conosce il civico, questo indice spesso lo trova
        features = await _photon(client, q, limit)
        for feature in features:
            item = _photon_item(feature)
            if item:
                out.append(item)

    # dedupe per coordinate+testo, i risultati col civico vanno in cima
    seen, unique = set(), []
    for item in out:
        key = (round(item["lat"], 5), round(item["lng"], 5))
        if key in seen:
            continue
        seen.add(key)
        unique.append(item)
    unique.sort(key=lambda i: (0 if i.get("house_number") else 1))

    # OSM/Photon in Italia spesso non hanno il civico: se l'utente l'ha scritto
    # lo manteniamo nel testo del suggerimento (coordinate della via), cosi'
    # il fattorino vede comunque il numero civico.
    if civic and street:
        for item in unique:
            if item.get("house_number"):
                continue
            main = (item.get("structured_formatting") or {}).get("main_text") or ""
            if street.lower() in main.lower():
                item["structured_formatting"]["main_text"] = f"{strip_civic(street)} {civic}".strip()
                item["structured_formatting"]["secondary_text"] = ", ".join(
                    [t for t in [item["structured_formatting"].get("secondary_text"), "civico da verificare"] if t]
                )
                item["house_number"] = civic
                item["house_number_source"] = "typed"
                item["precision"] = "via"
    return unique[:limit]


@router.get("/geocode/resolve")
async def geocode_resolve(address: str = Query(..., min_length=3)) -> Dict[str, Any]:
    """Coordinate per un indirizzo: civico esatto, poi via, poi comune."""
    street, civic, city = _split(address)
    attempts: List[tuple] = []
    if street and civic and city:
        attempts.append(("civico", "nominatim_structured", {"street": f"{civic} {street}", "city": city}))
    attempts.append(("indirizzo", "nominatim", {"q": address}))
    if street and city:
        attempts.append(("via", "nominatim_structured", {"street": street, "city": city}))
    attempts.append(("indirizzo", "photon", {"q": address}))
    if street and city:
        attempts.append(("via", "photon", {"q": f"{street} {city}"}))
    if city:
        attempts.append(("comune", "nominatim", {"q": city}))

    async with httpx.AsyncClient(timeout=TIMEOUT, headers=HEADERS) as client:
        if google_enabled():
            google_attempts = [address]
            if street and civic and city:
                google_attempts.append(f"{street} {civic}, {city}")
            if street and city:
                google_attempts.append(f"{street}, {city}")
            if city:
                google_attempts.append(city)
            for candidate in google_attempts:
                found = await _google_geocode(client, candidate)
                if found and (found.get("precision") == "civico" or candidate == google_attempts[-1]):
                    return found
                if found:
                    best_google = found  # memorizza il fallback migliore
            if 'best_google' in dir() and best_google:
                return best_google

        for precision, provider, params in attempts:
            if provider.startswith("nominatim"):
                rows = await _nominatim(client, {**params, "limit": 1})
                if rows:
                    row = rows[0]
                    found_number = (row.get("address") or {}).get("house_number")
                    real_precision = "civico" if found_number else ("via" if precision == "civico" else precision)
                    return {
                        "lat": float(row["lat"]), "lng": float(row["lon"]),
                        "label": row.get("display_name"), "precision": real_precision,
                        "house_number": found_number,
                        "provider": "nominatim",
                    }
            else:
                features = await _photon(client, params["q"], 1)
                if features:
                    item = _photon_item(features[0])
                    if item:
                        return {
                            "lat": item["lat"], "lng": item["lng"],
                            "label": item["description"],
                            "precision": "civico" if item.get("house_number") else precision,
                            "provider": "photon",
                        }
    raise HTTPException(status_code=404, detail="Indirizzo non trovato")
