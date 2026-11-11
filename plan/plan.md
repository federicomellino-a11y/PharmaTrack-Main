# PharmaTrack: revisione del codice e correzione dei problemi gravi

PharmaTrack è il gestionale delle consegne a domicilio per le farmacie italiane: farmacia, fattorino e console admin, con backend su Render, frontend su Vercel e database MongoDB Atlas.
Questo lavoro è un controllo del codice attuale su tre fronti (sicurezza, qualità e funzioni rotte), con la correzione dei soli problemi gravi.

## Per chi è
- Federico, titolare e unico sviluppatore, che pubblica su `main` direttamente in produzione.
- Indirettamente, le farmacie e i fattorini che usano l'app ogni giorno.

## Giudizio sul lavoro attuale
Il lavoro è di buon livello, sopra la media dei progetti fatti da una persona sola:
- sessioni gestite dal server, revocabili, con l'elenco dei dispositivi;
- limite ai tentativi di login, controllo dell'origine contro il CSRF, CSP che blocca davvero, documentazione dell'API chiusa in produzione;
- la demo apre la sessione dal server, quindi nel sito pubblico non ci sono più credenziali;
- secondo fattore per la console admin, backup cifrati, controllo dei segreti nella CI;
- `server.py` è stato spezzato in moduli ordinati e i test unitari sono tanti;
- `SICUREZZA.md` dichiara onestamente i buchi noti, e questo è raro.

La revisione ha però trovato alcuni problemi seri che i test attuali non vedono.

## Problemi trovati

### Gravi (vengono corretti in questa fase)
1. **Il canale in tempo reale non chiede chi sei.** Gli indirizzi `/ws/pharmacy/{id}` e `/ws/driver/{id}` accettano chiunque conosca un identificativo. Senza fare login si possono ricevere in diretta messaggi della chat, notifiche, aggiornamenti delle consegne e posizioni dei fattorini di un'altra farmacia. Si può anche inviare una posizione falsa a nome di un fattorino. È il buco più importante: tocca dati personali e sanitari.
2. **"Accedi con Google" va in errore a ogni tentativo.** La funzione usa un dato della richiesta che però non riceve, quindi risponde con un errore del server invece di far entrare l'utente.
3. **Google senza Client ID accetta qualunque token.** Se `GOOGLE_CLIENT_ID` manca, il controllo che il token sia destinato a PharmaTrack viene saltato. Inoltre non si verifica che Google abbia confermato l'email.
4. **Una sola connessione in tempo reale per utente.** Se la farmacia ha il PC del banco e il telefono aperti insieme, solo l'ultimo riceve gli aggiornamenti. Quando uno dei due si chiude, si perde anche l'altro.
5. **Eliminare un account lascia dati in giro.** Restano foto delle consegne, conversazioni, turni, ricorrenze e altri dati collegati alla farmacia. Per il GDPR un'eliminazione deve essere completa.

### Da sistemare, non urgenti (fase 2)
- La registrazione non uniforma le maiuscole dell'email, quindi `Mario@` e `mario@` possono diventare due account. Inoltre apre la sessione con un codice duplicato invece di quello comune.
- Gli account creati con Google non ricevono il piano iniziale che ricevono quelli registrati con email.
- La password admin si confronta in modo semplice invece che a tempo costante.
- Se `CORS_ORIGINS` manca in produzione, il backend accetta tutte le origini invece di fermarsi.
- La reimpostazione della password non ha limite di tentativi.
- C'è codice morto in `security_middleware.py` (due middleware mai usati) e la lettura di `CORS_ORIGINS` è fatta due volte in modi diversi.
- `SICUREZZA.md` riporta come data di aggiornamento "12 novembre 2026", una data futura.

## Cosa cambia per chi usa l'app
- Il tempo reale continua a funzionare uguale per chi è dentro. Chi non ha fatto login, o prova a collegarsi come un altro, viene respinto.
- "Accedi con Google" torna a funzionare.
- PC e telefono della stessa farmacia ricevono entrambi gli aggiornamenti in diretta.
- "Elimina account" cancella davvero tutto.

## Flusso
1. Federico approva questo piano.
2. Vengono corretti i 5 problemi gravi, ciascuno con un test che lo dimostra.
3. Viene consegnato un rapporto finale con la lista completa e cosa è stato toccato.
4. Federico apre la PR con "Save to Github" e la CI esistente fa da controllo prima del merge.

## Fasi
- **Fase 1 (ora):** correzione dei 5 problemi gravi, test per ognuno, aggiornamento di `SICUREZZA.md`.
- **Fase 2:** i problemi non urgenti elencati sopra, più pulizia del codice morto.
- **Fase 3:** limite ai tentativi condiviso tra più istanze di Render e reset periodico della demo, due punti già annotati in `PIANO-FINALE.md`.

## Assunzioni
- Il canale in tempo reale si protegge con il cookie di sessione che il browser già invia, quindi non serve cambiare il modo in cui l'app si collega né chiedere di nuovo il login.
- Senza `GOOGLE_CLIENT_ID` l'accesso con Google viene rifiutato invece di essere accettato.
- Le correzioni non cambiano l'aspetto dell'app né le regole di business, come gli stati delle consegne, i piani e la cassa.
- Non vengono toccati Render, Vercel, Atlas né alcun segreto. Nessun dato di produzione viene letto o modificato.
- Nessun push su `main`: la pubblicazione resta a Federico, tramite PR.
- La revisione è stata fatta sui file più sensibili (avvio del server, autenticazione, admin, sessioni, foto, demo, tempo reale) e non riga per riga su tutti i moduli.
