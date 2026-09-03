"""Data models for photo/POD (Proof of Delivery) functionality."""
from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime


class PhotoUploadResponse(BaseModel):
    """Response from successful photo upload."""
    success: bool
    public_id: str
    secure_url: str
    url: str
    format: str
    width: int
    height: int
    bytes: int
    uploaded_at: str


class DeliveryPhotoMetadata(BaseModel):
    """Metadata for a delivery photo stored in MongoDB."""
    photo_id: str = Field(default_factory=lambda: f"photo_{datetime.utcnow().timestamp()}")
    delivery_id: str
    pharmacy_id: str
    driver_id: str
    cloudinary_public_id: str
    cloudinary_url: str
    cloudinary_thumb_url: Optional[str] = None
    file_size: int
    format: str
    width: int
    height: int
    uploaded_at: str
    notes: Optional[str] = None

    class Config:
        json_schema_extra = {
            "example": {
                "photo_id": "photo_1693664334.123",
                "delivery_id": "del_abc123",
                "pharmacy_id": "pharm_xyz789",
                "driver_id": "drv_driver1",
                "cloudinary_public_id": "pharmatrack/pharm_xyz789/del_abc123",
                "cloudinary_url": "https://res.cloudinary.com/.../del_abc123.jpg",
                "file_size": 1048576,
                "format": "jpg",
                "width": 1280,
                "height": 720,
                "uploaded_at": "2026-09-03T17:45:00Z",
                "notes": "Package left at door, photo taken from street"
            }
        }


class PhotoSetRequest(BaseModel):
    """Request to associate a set of photos with a delivery."""
    delivery_id: str
    photo_ids: List[str] = Field(min_items=1, max_items=10)
    notes: Optional[str] = Field(None, max_length=500)


class DeliveryWithPhotos(BaseModel):
    """Delivery data enriched with POD photos."""
    delivery_id: str
    status: str
    photos: List[DeliveryPhotoMetadata] = []
    pod_confirmed_at: Optional[str] = None
    pod_confirmed_by: Optional[str] = None
