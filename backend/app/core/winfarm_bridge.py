"""Generazione dello script AutoHotkey personalizzato per il bridge Winfarm.

Il file viene servito dal backend con URL e token della farmacia già inseriti:
il farmacista lo scarica, doppio click e ha finito (nessuna modifica manuale).
"""
from datetime import datetime, timezone

_TEMPLATE = r'''; ============================================================
;  PharmaTrack - Bridge Winfarm
;  Farmacia: @@PHARMACY@@
;  Generato: @@GENERATED@@
;
;  USO
;   1. Apri Winfarm e seleziona il blocco della vendita
;   2. Premi ALT + C
;   3. La consegna appare in PharmaTrack (Dock compilato da solo)
;
;  ALT + D  apre il pannello Dock, sempre sopra Winfarm
;  Per chiudere: click destro sull'icona verde "H" vicino all'orologio -> Exit
; ============================================================
#NoEnv
#SingleInstance Force
SetWorkingDir %A_ScriptDir%
SendMode Input

global PharmaTrackURL := "@@URL@@"
global BridgeToken   := "@@TOKEN@@"

TrayTip, PharmaTrack, Pronto. Seleziona la vendita in Winfarm e premi ALT+C, 8, 1

; ---------- ALT + C : importa la vendita ----------
!c::
    saved := ClipboardAll
    Clipboard := ""
    SendInput ^c
    ClipWait, 0.8
    if ErrorLevel {
        Clipboard := saved
        TrayTip, PharmaTrack, Seleziona prima il testo della vendita in Winfarm., 4, 3
        return
    }
    saleText := Clipboard
    Clipboard := saved

    name := "", phone := "", amount := "", address := "", notes := ""

    if RegExMatch(saleText, "im)^\s*(?:Cliente|Sig\.?r?a?|Intestatario|Paziente)[:\s]+(.+?)\s*$", m)
        name := Trim(m1)
    if RegExMatch(saleText, "(?:\+?39[\s.]?)?((?:3\d{2}|0\d{1,3})[\s./-]?\d{3,4}[\s./-]?\d{3,4})", m)
        phone := RegExReplace(m1, "[\s./-]", "")
    if RegExMatch(saleText, "i)(?:Totale|Importo|Da incassare|Da pagare)[:\s]*(?:EUR| EURO)?[\s]*([\d]+[.,]?\d{0,2})", m)
        amount := StrReplace(m1, ",", ".")
    else if RegExMatch(saleText, "(?:EUR| EURO)\s*([\d]+[.,]?\d{0,2})", m)
        amount := StrReplace(m1, ",", ".")
    if RegExMatch(saleText, "im)^\s*(?:Indirizzo|Via|Domicilio)[:\s]+(.+?)\s*$", m)
        address := Trim(m1)

    if (name = "" && phone = "" && amount = "") {
        TrayTip, PharmaTrack, Selezione non riconosciuta: seleziona il blocco vendita con cliente e totale., 5, 3
        return
    }

    url := PharmaTrackURL . "/api/integrations/winfarm/bridge"
    url := url . "?cliente=" . UrlEncode(name)
    url := url . "&telefono=" . UrlEncode(phone)
    url := url . "&importo=" . UrlEncode(amount)
    url := url . "&indirizzo=" . UrlEncode(address)

    status := 0
    try {
        http := ComObjCreate("WinHttp.WinHttpRequest.5.1")
        http.Open("POST", url, false)
        http.SetRequestHeader("X-Bridge-Token", BridgeToken)
        http.Send()
        status := http.Status
        if (status = 200)
            TrayTip, PharmaTrack, Consegna importata da Winfarm., 3, 1
        else if (status = 401)
            TrayTip, PharmaTrack, Token non valido: riscarica il bridge da PharmaTrack > Integrazioni., 6, 3
        else if (status = 409)
            TrayTip, PharmaTrack, Questa vendita risulta gia' importata., 3, 2
        else
            TrayTip, PharmaTrack, Import non riuscito (HTTP " . status . "). Apro il modulo compilato., 4, 3
    } catch {
        status := 0
    }

    ; fallback: se il POST non passa, apri il modulo pre-compilato
    if (status != 200 && status != 409) {
        qs := "new=1&customer_name=" . UrlEncode(name) . "&customer_phone=" . UrlEncode(phone)
        if (amount != "")
            qs := qs . "&amount=" . amount
        if (address != "")
            qs := qs . "&customer_address=" . UrlEncode(address)
        Run, % PharmaTrackURL . "/deliveries?" . qs
    }
return

; ---------- ALT + D : Dock di banco ----------
!d::
DetectHiddenWindows, On
WinGet, dockId, ID, PharmaTrack Dock ahk_exe msedge.exe
if (dockId)
{
    if DllCall("IsWindowVisible", "Ptr", dockId)
        WinHide, ahk_id %dockId%
    else
    {
        WinShow, ahk_id %dockId%
        WinActivate, ahk_id %dockId%
        WinSet, AlwaysOnTop, On, ahk_id %dockId%
    }
}
else
{
    Run, msedge.exe --app=%PharmaTrackURL%/dock --window-size=380,900
    Sleep, 3000
    WinGet, dockId, ID, PharmaTrack Dock ahk_exe msedge.exe
    if (dockId)
    {
        SysGet, wa, MonitorWorkArea
        WinMove, ahk_id %dockId%,, %waRight% - 390, %waTop%, 380, %waBottom% - %waTop%
        WinSet, AlwaysOnTop, On, ahk_id %dockId%
        WinActivate, ahk_id %dockId%
    }
}
return

; ---------- helper ----------
UrlEncode(text) {
    out := ""
    VarSetCapacity(buf, 16, 0)
    Loop, Parse, text
    {
        c := A_LoopField
        if (c ~= "[A-Za-z0-9._~-]")
            out := out . c
        else if (c == " ")
            out := out . "%20"
        else {
            len := StrPut(c, &buf, "UTF-8") - 1
            Loop, %len%
                out := out . Format("%{:02X}", NumGet(buf, A_Index - 1, "UChar"))
        }
    }
    return out
}
'''


def render_bridge_script(base_url: str, token: str, pharmacy_name: str) -> str:
    return (
        _TEMPLATE.replace("@@URL@@", (base_url or "https://pharmatrack-zeta.vercel.app").rstrip("/"))
        .replace("@@TOKEN@@", token or "")
        .replace("@@PHARMACY@@", (pharmacy_name or "Farmacia").replace("\r", " ").replace("\n", " "))
        .replace("@@GENERATED@@", datetime.now(timezone.utc).strftime("%d/%m/%Y %H:%M UTC"))
    )
