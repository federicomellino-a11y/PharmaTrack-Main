"""Generazione del pulsante magico (icona + tasto) per il PC della farmacia.

Il file viene servito dal backend con indirizzo e token gia' dentro, come per il
bridge AutoHotkey: il farmacista lo scarica dalla pagina Integrazioni e lo
avvia, senza copiare token a mano ne' chiedere niente a nessuno.

Il modello e' un .ps1 in PowerShell puro: nessuna installazione, nessun motore
OCR da distribuire. Legge i testi che Windows espone all'accessibilita' di
Winfarm e li manda a /api/integrations/winfarm/parse, dove vivono le regole.
"""
from datetime import datetime, timezone

# La stessa cifra sta in integrations.py (VERSIONE_PULSANTE): qui la importo per
# non averne due copie. Se il router non e' importabile (script isolato) resta 2.
try:
    from app.routers.integrations import VERSIONE_PULSANTE
except Exception:  # pragma: no cover - solo per esecuzioni isolate
    VERSIONE_PULSANTE = 4

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
public static extern short GetAsyncKeyState(int vk);
'@

# Questi due valori li scrive il server quando generi il file dalla pagina
# Integrazioni: cosi' non c'e' niente da copiare a mano al primo avvio. Se il
# file arriva da un'altra parte restano vuoti e il programma li chiede.
$URL_PRECOMPILATA = '@@URL@@'
# L'API sta su un indirizzo diverso dal sito: le chiamate vanno fatte a lei,
# i link (/dock, /quick) al sito. Confonderli e' il motivo per cui il 6/11 il
# programma ha risposto 405 per ore: mandava i POST a Vercel, che non li accetta.
$API_PRECOMPILATA = '@@API@@'
$TOKEN_PRECOMPILATO = '@@TOKEN@@'

# Versione di questo file. Il server la confronta col battito e, se e' vecchia,
# prepara l'aggiornamento: nessuno deve riscaricare niente a mano.
$VERSIONE = '@@VERSION@@'

$cartella = Split-Path -Parent $MyInvocation.MyCommand.Path
$script:percorsoScript = $MyInvocation.MyCommand.Path
$percorsoConfig = Join-Path $cartella 'wf-tray-config.json'
$percorsoLog = Join-Path $cartella 'wf-tray-log.txt'
$MOD_CONTROL = 0x0002
$MOD_ALT = 0x0001
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

function Combinazione($testo) {
    <#
      Traduce "Ctrl+Shift+C" in una combinazione vera per Windows. Serve a chi
      vuole un tasto diverso: si scrive nel file di configurazione e il
      programma lo usa, senza ricompilare niente.
      Se la scrittura non si capisce torna $null e valgono i tasti predefiniti.
    #>
    if (-not $testo) { return $null }
    $pezzi = @($testo -split '\+' | ForEach-Object { $_.Trim() } | Where-Object { $_ })
    if ($pezzi.Count -lt 2) { return $null }
    $mod = 0
    $nome = @()
    foreach ($pezzo in $pezzi[0..($pezzi.Count - 2)]) {
        switch -Regex ($pezzo.ToLower()) {
            '^ctrl$|^control$' { $mod = $mod -bor $MOD_CONTROL; $nome += 'Ctrl' }
            '^shift$|^maiusc$|^maiuscolo$' { $mod = $mod -bor $MOD_SHIFT; $nome += 'Shift' }
            '^alt$' { $mod = $mod -bor $MOD_ALT; $nome += 'Alt' }
            '^win$|^windows$' { $mod = $mod -bor $MOD_WIN; $nome += 'Win' }
            default { return $null }
        }
    }
    $tasto = $pezzi[-1].ToUpper()
    $codice = 0
    if ($tasto -match '^[A-Z0-9]$') {
        $codice = [int][char]$tasto
    } elseif ($tasto -match '^F([1-9]|1[0-9]|2[0-4])$') {
        # F1..F24: sono i tasti che Windows chiama 0x70 e seguenti
        $codice = 0x70 + ([int]$tasto.Substring(1) - 1)
    } else {
        return $null
    }
    return @{
        Nome = (($nome + $tasto) -join '+')
        Mod = ($mod -bor $MOD_NOREPEAT)
        Vk = $codice
    }
}

function Leggi-Config {
    if (Test-Path $percorsoConfig) {
        $letto = $null
        try { $letto = Get-Content $percorsoConfig -Raw | ConvertFrom-Json } catch { }
        if ($letto) {
            # Chi ha il file scritto da una versione vecchia non ha api_url: glielo
            # aggiungo qui, altrimenti le chiamate continuano ad andare al sito.
            if (-not $letto.api_url) {
                $letto | Add-Member -NotePropertyName api_url -NotePropertyValue $(if ($API_PRECOMPILATA) { $API_PRECOMPILATA } else { $letto.base_url }) -Force
                try { $letto | ConvertTo-Json | Out-File -FilePath $percorsoConfig -Encoding UTF8 } catch { }
                Scrivi-Log ('Indirizzo dell API aggiunto alla configurazione: ' + $letto.api_url)
            }
            return $letto
        }
    }
    if ($URL_PRECOMPILATA -and $TOKEN_PRECOMPILATO) {
        $config = [pscustomobject]@{
            base_url = $URL_PRECOMPILATA
            api_url = $API_PRECOMPILATA
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
    $api = [Microsoft.VisualBasic.Interaction]::InputBox(
        "Indirizzo del server (quello che finisce in .onrender.com):",
        'PharmaTrack - pulsante magico', 'https://pharmatrack-api.onrender.com')
    if (-not $api) { return $null }
    $token = [Microsoft.VisualBasic.Interaction]::InputBox(
        "Token del bridge. Lo trovi in PharmaTrack > Integrazioni > Winfarm.",
        'PharmaTrack - pulsante magico', '')
    if (-not $token) { return $null }
    $config = [pscustomobject]@{
        base_url = $url.TrimEnd('/')
        api_url = $api.TrimEnd('/')
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
        Uri = $(if ($config.api_url) { $config.api_url } else { $config.base_url }) + $percorso
        Method = 'Post'
        ContentType = 'application/json; charset=utf-8'
        Headers = @{ 'X-Bridge-Token' = $config.bridge_token }
        Body = ($corpo | ConvertTo-Json -Depth 5 -Compress)
        TimeoutSec = 45
        UseBasicParsing = $true
    }
    return Invoke-RestMethod @parametri
}

function Invia-Battito($config) {
    <#
      Una chiamata ogni cinque minuti, in silenzio:
      - dice al server che questo PC e' vivo (lo stato in pagina diventa un
        fatto invece di un indovinello);
      - chiede se la versione e' vecchia, e se lo e' si porta a casa la nuova.
    #>
    try {
        $risposta = Chiama-Api $config '/api/integrations/winfarm/heartbeat' @{
            versione = $VERSIONE
            host = $env:COMPUTERNAME
        }
        if ($risposta.aggiorna) { Scarica-Aggiornamento $config }
    } catch {
        # Rete giu' o server fermo: non si dice niente al banco, si riprova.
        Scrivi-Log ('Battito non riuscito: ' + $_.Exception.Message)
    }
}

function Scarica-Aggiornamento($config) {
    <#
      Scarica la versione nuova accanto al file in uso, senza toccarlo: quella
      in esecuzione deve continuare a funzionare. Al prossimo avvio il file
      nuovo prende il posto del vecchio.
    #>
    try {
        $percorsoNuovo = $script:percorsoScript + '.new'
        $parametri = @{
            Uri = $(if ($config.api_url) { $config.api_url } else { $config.base_url }) + '/api/integrations/winfarm/tray/download'
            Headers = @{ 'X-Bridge-Token' = $config.bridge_token }
            OutFile = $percorsoNuovo
            TimeoutSec = 60
            UseBasicParsing = $true
        }
        Invoke-WebRequest @parametri | Out-Null
        # Solo un file che e' davvero il programma puo' sostituirlo: se al posto
        # dello script arriva una pagina web (indirizzo sbagliato, portale, errore)
        # il file scaricato va buttato, altrimenti al riavvio non parte piu' niente.
        $testo = Get-Content $percorsoNuovo -Raw
        if (-not $testo -or $testo -notmatch 'PharmaTrack' -or $testo -notmatch 'ID_TASTO') {
            Remove-Item $percorsoNuovo -Force
            Scrivi-Log 'Aggiornamento scartato: il file scaricato non e il programma.'
            return
        }
        if ((Get-Item $percorsoNuovo).Length -lt 2000) {
            Remove-Item $percorsoNuovo -Force
            return
        }
        Mostra ([System.Windows.Forms.ToolTipIcon]::Info) 'Aggiornamento pronto' `
            'Al prossimo avvio il pulsante magico si aggiorna da solo.'
    } catch {
        Scrivi-Log ('Aggiornamento non scaricato: ' + $_.Exception.Message)
    }
}

function Applica-Aggiornamento {
    <#
      Se accanto al file c'e' una versione .new, questa prende il posto di
      quella in uso e il programma riparte: l'utente vede solo l'icona tornare.
      PowerShell legge lo script in memoria all'avvio, quindi il file si puo'
      sostituire mentre gira.
    #>
    $percorsoNuovo = $script:percorsoScript + '.new'
    if (-not (Test-Path $percorsoNuovo)) { return $false }
    try {
        if ((Get-Item $percorsoNuovo).Length -lt 2000) { Remove-Item $percorsoNuovo -Force; return $false }
        $copia = $script:percorsoScript + '.old'
        if (Test-Path $copia) { Remove-Item $copia -Force -ErrorAction SilentlyContinue }
        Move-Item -Path $script:percorsoScript -Destination $copia -Force
        Move-Item -Path $percorsoNuovo -Destination $script:percorsoScript -Force
        Start-Process -FilePath 'powershell.exe' -ArgumentList @(
            '-WindowStyle', 'Hidden', '-ExecutionPolicy', 'Bypass', '-File', ('"' + $script:percorsoScript + '"')
        ) | Out-Null
        Scrivi-Log 'Aggiornamento applicato, riavvio'
        return $true
    } catch {
        Scrivi-Log ('Aggiornamento non applicato: ' + $_.Exception.Message)
        return $false
    }
}

function Stato-Errore($errore) {
    try { return [int]$errore.Exception.Response.StatusCode } catch { return 0 }
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
    # La scheda si apre sempre: quello che Winfarm sa (cliente, codice fiscale,
    # importo, scontrino) arriva gia' scritto, quello che non sa (orario,
    # pagamento) lo sceglie la farmacia prima di confermare.
    $parametri = @{ origine = 'winfarm' }
    if ($letto.campi.cliente) { $parametri.customer_name = $letto.campi.cliente }
    if ($letto.campi.importo) { $parametri.amount = $letto.campi.importo }
    if ($letto.campi.codice_fiscale) { $parametri.fiscal_code = $letto.campi.codice_fiscale }
    if ($letto.intestazione.riferimento) { $parametri.external_ref = $letto.intestazione.riferimento }
    if ($letto.intestazione.totale_pezzi) { $parametri.pezzi = $letto.intestazione.totale_pezzi }
    Apri-Dock -Parametri $parametri
}

function Apri-Dock {
    <#
      Apre il Dock; con -Parametri apre la finestra di inserimento gia'
      compilata (usata quando il cliente non e' in anagrafica: li' si sceglie
      il cliente giusto o lo si crea con l'indirizzo, che e' l'unica cosa che
      il programma non puo' sapere).
    #>
    param([hashtable]$Parametri = @{})
    if (-not $script:config) { return }
    $url = $script:config.base_url + '/dock'
    if ($Parametri.Count -gt 0) {
        $coda = ($Parametri.GetEnumerator() | Where-Object { $_.Value } | ForEach-Object {
            [uri]::EscapeDataString($_.Key) + '=' + [uri]::EscapeDataString([string]$_.Value)
        }) -join '&'
        if ($coda) { $url = $script:config.base_url + '/quick?' + $coda }
    }
    $browser = @(
        "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
        "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
        "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
        "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe"
    ) | Where-Object { Test-Path $_ } | Select-Object -First 1
    if ($browser) {
        Start-Process -FilePath $browser -ArgumentList "--app=$url", $(if ($Parametri.Count -gt 0) { '--window-size=420,640' } else { '--window-size=380,900' })
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

# La configurazione va letta prima di registrare il tasto: leggendola dopo,
# il tasto scelto dall'utente non veniva mai applicato (6/11: Alt+Shift+C salvato
# e mai usato, restava Ctrl+Shift+C).
$script:config = Leggi-Config
if (-not $script:config) { $script:config = Chiedi-Config }
if (-not $script:config) { $modulo.Close(); return }

$tastoScelto = $null
$candidatiDaProvare = @()
if ($script:config -and $script:config.tasto) {
    $preferito = Combinazione $script:config.tasto
    if ($preferito) { $candidatiDaProvare += $preferito }
    else { Scrivi-Log ('Tasto non riconosciuto nel file di configurazione: ' + $script:config.tasto) }
}
$candidatiDaProvare += $candidati

foreach ($candidato in $candidatiDaProvare) {
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
$menu.Items.Add('Cambia tasto...').Add_Click({
        if (-not $script:config) { return }
        $attuale = if ($script:config.tasto) { $script:config.tasto } else { 'Ctrl+Shift+C' }
        $nuovo = [Microsoft.VisualBasic.Interaction]::InputBox(
            'Scrivi la combinazione, per esempio Ctrl+Shift+C oppure Alt+F9.',
            'Quale tasto vuoi usare?', $attuale)
        if (-not $nuovo) { return }
        if (-not (Combinazione $nuovo)) {
            Mostra ([System.Windows.Forms.ToolTipIcon]::Warning) 'Tasto non valido' `
                'Servono almeno un modificatore e una lettera, per esempio Ctrl+Shift+C.'
            return
        }
        $script:config | Add-Member -NotePropertyName tasto -NotePropertyValue $nuovo -Force
        $script:config | ConvertTo-Json | Out-File -FilePath $percorsoConfig -Encoding UTF8
        Mostra ([System.Windows.Forms.ToolTipIcon]::Info) 'Tasto salvato' `
            ('Riavvia il pulsante magico per usare ' + $nuovo + '.')
    })
$menu.Items.Add((New-Object System.Windows.Forms.ToolStripSeparator)) | Out-Null
$voceAvvio = $menu.Items.Add('Avvio automatico con Windows')
$voceAvvio.Add_Click({ Alterna-AvvioAutomatico })
$menu.Items.Add('Apri il file di log').Add_Click({ if (Test-Path $percorsoLog) { Start-Process notepad.exe $percorsoLog } })
$menu.Items.Add((New-Object System.Windows.Forms.ToolStripSeparator)) | Out-Null
$menu.Items.Add('Esci').Add_Click({ $iconaTray.Visible = $false; $modulo.Close() })
$iconaTray.ContextMenuStrip = $menu
$iconaTray.add_DoubleClick({ Prendi-Vendita })

# Il tasto si legge dallo stato dei tasti, non dai messaggi di Windows.
# Con RegisterHotKey il messaggio esiste, ma arrivava alla finestra e non alla
# coda del thread, quindi il vecchio controllo non lo vedeva mai: menu' si',
# tasto no (6/11 in farmacia). GetAsyncKeyState guarda la tastiera vera, quindi
# funziona comunque, anche se un altro programma si e' prenotato la combinazione.
$script:tastoEraGiu = $false
$script:ultimaPressione = [datetime]::MinValue
$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 100
$timer.add_Tick({
        if (-not $tastoScelto) { return }
        $mod = [int]$tastoScelto.Mod
        $giu = (([int][Wf.Tasti]::GetAsyncKeyState([int]$tastoScelto.Vk)) -band 0x8000) -ne 0
        if ($giu -and ($mod -band 2)) { $giu = (([int][Wf.Tasti]::GetAsyncKeyState(0x11)) -band 0x8000) -ne 0 }
        if ($giu -and ($mod -band 4)) { $giu = (([int][Wf.Tasti]::GetAsyncKeyState(0x10)) -band 0x8000) -ne 0 }
        if ($giu -and ($mod -band 1)) { $giu = (([int][Wf.Tasti]::GetAsyncKeyState(0x12)) -band 0x8000) -ne 0 }
        if ($giu -and ($mod -band 8)) {
            $giu = ((([int][Wf.Tasti]::GetAsyncKeyState(0x5B)) -band 0x8000) -ne 0) -or ((([int][Wf.Tasti]::GetAsyncKeyState(0x5C)) -band 0x8000) -ne 0)
        }
        # scatta sul bordo (prima era su, ora e' giu') e non piu' di una volta
        # ogni mezzo secondo: tenendo premuto non riparte in continuazione
        if ($giu -and -not $script:tastoEraGiu) {
            if (([datetime]::Now - $script:ultimaPressione).TotalMilliseconds -gt 500) {
                $script:ultimaPressione = [datetime]::Now
                Prendi-Vendita
            }
        }
        $script:tastoEraGiu = $giu
    })
$timer.Start()

# Prima di fare qualunque cosa: se e' pronto un aggiornamento, si riparte con
# quello e questa istanza si chiude senza nemmeno mostrarsi.
if (Applica-Aggiornamento) { $modulo.Close(); return }

$modulo.add_Shown({
        $tasto = if ($tastoScelto) { $tastoScelto.Nome } else { 'nessuno' }
        Mostra ([System.Windows.Forms.ToolTipIcon]::Info) 'PharmaTrack pronto' `
            ('Icona attiva. Premi ' + $tasto + ' in Winfarm per prendere la vendita.')
        # Il primo battito parte subito, poi ogni cinque minuti.
        Invia-Battito $script:config
        $script:battito = New-Object System.Windows.Forms.Timer
        $script:battito.Interval = 300000
        $script:battito.add_Tick({ if ($script:config) { Invia-Battito $script:config } })
        $script:battito.Start()
    })

$modulo.add_FormClosing({
        $timer.Stop()
        if ($tastoScelto) { [Wf.Tasti]::UnregisterHotKey($modulo.Handle, $ID_TASTO) | Out-Null }
        $iconaTray.Visible = $false
        $iconaTray.Dispose()
    })

[System.Windows.Forms.Application]::Run($modulo)
'''


def render_tray_script(base_url: str, token: str, pharmacy_name: str, api_url: str = "") -> str:
    """Restituisce lo script con indirizzo, token e intestazione gia' compilati."""
    return (
        _TEMPLATE.replace("@@URL@@", (base_url or "https://pharmatrack-zeta.vercel.app").rstrip("/"))
        .replace("@@API@@", (api_url or base_url or "https://pharmatrack-api.onrender.com").rstrip("/"))
        .replace("@@TOKEN@@", token or "")
        .replace("@@PHARMACY@@", (pharmacy_name or "Farmacia").replace("\r", " ").replace("\n", " "))
        .replace("@@GENERATED@@", datetime.now(timezone.utc).strftime("%d/%m/%Y %H:%M UTC"))
        .replace("@@VERSION@@", str(VERSIONE_PULSANTE))
    )


def con_bom(testo: str) -> bytes:
    """Aggiunge il BOM: senza, PowerShell 5.1 legge il file in ANSI e sbaglia gli accenti."""
    return ("\ufeff" + testo).encode("utf-8")
