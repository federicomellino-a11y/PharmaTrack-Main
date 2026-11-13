//go:build windows

package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"time"
)

var client = &http.Client{Timeout: 25 * time.Second}

// chiamata parla con PharmaTrack usando il token del PC (X-Bridge-Token).
func chiamata(metodo, percorso string, corpo interface{}) (int, []byte, error) {
	var lettura io.Reader
	if corpo != nil {
		dati, err := json.Marshal(corpo)
		if err != nil {
			return 0, nil, err
		}
		lettura = bytes.NewReader(dati)
	}
	url := strings.TrimRight(cfg.BaseURL, "/") + percorso
	req, err := http.NewRequest(metodo, url, lettura)
	if err != nil {
		return 0, nil, err
	}
	req.Header.Set("X-Bridge-Token", cfg.Token)
	req.Header.Set("User-Agent", fmt.Sprintf("PharmaTrack-ConsegnaVeloce/%d", versione))
	if corpo != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	risposta, err := client.Do(req)
	if err != nil {
		return 0, nil, err
	}
	defer risposta.Body.Close()
	dati, err := io.ReadAll(io.LimitReader(risposta.Body, 1<<20))
	return risposta.StatusCode, dati, err
}

type venditaLetta struct {
	Campi          map[string]interface{} `json:"campi"`
	Utilizzabile   bool                   `json:"utilizzabile"`
	IndirizzoManca bool                   `json:"indirizzo_da_chiedere"`
	Intestazione   map[string]interface{} `json:"intestazione"`
}

func testo(mappa map[string]interface{}, chiave string) string {
	if mappa == nil {
		return ""
	}
	if valore, ok := mappa[chiave]; ok && valore != nil {
		return strings.TrimSpace(fmt.Sprintf("%v", valore))
	}
	return ""
}

// leggiVendita manda il testo copiato da Winfarm e riceve i campi riconosciuti.
func leggiVendita(testoVendita string) (*venditaLetta, int, string) {
	stato, dati, err := chiamata("POST", "/api/integrations/winfarm/parse", map[string]string{"testo": testoVendita})
	if err != nil {
		return nil, 0, "PharmaTrack non risponde: " + err.Error()
	}
	if stato == 401 {
		return nil, stato, "Questo PC non è più collegato: la chiave è stata revocata. Scarica di nuovo il programma da Integrazioni."
	}
	if stato == 402 {
		return nil, stato, "Il piano Professional è scaduto: le integrazioni sono chiuse."
	}
	if stato != 200 {
		return nil, stato, fmt.Sprintf("Lettura non riuscita (%d)", stato)
	}
	var letto venditaLetta
	if err := json.Unmarshal(dati, &letto); err != nil {
		return nil, stato, "Risposta non leggibile"
	}
	return &letto, stato, ""
}

type esitoConsegna struct {
	Delivery       map[string]interface{} `json:"delivery"`
	CustomerCreate bool                   `json:"customer_created"`
	Duplicate      bool                   `json:"duplicate"`
	Detail         interface{}            `json:"detail"`
}

// creaConsegna manda i campi riconosciuti e crea la consegna in PharmaTrack.
func creaConsegna(campi map[string]interface{}, riferimento string) (int, map[string]interface{}) {
	corpo := map[string]interface{}{}
	if valore := testo(campi, "cliente"); valore != "" {
		corpo["cliente"] = valore
	}
	if valore := testo(campi, "telefono"); valore != "" {
		corpo["telefono"] = valore
	}
	if valore := testo(campi, "indirizzo"); valore != "" {
		corpo["indirizzo"] = valore
	}
	if valore := testo(campi, "codice_fiscale"); valore != "" {
		corpo["codice_fiscale"] = valore
	}
	if valore := testo(campi, "pagamento"); valore != "" {
		corpo["pagamento"] = valore
	}
	if importo, ok := campi["importo"]; ok && importo != nil {
		corpo["importo"] = importo
	}
	if riferimento != "" {
		corpo["external_ref"] = riferimento
	}
	stato, dati, err := chiamata("POST", "/api/integrations/winfarm/bridge", corpo)
	if err != nil {
		return 0, map[string]interface{}{"detail": "PharmaTrack non risponde: " + err.Error()}
	}
	var risposta map[string]interface{}
	_ = json.Unmarshal(dati, &risposta)
	return stato, risposta
}

// battito dice "sono vivo" e chiede se c'è una versione nuova.
func battito() (bool, error) {
	host, _ := nomeComputer()
	stato, dati, err := chiamata("POST", "/api/integrations/winfarm/heartbeat", map[string]interface{}{
		"versione": versione,
		"host":     host,
	})
	if err != nil {
		return false, err
	}
	if stato != 200 {
		return false, fmt.Errorf("battito %d", stato)
	}
	var risposta struct {
		Aggiorna bool `json:"aggiorna"`
	}
	if err := json.Unmarshal(dati, &risposta); err != nil {
		return false, err
	}
	return risposta.Aggiorna, nil
}

// scaricaEseguibile prende la versione nuova del programma.
func scaricaEseguibile(destinazione string) error {
	url := strings.TrimRight(cfg.BaseURL, "/") + "/api/integrations/winfarm/app/download?formato=exe"
	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return err
	}
	req.Header.Set("X-Bridge-Token", cfg.Token)
	risposta, err := client.Do(req)
	if err != nil {
		return err
	}
	defer risposta.Body.Close()
	if risposta.StatusCode != 200 {
		return fmt.Errorf("download %d", risposta.StatusCode)
	}
	file, err := os.Create(destinazione)
	if err != nil {
		return err
	}
	defer file.Close()
	_, err = io.Copy(file, io.LimitReader(risposta.Body, 40<<20))
	return err
}
