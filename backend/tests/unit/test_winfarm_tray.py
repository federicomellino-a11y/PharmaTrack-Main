"""Il pulsante magico scaricato dalla pagina Integrazioni deve arrivare pronto.

Il file parte gia' con indirizzo e token dentro: se il segnaposto restasse nel
testo, il farmacista si troverebbe un programma che non sa dove chiamare, e se
il BOM mancasse PowerShell 5.1 leggerebbe il file in ANSI sbagliando gli
accenti nei messaggi.
"""
from app.core.winfarm_tray import con_bom, render_tray_script


def test_indirizzo_e_token_finiscono_nel_file():
    script = render_tray_script("https://pharmatrack-zeta.vercel.app", "wf_prova123", "Farmacia Mellino")
    assert "https://pharmatrack-zeta.vercel.app" in script
    assert "wf_prova123" in script
    assert "Farmacia Mellino" in script


def test_non_resta_nessun_segnaposto():
    script = render_tray_script("https://x.test", "wf_a", "Farmacia")
    for segnaposto in ("@@URL@@", "@@TOKEN@@", "@@PHARMACY@@", "@@GENERATED@@"):
        assert segnaposto not in script


def test_l_indirizzo_perde_la_barra_finale():
    script = render_tray_script("https://x.test/", "wf_a", "Farmacia")
    assert "https://x.test/'" not in script
    assert "https://x.test'" in script


def test_token_vuoto_non_lascia_righe_rotte():
    script = render_tray_script("https://x.test", "", "Farmacia")
    assert "wf_" not in script.split("$TOKEN_PRECOMPILATO")[1][:40]


def test_il_programma_parla_con_gli_endpoint_giusti():
    script = render_tray_script("https://x.test", "wf_a", "Farmacia")
    assert "/api/integrations/winfarm/parse" in script
    assert "/api/integrations/winfarm/bridge" in script
    assert "/api/auth/login" not in script  # il PC non usa la sessione del browser


def test_il_tasto_predefinito_e_ctrl_shift_c():
    script = render_tray_script("https://x.test", "wf_a", "Farmacia")
    assert "Ctrl+Shift+C" in script
    assert "Ctrl+Shift+D" in script  # ripiego


def test_il_file_arriva_con_il_bom():
    contenuto = con_bom("ciao")
    assert contenuto[:3] == b"\xef\xbb\xbf"
    assert contenuto[3:] == b"ciao"
