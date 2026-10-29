"""Cloudinary configuration and image management utilities."""
import os
import logging
from typing import Dict, Optional, Any
import cloudinary
import cloudinary.uploader
import cloudinary.api
from datetime import datetime, timezone

logger = logging.getLogger(__name__)

# Storage locale di riserva: se Cloudinary non è configurato le foto POD
# finiscono su MongoDB GridFS e vengono servite dall'app (link con chiave).
LOCAL_STORAGE_BUCKET = "pod_photos"
API_PUBLIC_URL = (os.environ.get("APP_BASE_URL") or os.environ.get("API_PUBLIC_URL")
                  or "https://pharmatrack-api.onrender.com").rstrip("/")
LOCAL_STORAGE_DISABLED = os.environ.get("LOCAL_PHOTO_STORAGE", "1") == "0"
CLOUDINARY_READY = bool(CLOUDINARY_CLOUD_NAME and CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET)

# Load Cloudinary credentials from environment
CLOUDINARY_CLOUD_NAME = os.environ.get("CLOUDINARY_CLOUD_NAME")
CLOUDINARY_API_KEY = os.environ.get("CLOUDINARY_API_KEY")
CLOUDINARY_API_SECRET = os.environ.get("CLOUDINARY_API_SECRET")

if CLOUDINARY_CLOUD_NAME and CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET:
    cloudinary.config(
        cloud_name=CLOUDINARY_CLOUD_NAME,
        api_key=CLOUDINARY_API_KEY,
        api_secret=CLOUDINARY_API_SECRET,
    )
    logger.info("Cloudinary initialized successfully")
else:
    logger.warning("Cloudinary credentials not fully configured. Photo upload disabled.")


class PhotoManager:
    """
    Manage photo uploads and storage for delivery proof-of-delivery (POD).
    Uses Cloudinary for cloud storage with automatic optimizations.
    """

    # Image constraints
    MAX_FILE_SIZE_MB = 5
    ALLOWED_FORMATS = {"jpg", "jpeg", "png", "webp"}
    IMAGE_WIDTH = 1280
    IMAGE_HEIGHT = 720
    COMPRESSION_QUALITY = 80

    STORAGE_LOCAL = "local"

    @staticmethod
    def storage_backend() -> str:
        """'cloudinary' se configurato, altrimenti 'local' (MongoDB GridFS)."""
        if CLOUDINARY_READY:
            return "cloudinary"
        return "disabled" if LOCAL_STORAGE_DISABLED else "local"

    @staticmethod
    def is_photo_upload_enabled() -> bool:
        """Le foto sono disponibili con Cloudinary oppure con lo storage locale."""
        return PhotoManager.storage_backend() in ("cloudinary", "local")

    @staticmethod
    async def _store_local(file_path: str, delivery_id: str, pharmacy_id: str, driver_id: str) -> Dict[str, Any]:
        """Salva la foto su MongoDB GridFS (nessun servizio esterno richiesto)."""
        import uuid as _uuid
        from motor.motor_asyncio import AsyncIOMotorGridFSBucket
        from app.core.database import db

        with open(file_path, "rb") as fh:
            data = fh.read()
        ext = file_path.split(".")[-1].lower()
        content_type = {"jpg": "image/jpeg", "jpeg": "image/jpeg", "png": "image/png",
                        "webp": "image/webp"}.get(ext, "image/jpeg")
        photo_id = f"photo_{_uuid.uuid4().hex[:16]}"
        access_key = _uuid.uuid4().hex
        bucket = AsyncIOMotorGridFSBucket(db, bucket_name=LOCAL_STORAGE_BUCKET)
        grid_id = await bucket.upload_from_stream(
            f"{delivery_id}.{ext}", data,
            metadata={"delivery_id": delivery_id, "pharmacy_id": pharmacy_id, "driver_id": driver_id},
        )
        await db.photo_files.insert_one({
            "photo_id": photo_id, "gridfs_id": grid_id, "access_key": access_key,
            "delivery_id": delivery_id, "pharmacy_id": pharmacy_id, "driver_id": driver_id,
            "content_type": content_type, "bytes": len(data), "format": ext,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        url = f"{API_PUBLIC_URL}/api/photos/file/{photo_id}?k={access_key}"
        logger.info(f"Foto POD salvata su GridFS per la consegna {delivery_id} ({len(data)} byte)")
        return {"success": True, "public_id": f"local:{photo_id}", "secure_url": url, "url": url,
                "format": ext, "width": None, "height": None, "bytes": len(data),
                "version": None, "storage": "local",
                "uploaded_at": datetime.now(timezone.utc).isoformat()}

    @staticmethod
    def validate_file_size(file_size_bytes: int) -> bool:
        """
        Validate file size against MAX_FILE_SIZE_MB limit.
        """
        max_bytes = PhotoManager.MAX_FILE_SIZE_MB * 1024 * 1024
        return 0 < file_size_bytes <= max_bytes

    @staticmethod
    def validate_file_extension(filename: str) -> bool:
        """
        Validate file extension against ALLOWED_FORMATS.
        """
        if not filename:
            return False
        ext = filename.split(".")[-1].lower()
        return ext in PhotoManager.ALLOWED_FORMATS

    @staticmethod
    async def upload_delivery_photo(
        file_path: str,
        delivery_id: str,
        pharmacy_id: str,
        driver_id: str,
    ) -> Dict[str, Any]:
        """
        Upload a delivery photo to Cloudinary with automatic optimization.
        
        Args:
            file_path: Local path to the image file
            delivery_id: Delivery ID for organization
            pharmacy_id: Pharmacy ID for multi-tenancy
            driver_id: Driver ID for tracking
            
        Returns:
            Dictionary with upload result including secure URL and metadata
        """
        if not PhotoManager.is_photo_upload_enabled():
            raise ValueError("Photo upload is disabled.")
        if PhotoManager.storage_backend() == "local":
            return await PhotoManager._store_local(file_path, delivery_id, pharmacy_id, driver_id)

        try:
            # Organize in folder structure: pharmatrack/pharmacy_id/delivery_id
            public_id = f"pharmatrack/{pharmacy_id}/{delivery_id}"
            
            timestamp = datetime.now(timezone.utc).isoformat()
            
            result = cloudinary.uploader.upload(
                file_path,
                public_id=public_id,
                folder=f"pharmatrack/{pharmacy_id}",
                overwrite=True,
                resource_type="auto",
                quality="auto",
                fetch_format="auto",
                width=PhotoManager.IMAGE_WIDTH,
                height=PhotoManager.IMAGE_HEIGHT,
                crop="limit",
                gravity="auto",
                tags=["delivery-pod", pharmacy_id, delivery_id, driver_id],
                metadata={
                    "delivery_id": delivery_id,
                    "pharmacy_id": pharmacy_id,
                    "driver_id": driver_id,
                    "uploaded_at": timestamp,
                },
                context={
                    "delivery_id": delivery_id,
                    "pharmacy_id": pharmacy_id,
                    "driver_id": driver_id,
                },
            )

            logger.info(
                f"Photo uploaded successfully for delivery {delivery_id}",
                extra={"pharmacy_id": pharmacy_id, "cloudinary_public_id": result["public_id"]}
            )

            return {
                "success": True,
                "public_id": result["public_id"],
                "secure_url": result["secure_url"],
                "url": result["url"],
                "format": result["format"],
                "width": result["width"],
                "height": result["height"],
                "bytes": result["bytes"],
                "version": result["version"],
                "uploaded_at": timestamp,
            }
        except Exception as e:
            logger.error(
                f"Failed to upload photo for delivery {delivery_id}: {str(e)}",
                extra={"pharmacy_id": pharmacy_id, "delivery_id": delivery_id},
                exc_info=True
            )
            raise ValueError(f"Photo upload failed: {str(e)}")

    @staticmethod
    async def delete_delivery_photo(public_id: str, pharmacy_id: str) -> bool:
        """
        Delete a photo from Cloudinary (when delivery is cancelled, etc.).
        
        Args:
            public_id: Cloudinary public ID of the image
            pharmacy_id: Pharmacy ID for authorization check
            
        Returns:
            True if deletion was successful
        """
        if not PhotoManager.is_photo_upload_enabled():
            return False

        if str(public_id or "").startswith("local:"):
            import uuid as _uuid
            from motor.motor_asyncio import AsyncIOMotorGridFSBucket
            from app.core.database import db
            photo_id = public_id.split(":", 1)[1]
            doc = await db.photo_files.find_one({"photo_id": photo_id, "pharmacy_id": pharmacy_id})
            if not doc:
                return False
            try:
                bucket = AsyncIOMotorGridFSBucket(db, bucket_name=LOCAL_STORAGE_BUCKET)
                await bucket.delete(_uuid.UUID(str(doc["gridfs_id"]).replace("-", "")) if isinstance(doc.get("gridfs_id"), str) else doc["gridfs_id"])
            except Exception as e:  # noqa: BLE001
                logger.warning(f"GridFS delete fallita per {photo_id}: {e}")
            await db.photo_files.delete_one({"photo_id": photo_id})
            return True

        try:
            # Verify the photo belongs to this pharmacy (security check)
            if not public_id.startswith(f"pharmatrack/{pharmacy_id}"):
                logger.warning(
                    f"Attempted to delete photo from different pharmacy: {public_id}",
                    extra={"pharmacy_id": pharmacy_id}
                )
                raise ValueError("Photo does not belong to this pharmacy")

            result = cloudinary.uploader.destroy(public_id)
            logger.info(
                f"Photo deleted: {public_id}",
                extra={"pharmacy_id": pharmacy_id}
            )
            return result.get("result") == "ok"
        except Exception as e:
            logger.error(
                f"Failed to delete photo {public_id}: {str(e)}",
                extra={"pharmacy_id": pharmacy_id},
                exc_info=True
            )
            return False

    @staticmethod
    def get_optimized_urls(public_id: str) -> Dict[str, str]:
        """
        Get optimized URLs for different use cases (thumbnail, full, etc.).
        
        Args:
            public_id: Cloudinary public ID
            
        Returns:
            Dictionary with URLs for different resolutions
        """
        base_url = f"https://res.cloudinary.com/{CLOUDINARY_CLOUD_NAME}/image/upload"
        return {
            "thumbnail": f"{base_url}/c_fill,w_200,h_200,q_auto,f_auto/{public_id}",
            "medium": f"{base_url}/c_fit,w_600,h_600,q_auto,f_auto/{public_id}",
            "full": f"{base_url}/q_auto,f_auto/{public_id}",
            "preview": f"{base_url}/c_fit,w_1280,h_720,q_auto,f_auto/{public_id}",
        }

    @staticmethod
    async def get_delivery_photos(
        delivery_id: str,
        pharmacy_id: str,
    ) -> list:
        """
        Get all photos associated with a delivery.
        
        Args:
            delivery_id: Delivery ID
            pharmacy_id: Pharmacy ID for authorization
            
        Returns:
            List of photos with metadata
        """
        if not PhotoManager.is_photo_upload_enabled():
            return []

        try:
            # Search for all images with this delivery_id tag
            result = cloudinary.api.resources_by_tag(
                f"pharmatrack/{pharmacy_id}/{delivery_id}",
                resource_type="image",
                max_results=50,
            )

            photos = []
            for resource in result.get("resources", []):
                photos.append({
                    "public_id": resource["public_id"],
                    "secure_url": resource["secure_url"],
                    "created_at": resource["created_at"],
                    "width": resource["width"],
                    "height": resource["height"],
                    "bytes": resource["bytes"],
                    "urls": PhotoManager.get_optimized_urls(resource["public_id"]),
                })
            return photos
        except Exception as e:
            logger.error(
                f"Failed to retrieve photos for delivery {delivery_id}: {str(e)}",
                extra={"pharmacy_id": pharmacy_id},
                exc_info=True
            )
            return []
