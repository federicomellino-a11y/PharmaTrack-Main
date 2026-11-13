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
	procShellNotifyIcon     = user32.NewProc("Shell_NotifyIconW")
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

	procGetModuleHandle = kernel32.NewProc("GetModuleHandleW")
	procCreateMutex     = kernel32.NewProc("CreateMutexW")
	procGlobalLock      = kernel32.NewProc("GlobalLock")
	procGlobalUnlock    = kernel32.NewProc("GlobalUnlock")
	procSleep           = kernel32.NewProc("Sleep")

	procShellExecute = shell32.NewProc("ShellExecuteW")

	procRegCreateKeyEx  = advapi32.NewProc("RegCreateKeyExW")
	procRegOpenKeyEx    = advapi32.NewProc("RegOpenKeyExW")
	procRegQueryValueEx = advapi32.NewProc("RegQueryValueExW")
	procRegSetValueEx  = advapi32.NewProc("RegSetValueExW")
	procRegDeleteValue = advapi32.NewProc("RegDeleteValueW")
	procRegCloseKey    = advapi32.NewProc("RegCloseKey")
)

const (
	wmDestroy      = 0x0002
	wmCommand      = 0x0111
	wmApp          = 0x8000
	wmHotKey       = 0x0312
	wmLButtonUp    = 0x0202
	wmLButtonDbl   = 0x0203
	wmRButtonUp    = 0x0205
	wmNull         = 0x0000
	cfUnicodeText  = 13
	keyUpFlag      = 0x0002
	vkControl      = 0x11
	vkC            = 0x43
	nimAdd         = 0x00000000
	nimModify      = 0x00000001
	nimDelete      = 0x00000002
	nifMessage     = 0x00000001
	nifIcon        = 0x00000002
	nifTip         = 0x00000004
	nifInfo        = 0x00000010
	niifInfo       = 0x00000001
	niifWarning    = 0x00000002
	imageIcon      = 1
	lrLoadFromFile = 0x000010
	mfString       = 0x00000000
	mfSeparator    = 0x00000800
	mfChecked      = 0x00000008
	tpmLeftAlign   = 0x0000
	tpmRightButton = 0x0002
	tpmReturnCmd   = 0x0100
	swHide         = 0
	hkeyCurrentUser = 0x80000001
	keySetValue     = 0x0002
	keyQueryValue   = 0x0001
	regSz           = 1
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
func copiaSelezione() {
	inviaTasto(vkControl, 0)
	inviaTasto(vkC, 0)
	inviaTasto(vkC, keyUpFlag)
	inviaTasto(vkControl, keyUpFlag)
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

func aggiungiIcona(finestra uintptr, icona uintptr, suggerimento string) {
	var dati notifyIconData
	dati.CbSize = uint32(unsafe.Sizeof(dati))
	dati.HWnd = finestra
	dati.UID = 1
	dati.Flags = nifMessage | nifIcon | nifTip
	dati.CallbackMessage = messaggioTray
	dati.HIcon = icona
	copiaUtf16(dati.SzTip[:], suggerimento)
	procShellNotifyIcon.Call(nimAdd, uintptr(unsafe.Pointer(&dati)))
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
	procShellNotifyIcon.Call(nimModify, uintptr(unsafe.Pointer(&dati)))
}

func mostraMessaggio(titolo, testoMessaggio string) {
	procMessageBox.Call(0,
		uintptr(unsafe.Pointer(puntatoreUtf16(testoMessaggio))),
		uintptr(unsafe.Pointer(puntatoreUtf16(titolo))), 0x40)
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
