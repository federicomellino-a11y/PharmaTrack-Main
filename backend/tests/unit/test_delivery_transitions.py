"""La sequenza delle fasi di una consegna.

Questi test sono la ragione per cui la tabella sta in delivery_lifecycle: se
qualcuno riapre un passaggio che falsa il fatturato (per esempio "consegnata" ->
"da preparare"), qui si rompe qualcosa prima che arrivi in produzione.
"""

from app.core.delivery_lifecycle import (
    ORIGINI,
    build_consegna_avvenuta,
    normalizza_stato,
    valuta_scrittura,
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
    # Il fattorino dal campo manda "delivered": e' la consegna fatta, e il
    # backend la registra in attesa che la farmacia confermi l'incasso.
    esito = valuta_cambio_stato("in_transit", "delivered", ruolo="fattorino")
    assert esito["ok"]
    assert normalizza_stato("in_transit", "delivered") == "delivered_pending_confirmation"


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

class TestAvanzamentoDallaFarmacia:
    """Le due azioni che il banco usa davvero: "Avvia" e "Consegnata"."""

    def test_da_affidata_la_farmacia_puo_andare_direttamente_in_giro(self):
        assert valuta_cambio_stato("assigned", "in_transit")["ok"] is True

    def test_il_fattorino_resta_sul_passo_singolo(self):
        esito = valuta_cambio_stato("assigned", "in_transit", ruolo="fattorino")
        assert esito["ok"] is False

    def test_delivered_da_una_consegna_in_giro_vale_consegnata_da_incassare(self):
        assert normalizza_stato("in_transit", "delivered") == "delivered_pending_confirmation"
        assert valuta_cambio_stato("in_transit", "delivered")["ok"] is True
        assert valuta_cambio_stato("picked_up", "delivered")["ok"] is True

    def test_dal_fattorino_delivered_e_accolto_come_consegna_fatta(self):
        assert valuta_cambio_stato("in_transit", "delivered", ruolo="fattorino")["ok"] is True

    def test_l_incasso_resta_un_passaggio_suo(self):
        # da "in attesa incasso" delivered e' l'incasso: non si normalizza
        assert normalizza_stato("delivered_pending_confirmation", "delivered") == "delivered"
        assert valuta_cambio_stato("delivered_pending_confirmation", "delivered")["ok"] is True

    def test_un_salto_ancora_illecito_resta_rifiutato(self):
        assert valuta_cambio_stato("da_preparare", "delivered")["ok"] is False

class TestPortaUnica:
    """Ogni gesto che scrive lo stato passa da valuta_scrittura, con la sua regola."""

    def test_la_sequenza_normale_e_quella_della_tabella(self):
        assert valuta_scrittura("pronta", "assigned")["ok"]
        assert not valuta_scrittura("pronta", "in_transit")["ok"]

    def test_annullamento(self):
        assert valuta_scrittura("pronta", "cancelled", origine="annullamento")["ok"]
        assert not valuta_scrittura("delivered", "cancelled", origine="annullamento")["ok"]
        # non si annulla due volte
        assert not valuta_scrittura("cancelled", "cancelled", origine="annullamento")["ok"]

    def test_ripristino(self):
        assert valuta_scrittura("cancelled", "pronta", origine="ripristino")["ok"]
        assert valuta_scrittura("delivered", "assigned", origine="ripristino")["ok"]
        assert not valuta_scrittura("in_transit", "pronta", origine="ripristino")["ok"]
        # un documento vecchio con previous_status "pending" deve potersi riaprire
        assert valuta_scrittura("cancelled", "pending", origine="ripristino")["ok"]

    def test_conferma_incasso(self):
        assert valuta_scrittura("delivered_pending_confirmation", "delivered", origine="conferma_incasso")["ok"]
        assert not valuta_scrittura("in_transit", "delivered", origine="conferma_incasso")["ok"]

    def test_contestazione(self):
        assert valuta_scrittura("delivered", "delivered_pending_confirmation", origine="contestazione")["ok"]
        assert not valuta_scrittura("pronta", "delivered_pending_confirmation", origine="contestazione")["ok"]

    def test_chiusura_turno(self):
        assert valuta_scrittura("delivered_pending_confirmation", "delivered", origine="chiusura_turno")["ok"]
        assert not valuta_scrittura("delivered", "delivered", origine="chiusura_turno")["ok"]

    def test_foto_di_consegna(self):
        assert valuta_scrittura("in_transit", "delivered_pending_confirmation", origine="pod")["ok"]
        assert not valuta_scrittura("pronta", "delivered_pending_confirmation", origine="pod")["ok"]

    def test_fattorino_rimosso(self):
        assert valuta_scrittura("in_transit", "pronta", origine="fattorino_rimosso")["ok"]
        assert not valuta_scrittura("delivered", "pronta", origine="fattorino_rimosso")["ok"]

    def test_ogni_origine_e_dichiarata(self):
        assert valuta_scrittura("pronta", "assigned", origine="inventata")["ok"] is False


def test_nessun_router_inventa_un_origine():
    """Un gesto nuovo che scrive lo stato deve passare di qui, non avere una sua via."""
    from pathlib import Path

    radice = Path(__file__).resolve().parents[2] / "app" / "routers"
    sorgenti = {p.name: p.read_text() for p in radice.glob("*.py")}
    for origine in ORIGINI:
        if origine == "aggiornamento":
            continue
        usi = [nome for nome, testo in sorgenti.items() if f'origine="{origine}"' in testo]
        assert len(usi) <= 1, f"origine {origine} dichiarata in {usi}"


def test_l_orario_di_consegna_si_scrive_quando_il_pacco_arriva():
    """Anche in attesa di incasso: e' l'arrivo, non l'incasso, a datare la consegna."""
    adesso = "2026-11-09T21:30:00+00:00"
    assert build_consegna_avvenuta("delivered_pending_confirmation", adesso) == {"actual_delivery": adesso}
    assert build_consegna_avvenuta("delivered", adesso) == {"actual_delivery": adesso}
    assert build_consegna_avvenuta("in_transit", adesso) == {}
    assert build_consegna_avvenuta("pronta", adesso) == {}


def test_l_orario_di_consegna_non_si_sovrascrive():
    adesso = "2026-11-09T21:30:00+00:00"
    consegna = {"actual_delivery": "2026-11-09T18:00:00+00:00"}
    assert build_consegna_avvenuta("delivered", adesso, consegna) == {}
