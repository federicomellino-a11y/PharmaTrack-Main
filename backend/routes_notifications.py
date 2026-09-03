"""Routes for notifications management."""
from fastapi import APIRouter, Depends, HTTPException, Request
from typing import Optional, List
import logging
from datetime import datetime, timezone
import uuid

from notifications_manager import NotificationManager, NotificationTemplate, NotificationChannel
from models_notifications import (
    SendNotificationRequest,
    SendBatchNotificationRequest,
    NotificationLog,
    NotificationConfig,
)
from error_handlers import AuthenticationError, ValidationAppError

logger = logging.getLogger(__name__)

notifications_router = APIRouter(prefix="/api/notifications", tags=["Notifications"])


async def get_current_user(request: Request) -> dict:
    """Dependency: Get authenticated user."""
    # Placeholder - would come from existing auth
    raise AuthenticationError()


@notifications_router.post("/send")
async def send_notification(
    data: SendNotificationRequest,
    user: dict = Depends(get_current_user),
) -> dict:
    """
    Send a single notification.
    
    Supported templates:
    - delivery_assigned
    - delivery_in_transit
    - delivery_arriving
    - delivery_delivered
    - delivery_cancelled
    - payment_confirmation
    - shift_start
    - shift_end
    - alert_late_delivery
    
    Channel support:
    - sms: via Twilio or Brevo
    - whatsapp: via Twilio
    - voice: via Twilio TTS
    """
    pharmacy_id = user.get("user_id")
    
    # Validate template
    try:
        template = NotificationTemplate(data.template)
    except ValueError:
        raise ValidationAppError(f"Unknown template: {data.template}")
    
    # Render message
    try:
        channel = NotificationChannel(data.channel.value)
        message = NotificationManager.render_template(
            template, channel, **data.template_vars
        )
    except Exception as e:
        raise ValidationAppError(f"Failed to render template: {str(e)}")
    
    # Send via appropriate channel
    if channel == NotificationChannel.SMS:
        result = await NotificationManager.send_sms(
            data.phone_number,
            message,
            pharmacy_id=pharmacy_id,
            delivery_id=data.template_vars.get("delivery_id"),
        )
    elif channel == NotificationChannel.WHATSAPP:
        result = await NotificationManager.send_whatsapp(
            data.phone_number,
            message,
            pharmacy_id=pharmacy_id,
        )
    elif channel == NotificationChannel.VOICE:
        result = await NotificationManager.make_voice_call(
            data.phone_number,
            message,
            pharmacy_id=pharmacy_id,
        )
    else:
        raise ValidationAppError(f"Unsupported channel: {channel}")
    
    if not result.get("success"):
        # Log failure but return status
        logger.error(
            f"Notification send failed: {result.get('error')}",
            extra={"pharmacy_id": pharmacy_id, "phone": data.phone_number}
        )
    
    return {
        "success": result.get("success", False),
        "channel": data.channel,
        "template": data.template,
        "recipient": data.phone_number,
        "provider_id": result.get("sid") or result.get("message_id") or result.get("call_sid"),
        "sent_at": result.get("sent_at"),
        "error": result.get("error"),
    }


@notifications_router.post("/send-batch")
async def send_batch_notifications(
    data: SendBatchNotificationRequest,
    user: dict = Depends(get_current_user),
) -> dict:
    """
    Send notifications to multiple recipients.
    Useful for delivery status updates, shift notifications, etc.
    """
    pharmacy_id = user.get("user_id")
    
    # Validate template
    try:
        template = NotificationTemplate(data.template)
    except ValueError:
        raise ValidationAppError(f"Unknown template: {data.template}")
    
    # Convert channel strings to enums
    channels = [NotificationChannel(ch.value) for ch in data.channels]
    
    # Send batch
    result = await NotificationManager.send_notification_batch(
        recipients=data.recipients,
        template=template,
        channels=channels,
        **data.template_vars
    )
    
    logger.info(
        f"Batch notifications sent: {result['succeeded']}/{result['total']}",
        extra={"pharmacy_id": pharmacy_id, "template": data.template}
    )
    
    return result


@notifications_router.get("/config")
async def get_notification_config() -> NotificationConfig:
    """
    Get notification system configuration (public, no auth needed).
    """
    return NotificationConfig(
        sms_enabled=NotificationManager.is_sms_enabled(),
        whatsapp_enabled=NotificationManager.is_whatsapp_enabled(),
        voice_enabled=NotificationManager.is_voice_enabled(),
        sms_provider="twilio" if NotificationManager.is_sms_enabled() else "none",
    )


@notifications_router.post("/test")
async def test_notification(
    phone_number: str,
    channel: str = "sms",
    user: dict = Depends(get_current_user),
) -> dict:
    """
    Send a test notification to verify configuration.
    Only for authenticated users (pharmacy admins).
    """
    pharmacy_id = user.get("user_id")
    
    test_message = f"🧪 Test notification from PharmaTrack ({pharmacy_id})"
    
    try:
        if channel == "sms":
            result = await NotificationManager.send_sms(
                phone_number,
                test_message,
                pharmacy_id=pharmacy_id,
                test=True,
            )
        elif channel == "whatsapp":
            result = await NotificationManager.send_whatsapp(
                phone_number,
                test_message,
                pharmacy_id=pharmacy_id,
                test=True,
            )
        elif channel == "voice":
            result = await NotificationManager.make_voice_call(
                phone_number,
                "Questo è un test del sistema di notifiche di PharmaTrack",
                pharmacy_id=pharmacy_id,
                test=True,
            )
        else:
            raise ValidationAppError(f"Unsupported channel: {channel}")
        
        return {
            "success": result.get("success", False),
            "channel": channel,
            "message": "Test notification sent" if result.get("success") else "Test notification failed",
            "error": result.get("error"),
        }
    except Exception as e:
        logger.error(
            f"Test notification failed: {str(e)}",
            extra={"pharmacy_id": pharmacy_id, "phone": phone_number},
            exc_info=True
        )
        raise HTTPException(status_code=500, detail=str(e))
