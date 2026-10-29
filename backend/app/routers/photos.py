"""Photo/POD (Proof of Delivery) router — wired to real auth and DB.

Fixes PR #3 'dead code': the standalone routes_photo.py was merged but never
imported. This router integrates the Cloudinary PhotoManager into the app/
architecture with real session auth and MongoDB persistence.
"""
import os
import uuid
import logging
import tempfile
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, HTTPException, Depends, Request, UploadFile, File, Form, Response

from app.core.database import db
from app.core.websocket import manager
from app.core.security import get_current_user, get_current_driver
from cloudinary_config import PhotoManager

logger = logging.getLogger(__name__)
router = APIRouter()


async def get_photo_actor(request: Request) -> dict:
    """Resolve actor as driver (preferred, POD taken on the road) or pharmacy."""
    try:
        driver = await get_current_driver(request)
        return {"type": "driver", "driver": driver, "pharmacy_id": driver.get("pharmacy_id")}
    except HTTPException:
        user = await get_current_user(request)
        return {"type": "pharmacy", "driver": None, "pharmacy_id": user["user_id"]}


@router.get("/photos/config")
async def photo_config() -> dict:
    """Public: photo upload availability and limits (no PII)."""
    return {
        "enabled": PhotoManager.is_photo_upload_enabled(),
        "max_file_size_mb": PhotoManager.MAX_FILE_SIZE_MB,
        "allowed_formats": list(PhotoManager.ALLOWED_FORMATS),
    }


@router.post("/photos/upload")
async def upload_delivery_photo(
    delivery_id: str = Form(...),
    file: UploadFile = File(...),
    notes: Optional[str] = Form(None),
    actor: dict = Depends(get_photo_actor),
) -> dict:
    """Upload a proof-of-delivery photo (driver on the road or pharmacy)."""
    if not PhotoManager.is_photo_upload_enabled():
        raise HTTPException(status_code=503, detail="Foto non configurate. Contatta il supporto.")

    delivery = await db.deliveries.find_one(
        {"delivery_id": delivery_id, "pharmacy_id": actor["pharmacy_id"]}
    )
    if not delivery:
        raise HTTPException(status_code=404, detail="Consegna non trovata")
    if actor["type"] == "driver" and delivery.get("driver_id") != actor["driver"].get("driver_id"):
        raise HTTPException(status_code=403, detail="Consegna non assegnata a questo fattorino")

    if not file.filename or not PhotoManager.validate_file_extension(file.filename):
        raise HTTPException(status_code=422, detail=f"Formato non valido. Ammessi: {', '.join(PhotoManager.ALLOWED_FORMATS)}")

    content = await file.read()
    if not PhotoManager.validate_file_size(len(content)):
        raise HTTPException(status_code=422, detail=f"File oltre {PhotoManager.MAX_FILE_SIZE_MB}MB")

    with tempfile.NamedTemporaryFile(delete=False, suffix=os.path.splitext(file.filename)[1]) as tmp:
        tmp.write(content)
        tmp_path = tmp.name

    try:
        result = await PhotoManager.upload_delivery_photo(
            file_path=tmp_path,
            delivery_id=delivery_id,
            pharmacy_id=actor["pharmacy_id"],
            driver_id=(actor["driver"] or {}).get("driver_id") or "pharmacy",
        )
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    finally:
        if os.path.exists(tmp_path):
            os.unlink(tmp_path)

    photo_doc = {
        "photo_id": f"photo_{uuid.uuid4().hex[:12]}",
        "delivery_id": delivery_id,
        "pharmacy_id": actor["pharmacy_id"],
        "driver_id": (actor["driver"] or {}).get("driver_id"),
        "cloudinary_public_id": result.get("public_id"),
        "cloudinary_url": result.get("secure_url"),
        "thumb_url": result.get("secure_url", "").replace("/upload/", "/upload/c_fill,g_face,w_200,h_200/") if result.get("secure_url") else None,
        "file_size": len(content),
        "format": result.get("format"),
        "width": result.get("width"),
        "height": result.get("height"),
        "uploaded_at": datetime.now(timezone.utc).isoformat(),
        "notes": (notes or "").strip()[:500] or None,
    }
    await db.delivery_photos.insert_one(photo_doc)

    await manager.send_personal_message(
        {"type": "photo_uploaded", "delivery_id": delivery_id, "photo_url": photo_doc["cloudinary_url"]},
        actor["pharmacy_id"], "pharmacy",
    )
    logger.info(f"POD photo uploaded for delivery {delivery_id} by {actor['type']}")
    return {k: v for k, v in photo_doc.items() if k != "_id"}


@router.get("/photos/delivery/{delivery_id}")
async def get_delivery_photos(delivery_id: str, user: dict = Depends(get_current_user)) -> dict:
    """List all photos of a delivery (pharmacy only)."""
    delivery = await db.deliveries.find_one(
        {"delivery_id": delivery_id, "pharmacy_id": user["user_id"]}, {"_id": 0}
    )
    if not delivery:
        raise HTTPException(status_code=404, detail="Consegna non trovata")
    photos = await db.delivery_photos.find(
        {"delivery_id": delivery_id}, {"_id": 0}
    ).sort("uploaded_at", -1).to_list(50)
    return {"delivery_id": delivery_id, "photo_count": len(photos), "photos": photos}


@router.delete("/photos/{photo_id}")
async def delete_delivery_photo(photo_id: str, user: dict = Depends(get_current_user)) -> dict:
    """Delete a photo (pharmacy only, ownership enforced)."""
    photo = await db.delivery_photos.find_one({"photo_id": photo_id})
    if not photo or photo.get("pharmacy_id") != user["user_id"]:
        raise HTTPException(status_code=404, detail="Foto non trovata")

    if PhotoManager.is_photo_upload_enabled():
        try:
            await PhotoManager.delete_delivery_photo(
                public_id=photo.get("cloudinary_public_id"),
                pharmacy_id=user["user_id"],
            )
        except Exception as e:  # noqa: BLE001 — cloudinary errors must not block metadata cleanup
            logger.warning(f"Cloudinary delete failed for {photo_id}: {e}")
    await db.delivery_photos.delete_one({"photo_id": photo_id})
    return {"deleted": True, "photo_id": photo_id}


@router.post("/photos/delivery/{delivery_id}/confirm-pod")
async def confirm_pod(delivery_id: str, user: dict = Depends(get_current_user)) -> dict:
    """Confirm proof-of-delivery: requires at least one photo, then marks the
    delivery as delivered_pending_confirmation so the pharmacy still settles cash."""
    delivery = await db.deliveries.find_one(
        {"delivery_id": delivery_id, "pharmacy_id": user["user_id"]}
    )
    if not delivery:
        raise HTTPException(status_code=404, detail="Consegna non trovata")
    if delivery.get("status") not in ("in_transit", "picked_up"):
        raise HTTPException(status_code=409, detail=f"Stato non confermabile: {delivery.get('status')}")

    photos = await db.delivery_photos.find(
        {"delivery_id": delivery_id}, {"_id": 0}
    ).to_list(10)
    if not photos:
        raise HTTPException(status_code=422, detail="Serve almeno una foto per confermare il POD")

    now = datetime.now(timezone.utc).isoformat()
    await db.deliveries.update_one(
        {"delivery_id": delivery_id},
        {"$set": {
            "status": "delivered_pending_confirmation",
            "delivered_by_driver_at": now,
            "pod_confirmed_at": now,
            "pod_confirmed_by": user["user_id"],
            "pod_photo_url": photos[0].get("cloudinary_url"),
            "updated_at": now,
        }},
    )
    await manager.send_personal_message(
        {"type": "delivery_update", "delivery_id": delivery_id, "status": "delivered_pending_confirmation"},
        user["user_id"], "pharmacy",
    )
    return {
        "success": True,
        "delivery_id": delivery_id,
        "status": "delivered_pending_confirmation",
        "pod_confirmed_at": now,
    }


@router.get("/photos/file/{photo_id}")
async def serve_stored_photo(photo_id: str, k: str = ""):
    """Serve una foto POD salvata su GridFS (link con chiave, nessuna sessione).

    La chiave casuale per foto rende l'URL una capability: il tag <img> del
    browser e l'app mobile la caricano senza cookie cross-site.
    """
    import uuid as _uuid
    import hmac
    from motor.motor_asyncio import AsyncIOMotorGridFSBucket

    doc = await db.photo_files.find_one({"photo_id": photo_id})
    if not doc or not k or not hmac.compare_digest(str(doc.get("access_key", "")), k):
        raise HTTPException(status_code=404, detail="Foto non trovata")

    bucket = AsyncIOMotorGridFSBucket(db, bucket_name="pod_photos")
    try:
        stream = await bucket.open_download_stream(doc["gridfs_id"])
        data = await stream.read()
    except Exception:  # noqa: BLE001
        raise HTTPException(status_code=404, detail="Foto non disponibile")

    return Response(
        content=data,
        media_type=doc.get("content_type", "image/jpeg"),
        headers={"Cache-Control": "private, max-age=604800"},
    )
