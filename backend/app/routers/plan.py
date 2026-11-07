"""Il piano della farmacia: cosa ha, quanto ha usato, cosa resta.

Un solo GET che la pagina Impostazioni usa per mostrare il piano e i consumi.
Il blocco vero non sta qui: sta nei punti che creano (consegne e fattorini),
perché un limite va fermato dove fa danno, non dove si legge.
"""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends

from app.core.database import db
from app.core.piani import PIANI, piano_corrente, inizio_mese, verifica_consegne, verifica_fattorini
from app.core.security import get_current_user

router = APIRouter()


@router.get("/plan")
async def get_plan(user: dict = Depends(get_current_user)):
    pharmacy_id = user["user_id"]
    farmacia = await db.users.find_one({"user_id": pharmacy_id}, {"_id": 0}) or {}
    piano = piano_corrente(farmacia)

    fattorini = await db.drivers.count_documents({"pharmacy_id": pharmacy_id, "is_active": True})
    consegne_mese = await db.deliveries.count_documents({
        "pharmacy_id": pharmacy_id,
        "created_at": {"$gte": inizio_mese().isoformat()},
    })

    return {
        **piano,
        "uso": {
            "fattorini": fattorini,
            "consegne_mese": consegne_mese,
        },
        "blocchi": {
            "consegne": verifica_consegne(piano, consegne_mese),
            "fattorini": verifica_fattorini(piano, fattorini),
        },
        "catalogo": [
            {
                "piano": chiave,
                "nome": valori["nome"],
                "prezzo_mese": valori["prezzo_mese"],
                "max_fattorini": valori["max_fattorini"],
                "max_consegne_mese": valori["max_consegne_mese"],
            }
            for chiave, valori in PIANI.items()
        ],
        "verificato_il": datetime.now(timezone.utc).isoformat(),
    }
