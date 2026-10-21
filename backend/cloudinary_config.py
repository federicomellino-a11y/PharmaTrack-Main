"""Cloudinary configuration and image management utilities."""
import os
import logging
from typing import Dict, Optional, Any
import cloudinary
import cloudinary.uploader
import cloudinary.api
from datetime import datetime, timezone

logger = logging.getLogger(__name__)

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

    @staticmethod
    def is_photo_upload_enabled() -> bool:
        """
        Check if Cloudinary is configured and photo uploads are enabled.
        """
        return all([
            CLOUDINARY_CLOUD_NAME,
            CLOUDINARY_API_KEY,
            CLOUDINARY_API_SECRET,
        ])

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
            raise ValueError("Photo upload is not configured. Set CLOUDINARY_* environment variables.")

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
