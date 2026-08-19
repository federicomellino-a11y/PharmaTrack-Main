import re
from pydantic import BaseModel, Field, EmailStr, field_validator
from typing import List, Optional


def _validate_password(v: str) -> str:
    if v is None or len(v) < 8:
        raise ValueError("La password deve contenere almeno 8 caratteri")
    if not re.search(r"[A-Za-z]", v):
        raise ValueError("La password deve contenere almeno una lettera")
    if not re.search(r"\d", v):
        raise ValueError("La password deve contenere almeno un numero")
    return v


class PharmacyRegister(BaseModel):
    email: EmailStr
    password: str
    name: str
    pharmacy_name: Optional[str] = None
    pharmacy_address: Optional[str] = None
    pharmacy_phone: Optional[str] = None
    pharmacy_lat: Optional[float] = None
    pharmacy_lng: Optional[float] = None

    @field_validator("password")
    @classmethod
    def _check_password(cls, v):
        return _validate_password(v)

class PharmacyLogin(BaseModel):
    email: EmailStr
    password: str

class ForgotPasswordRequest(BaseModel):
    email: EmailStr

class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str

    @field_validator("new_password")
    @classmethod
    def _check_password(cls, v):
        return _validate_password(v)

class GoogleAuthRequest(BaseModel):
    credential: str

class AdminLogin(BaseModel):
    email: EmailStr
    password: str

class VerifyEmailRequest(BaseModel):
    token: str

class AdminUserStatusUpdate(BaseModel):
    is_active: bool

class CustomerCreate(BaseModel):
    name: str
    phone: Optional[str] = None
    address: Optional[str] = None
    email: Optional[str] = None
    fiscal_code: Optional[str] = None
    birth_date: Optional[str] = None
    notes: Optional[str] = None
    customer_lat: Optional[float] = None
    customer_lng: Optional[float] = None
    place_id: Optional[str] = None
    extra_phones: Optional[List[str]] = []

class DriverCreate(BaseModel):
    name: str
    phone: str
    email: EmailStr
    password: str
    vehicle_type: str = "scooter"

    @field_validator("password")
    @classmethod
    def _check_password(cls, v):
        return _validate_password(v)

class DeliveryCreate(BaseModel):
    customer_id: str
    driver_id: Optional[str] = None
    notes: Optional[str] = None
    payment_method: str = "cash"
    amount: Optional[float] = Field(default=None, ge=0)
    amount_given: Optional[float] = Field(default=None, ge=0)
    scheduled_date: Optional[str] = None
    scheduled_time: Optional[str] = None
    priority: str = "normal"

class DeliveryUpdate(BaseModel):
    driver_id: Optional[str] = None
    status: Optional[str] = None
    notes: Optional[str] = None
    payment_method: Optional[str] = None
    amount: Optional[float] = Field(default=None, ge=0)
    amount_given: Optional[float] = Field(default=None, ge=0)
    payment_collected: Optional[bool] = None
    scheduled_date: Optional[str] = None
    scheduled_time: Optional[str] = None
    priority: Optional[str] = None

class MessageCreate(BaseModel):
    driver_id: str
    content: str

class DoctorCreate(BaseModel):
    name: str
    specialty: str
    phone: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    schedule: Optional[dict] = None
    notes: Optional[str] = None

class UsefulNumberCreate(BaseModel):
    name: str
    phone: str
    category: str = "general"
    notes: Optional[str] = None

class NoteCreate(BaseModel):
    title: str
    content: str
    color: str = "default"
    pinned: bool = False
