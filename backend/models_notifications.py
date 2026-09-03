"""Data models for notifications."""
from pydantic import BaseModel, Field
from typing import Optional, List
from enum import Enum


class NotificationChannelEnum(str, Enum):
    """Notification channels."""
    SMS = "sms"
    WHATSAPP = "whatsapp"
    VOICE = "voice"
    EMAIL = "email"
    PUSH = "push"


class SendNotificationRequest(BaseModel):
    """Request to send a single notification."""
    phone_number: str = Field(..., description="Recipient phone in E.164 format")
    template: str = Field(..., description="Template name (e.g., 'delivery_assigned')")
    channel: NotificationChannelEnum = NotificationChannelEnum.SMS
    template_vars: dict = Field(default_factory=dict, description="Template placeholder values")
    priority: str = Field(default="normal", description="Priority level (low, normal, high)")


class SendBatchNotificationRequest(BaseModel):
    """Request to send notifications to multiple recipients."""
    recipients: List[dict] = Field(..., description="List of {phone, name} objects")
    template: str
    channels: List[NotificationChannelEnum] = [NotificationChannelEnum.SMS]
    template_vars: dict = Field(default_factory=dict)


class NotificationLog(BaseModel):
    """Log entry for a sent notification."""
    notification_id: str
    recipient_phone: str
    channel: NotificationChannelEnum
    template: str
    status: str  # "pending", "sent", "failed", "delivered"
    provider_id: Optional[str] = None  # Twilio SID, Brevo message ID, etc.
    error_message: Optional[str] = None
    sent_at: str
    delivered_at: Optional[str] = None
    pharmacy_id: str
    delivery_id: Optional[str] = None
    driver_id: Optional[str] = None


class NotificationConfig(BaseModel):
    """Notification system configuration."""
    sms_enabled: bool
    whatsapp_enabled: bool
    voice_enabled: bool
    sms_provider: str  # "twilio" or "brevo"
    max_retries: int = 3
    retry_delay_seconds: int = 60
