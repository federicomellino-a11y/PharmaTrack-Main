"""Pydantic validators for all request models."""
from pydantic import BaseModel, field_validator, Field
from typing import Optional
from security_config import SecurityValidator


class PharmacyRegisterValidator(BaseModel):
    """Validated pharmacy registration data."""
    email: str
    password: str
    pharmacy_name: str
    phone: Optional[str] = None
    address: Optional[str] = None

    @field_validator('email')
    @classmethod
    def validate_email(cls, v: str) -> str:
        return SecurityValidator.validate_email(v)

    @field_validator('password')
    @classmethod
    def validate_password(cls, v: str) -> str:
        return SecurityValidator.validate_password(v)

    @field_validator('pharmacy_name')
    @classmethod
    def validate_pharmacy_name(cls, v: str) -> str:
        return SecurityValidator.sanitize_string(v, 'pharmacy_name', max_len=100)

    @field_validator('phone')
    @classmethod
    def validate_phone(cls, v: Optional[str]) -> Optional[str]:
        if v:
            return SecurityValidator.validate_phone(v)
        return v

    @field_validator('address')
    @classmethod
    def validate_address(cls, v: Optional[str]) -> Optional[str]:
        if v:
            return SecurityValidator.sanitize_string(v, 'address', max_len=500)
        return v


class DeliveryValidator(BaseModel):
    """Validated delivery creation data."""
    customer_id: str
    customer_name: Optional[str] = None
    customer_phone: Optional[str] = None
    customer_address: Optional[str] = None
    customer_lat: Optional[float] = None
    customer_lng: Optional[float] = None
    driver_id: Optional[str] = None
    notes: Optional[str] = Field(None, max_length=1000)
    payment_method: str = 'cash'
    amount: Optional[float] = Field(None, ge=0, le=99999)
    amount_given: Optional[float] = Field(None, ge=0, le=99999)
    priority: str = 'normal'

    @field_validator('payment_method')
    @classmethod
    def validate_payment_method(cls, v: str) -> str:
        return SecurityValidator.validate_payment_method(v)

    @field_validator('priority')
    @classmethod
    def validate_priority(cls, v: str) -> str:
        return SecurityValidator.validate_priority(v)

    @field_validator('notes')
    @classmethod
    def sanitize_notes(cls, v: Optional[str]) -> Optional[str]:
        if v:
            return SecurityValidator.sanitize_string(v, 'notes', max_len=1000)
        return v

    @field_validator('amount')
    @classmethod
    def validate_amount(cls, v: Optional[float]) -> Optional[float]:
        if v is not None:
            return SecurityValidator.validate_amount(v, 'amount')
        return v

    @field_validator('amount_given')
    @classmethod
    def validate_amount_given(cls, v: Optional[float]) -> Optional[float]:
        if v is not None:
            return SecurityValidator.validate_amount(v, 'amount_given')
        return v

    @field_validator('customer_lat')
    @classmethod
    def validate_lat(cls, v: Optional[float]) -> Optional[float]:
        if v is not None:
            return SecurityValidator.validate_latitude(v)
        return v

    @field_validator('customer_lng')
    @classmethod
    def validate_lng(cls, v: Optional[float]) -> Optional[float]:
        if v is not None:
            return SecurityValidator.validate_longitude(v)
        return v


class CustomerValidator(BaseModel):
    """Validated customer data."""
    name: str
    phone: str
    address: str
    email: Optional[str] = None
    fiscal_code: Optional[str] = None
    birth_date: Optional[str] = None
    notes: Optional[str] = None
    customer_lat: Optional[float] = None
    customer_lng: Optional[float] = None

    @field_validator('name')
    @classmethod
    def validate_name(cls, v: str) -> str:
        return SecurityValidator.sanitize_string(v, 'name', max_len=100)

    @field_validator('phone')
    @classmethod
    def validate_phone(cls, v: str) -> str:
        return SecurityValidator.validate_phone(v)

    @field_validator('address')
    @classmethod
    def validate_address(cls, v: str) -> str:
        return SecurityValidator.sanitize_string(v, 'address', max_len=500)

    @field_validator('email')
    @classmethod
    def validate_email(cls, v: Optional[str]) -> Optional[str]:
        if v:
            return SecurityValidator.validate_email(v)
        return v

    @field_validator('fiscal_code')
    @classmethod
    def validate_fiscal_code(cls, v: Optional[str]) -> Optional[str]:
        if v:
            return SecurityValidator.validate_fiscal_code(v)
        return v

    @field_validator('notes')
    @classmethod
    def sanitize_notes(cls, v: Optional[str]) -> Optional[str]:
        if v:
            return SecurityValidator.sanitize_string(v, 'notes', max_len=1000)
        return v

    @field_validator('customer_lat')
    @classmethod
    def validate_lat(cls, v: Optional[float]) -> Optional[float]:
        if v is not None:
            return SecurityValidator.validate_latitude(v)
        return v

    @field_validator('customer_lng')
    @classmethod
    def validate_lng(cls, v: Optional[float]) -> Optional[float]:
        if v is not None:
            return SecurityValidator.validate_longitude(v)
        return v
