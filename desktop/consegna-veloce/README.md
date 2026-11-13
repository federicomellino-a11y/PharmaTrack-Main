# Consegna veloce (programma per il PC del banco)

Un solo eseguibile per Windows: sta vicino all'orologio, preme un tasto globale
mentre Winfarm è aperto e la vendita diventa una consegna in PharmaTrack.

Niente da installare prima: nessun AutoHotkey, nessun runtime, nessun Python.
Solo la libreria standard di Go, compilato in un `.exe` da `desktop/build.sh`.

## Come legge la vendita

1. Manda `Ctrl+C` alla finestra in primo piano (è il gesto del vecchio bridge).
2. Legge gli appunti e li manda a `POST /api/integrations/winfarm/parse`.
3. Il riconoscimento sta sul server: se migliora, migliora su tutti i PC senza
   reinstallare niente.
4. I campi riconosciuti vanno a `POST /api/integrations/winfarm/bridge`, che crea
   la consegna (o risponde 422 se il cliente non è in anagrafica: in quel caso
   il programma apre il modulo di consegna veloce già compilato).

## Cosa fa da solo

- **Battito** ogni cinque minuti: rende vero lo stato in pagina e chiede se c'è
  una versione nuova (`POST /integrations/winfarm/heartbeat`).
- **Aggiornamento**: scarica l'eseguibile nuovo con la sua chiave e si sostituisce
  al riavvio successivo (uno script temporaneo aspetta la chiusura del processo).
- **Avvio automatico con Windows**: voce nel menu dell'icona, chiave
  `HKCU\Software\Microsoft\Windows\CurrentVersion\Run`.

## La chiave del PC

Vive in `%LOCALAPPDATA%\PharmaTrack\consegna-veloce.json`, con permessi 0600, e
arriva già compilata dentro lo zip che si scarica da Integrazioni. Se la farmacia
la rigenera da `POST /integrations/winfarm/token/rotate`, questo PC riceve 401 e
lo dice: va scaricato di nuovo il programma.

## Comandi utili

```bash
desktop/build.sh                                    # compila (da Linux/macOS)
consegna-veloce.exe --version                        # versione
consegna-veloce.exe --self-test                      # prova senza interfaccia
%LOCALAPPDATA%\PharmaTrack\consegna-veloce.log       # registro
```

`--self-test` è quello che gira in CI su Windows: apre la finestra di messaggi,
carica l'icona, legge le combinazioni di tasti e scrive il rapporto in
`%TEMP%\consegna-veloce-selftest.txt`.
