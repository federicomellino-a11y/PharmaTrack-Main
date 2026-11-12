"""Protezioni di fase 2: reset password a tentativi limitati, CORS obbligatorio in produzione."""
from __future__ import annotations

import os

import pytest

os.environ.setdefault("MONGO_URL", "mongodb://127.0.0.1:27017")
os.environ.setdefault("DB_NAME", "pharmatrack_test")

from fastapi.testclient import TestClient  # noqa: E402

from _finto_db import FintoDb  # noqa: E402
from app.core.security_middleware import origini_per_ambiente  # noqa: E402


def test_in_produzione_senza_cors_origins_non_si_parte():
    for valore in (None, "", "  ", "*"):
        with pytest.raises(RuntimeError, match="CORS_ORIGINS"):
            origini_per_ambiente(valore, produzione=True)


def test_in_produzione_con_l_elenco_si_parte():
    assert origini_per_ambiente("https://pharmatrack.vercel.app/, https://pharmatrack.app",
                                produzione=True) == ["https://pharmatrack.vercel.app", "https://pharmatrack.app"]


def test_in_sviluppo_senza_elenco_resta_aperto():
    assert origini_per_ambiente(None, produzione=False) is None


def test_il_reset_password_si_ferma_dopo_troppi_tentativi(monkeypatch):
    import server
    from app.core.config import RESET_RATE_LIMIT
    from app.core.limiter import limiter
    from app.routers import pharmacy_auth

    monkeypatch.setattr(pharmacy_auth, "db", FintoDb())
    monkeypatch.setattr(limiter, "enabled", True)
    limiter.reset()
    client = TestClient(server.app)
    ammessi = int(RESET_RATE_LIMIT.split("/")[0])
    intestazioni = {"x-forwarded-for": "203.0.113.77"}
    codici = [client.post("/api/auth/reset-password", headers=intestazioni,
                          json={"token": f"falso{i}", "new_password": "Password123!"}).status_code
              for i in range(ammessi + 1)]
    assert codici[:ammessi] == [400] * ammessi
    assert codici[-1] == 429
    limiter.reset()
