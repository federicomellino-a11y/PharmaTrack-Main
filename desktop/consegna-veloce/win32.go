//go:build windows

package main

import (
	"syscall"
	"unsafe"
)

// Poche chiamate a Windows, quelle che servono: icona vicino all'orologio,
// tasto globale, appunti. Niente runtime esterni, niente AutoHotkey.
var (
	user32   = syscall.NewLazyDLL("user32.dll")
	kernel32 = syscall.NewLazyDLL("kernel32.dll")
	shell32  = syscall.NewLazyDLL("shell32.dll")
	advapi32 = syscall.NewLazyDLL("advapi32.dll")

	procRegisterClassEx     = user32.NewProc("RegisterClassExW")
	procCreateWindowEx      = user32.NewProc("CreateWindowExW")
	procDefWindowProc       = user32.NewProc("DefWindowProcW")
	procGetMessage          = user32.NewProc("GetMessageW")
	procTranslateMessage    = user32.NewProc("TranslateMessage")
	procDispatchMessage     = user32.NewProc("DispatchMessageW")
	procRegisterHotKey      = user32.NewProc("RegisterHotKey")
	procUnregisterHotKey    = user32.NewProc("UnregisterHotKey")
	procSendInput           = user32.NewProc("SendInput")
	procOpenClipboard       = user32.NewProc("OpenClipboard")
	procCloseClipboard      = user32.NewProc("CloseClipboard")
	procGetClipboardData    = user32.NewProc("GetClipboardData")
	procCreatePopupMenu     = user32.NewProc("CreatePopupMenu")
	procAppendMenu          = user32.NewProc("AppendMenuW")
	procTrackPopupMenu      = user32.NewProc("TrackPopupMenu")
	procSetForegroundWindow = user32.NewProc("SetForegroundWindow")
	procDestroyMenu         = user32.NewProc("DestroyMenu")
	procGetCursorPos        = user32.NewProc("GetCursorPos")
	procLoadImage           = user32.NewProc("LoadImageW")
	procMessageBox          = user32.NewProc("MessageBoxW")
	procPostQuitMessage     = user32.NewProc("PostQuitMessage")
	procDestroyWindow       = user32.NewProc("DestroyWindow")
	procPostMessage         = user32.NewProc("PostMessageW")
	procGetParent           = user32.NewProc("GetParent")

	procGetModuleHandle = kernel32.NewProc("GetModuleHandleW")
	procCreateMutex     = kernel32.NewProc("CreateMutexW")
	procGlobalLock      = kernel32.NewProc("GlobalLock")
	procGlobalUnlock    = kernel32.NewProc("GlobalUnlock")
	procSleep           = kernel32.NewProc("Sleep")

	procShellExecute = shell32.NewProc("ShellExecuteW")

	procRegCreateKeyEx  = advapi32.NewProc("RegCreateKeyExW")
	procRegOpenKeyEx    = advapi32.NewProc("RegOpenKeyExW")
	procRegQueryValueEx = advapi32.NewProc("RegQueryValueExW")
	procRegSetValueEx   = advapi32.NewProc("RegSetValueExW")
	procRegDeleteValue  = advapi32.NewProc("RegDeleteValueW")
	procRegCloseKey     = advapi32.NewProc("RegCloseKey")
)

// Shell_NotifyIconW vive in shell32.dll: cercata in user32 la prima chiamata
// andava in panico e, senza console, il programma moriva senza dire niente.
// Qui la maniglia si risolve una volta sola, provando le due librerie: se in
// futuro cambia, non torna il silenzio.
var procShellNotifyIcon *syscall.LazyProc

func apiIconaOrologio() *syscall.LazyProc {
	if procShellNotifyIcon != nil {
		return procShellNotifyIcon
	}
	for _, libreria := range []*syscall.LazyDLL{shell32, user32} {
		candidata := libreria.NewProc("Shell_NotifyIconW")
		if errore := candidata.Find(); errore == nil {
			procShellNotifyIcon = candidata
			return procShellNotifyIcon
		}
	}
	return nil
}

const (
	wmDestroy          = 0x0002
	wmCommand          = 0x0111
	wmApp              = 0x8000
	wmHotKey           = 0x0312
	wmLButtonUp        = 0x0202
	wmLButtonDbl       = 0x0203
	wmRButtonUp        = 0x0205
	wmNull             = 0x0000
	cfUnicodeText      = 13
	keyUpFlag          = 0x0002
	vkControl          = 0x11
	vkC                = 0x43
	nimAdd             = 0x00000000
	nimModify          = 0x00000001
	nimDelete          = 0x00000002
	nifMessage         = 0x00000001
	nifIcon            = 0x00000002
	nifTip             = 0x00000004
	nifInfo            = 0x00000010
	niifInfo           = 0x00000001
	niifWarning        = 0x00000002
	imageIcon          = 1
	lrLoadFromFile     = 0x000010
	mfString           = 0x00000000
	mfSeparator        = 0x00000800
	mfChecked          = 0x00000008
	tpmLeftAlign       = 0x0000
	tpmRightButton     = 0x0002
	tpmReturnCmd       = 0x0100
	swHide             = 0
	hkeyCurrentUser    = 0x80000001
	keySetValue        = 0x0002
	keyQueryValue      = 0x0001
	regSz              = 1
	errorAlreadyExists = 183
	nullPointer        = 0
)

type point struct{ X, Y int32 }

type msgStruct struct {
	HWnd    uintptr
	Message uint32
	WParam  uintptr
	LParam  uintptr
	Time    uint32
	Pt      point
}

type wndClassEx struct {
	CbSize        uint32
	Style         uint32
	LpfnWndProc   uintptr
	CbClsExtra    int32
	CbWndExtra    int32
	HInstance     uintptr
	HIcon         uintptr
	HCursor       uintptr
	HbrBackground uintptr
	LpszMenuName  *uint16
	LpszClassName *uint16
	HIconSm       uintptr
}

type guidStruct struct {
	Data1 uint32
	Data2 uint16
	Data3 uint16
	Data4 [8]byte
}

type notifyIconData struct {
	CbSize          uint32
	HWnd            uintptr
	UID             uint32
	Flags           uint32
	CallbackMessage uint32
	HIcon           uintptr
	SzTip           [128]uint16
	DwState         uint32
	DwStateMask     uint32
	SzInfo          [256]uint16
	UVersion        uint32
	SzInfoTitle     [64]uint16
	DwInfoFlags     uint32
	GuidItem        guidStruct
	HBalloonIcon    uintptr
}

type keybdInput struct {
	Vk    uint16
	Scan  uint16
	Flags uint32
	Time  uint32
	Extra uintptr
}

type inputStruct struct {
	Type uint32
	_    uint32
	Ki   keybdInput
	_    [8]byte
}

func puntatoreUtf16(s string) *uint16 {
	p, err := syscall.UTF16PtrFromString(s)
	if err != nil {
		return nil
	}
	return p
}

func copiaUtf16(destino []uint16, sorgente string) {
	for i, r := range syscall.StringToUTF16(sorgente) {
		if i >= len(destino) {
			return
		}
		destino[i] = r
	}
}

// inviaTasto preme (o rilascia) un tasto nella finestra in primo piano.
func inviaTasto(vk uint16, flags uint32) {
	var evento inputStruct
	evento.Type = 1 // INPUT_KEYBOARD
	evento.Ki.Vk = vk
	evento.Ki.Flags = flags
	procSendInput.Call(1, uintptr(unsafe.Pointer(&evento)), unsafe.Sizeof(evento))
}

// copiaSelezione manda Ctrl+C a Winfarm: quello che è selezionato finisce negli
// appunti e da lì lo leggiamo. È lo stesso gesto del vecchio bridge Alt+C, ma
// senza installare AutoHotkey.
// La copia si manda in un colpo solo: quattro SendInput separati arrivano al
// programma di vendita con tempi diversi e a volte la C resta attaccata al
// Ctrl, quindi la selezione non finisce negli appunti e sembra che il
// programma non legga niente.
func copiaSelezione() {
	var eventi [4]inputStruct
	for i, evento := range []struct {
		vk    uint16
		flags uint32
	}{
		{vkControl, 0},
		{vkC, 0},
		{vkC, keyUpFlag},
		{vkControl, keyUpFlag},
	} {
		eventi[i].Type = 1
		eventi[i].Ki.Vk = evento.vk
		eventi[i].Ki.Flags = evento.flags
	}
	inviate, _, _ := procSendInput.Call(4, uintptr(unsafe.Pointer(&eventi[0])), unsafe.Sizeof(eventi[0]))
	if inviate != 4 {
		scriviLog("copia: SendInput ha preso %d eventi su 4", inviate)
	}
}

func leggiAppunti() string {
	if esito, _, _ := procOpenClipboard.Call(0); esito == 0 {
		return ""
	}
	defer procCloseClipboard.Call()
	maniglia, _, _ := procGetClipboardData.Call(cfUnicodeText)
	if maniglia == 0 {
		return ""
	}
	puntatore, _, _ := procGlobalLock.Call(maniglia)
	if puntatore == 0 {
		return ""
	}
	defer procGlobalUnlock.Call(maniglia)
	var rune []uint16
	for i := 0; i < 1<<18; i++ {
		valore := *(*uint16)(unsafe.Add(unsafe.Pointer(puntatore), uintptr(i*2)))
		if valore == 0 {
			break
		}
		rune = append(rune, valore)
	}
	return syscall.UTF16ToString(rune)
}

func caricaIcona(percorso string) uintptr {
	if percorso == "" {
		return 0
	}
	maniglia, _, _ := procLoadImage.Call(0,
		uintptr(unsafe.Pointer(puntatoreUtf16(percorso))), imageIcon, 0, 0, lrLoadFromFile)
	return maniglia
}

func aggiungiIcona(finestra uintptr, icona uintptr, suggerimento string) bool {
	var dati notifyIconData
	dati.CbSize = uint32(unsafe.Sizeof(dati))
	dati.HWnd = finestra
	dati.UID = 1
	dati.Flags = nifMessage | nifIcon | nifTip
	dati.CallbackMessage = messaggioTray
	dati.HIcon = icona
	copiaUtf16(dati.SzTip[:], suggerimento)
	api := apiIconaOrologio()
	if api == nil {
		scriviLog("Shell_NotifyIconW non trovata: icona non aggiunta")
		return false
	}
	esito, _, erroreChiamata := api.Call(nimAdd, uintptr(unsafe.Pointer(&dati)))
	if esito == 0 {
		scriviLog("Shell_NotifyIcon(NIM_ADD) rifiutata: %v", erroreChiamata)
		return false
	}
	scriviLog("icona aggiunta vicino all'orologio")
	return true
}

// Un problema va visto sempre: i fumetti di Windows si perdono con
// l'Assistenza concentrazione o con le notifiche spente per il programma, e al
// banco "non e' successo niente" e' peggio di una finestra in piu'.
func avvisoVisibile(titolo, testoAvviso string) {
	notifica(titolo, testoAvviso, true)
	mostraMessaggio(titolo, testoAvviso)
}

func notifica(titolo, testoNotifica string, avviso bool) {
	var dati notifyIconData
	dati.CbSize = uint32(unsafe.Sizeof(dati))
	dati.HWnd = finestra
	dati.UID = 1
	dati.Flags = nifInfo
	if avviso {
		dati.DwInfoFlags = niifWarning
	} else {
		dati.DwInfoFlags = niifInfo
	}
	copiaUtf16(dati.SzInfoTitle[:], titolo)
	copiaUtf16(dati.SzInfo[:], testoNotifica)
	if api := apiIconaOrologio(); api != nil {
		esito, _, _ := api.Call(nimModify, uintptr(unsafe.Pointer(&dati)))
		if esito == 0 {
			scriviLog("fumetto non mostrato da Windows: %s", titolo)
		}
	}
}

func mostraMessaggio(titolo, testoMessaggio string) {
	procMessageBox.Call(0,
		uintptr(unsafe.Pointer(puntatoreUtf16(testoMessaggio))),
		uintptr(unsafe.Pointer(puntatoreUtf16(titolo))), 0x40)
}

// "file:///C:/..." non e' un file: ShellExecute lo rifiuta e il menu sembra
// morto. Qui si apre il percorso vero.
func apriPercorso(percorso string) bool {
	esito, _, _ := procShellExecute.Call(0,
		uintptr(unsafe.Pointer(puntatoreUtf16("open"))),
		uintptr(unsafe.Pointer(puntatoreUtf16(percorso))),
		0, 0, 1)
	if esito <= 32 {
		scriviLog("apertura di '%s' rifiutata (codice %d)", percorso, esito)
		return false
	}
	return true
}

// Mostra il file dentro la sua cartella: ultima strada quando il programma
// predefinito non risponde.
func apriCartella(percorso string) {
	procShellExecute.Call(0,
		uintptr(unsafe.Pointer(puntatoreUtf16("explorer.exe"))),
		uintptr(unsafe.Pointer(puntatoreUtf16("/select,"+percorso))),
		0, 0, 1)
}

func apriUrl(url string) {
	procShellExecute.Call(0,
		uintptr(unsafe.Pointer(puntatoreUtf16("open"))),
		uintptr(unsafe.Pointer(puntatoreUtf16(url))),
		0, 0, 1)
}

func eseguiNascosto(comando string, argomenti string) {
	procShellExecute.Call(0,
		uintptr(unsafe.Pointer(puntatoreUtf16("open"))),
		uintptr(unsafe.Pointer(puntatoreUtf16(comando))),
		uintptr(unsafe.Pointer(puntatoreUtf16(argomenti))),
		0, swHide)
}

// --- avvio automatico con Windows (HKCU\...\Run) ---

func chiaveAvvio() uintptr {
	var maniglia uintptr
	procRegCreateKeyEx.Call(hkeyCurrentUser,
		uintptr(unsafe.Pointer(puntatoreUtf16(`Software\Microsoft\Windows\CurrentVersion\Run`))),
		0, 0, 0, keySetValue, 0, uintptr(unsafe.Pointer(&maniglia)), 0)
	return maniglia
}

func avvioAutomaticoAttivo() bool {
	var maniglia uintptr
	esito, _, _ := procRegOpenKeyEx.Call(hkeyCurrentUser,
		uintptr(unsafe.Pointer(puntatoreUtf16(`Software\Microsoft\Windows\CurrentVersion\Run`))),
		0, keyQueryValue, uintptr(unsafe.Pointer(&maniglia)))
	if esito != 0 {
		return false
	}
	defer procRegCloseKey.Call(maniglia)
	var tipo, dimensione uint32
	letto, _, _ := procRegQueryValueEx.Call(maniglia,
		uintptr(unsafe.Pointer(puntatoreUtf16("PharmaTrackConsegnaVeloce"))),
		0, uintptr(unsafe.Pointer(&tipo)), 0, uintptr(unsafe.Pointer(&dimensione)))
	return letto == 0
}

func impostaAvvioAutomatico(attivo bool) bool {
	eseguibile, err := percorsoEseguibile()
	if err != nil {
		return false
	}
	maniglia := chiaveAvvio()
	if maniglia == 0 {
		return false
	}
	defer procRegCloseKey.Call(maniglia)
	nome := uintptr(unsafe.Pointer(puntatoreUtf16("PharmaTrackConsegnaVeloce")))
	if !attivo {
		procRegDeleteValue.Call(maniglia, nome)
		return false
	}
	valore := syscall.StringToUTF16(`"` + eseguibile + `"`)
	procRegSetValueEx.Call(maniglia, nome, 0, regSz,
		uintptr(unsafe.Pointer(&valore[0])), uintptr(len(valore)*2))
	return true
}
