"""Staff: il traduttore verso il titolare e la porta chiusa per i non titolari."""
import os

import pytest
from fastapi import HTTPException

os.environ.setdefault("MONGO_URL", "mongodb://127.0.0.1:27017")
os.environ.setdefault("DB_NAME", "pharmatrack_ci")
os.environ.setdefault("JWT_SECRET", "x")
os.environ.setdefault("SECRET_KEY", "x")

from app.core.security import applica_contesto_staff, richiedi_titolare  # noqa: E402


def test_titolare_resta_se_stesso():
    titolare = {"user_id": "user_1", "role": "pharmacy"}
    fuori = applica_contesto_staff(dict(titolare))
    assert fuori["user_id"] == "user_1"
    assert fuori["ruolo_accesso"] == "pharmacy"
    assert "staff_user_id" not in fuori


def test_staff_lavora_sui_dati_del_titolare():
    staff = {
        "user_id": "stf_1",
        "role": "staff",
        "staff_role": "operatore",
        "pharmacy_owner_id": "user_1",
    }
    fuori = applica_contesto_staff(dict(staff))
    # i router leggono user_id come farmacia: deve essere il titolare
    assert fuori["user_id"] == "user_1"
    assert fuori["staff_user_id"] == "stf_1"
    assert fuori["staff_role"] == "operatore"
    assert fuori["ruolo_accesso"] == "staff"
    # il resto del codice non deve accorgersi che era uno staff
    assert fuori["role"] == "pharmacy"


def test_staff_senza_titolare_viene_respinto():
    with pytest.raises(HTTPException) as errore:
        applica_contesto_staff({"user_id": "stf_1", "role": "staff"})
    assert errore.value.status_code == 403


def test_il_titolare_passa_dove_lo_staff_si_ferma():
    import asyncio

    assert asyncio.run(
        richiedi_titolare({"user_id": "user_1", "ruolo_accesso": "pharmacy"})
    )["user_id"] == "user_1"
    with pytest.raises(HTTPException) as errore:
        asyncio.run(
            richiedi_titolare({"user_id": "user_1", "ruolo_accesso": "staff", "staff_user_id": "stf_1"})
        )
    assert errore.value.status_code == 403
    assert "titolare" in errore.value.detail


def test_rotta_staff_registrata():
    """Un router importato ma non montato risponde 404 in produzione: successo."""
    from server import app

    percorsi = {getattr(rotta, "path", "") for rotta in app.routes}
    assert "/api/staff" in percorsi, "il router staff non e' montato in server.py"
