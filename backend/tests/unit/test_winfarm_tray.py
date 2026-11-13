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
    # la consegna la crea la scheda, non il programma: niente creazione diretta
    assert "/api/integrations/winfarm/bridge'" not in script
    assert "/api/auth/login" not in script  # il PC non usa la sessione del browser


def test_il_tasto_predefinito_e_ctrl_shift_c():
    script = render_tray_script("https://x.test", "wf_a", "Farmacia")
    assert "Ctrl+Shift+C" in script
    assert "Ctrl+Shift+D" in script  # ripiego


def test_il_file_arriva_con_il_bom():
    contenuto = con_bom("ciao")
    assert contenuto[:3] == b"\xef\xbb\xbf"
    assert contenuto[3:] == b"ciao"


# --- Due indirizzi: il sito e l'API -----------------------------------------

def test_lo_script_conosce_l_indirizzo_dell_api_e_quello_del_sito():
    """Il 6/11 i POST andavano al sito e tornavano 405: devono essere due cose."""
    from app.core.winfarm_tray import render_tray_script
    script = render_tray_script(
        'https://pharmatrack-zeta.vercel.app', 'wf_x', 'Farmacia',
        api_url='https://pharmatrack-api.onrender.com',
    )
    assert "$URL_PRECOMPILATA = 'https://pharmatrack-zeta.vercel.app'" in script
    assert "$API_PRECOMPILATA = 'https://pharmatrack-api.onrender.com'" in script
    assert 'api_url' in script


def test_senza_indirizzo_dell_api_lo_script_non_resta_vuoto():
    from app.core.winfarm_tray import render_tray_script
    script = render_tray_script('https://pharmatrack-api.onrender.com', 'wf_x', 'Farmacia')
    assert "$API_PRECOMPILATA = 'https://pharmatrack-api.onrender.com'" in script


def test_la_configurazione_si_legge_prima_del_tasto():
    """Se si legge dopo, il tasto scelto dall'utente non viene mai applicato."""
    from app.core.winfarm_tray import render_tray_script
    script = render_tray_script('https://a.test', 'wf_x', 'Farmacia')
    lettura = script.index('$script:config = Leggi-Config')
    registrazione = script.index('function Registra-Tasto') if 'function Registra-Tasto' in script else script.index('[Wf.Tasti]::RegisterHotKey($modulo.Handle')
    assert lettura < registrazione


def test_un_aggiornamento_che_non_e_il_programma_viene_scartato():
    from app.core.winfarm_tray import render_tray_script
    script = render_tray_script('https://a.test', 'wf_x', 'Farmacia')
    assert 'Aggiornamento scartato' in script


def test_il_tasto_si_legge_dalla_tastiera_non_dai_messaggi():
    """Il 6/11 la pressione non arrivava: PeekMessage sulla coda del thread non
    vedeva il WM_HOTKEY, che invece va alla finestra. Ora si guarda lo stato."""
    from app.core.winfarm_tray import render_tray_script
    script = render_tray_script('https://a.test', 'wf_x', 'Farmacia')
    assert 'GetAsyncKeyState' in script
    assert 'PeekMessage' not in script
    # scatta sul bordo (una volta per pressione), non a ogni giro del timer
    assert '$script:tastoEraGiu' in script


def test_la_scheda_si_apre_sempre_con_quello_che_si_e_letto():
    """Cliente noto o no, la conferma passa dalla scheda: li' si sceglie l'orario."""
    from app.core.winfarm_tray import render_tray_script
    script = render_tray_script('https://a.test', 'wf_x', 'Farmacia')
    blocco = script[script.index('function Prendi-Vendita'):script.index('function Apri-Dock')]
    assert "origine = 'winfarm'" in blocco
    for campo in ('customer_name', 'amount', 'fiscal_code', 'external_ref', 'pezzi'):
        assert '$parametri.' + campo in blocco
    assert 'Apri-Dock -Parametri $parametri' in blocco
    assert '--window-size=420,640' in script


def test_lo_script_porta_la_versione_che_il_server_si_aspetta():
    """Se le due cifre divergono il programma si riscarica a ogni battito, per sempre."""
    from app.core.winfarm_tray import render_tray_script
    from app.routers.integrations import VERSIONE_PULSANTE
    script = render_tray_script('https://a.test', 'wf_x', 'Farmacia')
    assert f"$VERSIONE = '{VERSIONE_PULSANTE}'" in script
    assert 'Leggi-Parole' in script and 'prodotti_testo' in script
