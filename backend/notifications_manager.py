"""Multi-channel notification service: SMS, WhatsApp, Voice calls."""
import os
import logging
from typing import Optional, Dict, Any, List
from enum import Enum
from datetime import datetime, timezone
import asyncio

logger = logging.getLogger(__name__)

# Provider credentials from environment
TWILIO_ACCOUNT_SID = os.environ.get("TWILIO_ACCOUNT_SID")
TWILIO_AUTH_TOKEN = os.environ.get("TWILIO_AUTH_TOKEN")
TWILIO_PHONE_NUMBER = os.environ.get("TWILIO_PHONE_NUMBER")  # SMS/Voice sender
TWILIO_WHATSAPP_NUMBER = os.environ.get("TWILIO_WHATSAPP_NUMBER")  # WhatsApp sender

SMS_PROVIDER = os.environ.get("SMS_PROVIDER", "twilio")  # twilio or brevo
BREVO_API_KEY = os.environ.get("BREVO_API_KEY")

# Try to import Twilio client
try:
    from twilio.rest import Client as TwilioClient
    TWILIO_CLIENT = TwilioClient(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN) if TWILIO_ACCOUNT_SID else None
    if TWILIO_CLIENT:
        logger.info("Twilio client initialized")
except ImportError:
    TWILIO_CLIENT = None
    logger.warning("Twilio SDK not installed")


class NotificationChannel(str, Enum):
    """Available notification channels."""
    SMS = "sms"
    WHATSAPP = "whatsapp"
    VOICE = "voice"
    EMAIL = "email"
    PUSH = "push"


class NotificationTemplate(str, Enum):
    """Pre-defined notification templates with placeholders."""
    DELIVERY_ASSIGNED = "delivery_assigned"  # Driver: You have a new delivery
    DELIVERY_IN_TRANSIT = "delivery_in_transit"  # Customer: Driver is on the way
    DELIVERY_ARRIVING = "delivery_arriving"  # Customer: Driver arriving in 5 min
    DELIVERY_DELIVERED = "delivery_delivered"  # Customer: Delivery completed
    DELIVERY_CANCELLED = "delivery_cancelled"  # Both: Delivery cancelled
    PAYMENT_CONFIRMATION = "payment_confirmation"  # Pharmacy: Payment received
    SHIFT_START = "shift_start"  # Driver: Shift started
    SHIFT_END = "shift_end"  # Driver: Shift ended
    ALERT_LATE_DELIVERY = "alert_late_delivery"  # Pharmacy: Delivery is late


TEMPLATE_TEXTS = {
    NotificationTemplate.DELIVERY_ASSIGNED: {
        "sms": "🚚 Nuova consegna: {customer_name}, {customer_address}. Ritira il pacco. Link: {short_url}",
        "whatsapp": "🚚 *Consegna assegnata*\n{customer_name}\n{customer_address}\n⏱ Tempo stimato: {eta_minutes} min",
        "voice": "Hai una nuova consegna per {customer_name} in {customer_address}. Ritira il pacco.",
    },
    NotificationTemplate.DELIVERY_IN_TRANSIT: {
        "sms": "📦 Il tuo pacco è in consegna. Tracking: {short_url}",
        "whatsapp": "📦 *La tua consegna è in corso*\nTiempo stimato: {eta_minutes} minuti\nTracking: {short_url}",
        "voice": "La tua consegna è in consegna. Tempo stimato {eta_minutes} minuti.",
    },
    NotificationTemplate.DELIVERY_ARRIVING: {
        "sms": "📍 Fattorino in arrivo tra 5 minuti. Numero: {driver_phone}",
        "whatsapp": "📍 *Arrivo imminente*\nIl fattorino arriverà tra circa 5 minuti.\n📞 {driver_phone}",
        "voice": "Il fattorino arriverà tra circa 5 minuti.",
    },
    NotificationTemplate.DELIVERY_DELIVERED: {
        "sms": "✅ Consegna completata. Grazie per aver scelto noi!",
        "whatsapp": "✅ *Consegna consegnata*\nGrazie per aver scelto la nostra farmacia!",
        "voice": "La tua consegna è stata completata. Grazie.",
    },
    NotificationTemplate.DELIVERY_CANCELLED: {
        "sms": "❌ La tua consegna è stata annullata. Contatta la farmacia.",
        "whatsapp": "❌ *Consegna annullata*\nContatta la farmacia per maggiori informazioni.",
        "voice": "La consegna è stata annullata. Contatta la farmacia.",
    },
    NotificationTemplate.PAYMENT_CONFIRMATION: {
        "sms": "💰 Incasso confermato: €{amount} per consegna {delivery_id}",
        "whatsapp": "💰 *Pagamento confermato*\n€{amount}\nConsegna: {delivery_id}",
    },
    NotificationTemplate.SHIFT_START: {
        "sms": "⏰ Turno iniziato. Buona giornata! 💪",
        "whatsapp": "⏰ *Turno iniziato*\nBuona giornata! 💪",
        "voice": "Turno iniziato. Buona giornata.",
    },
    NotificationTemplate.SHIFT_END: {
        "sms": "🏁 Turno terminato. Incasso totale: €{cash_total}",
        "whatsapp": "🏁 *Turno terminato*\n💰 Incasso: €{cash_total}\n📊 Consegne: {delivery_count}",
    },
    NotificationTemplate.ALERT_LATE_DELIVERY: {
        "sms": "⚠️ Consegna in ritardo: {customer_name}, assegnato a {driver_name}",
        "whatsapp": "⚠️ *Consegna in ritardo*\n{customer_name}\nFattorino: {driver_name}",
    },
}


class NotificationManager:
    """
    Central notification manager supporting multiple channels.
    Handles SMS, WhatsApp, Voice, Email, and Push notifications.
    """

    @staticmethod
    def is_sms_enabled() -> bool:
        """Check if SMS notifications are configured."""
        if SMS_PROVIDER == "twilio":
            return TWILIO_CLIENT is not None and TWILIO_PHONE_NUMBER is not None
        elif SMS_PROVIDER == "brevo":
            return BREVO_API_KEY is not None
        return False

    @staticmethod
    def is_whatsapp_enabled() -> bool:
        """Check if WhatsApp notifications are configured."""
        return TWILIO_CLIENT is not None and TWILIO_WHATSAPP_NUMBER is not None

    @staticmethod
    def is_voice_enabled() -> bool:
        """Check if Voice notifications are configured."""
        return TWILIO_CLIENT is not None and TWILIO_PHONE_NUMBER is not None

    @staticmethod
    def render_template(template: NotificationTemplate, channel: NotificationChannel, **kwargs) -> str:
        """
        Render a notification template with placeholders filled in.
        
        Args:
            template: Template enum
            channel: Notification channel (sms, whatsapp, voice)
            **kwargs: Placeholder values (customer_name, delivery_id, etc.)
            
        Returns:
            Rendered text message
        """
        if template not in TEMPLATE_TEXTS:
            raise ValueError(f"Unknown template: {template}")

        text = TEMPLATE_TEXTS[template].get(channel.value, "")
        if not text:
            # Fallback to SMS text if channel-specific version doesn't exist
            text = TEMPLATE_TEXTS[template].get("sms", "")

        # Replace placeholders
        for key, value in kwargs.items():
            placeholder = "{" + key + "}"
            text = text.replace(placeholder, str(value))

        return text

    @staticmethod
    async def send_sms(phone_number: str, message: str, **metadata) -> Dict[str, Any]:
        """
        Send SMS notification via Twilio or Brevo.
        
        Args:
            phone_number: Recipient phone number (E.164 format: +39xxxxxxxxxx)
            message: Message text
            **metadata: Additional context (delivery_id, etc. for logging)
            
        Returns:
            Sending result with status and SID
        """
        if not NotificationManager.is_sms_enabled():
            logger.warning(f"SMS not configured. Message not sent to {phone_number}")
            return {"success": False, "error": "SMS not configured"}

        try:
            if SMS_PROVIDER == "twilio" and TWILIO_CLIENT:
                msg = TWILIO_CLIENT.messages.create(
                    body=message,
                    from_=TWILIO_PHONE_NUMBER,
                    to=phone_number,
                )
                logger.info(
                    f"SMS sent to {phone_number}",
                    extra={"sid": msg.sid, **metadata}
                )
                return {
                    "success": True,
                    "channel": "sms",
                    "provider": "twilio",
                    "sid": msg.sid,
                    "sent_at": datetime.now(timezone.utc).isoformat(),
                }
            elif SMS_PROVIDER == "brevo" and BREVO_API_KEY:
                # Brevo (formerly Sendinblue) API call
                import httpx
                async with httpx.AsyncClient() as client:
                    response = await client.post(
                        "https://api.brevo.com/v3/sms/send",
                        json={
                            "recipient": phone_number,
                            "content": message,
                            "sender": "PharmaTrack",
                        },
                        headers={"api-key": BREVO_API_KEY},
                    )
                    if response.status_code == 201:
                        result = response.json()
                        logger.info(
                            f"SMS sent via Brevo to {phone_number}",
                            extra={"message_id": result.get("messageId"), **metadata}
                        )
                        return {
                            "success": True,
                            "channel": "sms",
                            "provider": "brevo",
                            "message_id": result.get("messageId"),
                            "sent_at": datetime.now(timezone.utc).isoformat(),
                        }
                    else:
                        raise Exception(f"Brevo error: {response.text}")
        except Exception as e:
            logger.error(
                f"Failed to send SMS to {phone_number}: {str(e)}",
                extra=metadata,
                exc_info=True
            )
            return {"success": False, "error": str(e)}

    @staticmethod
    async def send_whatsapp(phone_number: str, message: str, **metadata) -> Dict[str, Any]:
        """
        Send WhatsApp message via Twilio.
        
        Args:
            phone_number: Recipient phone number (E.164 format)
            message: Message text
            **metadata: Additional context
            
        Returns:
            Sending result with status and SID
        """
        if not NotificationManager.is_whatsapp_enabled():
            logger.warning(f"WhatsApp not configured. Message not sent to {phone_number}")
            return {"success": False, "error": "WhatsApp not configured"}

        try:
            msg = TWILIO_CLIENT.messages.create(
                body=message,
                from_=f"whatsapp:{TWILIO_WHATSAPP_NUMBER}",
                to=f"whatsapp:{phone_number}",
            )
            logger.info(
                f"WhatsApp sent to {phone_number}",
                extra={"sid": msg.sid, **metadata}
            )
            return {
                "success": True,
                "channel": "whatsapp",
                "provider": "twilio",
                "sid": msg.sid,
                "sent_at": datetime.now(timezone.utc).isoformat(),
            }
        except Exception as e:
            logger.error(
                f"Failed to send WhatsApp to {phone_number}: {str(e)}",
                extra=metadata,
                exc_info=True
            )
            return {"success": False, "error": str(e)}

    @staticmethod
    async def make_voice_call(phone_number: str, message: str, **metadata) -> Dict[str, Any]:
        """
        Make outbound voice call with TTS (text-to-speech) message via Twilio.
        
        Args:
            phone_number: Recipient phone number (E.164 format)
            message: Message to speak (will be converted to speech)
            **metadata: Additional context
            
        Returns:
            Call result with status and Call SID
        """
        if not NotificationManager.is_voice_enabled():
            logger.warning(f"Voice calls not configured. Call not made to {phone_number}")
            return {"success": False, "error": "Voice calls not configured"}

        try:
            # TwiML (Twilio Markup Language) for voice call
            twiml = f'<Response><Say language="it-IT">{message}</Say></Response>'

            call = TWILIO_CLIENT.calls.create(
                to=phone_number,
                from_=TWILIO_PHONE_NUMBER,
                twiml=twiml,
            )
            logger.info(
                f"Voice call initiated to {phone_number}",
                extra={"call_sid": call.sid, **metadata}
            )
            return {
                "success": True,
                "channel": "voice",
                "provider": "twilio",
                "call_sid": call.sid,
                "sent_at": datetime.now(timezone.utc).isoformat(),
            }
        except Exception as e:
            logger.error(
                f"Failed to make voice call to {phone_number}: {str(e)}",
                extra=metadata,
                exc_info=True
            )
            return {"success": False, "error": str(e)}

    @staticmethod
    async def send_notification_batch(
        recipients: List[Dict[str, str]],
        template: NotificationTemplate,
        channels: List[NotificationChannel] = None,
        **template_kwargs
    ) -> Dict[str, Any]:
        """
        Send notification to multiple recipients (batch).
        
        Args:
            recipients: List of {"phone": "...", "name": "..."} dicts
            template: Notification template to use
            channels: List of channels to use (defaults to SMS)
            **template_kwargs: Placeholder values
            
        Returns:
            Batch result with success/failure counts
        """
        if channels is None:
            channels = [NotificationChannel.SMS]

        results = {
            "total": len(recipients),
            "succeeded": 0,
            "failed": 0,
            "by_channel": {ch.value: [] for ch in channels},
        }

        tasks = []
        for recipient in recipients:
            for channel in channels:
                text = NotificationManager.render_template(
                    template, channel, **template_kwargs
                )
                phone = recipient.get("phone")

                if channel == NotificationChannel.SMS:
                    task = NotificationManager.send_sms(phone, text)
                elif channel == NotificationChannel.WHATSAPP:
                    task = NotificationManager.send_whatsapp(phone, text)
                elif channel == NotificationChannel.VOICE:
                    task = NotificationManager.make_voice_call(phone, text)
                else:
                    continue

                tasks.append((channel.value, task))

        # Execute all tasks concurrently
        for channel_name, task in tasks:
            try:
                result = await task
                if result.get("success"):
                    results["succeeded"] += 1
                    results["by_channel"][channel_name].append(result)
                else:
                    results["failed"] += 1
            except Exception as e:
                logger.error(f"Batch notification error: {str(e)}", exc_info=True)
                results["failed"] += 1

        return results
