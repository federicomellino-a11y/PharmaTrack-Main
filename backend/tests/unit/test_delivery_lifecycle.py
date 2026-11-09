"""Test delle regole di vita di una consegna (archivio, ripristino, annullamento).

Sono test puri: nessun database, nessun FastAPI. Coprono i casi in cui un errore
si traduce in soldi sbagliati nei report o in una consegna fantasma per il
fattorino.
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

from app.core.delivery_lifecycle import (  # noqa: E402
    archive_marker,
    build_photo_cleanup,
    build_cancel_updates,
    build_restore_updates,
    can_cancel,
    can_hard_delete,
    can_restore,
    resolve_restore_target,
)

NOW = "2026-11-02T20:00:00+00:00"


def test_consegna_annullata_torna_alla_pronta():
    assert resolve_restore_target({"status": "cancelled", "previous_status": "pronta"}) == "pronta"


def test_consegna_assegnata_riprende_dal_fattorino():
    delivery = {"status": "cancelled", "previous_status": "assigned", "driver_id": "drv_1"}
    assert resolve_restore_target(delivery) == "assigned"


def test_assegnata_senza_fattorino_torna_pronta():
    # Caso reale: il fattorino e' stato cancellato mentre la consegna era in giro.
    delivery = {"status": "cancelled", "previous_status": "in_transit", "driver_id": None}
    assert resolve_restore_target(delivery) == "pronta"


def test_ripristino_di_una_consegnata_torna_pronta_e_azzera_incasso():
    delivery = {
        "status": "delivered",
        "previous_status": None,
        "actual_delivery": "2026-11-02T09:00:00+00:00",
        "cash_confirmed": True,
        "cash_confirmed_at": "2026-11-02T09:05:00+00:00",
    }
    updates = build_restore_updates(delivery, resolve_restore_target(delivery), NOW)
    assert updates["status"] == "pronta"
    assert updates["restored_from_status"] == "delivered"
    # Senza questo azzeramento la consegna resterebbe nei report del periodo
    # e ci tornerebbe una seconda volta quando verra' richiusa.
    assert updates["actual_delivery"] is None
    assert updates["cash_confirmed"] is None
    assert updates["cash_confirmed_at"] is None


def test_annullamento_conserva_lo_stato_precedente():
    updates = build_cancel_updates({"status": "assigned"}, "  cliente assente  ", NOW, "usr_1")
    assert updates["status"] == "cancelled"
    assert updates["previous_status"] == "assigned"
    assert updates["cancellation_reason"] == "cliente assente"
    assert updates["cancelled_by"] == "usr_1"


def test_annullamento_senza_motivo_resta_pulito():
    updates = build_cancel_updates({"status": "pronta"}, "   ", NOW, "usr_1")
    assert updates["cancellation_reason"] is None


def test_non_si_annulla_due_volte():
    assert can_cancel("cancelled") is False
    assert can_cancel("assigned") is True
    # Una consegna incassata o archiviata non si annulla: si ripristina e poi si
    # annulla, se e' proprio il caso. Prima l'elenco diceva il contrario.
    assert can_cancel("delivered") is False
    assert can_cancel("delivered_pending_confirmation") is False
    assert can_cancel("not_delivered") is False


def test_cancellazione_fisica_solo_per_righe_chiuse():
    assert can_hard_delete("cancelled") is True
    assert can_hard_delete("not_delivered") is True
    # Una consegna in giro non si elimina: prima si annulla.
    assert can_hard_delete("assigned") is False
    assert can_hard_delete("delivered") is False


def test_ripristino_ammesso_anche_su_una_consegnata():
    # Prima era rifiutato: segnare consegnata per sbaglio era irreversibile.
    assert can_restore("delivered") is True
    assert can_restore("delivered_pending_confirmation") is True
    assert can_restore("cancelled") is True
    assert can_restore("not_delivered") is True
    assert can_restore("assigned") is False


def test_etichetta_archivio():
    assert archive_marker({"status": "cancelled"}) == "annullata"
    assert archive_marker({"status": "delivered", "restored_at": NOW}) == "ripristinata"
    assert archive_marker({"status": "delivered"}) is None


def test_eliminare_una_consegna_porta_via_le_foto():
    foto = [
        {"photo_id": "photo_1", "cloudinary_public_id": "poddocs/farmacia/1"},
        {"photo_id": "photo_2", "cloudinary_public_id": "poddocs/farmacia/2"},
    ]
    pulizia = build_photo_cleanup(foto)
    assert pulizia["righe"] == 2
    assert pulizia["public_ids"] == ["poddocs/farmacia/1", "poddocs/farmacia/2"]


def test_foto_senza_identificativo_non_blocca_la_cancellazione():
    """Una riga sbagliata non deve impedire di eliminare la consegna."""
    pulizia = build_photo_cleanup([{"photo_id": "photo_1"}, None, {"cloudinary_public_id": "x"}])
    assert pulizia["righe"] == 3
    assert pulizia["public_ids"] == ["x"]


def test_consegna_senza_foto_non_fa_niente():
    assert build_photo_cleanup([]) == {"public_ids": [], "righe": 0}
    assert build_photo_cleanup(None) == {"public_ids": [], "righe": 0}
