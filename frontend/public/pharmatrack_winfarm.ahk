; ╔════════════════════════════════════════════════════════════════════════════╗
; ║  PHARMATRACK · BRIDGE WINFARM (AutoHotkey v1.1)                            ║
; ║  -----------------------------------------------------------------------   ║
; ║  Hotkey: CTRL + F10  (configurabile sotto)                                 ║
; ║                                                                            ║
; ║  Cosa fa:                                                                  ║
; ║  1) Copia il testo selezionato in Winfarm (Ctrl+C)                         ║
; ║  2) Estrae cliente e importo dalla clipboard con regex                     ║
; ║  3) Apre PharmaTrack su /deliveries?new=1&customer_name=…&amount=…         ║
; ║     pre-compilando il modulo "Nuova Consegna" — il farmacista              ║
; ║     completa solo metodo pagamento, resto e clic OK.                       ║
; ║                                                                            ║
; ║  Installazione:                                                            ║
; ║   • Scarica AutoHotkey v1.1 da https://www.autohotkey.com/                 ║
; ║   • Salva questo file come `pharmatrack_winfarm.ahk`                       ║
; ║   • Doppio-click per avviarlo (icona verde "H" in tray)                    ║
; ║   • Per autostart: copialo in shell:startup                                ║
; ║                                                                            ║
; ║  Personalizza:                                                             ║
; ║   • PharmaTrackURL  → URL della tua farmacia                               ║
; ║   • Hotkey          → cambia "^F10" in altra combinazione                  ║
; ║   • Le regex sotto  → adatta ai pattern reali della tua schermata Winfarm  ║
; ╚════════════════════════════════════════════════════════════════════════════╝

; === CONFIGURAZIONE ===
PharmaTrackURL := "https://pharmatrack.replit.app"
; ↑ se hai un dominio personalizzato, scrivilo qui (es. https://farmacia-mia.it)

; === HOTKEY: Ctrl+F10 ===
^F10::
    ; 1. Copia il testo selezionato in Winfarm
    ClipSaved := ClipboardAll
    Clipboard := ""
    SendInput, ^c
    ClipWait, 1
    if (ErrorLevel) {
        ; Niente selezionato → prova a leggere la finestra attiva via OCR/UI Automation
        ; (versione semplice: prendi clipboard esistente)
        Clipboard := ClipSaved
        MsgBox, 48, PharmaTrack Bridge, Niente di selezionato in Winfarm.`n`nSeleziona prima il testo della vendita (cliente + importo) e ripeti.
        return
    }
    saleText := Clipboard

    ; 2. Estrai dati con regex (CONFIGURABILI in base al layout Winfarm)
    customerName := ""
    customerPhone := ""
    amount := ""

    ; Pattern 1: "Cliente: ROSSI MARIO" oppure "Sig. ROSSI MARIO"
    if RegExMatch(saleText, "i)(?:Cliente|Sig\.?|Sig\.?ra)[:\s]+([A-ZÀ-ÿ][\w\s\.\']+?)(?=[\r\n]|telefono|tel|cell|importo|totale|€|$)", m)
        customerName := Trim(m1)

    ; Pattern 2: telefono italiano (3xx, 0x, prefisso opzionale +39)
    if RegExMatch(saleText, "(?:\+?39\s?)?((?:3\d{2}|0\d{1,3})[\s\.\/-]?\d{3,4}[\s\.\/-]?\d{3,4})", m)
        customerPhone := RegExReplace(m1, "[\s\.\/-]", "")

    ; Pattern 3: totale / importo / pagamento
    if RegExMatch(saleText, "i)(?:Totale|Importo|Pagamento|Da incassare)[:\s]*€?\s*([\d]+[\.,]?\d{0,2})", m)
        amount := StrReplace(m1, ",", ".")
    else if RegExMatch(saleText, "€\s*([\d]+[\.,]?\d{0,2})", m)
        amount := StrReplace(m1, ",", ".")

    ; Restore clipboard
    Clipboard := ClipSaved

    ; 3. URL-encode e apri PharmaTrack
    if (customerName = "" && customerPhone = "" && amount = "") {
        MsgBox, 48, PharmaTrack Bridge, Non sono riuscito a estrarre dati utili dalla selezione.`n`nVerifica le regex nello script o seleziona un blocco di testo che contenga cliente e totale.
        return
    }

    qs := "new=1"
    if (customerName != "")
        qs := qs . "&customer_name=" . UrlEncode(customerName)
    if (customerPhone != "")
        qs := qs . "&customer_phone=" . UrlEncode(customerPhone)
    if (amount != "")
        qs := qs . "&amount=" . amount
    qs := qs . "&notes=" . UrlEncode("Importato da Winfarm il " . A_DD . "/" . A_MM . "/" . A_YYYY . " " . A_Hour . ":" . A_Min)

    Run, % PharmaTrackURL . "/deliveries?" . qs
    return

; === Helper URL-encode ===
UrlEncode(text) {
    out := ""
    Loop, Parse, text
    {
        c := A_LoopField
        if (c ~= "[A-Za-z0-9._~-]")
            out := out . c
        else if (c == " ")
            out := out . "%20"
        else {
            ; UTF-8 encode
            VarSetCapacity(buf, 8, 0)
            len := StrPut(c, &buf, "UTF-8") - 1
            Loop, %len%
            {
                b := NumGet(buf, A_Index - 1, "UChar")
                out := out . Format("%{:02X}", b)
                ; aggiungi % davanti
                StringTrimRight, out, out, 2
                out := out . "%" . Format("{:02X}", b)
            }
        }
    }
    return out
}

; === Optional: hotkey di test ===
; ^F11::
;     Run, % PharmaTrackURL . "/deliveries?new=1&customer_name=ROSSI%20MARIO&amount=12.50"
; return
