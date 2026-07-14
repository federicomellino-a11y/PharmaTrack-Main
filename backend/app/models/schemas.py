from pydantic import BaseModel, Field
from typing import List, Optional


class PharmacyRegister(BaseModel):
    email: str
    password: str
    name: str
    pharmacy_name: Optional[str] = None
    pharmacy_address: Optional[str] = None
    pharmacy_phone: Optional[str] = None
    pharmacy_lat: Optional[float] = None
    pharmacy_lng: Optional[float] = None

class PharmacyLogin(BaseModel):
    email: str
    password: str

class ForgotPasswordRequest(BaseModel):
    email: str

class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str

class GoogleAuthRequest(BaseModel):
    credential: str

class AdminLogin(BaseModel):
    email: str
    password: str

class AdminUserStatusUpdate(BaseModel):
    is_active: bool

class CustomerCreate(BaseModel):
    name: str
    phone: str
    address: str
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
    email: str
    password: str
    vehicle_type: str = "scooter"

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
