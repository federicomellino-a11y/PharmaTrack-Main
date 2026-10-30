import uuid
import logging
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, Depends, Request

from app.core.database import db
from app.core.config import *
from app.core.security import (
    get_current_user,
)
from app.models.schemas import *

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/doctors")
async def get_doctors(user: dict = Depends(get_current_user)):
    return await db.doctors_list.find({"pharmacy_id": user["user_id"]}, {"_id": 0}).sort("name", 1).to_list(500)

@router.post("/doctors")
async def create_doctor(doctor: DoctorCreate, user: dict = Depends(get_current_user)):
    doctor_data = {"doctor_id": f"doc_{uuid.uuid4().hex[:12]}", "pharmacy_id": user["user_id"], **doctor.dict(), "created_at": datetime.now(timezone.utc).isoformat()}
    await db.doctors_list.insert_one(doctor_data)
    return {k: v for k, v in doctor_data.items() if k != "_id"}

@router.put("/doctors/{doctor_id}")
async def update_doctor(doctor_id: str, request: Request, user: dict = Depends(get_current_user)):
    body = await request.json()
    result = await db.doctors_list.update_one({"doctor_id": doctor_id, "pharmacy_id": user["user_id"]}, {"$set": body})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Medico non trovato")
    return await db.doctors_list.find_one({"doctor_id": doctor_id}, {"_id": 0})

@router.delete("/doctors/{doctor_id}")
async def delete_doctor(doctor_id: str, user: dict = Depends(get_current_user)):
    result = await db.doctors_list.delete_one({"doctor_id": doctor_id, "pharmacy_id": user["user_id"]})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Medico non trovato")
    return {"message": "Medico eliminato"}
