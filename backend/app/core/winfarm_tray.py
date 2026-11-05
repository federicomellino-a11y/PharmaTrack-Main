"""Generazione del pulsante magico (icona + tasto) per il PC della farmacia.

Il file viene servito dal backend con indirizzo e token gia' dentro, come per il
bridge AutoHotkey: il farmacista lo scarica dalla pagina Integrazioni e lo
avvia, senza copiare token a mano ne' chiedere niente a nessuno.

Il modello e' un .ps1 in PowerShell puro: nessuna installazione, nessun motore
OCR da distribuire. Legge i testi che Windows espone all'accessibilita' di
Winfarm e li manda a /api/integrations/winfarm/parse, dove vivono le regole.
"""
from datetime import datetime, timezone

_TEMPLATE = r'''# wf-tray.ps1  --  il pulsante magico di PharmaTrack, versione 1
# Farmacia: @@PHARMACY@@
# Generato: @@GENERATED@@
#
# File gia' configurato: indirizzo e token sono dentro, non serve copiare niente.
#
# Una icona vicino all'orologio e una combinazione di tasti (Ctrl+Shift+C).
# Premi, e la vendita che hai davanti in Winfarm arriva su PharmaTrack gia'
# compilata: cliente, codice fiscale e importo. Nessuna fotografia, nessun
# riconoscimento di lettere: legge i testi che Windows espone all'accessibilita'
# e li manda al server, che e' l'unico posto dove vivono le regole.
#
# Primo avvio: chiede l'indirizzo di PharmaTrack e il token del bridge (li trovi
# in PharmaTrack > Integrazioni > Winfarm). Si salva tutto in
# wf-tray-config.json accanto a questo file.
#
# Per farlo partire da solo col PC: tasto destro sull'icona > "Avvio automatico".
# Per fermarlo: tasto destro sull'icona > Esci.
#
# Non modifica Winfarm e non tocca nessun suo file.
#
# Avvio senza console:
#   powershell -WindowStyle Hidden -ExecutionPolicy Bypass -File wf-tray.ps1

$ErrorActionPreference = 'Stop'

# Windows PowerShell 5.1 parte ancora con TLS 1.0: senza questa riga le
# chiamate al server falliscono con un errore di connessione poco chiaro.
try { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 } catch { }

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type -AssemblyName Microsoft.VisualBasic

try {
    Add-Type -Namespace Wf -Name Dpi -MemberDefinition @'
[DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
'@
    [Wf.Dpi]::SetProcessDPIAware() | Out-Null
} catch { }

Add-Type -Namespace Wf -Name Tasti -MemberDefinition @'
[DllImport("user32.dll", SetLastError = true)]
public static extern bool RegisterHotKey(IntPtr hWnd, int id, uint modificatori, uint vk);

[DllImport("user32.dll", SetLastError = true)]
public static extern bool UnregisterHotKey(IntPtr hWnd, int id);

[DllImport("user32.dll")]
public static extern bool PeekMessage(out MSG messaggio, IntPtr hWnd, uint filtroMin, uint filtroMax, uint rimuovi);

public struct MSG {
    public IntPtr hwnd;
    public uint message;
    public IntPtr wParam;
    public IntPtr lParam;
    public uint time;
    public int x;
    public int y;
}
'@

# Questi due valori li scrive il server quando generi il file dalla pagina
# Integrazioni: cosi' non c'e' niente da copiare a mano al primo avvio. Se il
# file arriva da un'altra parte restano vuoti e il programma li chiede.
$URL_PRECOMPILATA = '@@URL@@'
$TOKEN_PRECOMPILATO = '@@TOKEN@@'

$cartella = Split-Path -Parent $MyInvocation.MyCommand.Path
$percorsoConfig = Join-Path $cartella 'wf-tray-config.json'
$percorsoLog = Join-Path $cartella 'wf-tray-log.txt'
$MOD_CONTROL = 0x0002
$MOD_SHIFT = 0x0004
$MOD_WIN = 0x0008
$MOD_NOREPEAT = 0x4000
$WM_HOTKEY = 0x0312
$ID_TASTO = 9200

# La prima combinazione che il sistema lascia libera vince. Ctrl+Shift+C e' la
# scelta: niente Win (lo prende Windows per Cortana o Copilot) e niente Ctrl+Alt
# (sui tasti italiani AltGr e' Ctrl+Alt e scatterebbe scrivendo la "c" di copyright).
$candidati = @(
    @{ Nome = 'Ctrl+Shift+C'; Mod = ($MOD_CONTROL -bor $MOD_SHIFT -bor $MOD_NOREPEAT); Vk = 0x43 },
    @{ Nome = 'Ctrl+Shift+D'; Mod = ($MOD_CONTROL -bor $MOD_SHIFT -bor $MOD_NOREPEAT); Vk = 0x44 },
    @{ Nome = 'Win+C'; Mod = ($MOD_WIN -bor $MOD_NOREPEAT); Vk = 0x43 }
)

function Scrivi-Log($testo) {
    try {
        ((Get-Date).ToString('yyyy-MM-dd HH:mm:ss') + '  ' + $testo) |
            Out-File -FilePath $percorsoLog -Append -Encoding UTF8
    } catch { }
}

# --- Configurazione ---------------------------------------------------------

function Leggi-Config {
    if (Test-Path $percorsoConfig) {
        try { return Get-Content $percorsoConfig -Raw | ConvertFrom-Json } catch { }
    }
    if ($URL_PRECOMPILATA -and $TOKEN_PRECOMPILATO) {
        $config = [pscustomobject]@{
            base_url = $URL_PRECOMPILATA
            bridge_token = $TOKEN_PRECOMPILATO
        }
        $config | ConvertTo-Json | Out-File -FilePath $percorsoConfig -Encoding UTF8
        return $config
    }
    return $null
}

function Chiedi-Config {
    $url = [Microsoft.VisualBasic.Interaction]::InputBox(
        "Indirizzo di PharmaTrack (lo vedi nella barra del browser):",
        'PharmaTrack - pulsante magico', 'https://pharmatrack-zeta.vercel.app')
    if (-not $url) { return $null }
    $token = [Microsoft.VisualBasic.Interaction]::InputBox(
        "Token del bridge. Lo trovi in PharmaTrack > Integrazioni > Winfarm.",
        'PharmaTrack - pulsante magico', '')
    if (-not $token) { return $null }
    $config = [pscustomobject]@{
        base_url = $url.TrimEnd('/')
        bridge_token = $token.Trim()
    }
    $config | ConvertTo-Json | Out-File -FilePath $percorsoConfig -Encoding UTF8
    return $config
}

# --- Lettura di Winfarm -----------------------------------------------------

function Leggi-Vendita {
    <#
      Restituisce l'elenco dei testi della finestra di vendita. Fra le finestre
      Winfarm si sceglie quella con la vendita aperta: le altre sono pannelli e
      i loro testi confonderebbero il riconoscimento.
    #>
    $radice = [System.Windows.Automation.AutomationElement]::RootElement
    $migliori = @()
    foreach ($proc in (Get-Process | Where-Object {
                $_.MainWindowHandle -ne 0 -and $_.MainWindowTitle -match 'win\s*farm' })) {
        $condizione = New-Object System.Windows.Automation.PropertyCondition(
            [System.Windows.Automation.AutomationElement]::ProcessIdProperty, $proc.Id)
        $finestra = $radice.FindFirst([System.Windows.Automation.TreeScope]::Children, $condizione)
        if (-not $finestra) { continue }
        $testi = New-Object System.Collections.Generic.List[string]
        try {
            $nodi = $finestra.FindAll([System.Windows.Automation.TreeScope]::Descendants,
                [System.Windows.Automation.Condition]::TrueCondition)
            foreach ($nodo in $nodi) {
                try { if ($nodo.Current.Name) { $testi.Add($nodo.Current.Name) } } catch { }
            }
        } catch { }
        $migliori += [pscustomobject]@{
            Testi = $testi
            Vendita = ($testi -contains 'Vendita Aperta')
        }
    }
    if (-not $migliori) { return $null }
    $scelta = $migliori | Sort-Object -Property @{ Expression = { $_.Vendita }; Descending = $true },
                                            @{ Expression = { $_.Testi.Count }; Descending = $true } |
        Select-Object -First 1
    return $scelta.Testi
}

# --- Chiamate al server -----------------------------------------------------

function Chiama-Api($config, $percorso, $corpo) {
    $parametri = @{
        Uri = $config.base_url + $percorso
        Method = 'Post'
        ContentType = 'application/json; charset=utf-8'
        Headers = @{ 'X-Bridge-Token' = $config.bridge_token }
        Body = ($corpo | ConvertTo-Json -Depth 5 -Compress)
        TimeoutSec = 45
        UseBasicParsing = $true
    }
    return Invoke-RestMethod @parametri
}

function Mostra($icona, $titolo, $testo) {
    $iconaTray.ShowBalloonTip(4000, $titolo, $testo, $icona)
    Scrivi-Log ($titolo + ' - ' + $testo)
}

# --- Azione ----------------------------------------------------------------

function Prendi-Vendita {
    $config = $script:config
    if (-not $config) {
        Mostra ([System.Windows.Forms.ToolTipIcon]::Error) 'PharmaTrack' 'Manca la configurazione: riapri il programma.'
        return
    }
    $testi = Leggi-Vendita
    if (-not $testi) {
        Mostra ([System.Windows.Forms.ToolTipIcon]::Warning) 'Winfarm non trovato' 'Apri Winfarm sulla schermata di vendita e riprova.'
        return
    }
    try {
        $letto = Chiama-Api $config '/api/integrations/winfarm/parse' @{ controlli = @($testi) }
    } catch {
        Mostra ([System.Windows.Forms.ToolTipIcon]::Error) 'Server non raggiungibile' $_.Exception.Message
        return
    }
    if (-not $letto.utilizzabile) {
        $motivo = if (-not $letto.campi.cliente) { 'Non ho letto il cliente.' } else { 'Non ho letto il totale.' }
        Mostra ([System.Windows.Forms.ToolTipIcon]::Warning) 'Vendita non riconosciuta' `
            ($motivo + ' Seleziona il cliente in Winfarm e riprova.')
        return
    }
    $pezzi = if ($letto.intestazione.totale_pezzi) { $letto.intestazione.totale_pezzi } else { 1 }
    $corpo = @{
        cliente = $letto.campi.cliente
        importo = $letto.campi.importo
        note = 'Letta da Winfarm (' + $pezzi + ' pezzi)'
    }
    if ($letto.campi.codice_fiscale) { $corpo.codice_fiscale = $letto.campi.codice_fiscale }
    try {
        $creata = Chiama-Api $config '/api/integrations/winfarm/bridge' $corpo
    } catch {
        $errore = $_.Exception.Message
        if ($errore -match '409') {
            Mostra ([System.Windows.Forms.ToolTipIcon]::Info) 'Gia importata' 'Questa vendita e gia su PharmaTrack.'
        } else {
            Mostra ([System.Windows.Forms.ToolTipIcon]::Error) 'Consegna non creata' $errore
        }
        return
    }
    $importo = ('{0:N2}' -f [double]$letto.campi.importo) + ' euro'
    Mostra ([System.Windows.Forms.ToolTipIcon]::Info) 'Consegna pronta' `
        ($letto.campi.cliente + ' - ' + $importo + '. Apri il Dock per completarla.')
}

function Apri-Dock {
    if (-not $script:config) { return }
    $url = $script:config.base_url + '/dock'
    $browser = @(
        "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
        "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
        "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
        "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe"
    ) | Where-Object { Test-Path $_ } | Select-Object -First 1
    if ($browser) {
        Start-Process -FilePath $browser -ArgumentList "--app=$url", '--window-size=380,900'
    } else {
        Start-Process $url
    }
}

function Alterna-AvvioAutomatico {
    $avvio = [Environment]::GetFolderPath('Startup')
    $scorciatoia = Join-Path $avvio 'PharmaTrack pulsante magico.lnk'
    if (Test-Path $scorciatoia) {
        Remove-Item $scorciatoia -Force
        Mostra ([System.Windows.Forms.ToolTipIcon]::Info) 'Avvio automatico' 'Disattivato.'
        return
    }
    $shell = New-Object -ComObject WScript.Shell
    $link = $shell.CreateShortcut($scorciatoia)
    $link.TargetPath = 'powershell.exe'
    $link.Arguments = '-WindowStyle Hidden -ExecutionPolicy Bypass -File "' + (Join-Path $cartella 'wf-tray.ps1') + '"'
    $link.WorkingDirectory = $cartella
    $link.Save()
    Mostra ([System.Windows.Forms.ToolTipIcon]::Info) 'Avvio automatico' 'Attivato: partira da solo col prossimo avvio di Windows.'
}

# --- Interfaccia: icona, menu, tasto ---------------------------------------
#
# La finestra non si vede: serve solo a tenere in vita il ciclo di messaggi di
# Windows, che e' quello che consegna la pressione del tasto e i clic sul menu.

$modulo = New-Object System.Windows.Forms.Form
$modulo.Text = 'PharmaTrack'
$modulo.ShowInTaskbar = $false
$modulo.WindowState = 'Minimized'
$modulo.FormBorderStyle = 'FixedToolWindow'
$modulo.Opacity = 0

# Icona disegnata al volo: croce bianca su fondo verde farmacia.
$disegno = New-Object System.Drawing.Bitmap 32, 32
$penna = [System.Drawing.Graphics]::FromImage($disegno)
$penna.SmoothingMode = 'AntiAlias'
$penna.Clear([System.Drawing.Color]::Transparent)
$verde = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(16, 122, 87))
$penna.FillEllipse($verde, 0, 0, 31, 31)
$bianco = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::White)
$penna.FillRectangle($bianco, 13, 7, 6, 18)
$penna.FillRectangle($bianco, 7, 13, 18, 6)
$penna.Dispose()
$icona = [System.Drawing.Icon]::FromHandle($disegno.GetHicon())

$iconaTray = New-Object System.Windows.Forms.NotifyIcon
$iconaTray.Icon = $icona
$iconaTray.Text = 'PharmaTrack'
$iconaTray.Visible = $true

# --- Tasto globale ---------------------------------------------------------

$tastoScelto = $null
foreach ($candidato in $candidati) {
    if ([Wf.Tasti]::RegisterHotKey($modulo.Handle, $ID_TASTO, [uint32]$candidato.Mod, [uint32]$candidato.Vk)) {
        $tastoScelto = $candidato
        break
    }
}
if (-not $tastoScelto) {
    Scrivi-Log 'Nessuna combinazione di tasti disponibile: resta l icona.'
}

$menu = New-Object System.Windows.Forms.ContextMenuStrip
$vocePrendi = $menu.Items.Add('Prendi la vendita ora (' + $(if ($tastoScelto) { $tastoScelto.Nome } else { 'nessun tasto' }) + ')')
$vocePrendi.Add_Click({ Prendi-Vendita })
$menu.Items.Add('Apri il Dock').Add_Click({ Apri-Dock })
$menu.Items.Add((New-Object System.Windows.Forms.ToolStripSeparator)) | Out-Null
$voceAvvio = $menu.Items.Add('Avvio automatico con Windows')
$voceAvvio.Add_Click({ Alterna-AvvioAutomatico })
$menu.Items.Add('Apri il file di log').Add_Click({ if (Test-Path $percorsoLog) { Start-Process notepad.exe $percorsoLog } })
$menu.Items.Add((New-Object System.Windows.Forms.ToolStripSeparator)) | Out-Null
$menu.Items.Add('Esci').Add_Click({ $iconaTray.Visible = $false; $modulo.Close() })
$iconaTray.ContextMenuStrip = $menu
$iconaTray.add_DoubleClick({ Prendi-Vendita })

# Il timer guarda se e' arrivata la pressione del tasto. Con PowerShell e'
# piu' semplice e solido che intercettare i messaggi di Windows a mano.
$messaggio = New-Object Wf.Tasti+MSG
$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 150
$timer.add_Tick({
        while ([Wf.Tasti]::PeekMessage([ref]$messaggio, [IntPtr]::Zero, 0, 0, 1)) {
            if ($messaggio.message -eq $WM_HOTKEY -and $messaggio.wParam.ToInt64() -eq $ID_TASTO) {
                Prendi-Vendita
            }
        }
    })
$timer.Start()

$modulo.add_Shown({
        $script:config = Leggi-Config
        if (-not $script:config) { $script:config = Chiedi-Config }
        if (-not $script:config) { $modulo.Close(); return }
        $tasto = if ($tastoScelto) { $tastoScelto.Nome } else { 'nessuno' }
        Mostra ([System.Windows.Forms.ToolTipIcon]::Info) 'PharmaTrack pronto' `
            ('Icona attiva. Premi ' + $tasto + ' in Winfarm per prendere la vendita.')
    })

$modulo.add_FormClosing({
        $timer.Stop()
        if ($tastoScelto) { [Wf.Tasti]::UnregisterHotKey($modulo.Handle, $ID_TASTO) | Out-Null }
        $iconaTray.Visible = $false
        $iconaTray.Dispose()
    })

[System.Windows.Forms.Application]::Run($modulo)
'''


def render_tray_script(base_url: str, token: str, pharmacy_name: str) -> str:
    """Restituisce lo script con indirizzo, token e intestazione gia' compilati."""
    return (
        _TEMPLATE.replace("@@URL@@", (base_url or "https://pharmatrack-zeta.vercel.app").rstrip("/"))
        .replace("@@TOKEN@@", token or "")
        .replace("@@PHARMACY@@", (pharmacy_name or "Farmacia").replace("\r", " ").replace("\n", " "))
        .replace("@@GENERATED@@", datetime.now(timezone.utc).strftime("%d/%m/%Y %H:%M UTC"))
    )


def con_bom(testo: str) -> bytes:
    """Aggiunge il BOM: senza, PowerShell 5.1 legge il file in ANSI e sbaglia gli accenti."""
    return ("\ufeff" + testo).encode("utf-8")
