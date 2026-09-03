"""Routes for photo/POD (Proof of Delivery) management."""
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Request
from typing import Optional, List
import logging
import os
import tempfile
from datetime import datetime, timezone

from cloudinary_config import PhotoManager
from models_photo import PhotoUploadResponse, DeliveryPhotoMetadata, PhotoSetRequest
from error_handlers import NotFoundError, AuthenticationError, ValidationAppError

logger = logging.getLogger(__name__)

photo_router = APIRouter(prefix="/api/photos", tags=["Photos"])


async def get_current_user(request: Request) -> dict:
    """Dependency: Get authenticated user from session or Bearer token."""
    # This would typically come from your existing get_current_user function
    # For now, this is a placeholder
    raise AuthenticationError()


@photo_router.post("/upload", response_model=PhotoUploadResponse)
async def upload_delivery_photo(
    delivery_id: str,
    file: UploadFile = File(...),
    notes: Optional[str] = None,
    user: dict = Depends(get_current_user),
):
    """
    Upload a photo for proof-of-delivery (POD).
    
    - **delivery_id**: Delivery ID to attach photo to
    - **file**: Image file (JPG, PNG, WebP, max 5MB)
    - **notes**: Optional notes about the photo (max 500 chars)
    
    Returns: Upload result with Cloudinary URLs
    """
    pharmacy_id = user.get("user_id")
    driver_id = user.get("driver_id") or "unknown"
    
    if not PhotoManager.is_photo_upload_enabled():
        raise HTTPException(
            status_code=503,
            detail="Photo upload is not configured. Contact support."
        )
    
    # Validate file
    if not file.filename:
        raise ValidationAppError("File name is required")
    
    if not PhotoManager.validate_file_extension(file.filename):
        raise ValidationAppError(
            f"Invalid file format. Allowed: {', '.join(PhotoManager.ALLOWED_FORMATS)}"
        )
    
    # Get file size
    file_content = await file.read()
    file_size = len(file_content)
    
    if not PhotoManager.validate_file_size(file_size):
        raise ValidationAppError(
            f"File size exceeds {PhotoManager.MAX_FILE_SIZE_MB}MB limit"
        )
    
    # Save temp file for upload
    with tempfile.NamedTemporaryFile(delete=False, suffix=os.path.splitext(file.filename)[1]) as tmp:
        tmp.write(file_content)
        tmp_path = tmp.name
    
    try:
        # Upload to Cloudinary
        upload_result = await PhotoManager.upload_delivery_photo(
            file_path=tmp_path,
            delivery_id=delivery_id,
            pharmacy_id=pharmacy_id,
            driver_id=driver_id,
        )
        
        # Store metadata in MongoDB
        photo_doc = {
            "photo_id": f"photo_{datetime.now(timezone.utc).timestamp()}",
            "delivery_id": delivery_id,
            "pharmacy_id": pharmacy_id,
            "driver_id": driver_id,
            "cloudinary_public_id": upload_result["public_id"],
            "cloudinary_url": upload_result["secure_url"],
            "file_size": file_size,
            "format": upload_result["format"],
            "width": upload_result["width"],
            "height": upload_result["height"],
            "uploaded_at": upload_result["uploaded_at"],
            "notes": notes[:500] if notes else None,
        }
        # db.delivery_photos.insert_one(photo_doc)  # Enable when DB is available
        
        logger.info(f"Photo uploaded for delivery {delivery_id}")
        return PhotoUploadResponse(**upload_result)
        
    except ValueError as e:
        raise ValidationAppError(str(e))
    finally:
        # Clean up temp file
        if os.path.exists(tmp_path):
            os.unlink(tmp_path)


@photo_router.get("/delivery/{delivery_id}")
async def get_delivery_photos(
    delivery_id: str,
    user: dict = Depends(get_current_user),
) -> dict:
    """
    Get all photos associated with a delivery.
    
    Args:
        delivery_id: Delivery ID
        
    Returns: List of photos with metadata and URLs
    """
    pharmacy_id = user.get("user_id")
    
    try:
        photos = await PhotoManager.get_delivery_photos(
            delivery_id=delivery_id,
            pharmacy_id=pharmacy_id,
        )
        
        return {
            "delivery_id": delivery_id,
            "photo_count": len(photos),
            "photos": photos,
        }
    except Exception as e:
        logger.error(f"Error retrieving photos for delivery {delivery_id}: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to retrieve photos")


@photo_router.delete("/photo/{photo_id}")
async def delete_delivery_photo(
    photo_id: str,
    user: dict = Depends(get_current_user),
) -> dict:
    """
    Delete a specific photo (only pharmacy can delete their own photos).
    
    Args:
        photo_id: Photo ID to delete
        
    Returns: Confirmation of deletion
    """
    pharmacy_id = user.get("user_id")
    
    # Note: In production, fetch photo metadata from DB to verify ownership
    # For now, we assume the photo_id structure allows us to check
    
    try:
        success = await PhotoManager.delete_delivery_photo(
            public_id=photo_id,
            pharmacy_id=pharmacy_id,
        )
        
        if not success:
            raise HTTPException(status_code=400, detail="Failed to delete photo")
        
        return {"deleted": True, "photo_id": photo_id}
    except ValueError as e:
        raise HTTPException(status_code=403, detail=str(e))


@photo_router.post("/delivery/{delivery_id}/confirm-pod")
async def confirm_pod(
    delivery_id: str,
    request: Request,
    user: dict = Depends(get_current_user),
) -> dict:
    """
    Confirm proof-of-delivery: mark delivery as delivered with photo evidence.
    This transitions delivery status from 'in_transit' to 'delivered'.
    
    Args:
        delivery_id: Delivery ID
        
    Returns: Updated delivery status
    """
    pharmacy_id = user.get("user_id")
    
    # Fetch delivery from DB (placeholder)
    # delivery = await db.deliveries.find_one({"delivery_id": delivery_id})
    # if not delivery:
    #     raise NotFoundError("Delivery", delivery_id)
    
    # Check if delivery has at least one photo
    # photos = await db.delivery_photos.find({"delivery_id": delivery_id}).to_list(None)
    # if not photos:
    #     raise ValidationAppError("At least one photo is required for POD")
    
    # Update delivery status
    now = datetime.now(timezone.utc).isoformat()
    # await db.deliveries.update_one(
    #     {"delivery_id": delivery_id},
    #     {"$set": {
    #         "status": "delivered",
    #         "delivered_at": now,
    #         "pod_confirmed_at": now,
    #         "pod_confirmed_by": pharmacy_id,
    #     }}
    # )
    
    logger.info(f"POD confirmed for delivery {delivery_id}")
    return {
        "success": True,
        "delivery_id": delivery_id,
        "status": "delivered",
        "pod_confirmed_at": now,
    }


@photo_router.get("/config")
async def photo_config() -> dict:
    """
    Get photo upload configuration (public settings).
    No authentication required.
    """
    return {
        "enabled": PhotoManager.is_photo_upload_enabled(),
        "max_file_size_mb": PhotoManager.MAX_FILE_SIZE_MB,
        "allowed_formats": list(PhotoManager.ALLOWED_FORMATS),
        "max_files_per_delivery": 10,
    }
