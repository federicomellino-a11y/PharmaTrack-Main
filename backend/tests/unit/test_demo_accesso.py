"""L'accesso demo non deve tornare a portare credenziali nel browser.

L'11 novembre le credenziali demo stavano nel bundle pubblico. Ora le apre il
server, quindi il frontend non deve contenere ne' la password ne' le variabili
che le leggevano. Il controllo sul file costruito (dist) sta in
`scripts/controlla-segreti.sh`, che gira in CI dopo il build; questo lo anticipa
nel ciclo di sviluppo rapido, sui sorgenti.
"""
from __future__ import annotations

import os

import pytest

# app.core.database legge DB_NAME all'import: nei test unitari non c'e' database,
# servono solo valori finti per poter importare il modulo.
os.environ.setdefault("MONGO_URL", "mongodb://127.0.0.1:27017")
os.environ.setdefault("DB_NAME", "pharmatrack_test")

from app.core.config import DEMO_DRIVER_EMAIL, DEMO_PHARMACY_EMAIL  # noqa: E402
from app.routers.demo import RUOLI, email_demo  # noqa: E402


def test_email_demo_per_ruolo():
    assert email_demo("pharmacy") == DEMO_PHARMACY_EMAIL.strip()
    assert email_demo("driver") == DEMO_DRIVER_EMAIL.strip()


def test_ruolo_sconosciuto_non_apre_niente():
    with pytest.raises(ValueError):
        email_demo("admin")


def test_i_ruoli_sono_solo_farmacia_e_fattorino():
    """La demo non deve poter diventare una porta per altri tipi di account."""
    assert RUOLI == ("pharmacy", "driver")
