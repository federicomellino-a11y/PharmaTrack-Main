"""Staff della stessa farmacia, con accessi separati.

Regola di Federico (7/11): sedi diverse = account diversi, non un unico account
con selettore. Qui c'e' il secondo pezzo: dentro UNA sede, il titolare puo'
dare un accesso proprio a chi lavora al banco, senza prestare la sua password.

Il trucco che evita di toccare venti router: lo staff viene tradotto nel
titolare una volta sola, dentro get_current_user. Da li' in poi tutto il codice
continua a usare user_id come identificativo della farmacia, e i dati restano
quelli del titolare.
"""
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr, Field

from app.core.database import db
from app.core.passwords import hash_password
from app.core.security import richiedi_titolare

router = APIRouter()

RUOLI_STAFF = {
    "operatore": "Operatore al banco",
    "magazzino": "Magazzino e preparazione",
}


class StaffCreate(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    staff_role: str = "operatore"


@router.get("/staff")
async def elenco_staff(user: dict = Depends(richiedi_titolare)):
    membri = await db.users.find(
        {"pharmacy_owner_id": user["user_id"], "role": "staff"},
        {"_id": 0, "password_hash": 0},
    ).to_list(50)
    return [
        {
            "user_id": m.get("user_id"),
            "name": m.get("name"),
            "email": m.get("email"),
            "staff_role": m.get("staff_role") or "operatore",
            "ruolo_leggibile": RUOLI_STAFF.get(m.get("staff_role") or "operatore", "Operatore al banco"),
            "is_active": m.get("is_active", True),
            "created_at": m.get("created_at"),
        }
        for m in membri
    ]


@router.post("/staff", status_code=201)
async def crea_staff(dati: StaffCreate, user: dict = Depends(richiedi_titolare)):
    if dati.staff_role not in RUOLI_STAFF:
        raise HTTPException(status_code=422, detail="Ruolo non riconosciuto")
    email = dati.email.strip().lower()
    if await db.users.find_one({"email": email}, {"_id": 0, "user_id": 1}):
        raise HTTPException(status_code=400, detail="Questa email ha già un accesso")
    if await db.drivers.find_one({"email": email}, {"_id": 0, "driver_id": 1}):
        raise HTTPException(status_code=400, detail="Questa email è già usata da un fattorino")

    nuovo = {
        "user_id": f"stf_{uuid.uuid4().hex[:12]}",
        "email": email,
        "name": dati.name.strip(),
        "role": "staff",
        "staff_role": dati.staff_role,
        "pharmacy_owner_id": user["user_id"],
        "password_hash": hash_password(dati.password),
        "is_active": True,
        "email_verified": True,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.users.insert_one(nuovo)
    return {
        "user_id": nuovo["user_id"],
        "name": nuovo["name"],
        "email": nuovo["email"],
        "staff_role": nuovo["staff_role"],
        "is_active": True,
    }


@router.delete("/staff/{staff_id}")
async def disattiva_staff(staff_id: str, user: dict = Depends(richiedi_titolare)):
    membro = await db.users.find_one(
        {"user_id": staff_id, "pharmacy_owner_id": user["user_id"], "role": "staff"},
        {"_id": 0, "user_id": 1},
    )
    if not membro:
        raise HTTPException(status_code=404, detail="Accesso non trovato")
    await db.users.update_one({"user_id": staff_id}, {"$set": {"is_active": False}})
    # Le sessioni aperte vanno chiuse subito, non alla scadenza naturale.
    await db.user_sessions.delete_many({"user_id": staff_id})
    return {"disattivato": True, "user_id": staff_id}
