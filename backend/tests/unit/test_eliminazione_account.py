"""'Elimina account' cancella tutto cio' che appartiene alla farmacia, e niente altro.

Fino all'11 novembre 2026 restavano foto delle consegne, conversazioni, turni,
registro modifiche e token di reset: per il GDPR l'eliminazione deve essere completa.
"""
from __future__ import annotations

import os

import pytest

os.environ.setdefault("MONGO_URL", "mongodb://127.0.0.1:27017")
os.environ.setdefault("DB_NAME", "pharmatrack_test")

from _finto_db import FintoDb  # noqa: E402


def _semina(db, uid, drv):
    db.users.docs.append({"user_id": uid})
    db.user_sessions.docs.append({"user_id": uid, "session_token": f"s_{uid}"})
    db.drivers.docs.append({"driver_id": drv, "pharmacy_id": uid})
    db.driver_sessions.docs.append({"driver_id": drv, "session_token": f"d_{drv}"})
    for nome in ("deliveries", "customers", "notes", "doctors_list", "useful_numbers",
                 "messages", "chat_threads", "driver_shifts", "audit_log",
                 "delivery_photos", "photo_files"):
        db[nome].docs.append({"pharmacy_id": uid})
    db.delivery_photos.docs[-1]["cloudinary_public_id"] = f"pharmatrack/{uid}/del_1"
    db["pod_photos.files"].docs.append({"_id": f"grid_{uid}", "metadata": {"pharmacy_id": uid}})
    db.notifications.docs += [{"user_id": uid}, {"user_id": drv}]
    db.push_subscriptions.docs += [{"user_id": uid, "user_type": "pharmacy"}, {"user_id": drv, "user_type": "driver"}]
    db.password_reset_tokens.docs.append({"user_id": uid})
    db.email_verifications.docs.append({"user_id": uid})


@pytest.mark.anyio
async def test_non_resta_niente_della_farmacia_e_l_altra_resta_intatta(monkeypatch):
    import motor.motor_asyncio
    from app.core import security
    from app.core.cloudinary_client import PhotoManager

    db = FintoDb()
    monkeypatch.setattr(security, "db", db)
    rimosse_cloud, rimossi_grid = [], []

    async def _cancella_foto(public_id, pharmacy_id):
        rimosse_cloud.append((public_id, pharmacy_id))
        return True

    class _Bucket:
        def __init__(self, *_a, **_k):
            pass

        async def delete(self, file_id):
            rimossi_grid.append(file_id)
            await db["pod_photos.files"].delete_one({"_id": file_id})

    monkeypatch.setattr(PhotoManager, "delete_delivery_photo", staticmethod(_cancella_foto))
    monkeypatch.setattr(motor.motor_asyncio, "AsyncIOMotorGridFSBucket", _Bucket)

    _semina(db, "user_a", "drv_a")
    _semina(db, "user_b", "drv_b")
    prima_b = {n: [d for d in docs if "user_b" in str(d) or "drv_b" in str(d)]
               for n, docs in db.collezioni_non_vuote().items()}

    await security.delete_pharmacy_account_data("user_a")

    residui = {n: docs for n, docs in db.collezioni_non_vuote().items()
               if any("user_a" in str(d) or "drv_a" in str(d) for d in docs)}
    assert residui == {}
    assert db.collezioni_non_vuote() == prima_b
    assert rimosse_cloud == [("pharmatrack/user_a/del_1", "user_a")]
    assert rimossi_grid == ["grid_user_a"]


@pytest.fixture
def anyio_backend():
    return "asyncio"
