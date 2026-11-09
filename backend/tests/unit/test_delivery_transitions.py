"""La sequenza delle fasi di una consegna.

Questi test sono la ragione per cui la tabella sta in delivery_lifecycle: se
qualcuno riapre un passaggio che falsa il fatturato (per esempio "consegnata" ->
"da preparare"), qui si rompe qualcosa prima che arrivi in produzione.
"""

from app.core.delivery_lifecycle import (
    TRANSIZIONI,
    TRANSIZIONI_FATTORINO,
    build_force_updates,
    build_phase_updates,
    stati_successivi,
    valuta_cambio_stato,
)


def test_la_sequenza_completa_e_ammessa_una_fase_alla_volta():
    sequenza = ["da_preparare", "pronta", "assigned", "picked_up", "in_transit",
                "delivered_pending_confirmation", "delivered"]
    for attuale, prossimo in zip(sequenza, sequenza[1:]):
        esito = valuta_cambio_stato(attuale, prossimo)
        assert esito["ok"], f"{attuale} -> {prossimo} dovrebbe essere ammesso"
        assert not esito["forzato"]


def test_lo_stesso_stato_non_e_un_errore():
    esito = valuta_cambio_stato("pronta", "pronta")
    assert esito["ok"] and not esito["forzato"]


def test_annullare_e_possibile_finche_la_consegna_e_viva():
    for stato in ("da_preparare", "pending", "pronta", "assigned", "picked_up", "in_transit"):
        assert valuta_cambio_stato(stato, "cancelled")["ok"], stato


def test_da_chiusa_non_si_torna_indietro_senza_forzare():
    for stato in ("delivered", "cancelled", "not_delivered"):
        esito = valuta_cambio_stato(stato, "da_preparare")
        assert not esito["ok"]
        assert "non previsto" in esito["errore"]
        assert "force=true" in esito["errore"]


def test_la_farmacia_puo_forzare_ma_solo_con_un_motivo():
    senza_motivo = valuta_cambio_stato("delivered", "da_preparare", forzato=True)
    assert not senza_motivo["ok"]
    assert "motivo" in senza_motivo["errore"]

    con_motivo = valuta_cambio_stato("delivered", "da_preparare", forzato=True, motivo="errore di selezione")
    assert con_motivo["ok"] and con_motivo["forzato"]


def test_il_fattorino_non_puo_forzare():
    esito = valuta_cambio_stato("assigned", "delivered_pending_confirmation", ruolo="fattorino",
                                forzato=True, motivo="ho fretta")
    assert not esito["ok"]
    assert "fattorino" in esito["errore"]


def test_il_fattorino_avanza_solo_il_giro():
    assert valuta_cambio_stato("assigned", "picked_up", ruolo="fattorino")["ok"]
    assert valuta_cambio_stato("picked_up", "in_transit", ruolo="fattorino")["ok"]
    assert valuta_cambio_stato("in_transit", "delivered_pending_confirmation", ruolo="fattorino")["ok"]
    # non puo' saltare il ritiro ne' incassare
    assert not valuta_cambio_stato("assigned", "in_transit", ruolo="fattorino")["ok"]
    assert not valuta_cambio_stato("in_transit", "delivered", ruolo="fattorino")["ok"]


def test_ogni_stato_della_tabella_e_uno_stato_vero():
    veri = set(TRANSIZIONI) | {"created"}
    for da, destinazioni in TRANSIZIONI.items():
        for a in destinazioni:
            assert a in TRANSIZIONI, f"{da} porta a uno stato sconosciuto: {a}"
    for da, destinazioni in TRANSIZIONI_FATTORINO.items():
        assert da in veri, da
        for a in destinazioni:
            assert a in TRANSIZIONI, a


def test_ogni_fase_ha_il_suo_orario():
    attesi = {
        "pronta": "pronta_at",
        "assigned": "assigned_at",
        "picked_up": "picked_up_at",
        "in_transit": "departed_at",
        "delivered_pending_confirmation": "delivered_by_driver_at",
        "delivered": "confirmed_at",
    }
    for stato, campo in attesi.items():
        assert build_phase_updates(stato, "2026-11-09T18:00:00+00:00") == {campo: "2026-11-09T18:00:00+00:00"}
    # gli stati senza fase non toccano niente
    for stato in ("da_preparare", "cancelled", "not_delivered", "pending"):
        assert build_phase_updates(stato, "x") == {}


def test_la_correzione_lascia_il_segno():
    segni = build_force_updates("  doppio click  ", "2026-11-09T18:00:00+00:00", "ph_1")
    assert segni["status_forced_reason"] == "doppio click"
    assert segni["status_forced_by"] == "ph_1"
    assert segni["status_forced_at"] == "2026-11-09T18:00:00+00:00"


def test_gli_stati_successivi_dipendono_dal_ruolo():
    assert "picked_up" in stati_successivi("pronta")
    assert "picked_up" not in stati_successivi("pronta", ruolo="fattorino")
    assert stati_successivi("stato_inventato") == ()
