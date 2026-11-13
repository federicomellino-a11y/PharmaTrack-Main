//go:build windows

package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
)

const nomeApp = "consegna-veloce"

// Configurazione è quello che arriva insieme all'eseguibile (consegna-veloce.json
// dentro lo zip) e che poi vive nella cartella dell'utente. Il token del PC sta
// qui e si revoca da PharmaTrack: quando la farmacia lo rigenera, questo file
// smette di valere e il programma lo dice invece di restare muto.
type Configurazione struct {
	BaseURL  string `json:"base_url"`
	Token    string `json:"bridge_token"`
	Tasto    string `json:"tasto,omitempty"`
	Farmacia string `json:"farmacia,omitempty"`
	Versione int    `json:"versione,omitempty"`
}

func cartellaDati() string {
	base := os.Getenv("LOCALAPPDATA")
	if base == "" {
		base = os.TempDir()
	}
	cartella := filepath.Join(base, "PharmaTrack")
	_ = os.MkdirAll(cartella, 0o755)
	return cartella
}

func percorsoConfig() string { return filepath.Join(cartellaDati(), nomeApp+".json") }
func percorsoLog() string    { return filepath.Join(cartellaDati(), nomeApp+".log") }
func percorsoIcona() string  { return filepath.Join(cartellaDati(), nomeApp+".ico") }
func percorsoNuovo() string  { return filepath.Join(cartellaDati(), nomeApp+".new.exe") }

func decodifica(dati []byte) (*Configurazione, error) {
	var cfg Configurazione
	if err := json.Unmarshal(dati, &cfg); err != nil {
		return nil, err
	}
	cfg.BaseURL = strings.TrimRight(strings.TrimSpace(cfg.BaseURL), "/")
	cfg.Token = strings.TrimSpace(cfg.Token)
	return &cfg, nil
}

func salvaConfigurazione(cfg *Configurazione) error {
	dati, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(percorsoConfig(), dati, 0o600)
}

// caricaConfigurazione legge prima il file accanto all'eseguibile (lo zip
// arriva già compilato: doppio clic e basta, nessun codice da copiare) e poi
// quello installato. Il file accanto viene cancellato appena letto: conteneva
// il token in chiaro, non deve restare nella cartella Download.
func caricaConfigurazione() (*Configurazione, error) {
	if eseguibile, err := os.Executable(); err == nil {
		accanto := filepath.Join(filepath.Dir(eseguibile), nomeApp+".json")
		if dati, err := os.ReadFile(accanto); err == nil {
			if cfg, err := decodifica(dati); err == nil && cfg.Token != "" && cfg.BaseURL != "" {
				_ = salvaConfigurazione(cfg)
				_ = os.Remove(accanto)
				return cfg, nil
			}
		}
	}
	dati, err := os.ReadFile(percorsoConfig())
	if err != nil {
		return nil, err
	}
	return decodifica(dati)
}
