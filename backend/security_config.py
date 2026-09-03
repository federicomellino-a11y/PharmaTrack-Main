"""Security configuration and utilities for PharmaTrack."""
import hashlib
import hmac
from typing import Dict, Any
from datetime import datetime, timezone
import logging

logger = logging.getLogger(__name__)


class SecurityValidator:
    """Central validator for all input sanitization and security checks."""

    # Maximum field lengths (prevent DoS via huge strings)
    MAX_LENGTHS = {
        "email": 254,
        "name": 100,
        "phone": 20,
        "address": 500,
        "notes": 1000,
        "password": 128,
        "fiscal_code": 16,
        "vehicle_type": 50,
    }

    # Allowed payment methods
    ALLOWED_PAYMENT_METHODS = {"cash", "card", "bank_transfer", "prepaid"}

    # Allowed delivery statuses
    ALLOWED_STATUSES = {
        "da_preparare",
        "pronta",
        "assigned",
        "picked_up",
        "in_transit",
        "delivered",
        "cancelled",
        "delivered_pending_confirmation",
    }

    # Allowed priorities
    ALLOWED_PRIORITIES = {"low", "normal", "high", "urgent"}

    @staticmethod
    def sanitize_string(value: str, field_name: str = "field", max_len: int = None) -> str:
        """
        Sanitize string input: strip whitespace, truncate if needed, check length.
        """
        if not isinstance(value, str):
            raise ValueError(f"{field_name} must be a string")

        value = value.strip()
        if not value:
            raise ValueError(f"{field_name} cannot be empty")

        # Use field-specific max length or provided one
        limit = max_len or SecurityValidator.MAX_LENGTHS.get(field_name, 1000)
        if len(value) > limit:
            raise ValueError(f"{field_name} exceeds maximum length of {limit} characters")

        return value

    @staticmethod
    def validate_email(email: str) -> str:
        """
        Validate email format and length.
        """
        email = email.lower().strip()
        if len(email) > SecurityValidator.MAX_LENGTHS["email"]:
            raise ValueError("Email too long")
        if "@" not in email or "." not in email.split("@")[1]:
            raise ValueError("Invalid email format")
        return email

    @staticmethod
    def validate_password(password: str) -> str:
        """
        Validate password strength:
        - At least 8 characters
        - At least one uppercase, one lowercase, one digit
        - No more than 128 characters
        """
        if len(password) < 8:
            raise ValueError("Password must be at least 8 characters")
        if len(password) > SecurityValidator.MAX_LENGTHS["password"]:
            raise ValueError("Password too long")
        if not any(c.isupper() for c in password):
            raise ValueError("Password must contain at least one uppercase letter")
        if not any(c.islower() for c in password):
            raise ValueError("Password must contain at least one lowercase letter")
        if not any(c.isdigit() for c in password):
            raise ValueError("Password must contain at least one digit")
        return password

    @staticmethod
    def validate_phone(phone: str) -> str:
        """
        Validate phone number: only digits, +, -, and spaces.
        """
        phone = phone.replace(" ", "").strip()
        if not all(c in "0123456789+-" for c in phone):
            raise ValueError("Phone number contains invalid characters")
        if len(phone) < 8 or len(phone) > SecurityValidator.MAX_LENGTHS["phone"]:
            raise ValueError("Phone number length invalid")
        return phone

    @staticmethod
    def validate_amount(amount: float, field_name: str = "amount") -> float:
        """
        Validate monetary amount: positive, <= 99999, reasonable precision.
        """
        if not isinstance(amount, (int, float)):
            raise ValueError(f"{field_name} must be a number")
        if amount < 0:
            raise ValueError(f"{field_name} cannot be negative")
        if amount > 99999:
            raise ValueError(f"{field_name} exceeds maximum of €99,999")
        # Round to 2 decimal places
        return round(amount, 2)

    @staticmethod
    def validate_payment_method(method: str) -> str:
        """
        Validate payment method against allowed list.
        """
        method = method.lower().strip()
        if method not in SecurityValidator.ALLOWED_PAYMENT_METHODS:
            raise ValueError(
                f"Invalid payment method. Allowed: {', '.join(sorted(SecurityValidator.ALLOWED_PAYMENT_METHODS))}"
            )
        return method

    @staticmethod
    def validate_status(status: str) -> str:
        """
        Validate delivery status against allowed list.
        """
        status = status.lower().strip()
        if status not in SecurityValidator.ALLOWED_STATUSES:
            raise ValueError(
                f"Invalid status. Allowed: {', '.join(sorted(SecurityValidator.ALLOWED_STATUSES))}"
            )
        return status

    @staticmethod
    def validate_priority(priority: str) -> str:
        """
        Validate priority against allowed list.
        """
        priority = priority.lower().strip()
        if priority not in SecurityValidator.ALLOWED_PRIORITIES:
            raise ValueError(
                f"Invalid priority. Allowed: {', '.join(sorted(SecurityValidator.ALLOWED_PRIORITIES))}"
            )
        return priority

    @staticmethod
    def validate_fiscal_code(code: str) -> str:
        """
        Basic Italian fiscal code (codice fiscale) validation.
        Format: 16 alphanumeric characters.
        """
        code = code.upper().strip()
        if len(code) != 16:
            raise ValueError("Fiscal code must be 16 characters")
        if not code.isalnum():
            raise ValueError("Fiscal code must be alphanumeric")
        return code

    @staticmethod
    def validate_latitude(lat: float) -> float:
        """
        Validate latitude: -90 to +90.
        """
        if not isinstance(lat, (int, float)):
            raise ValueError("Latitude must be a number")
        if lat < -90 or lat > 90:
            raise ValueError("Latitude must be between -90 and +90")
        return round(lat, 6)

    @staticmethod
    def validate_longitude(lng: float) -> float:
        """
        Validate longitude: -180 to +180.
        """
        if not isinstance(lng, (int, float)):
            raise ValueError("Longitude must be a number")
        if lng < -180 or lng > 180:
            raise ValueError("Longitude must be between -180 and +180")
        return round(lng, 6)


def hash_password(password: str) -> str:
    """
    Hash password using bcrypt (if available) or PBKDF2 fallback.
    """
    try:
        import bcrypt
        salt = bcrypt.gensalt(rounds=12)
        return bcrypt.hashpw(password.encode(), salt).decode()
    except ImportError:
        # Fallback: use PBKDF2 (less secure than bcrypt, but better than nothing)
        import hashlib
        salt = hashlib.sha256(str(datetime.now(timezone.utc)).encode()).hexdigest()[:16]
        hashed = hashlib.pbkdf2_hmac('sha256', password.encode(), salt.encode(), 100000)
        return f"pbkdf2$${salt}${hashed.hex()}"


def verify_password(password: str, hash_value: str) -> bool:
    """
    Verify password against hash.
    """
    try:
        import bcrypt
        return bcrypt.checkpw(password.encode(), hash_value.encode())
    except ImportError:
        # Fallback PBKDF2 check
        if hash_value.startswith("pbkdf2$$"):
            parts = hash_value.split("$$")
            if len(parts) != 3:
                return False
            salt, stored_hash = parts[1], parts[2]
            hashed = hashlib.pbkdf2_hmac('sha256', password.encode(), salt.encode(), 100000)
            return hashed.hex() == stored_hash
        return False


def generate_secure_token(length: int = 32) -> str:
    """
    Generate a cryptographically secure random token.
    """
    import secrets
    return secrets.token_urlsafe(length)


def verify_hmac_signature(payload: bytes, signature: str, secret: str) -> bool:
    """
    Verify HMAC-SHA256 signature (for Stripe webhooks, etc.).
    """
    expected_signature = hmac.new(
        secret.encode(),
        payload,
        hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(signature, expected_signature)
