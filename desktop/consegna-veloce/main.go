//go:build windows

// Command consegna-veloce è il programma per il PC del banco.
//
// Un solo eseguibile, nessun programma da installare prima: sta vicino
// all'orologio con la croce verde, preme un tasto globale mentre Winfarm è
// aperto sulla vendita e la consegna compare in PharmaTrack già compilata.
//
// Come legge la vendita: manda Ctrl+C alla finestra in primo piano e legge gli
// appunti (è il gesto del vecchio bridge, senza AutoHotkey). Il testo va a
// /parse, il riconoscimento sta sul server: se migliora, migliora su tutti i PC
// senza reinstallare niente.
//
// Cosa fa da solo: battito ogni cinque minuti verso PharmaTrack, che gli dice
// anche se c'è una versione nuova da scaricare (l'aggiornamento si applica al
// riavvio successivo, senza toccare niente a mano). Se la farmacia revoca la
// chiave del PC da Integrazioni, il programma lo dice invece di restare muto.
package main

import (
	"embed"
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"syscall"
	"time"
	"unsafe"
)

const versione = 7

//go:embed assets/icona.ico
var risorsaIcona embed.FS

const (
	idPrendi    = 1
	idModulo    = 2
	idTasto     = 3
	idAvvio     = 4
	idLog       = 5
	idAggiorna  = 6
	idEsci      = 9
	intervalloBattito = 5 * time.Minute
)

var (
	finestra      uintptr
	icona         uintptr
	configurazione *Configurazione
	cfg           *Configurazione // alias usato da api.go
	messaggioTray = uint32(wmApp + 1)
	procWndProc   = syscall.NewCallback(finestraMessaggi)
	registrato    bool
	tastoCorrente string
	statoAvvio    bool
	fileLog       *os.File
	tastoScelto   int
)

// combinazioni provate in ordine: la prima che Windows concede resta quella.
var combinazioni = []string{"Ctrl+Shift+C", "Ctrl+Shift+D", "Ctrl+Alt+C", "Win+C", "Alt+F9"}

func percorsoEseguibile() (string, error) {
	return os.Executable()
}

func nomeComputer() (string, error) {
	return os.Hostname()
}

func scriviLog(modello string, argomenti ...interface{}) {
	if fileLog == nil {
		return
	}
	riga := time.Now().Format("2006-01-02 15:04:05") + "  " + fmt.Sprintf(modello, argomenti...) + "\r\n"
	_, _ = fileLog.WriteString(riga)
	_ = fileLog.Sync()
}

func apriLog() {
	percorso := percorsoLog()
	if file, err := os.OpenFile(percorso, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0o600); err == nil {
		fileLog = file
	}
}

// --- tasto globale ---

func leggiCombinazione(testo string) (uint32, uint32, bool) {
	pezzi := strings.Split(strings.ToUpper(strings.TrimSpace(testo)), "+")
	if len(pezzi) < 2 {
		return 0, 0, false
	}
	var modificatori uint32
	for _, pezzo := range pezzi[:len(pezzi)-1] {
		switch strings.TrimSpace(pezzo) {
		case "CTRL", "CONTROL":
			modificatori |= 0x0002 // MOD_CONTROL
		case "ALT":
			modificatori |= 0x0001 // MOD_ALT
		case "SHIFT", "MAIUSC", "MAIUSCOLO":
			modificatori |= 0x0004 // MOD_SHIFT
		case "WIN", "WINDOWS":
			modificatori |= 0x0008 // MOD_WIN
		default:
			return 0, 0, false
		}
	}
	tasto := strings.TrimSpace(pezzi[len(pezzi)-1])
	var codice uint32
	switch {
	case len(tasto) == 1 && tasto[0] >= 'A' && tasto[0] <= 'Z':
		codice = uint32(tasto[0])
	case len(tasto) == 1 && tasto[0] >= '0' && tasto[0] <= '9':
		codice = uint32(tasto[0])
	case len(tasto) >= 2 && tasto[0] == 'F':
		var numero int
		if _, err := fmt.Sscanf(tasto, "F%d", &numero); err == nil && numero >= 1 && numero <= 24 {
			codice = uint32(0x70 + numero - 1)
		}
	}
	if codice == 0 {
		return 0, 0, false
	}
	return modificatori, codice, true
}

func registraTasto(preferito string) bool {
	coda := append([]string{preferito}, combinazioni...)
	for _, combinazione := range coda {
		modificatori, codice, ok := leggiCombinazione(combinazione)
		if !ok {
			continue
		}
		esito, _, _ := procRegisterHotKey.Call(finestra, 1, uintptr(modificatori), uintptr(codice))
		if esito != 0 {
			tastoCorrente = combinazione
			registrato = true
			scriviLog("tasto %s attivo", combinazione)
			return true
		}
	}
	scriviLog("nessun tasto disponibile: si usa il doppio clic sull'icona")
	return false
}

// --- menu dell'icona ---

func mostraMenu() {
	menu, _, _ := procCreatePopupMenu.Call()
	if menu == 0 {
		return
	}
	defer procDestroyMenu.Call(menu)
	voce := func(id uintptr, testo string) {
		procAppendMenu.Call(menu, mfString, id, uintptr(unsafe.Pointer(puntatoreUtf16(testo))))
	}
	voce(idPrendi, "Prendi la vendita ora")
	voce(idModulo, "Apri il modulo di consegna veloce")
	procAppendMenu.Call(menu, mfSeparator, 0, 0)
	etichetta := "Tasto: " + tastoCorrente
	if !registrato {
		etichetta = "Tasto: non disponibile"
	}
	voce(idTasto, etichetta+" (cambia…)")
	opzioni := uintptr(mfString)
	if statoAvvio {
		opzioni = mfString | mfChecked
	}
	procAppendMenu.Call(menu, opzioni, idAvvio, uintptr(unsafe.Pointer(puntatoreUtf16("Avvio automatico con Windows"))))
	voce(idAggiorna, "Controlla aggiornamenti")
	voce(idLog, "Apri il registro")
	procAppendMenu.Call(menu, mfSeparator, 0, 0)
	voce(idEsci, "Esci")

	var posizione point
	procGetCursorPos.Call(uintptr(unsafe.Pointer(&posizione)))
	procSetForegroundWindow.Call(finestra)
	procTrackPopupMenu.Call(menu, tpmLeftAlign|tpmRightButton|tpmReturnCmd,
		uintptr(posizione.X), uintptr(posizione.Y), 0, finestra, 0)
	procPostMessage.Call(finestra, wmNull, 0, 0)
}

// --- la vendita ---

func prendiVendita() {
	if configurazione == nil {
		notifica("Consegna veloce", "Manca la configurazione: riscarica il programma da Integrazioni.", true)
		return
	}
	scriviLog("vendita: copio la selezione")
	notifica("Consegna veloce", "Leggo la vendita…", false)
	copiaSelezione()
	time.Sleep(450 * time.Millisecond)
	testoVendita := leggiAppunti()
	if len(strings.TrimSpace(testoVendita)) < 8 {
		scriviLog("vendita: appunti vuoti")
		notifica("Nessuna vendita selezionata", "In Winfarm seleziona le righe della vendita e riprova.", true)
		return
	}
	letto, stato, motivo := leggiVendita(testoVendita)
	if motivo != "" {
		scriviLog("parse %d: %s", stato, motivo)
		notifica("Consegna veloce", motivo, true)
		return
	}
	if !letto.Utilizzabile {
		scriviLog("parse: vendita non riconosciuta")
		notifica("Vendita non riconosciuta",
			"Non ho letto cliente e totale. Seleziona la vendita intera, dalla riga del cliente al totale.", true)
		return
	}
	cliente := testo(letto.Campi, "cliente")
	riferimento := ""
	if letto.Intestazione != nil {
		riferimento = testo(letto.Intestazione, "riferimento")
	}
	scriviLog("vendita riconosciuta: %s rif=%s", cliente, riferimento)
	statoConsegna, risposta := creaConsegna(letto.Campi, riferimento)
	switch statoConsegna {
	case 200:
		scriviLog("consegna creata per %s", cliente)
		notifica("Consegna creata", cliente+" · apri PharmaTrack per pagamento e indirizzo", false)
	case 409:
		notifica("Già importata", "Questa vendita è già una consegna in PharmaTrack.", true)
	case 401:
		notifica("Chiave revocata",
			"Questo PC non è più collegato. Scarica di nuovo il programma da Integrazioni.", true)
	case 402:
		notifica("Piano Professional scaduto", "Le integrazioni sono chiuse: riattiva il piano per usarle.", true)
	case 422:
		scriviLog("consegna: cliente da inserire")
		apriModulo(cliente, letto.Campi)
		notifica("Serve l'indirizzo", "Ho aperto il modulo: scegli il cliente o aggiungilo con l'indirizzo.", true)
	default:
		dettaglio := testo(risposta, "detail")
		scriviLog("consegna: stato %d %s", statoConsegna, dettaglio)
		notifica("Consegna non creata", fmt.Sprintf("%s (%d)", dettaglio, statoConsegna), true)
	}
}

func apriModulo(cliente string, campi map[string]interface{}) {
	url := strings.TrimRight(configurazione.BaseURL, "/") + "/quick?customer_name=" + urlEscape(cliente)
	if importo := testo(campi, "importo"); importo != "" {
		url += "&amount=" + urlEscape(strings.ReplaceAll(importo, ",", "."))
	}
	if cf := testo(campi, "codice_fiscale"); cf != "" {
		url += "&fiscal_code=" + urlEscape(cf)
	}
	apriUrl(url)
}

func urlEscape(valore string) string {
	sostituzioni := strings.NewReplacer(" ", "%20", "&", "%26", "#", "%23", "?", "%3F", "+", "%2B", "'", "%27", "%", "%25")
	return sostituzioni.Replace(valore)
}

// --- aggiornamenti ---

func controllaAggiornamento(manuale bool) {
	aggiorna, err := battito()
	if err != nil {
		scriviLog("battito fallito: %v", err)
		if manuale {
			notifica("PharmaTrack non risponde", "Controlla la connessione e riprova.", true)
		}
		return
	}
	if !aggiorna {
		if manuale {
			notifica("Già aggiornato", fmt.Sprintf("Versione %d, l'ultima disponibile.", versione), false)
		}
		return
	}
	eseguibile, err := os.Executable()
	if err != nil {
		return
	}
	nuovo := percorsoNuovo()
	scriviLog("aggiornamento: scarico in %s", nuovo)
	if err := scaricaEseguibile(nuovo); err != nil {
		scriviLog("aggiornamento fallito: %v", err)
		notifica("Aggiornamento non riuscito", "Riprovo al prossimo avvio.", true)
		return
	}
	avviaSostituzione(eseguibile, nuovo)
}

// avviaSostituzione lascia un piccolo script che, quando questo processo è
// uscito, mette il file nuovo al posto del vecchio e riapre il programma:
// Windows non lascia sovrascrivere un eseguibile in esecuzione.
func avviaSostituzione(vecchio, nuovo string) {
	cartella := filepath.Dir(vecchio)
	script := filepath.Join(cartella, "aggiorna-consegna-veloce.cmd")
	contenuto := "@echo off\r\n" +
		"timeout /t 3 /nobreak >nul\r\n" +
		":attendi\r\n" +
		"del \"" + vecchio + ".vecchio\" >nul 2>&1\r\n" +
		"move \"" + vecchio + "\" \"" + vecchio + ".vecchio\" >nul 2>&1\r\n" +
		"if exist \"" + vecchio + "\" (timeout /t 2 /nobreak >nul & goto attendi)\r\n" +
		"move \"" + nuovo + "\" \"" + vecchio + "\" >nul 2>&1\r\n" +
		"start \"\" \"" + vecchio + "\"\r\n" +
		"del \"%~f0\"\r\n"
	if err := os.WriteFile(script, []byte(contenuto), 0o700); err != nil {
		scriviLog("aggiornamento: script non scritto: %v", err)
		return
	}
	eseguiNascosto("cmd.exe", "/C \""+script+"\"")
	notifica("Aggiornamento in corso", "Il programma si riapre tra pochi secondi.", false)
	time.Sleep(1200 * time.Millisecond)
	os.Exit(0)
}

// --- finestra e ciclo dei messaggi ---

func finestraMessaggi(hwnd, messaggio, wparam, lparam uintptr) uintptr {
	switch messaggio {
	case wmHotKey:
		go prendiVendita()
		return 0
	case uintptr(messaggioTray):
		switch uint32(lparam) & 0xffff {
		case wmLButtonUp, wmLButtonDbl:
			go prendiVendita()
		case wmRButtonUp:
			mostraMenu()
		}
		return 0
	case wmCommand:
		switch wparam & 0xffff {
		case idPrendi:
			go prendiVendita()
		case idModulo:
			apriUrl(strings.TrimRight(configurazione.BaseURL, "/") + "/quick")
		case idTasto:
			cambiaTasto()
		case idAvvio:
			statoAvvio = impostaAvvioAutomatico(!statoAvvio)
			notifica("Avvio automatico", mappaAvvio(statoAvvio), false)
		case idAggiorna:
			go controllaAggiornamento(true)
		case idLog:
			apriUrl("file:///" + strings.ReplaceAll(percorsoLog(), "\\", "/"))
		case idEsci:
			procDestroyWindow.Call(hwnd)
		}
		return 0
	case wmDestroy:
		procPostQuitMessage.Call(0)
		return 0
	}
	esito, _, _ := procDefWindowProc.Call(hwnd, messaggio, wparam, lparam)
	return esito
}

func mappaAvvio(attivo bool) string {
	if attivo {
		return "Il programma parte da solo all'accensione del PC."
	}
	return "Il programma non parte più da solo: avvialo dal collegamento."
}

func cambiaTasto() {
	if !registrato {
		tastoScelto = 0
	}
	nuovo := combinazioni[(tastoScelto+1)%len(combinazioni)]
	procUnregisterHotKey.Call(finestra, 1)
	registrato = false
	if registraTasto(nuovo) {
		tastoScelto = (tastoScelto + 1) % len(combinazioni)
		configurazione.Tasto = tastoCorrente
		_ = salvaConfigurazione(configurazione)
		notifica("Tasto cambiato", "Da adesso: "+tastoCorrente, false)
		return
	}
	notifica("Tasto non disponibile", "Quel tasto è già usato da un altro programma: ne provo un altro.", true)
}

func creaFinestra() bool {
	istanza, _, _ := procGetModuleHandle.Call(0)
	classe := "PharmaTrackConsegnaVeloce"
	var wc wndClassEx
	wc.CbSize = uint32(unsafe.Sizeof(wc))
	wc.LpfnWndProc = procWndProc
	wc.HInstance = istanza
	wc.LpszClassName = puntatoreUtf16(classe)
	if esito, _, _ := procRegisterClassEx.Call(uintptr(unsafe.Pointer(&wc))); esito == 0 {
		scriviLog("RegisterClassEx fallita")
		return false
	}
	hwndMessage := ^uintptr(2) // HWND_MESSAGE: finestra che non si vede
	finestra, _, _ = procCreateWindowEx.Call(0,
		uintptr(unsafe.Pointer(wc.LpszClassName)), 0, 0, 0, 0, 0, 0,
		hwndMessage, 0, istanza, 0)
	if finestra == 0 {
		scriviLog("CreateWindowEx fallita")
		return false
	}
	return true
}

func istanzaSingola() bool {
	maniglia, _, _ := procCreateMutex.Call(0, 0, uintptr(unsafe.Pointer(puntatoreUtf16("PharmaTrackConsegnaVeloce"))))
	if maniglia == 0 {
		return true
	}
	ultimo, _, _ := kernel32.NewProc("GetLastError").Call()
	if ultimo == errorAlreadyExists {
		mostraMessaggio("Consegna veloce", "Il programma è già in esecuzione: cerca la croce verde vicino all'orologio.")
		return false
	}
	return true
}

func cicloMessaggi() {
	var messaggio msgStruct
	for {
		esito, _, _ := procGetMessage.Call(uintptr(unsafe.Pointer(&messaggio)), 0, 0, 0)
		if esito == 0 || esito == ^uintptr(0) {
			return
		}
		procTranslateMessage.Call(uintptr(unsafe.Pointer(&messaggio)))
		procDispatchMessage.Call(uintptr(unsafe.Pointer(&messaggio)))
	}
}

func iconaSuDisco() string {
	dati, err := risorsaIcona.ReadFile("assets/icona.ico")
	if err != nil {
		scriviLog("icona mancante: %v", err)
		return ""
	}
	percorso := percorsoIcona()
	if err := os.WriteFile(percorso, dati, 0o600); err != nil {
		return ""
	}
	return percorso
}

func avviaBattito() {
	go func() {
		time.Sleep(8 * time.Second)
		for {
			controllaAggiornamento(false)
			time.Sleep(intervalloBattito)
		}
	}()
}

func selfTest() int {
	problemi := []string{}
	modificatori, tasto, ok := leggiCombinazione("Ctrl+Shift+C")
	if !ok || modificatori != 6 || tasto != vkC {
		problemi = append(problemi, "combinazione Ctrl+Shift+C non letta")
	}
	if _, _, ok := leggiCombinazione("F9"); ok {
		problemi = append(problemi, "F9 da solo non deve essere accettato")
	}
	if _, _, ok := leggiCombinazione("Ctrl+Shift+X+p"); ok {
		problemi = append(problemi, "combinazione inventata accettata")
	}
	if dati, err := risorsaIcona.ReadFile("assets/icona.ico"); err != nil || len(dati) < 100 {
		problemi = append(problemi, "icona non incorporata")
	}
	if !creaFinestra() {
		problemi = append(problemi, "finestra di messaggi non creata")
	}
	if finestra != 0 {
		procDestroyWindow.Call(finestra)
	}
	esito := "ok"
	if len(problemi) > 0 {
		esito = "problemi: " + strings.Join(problemi, "; ")
	}
	rapporto := fmt.Sprintf("consegna-veloce versione %d\n%s\n", versione, esito)
	_ = os.WriteFile(filepath.Join(os.TempDir(), "consegna-veloce-selftest.txt"), []byte(rapporto), 0o600)
	if len(problemi) > 0 {
		return 1
	}
	return 0
}

func main() {
	prova := flag.Bool("self-test", false, "verifica che l'eseguibile funzioni e termina")
	mostraVersione := flag.Bool("version", false, "stampa la versione")
	flag.Parse()
	if *mostraVersione {
		fmt.Printf("consegna-veloce %d\n", versione)
		return
	}
	if *prova {
		os.Exit(selfTest())
	}
	apriLog()
	scriviLog("avvio versione %d", versione)
	if !istanzaSingola() {
		return
	}
	caricata, err := caricaConfigurazione()
	if err != nil {
		mostraMessaggio("Consegna veloce",
			"Manca la configurazione.\n\nScarica di nuovo il programma da PharmaTrack → Integrazioni: il file arriva già collegato alla tua farmacia.")
		return
	}
	configurazione = caricata
	cfg = caricata
	statoAvvio = avvioAutomaticoAttivo()
	scriviLog("farmacia %s su %s", configurazione.Farmacia, configurazione.BaseURL)
	if !creaFinestra() {
		mostraMessaggio("Consegna veloce", "Non sono riuscito ad aprire la finestra di Windows. Vedi il registro nel menu dell'icona.")
		return
	}
	icona = caricaIcona(iconaSuDisco())
	aggiungiIcona(finestra, icona, "Consegna veloce — "+primoNome())
	tasto := configurazione.Tasto
	if tasto == "" {
		tasto = combinazioni[0]
	}
	registraTasto(tasto)
	notifica("Consegna veloce attiva",
		"Premi "+tastoCorrente+" in Winfarm con la vendita selezionata.", false)
	avviaBattito()
	cicloMessaggi()
}

func primoNome() string {
	if configurazione != nil && configurazione.Farmacia != "" {
		return configurazione.Farmacia
	}
	return "Winfarm"
}
