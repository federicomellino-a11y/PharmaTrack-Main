"""La demo non deve tornare.

Il 13 novembre 2026 la demo e' stata tolta del tutto: i due pulsanti della
pagina iniziale, `POST /api/auth/demo`, le variabili `DEMO_*` e i due account
(`test@farmaciaprova.it`, `luca@fattorino.it`). Non era solo una vetrina: quel
tenant era raggiungibile da chiunque senza credenziali.

Questa e' la guardia del ciclo rapido. Gli altri due strati: il bundle lo
controlla `scripts/controlla-segreti.sh --dist`, e la produzione la controlla
`.github/scripts/verifica_produzione.py`, che pretende 404 su `/api/auth/demo`.
"""
from __future__ import annotations

import importlib
import os
from pathlib import Path

import pytest

# app.core.database legge DB_NAME all'import: nei test unitari non c'e' database.
os.environ.setdefault("MONGO_URL", "mongodb://127.0.0.1:27017")
os.environ.setdefault("DB_NAME", "pharmatrack_test")

RADICE = Path(__file__).resolve().parents[3]


def test_il_router_demo_non_esiste_piu():
    with pytest.raises(ModuleNotFoundError):
        importlib.import_module("app.routers.demo")


def test_la_config_non_conosce_piu_gli_account_demo():
    from app.core import config

    assert [nome for nome in dir(config) if nome.startswith("DEMO_")] == []


def test_il_server_non_monta_la_demo():
    sorgente = (RADICE / "backend" / "server.py").read_text(encoding="utf-8")
    assert "demo" not in sorgente.lower()


def test_la_landing_non_offre_la_demo():
    landing = (RADICE / "frontend" / "src" / "pages" / "LandingPage.jsx").read_text(encoding="utf-8")
    assert "/auth/demo" not in landing
    assert "demo-pharmacy-btn" not in landing
    assert "demo-driver-btn" not in landing
