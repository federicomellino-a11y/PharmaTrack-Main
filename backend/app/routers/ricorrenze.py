"""Ricorrenze e richiami: chi torna ogni mese e chi si e' perso.

Due letture e due scritture, niente di piu': i promemoria non creano consegne.
La consegna la prepara il banco dal solito Nuovo rapido, che e' gia' verificato
e conosce la regola dell'indirizzo preso dall'anagrafica. Un `ripeti` che copia
gli importi della volta prima sarebbe comodo e sbagliato (gli importi cambiano).
"""
import logging
from datetime import date, datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.core.database import db
from app.core.fasce import valida_fascia
from app.core.funzioni_pro import richiedi_pro
from app.core.ricorrenze import GIORNI_RICHIAMO, raggruppa, ultimo_ordine_per_cliente

logger = logging.getLogger(__name__)
router = APIRouter()

# Quanto indietro guardare per capire l'ultimo ordine: un anno e mezzo copre
# anche i pazienti veramente spariti senza caricare tutta la collezione.
GIORNI_STORICO = 550


class RicorrenzaIn(BaseModel):
    giorni: int = Field(ge=1, le=365)
    fascia_da: Optional[str] = Field(default=None, max_length=5)
    fascia_a: Optional[str] = Field(default=None, max_length=5)
    attiva: bool = True


def _oggi() -> date:
    return datetime.now(timezone.utc).date()


async def _consegne_recenti(pharmacy_id: str):
    """Solo i tre campi che servono: la lista non deve pesare quanto le consegne."""
    taglio = (_oggi().toordinal() - GIORNI_STORICO)
    taglio_iso = date.fromordinal(taglio).isoformat()
    return await db.deliveries.find(
        {"pharmacy_id": pharmacy_id, "created_at": {"$gte": taglio_iso}},
        {"_id": 0, "customer_id": 1, "created_at": 1, "status": 1},
    ).to_list(20000)


def _soglia_della_farmacia(user: dict) -> int:
    """Quanti giorni di silenzio fanno scattare l'avviso. Default: i 45 di sempre."""
    impostata = (user.get("settings") or {}).get("giorni_pazienti_fermi")
    try:
        valore = int(impostata)
    except (TypeError, ValueError):
        return GIORNI_RICHIAMO
    return valore if 7 <= valore <= 365 else GIORNI_RICHIAMO


@router.get("/ricorrenze")
async def elenco_ricorrenze(giorni: Optional[int] = None, user: dict = Depends(richiedi_pro("ricorrenze"))):
    """Le tre liste del banco: da fare ora, in arrivo, pazienti spariti.

    La soglia dei "pazienti fermi" e' una preferenza della farmacia
    (Impostazioni > Farmacia): se la chiamata non la chiede, vale quella.
    """
    if giorni is None:
        giorni = _soglia_della_farmacia(user)
    if giorni < 7 or giorni > 365:
        raise HTTPException(status_code=422, detail="I giorni del richiamo stanno fra 7 e 365")
    clienti = await db.customers.find(
        {"pharmacy_id": user["user_id"]},
        {"_id": 0, "customer_id": 1, "name": 1, "phone": 1, "address": 1,
         "created_at": 1, "is_active": 1, "ricorrenza_giorni": 1,
         "ricorrenza_da": 1, "ricorrenza_a": 1, "ricorrenza_attiva": 1, "ricorrenza_dal": 1},
    ).to_list(5000)
    consegne = await _consegne_recenti(user["user_id"])
    return raggruppa(clienti, consegne, oggi=_oggi(), giorni_richiamo=giorni)


@router.put("/ricorrenze/{customer_id}")
async def imposta_ricorrenza(customer_id: str, dati: RicorrenzaIn, user: dict = Depends(richiedi_pro("ricorrenze"))):
    """Imposta o modifica la ricorrenza di un paziente."""
    cliente = await db.customers.find_one(
        {"customer_id": customer_id, "pharmacy_id": user["user_id"]}, {"_id": 0, "customer_id": 1}
    )
    if not cliente:
        raise HTTPException(status_code=404, detail="Cliente non trovato")

    try:
        da, a = valida_fascia(dati.fascia_da, dati.fascia_a)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    # La partenza e' l'ultimo ordine: cosi' "ogni 30 giorni" significa 30 giorni
    # dall'ultimo, non 30 giorni da quando qualcuno ha compilato il modulo.
    ultimi = ultimo_ordine_per_cliente(await _consegne_recenti(user["user_id"]))
    base = ultimi.get(customer_id) or _oggi()

    aggiornamento = {
        "ricorrenza_giorni": dati.giorni,
        "ricorrenza_da": da,
        "ricorrenza_a": a,
        "ricorrenza_attiva": bool(dati.attiva),
        "ricorrenza_dal": base.isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.customers.update_one(
        {"customer_id": customer_id, "pharmacy_id": user["user_id"]}, {"$set": aggiornamento}
    )
    return {"customer_id": customer_id, **aggiornamento}


@router.delete("/ricorrenze/{customer_id}")
async def togli_ricorrenza(customer_id: str, user: dict = Depends(richiedi_pro("ricorrenze"))):
    """Spegne la ricorrenza. Il paziente torna a essere un cliente normale."""
    esito = await db.customers.update_one(
        {"customer_id": customer_id, "pharmacy_id": user["user_id"]},
        {"$set": {
            "ricorrenza_attiva": False,
            "ricorrenza_giorni": None,
            "ricorrenza_da": None,
            "ricorrenza_a": None,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }},
    )
    if not esito.matched_count:
        raise HTTPException(status_code=404, detail="Cliente non trovato")
    return {"customer_id": customer_id, "ricorrenza_attiva": False}
