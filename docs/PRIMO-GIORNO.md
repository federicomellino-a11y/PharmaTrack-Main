# PRIMO-GIORNO — il primo giorno su PharmaTrack

Questa pagina serve a chi arriva adesso: quali accessi chiedere, come avere
l'app che gira sul proprio computer in cinque minuti, da dove cominciare a
leggere e cosa non toccare. Il resto della documentazione parte dopo.

Da sapere subito: **`main` è la produzione**. Un merge pubblica su Vercel e
Render in pochi minuti, davanti alle farmacie che stanno lavorando. Non esiste
un ambiente di staging.

---

## 1. Gli accessi (e chi te li dà)

Nessuno di questi lo attivi da solo: li concede Federico. Chiedili tutti il
primo giorno, anche quelli che ti sembrano inutili, perché aspettarli a metà
lavoro è la perdita di tempo più frequente.

| Accesso | A cosa serve | Senza, cosa non puoi fare |
| --- | --- | --- |
| **GitHub** — repo `federicomellino-a11y/PharmaTrack-Main`, invito come collaboratore | rami, pull request, CI, workflow | niente PR: puoi solo leggere il codice |
| **Vercel** — progetto `pharmatrack` | deploy del frontend, preview di ogni PR, log delle build | non vedi perché una build è rossa |
| **Render** — servizio `pharmatrack-api` (Francoforte, piano free) | backend, variabili d'ambiente, log | non sai perché il backend non parte |
| **MongoDB Atlas** — cluster del progetto (di norma in sola lettura) | database vero, `MONGO_URL` per il locale | lavori alla cieca sui dati |
| **Sentry** — progetto `pharmatrack` | errori di produzione, filtrati per release | non vedi gli errori che vedono le farmacie |
| **Brevo** — relay SMTP, mittente `federicomellino@gmail.com` (unico validato: `noreply@pharmatrack.app` richiede il dominio autenticato) | email transazionali (reset password, codici di accesso, inviti) | solo se lavori sulle email |
| **Cloudinary** — foto delle consegne | le foto dei POD in produzione | solo se lavori sulle foto |

I segreti dei workflow (`.github/workflows/`) li gestisce Federico: a te non
servono, e non vanno copiati da nessuna parte.

**Regola che vale dal primo minuto:** le password di produzione non si chiedono
e non circolano in chat, in un file o in un commit. Si lavora con la preview di
Vercel, i test in locale e le pull request. Se ti serve una cosa che richiede
la password vera, la fa Federico o ti dà un accesso suo (per esempio un account
farmacia di prova, mai le credenziali dell'account reale).

---

## 2. L'app sul tuo computer in cinque minuti

Servono git, Node 20 o superiore e Python 3.11.

```bash
git clone https://github.com/federicomellino-a11y/PharmaTrack-Main.git
cd PharmaTrack-Main

# frontend (una volta, circa due minuti)
cd frontend && npm ci && cd ..

# backend (una volta)
cd backend && python3 -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt && cd ..

# variabili d'ambiente: i due esempi sono già pronti e commentati
cp backend/env.example backend/.env
cp frontend/env.example frontend/.env
```

Poi il controllo che dice se il repository è sano:

```bash
./verifica.sh              # lint, tipi, test unitari, build (circa un minuto)
./verifica.sh --completo   # aggiunge gli E2E Playwright sul build appena fatto
```

I test unitari del backend non aprono il database e non vanno in rete: partono
anche con `MONGO_URL=mongodb://localhost:27017` e senza Mongo acceso. Per
l'app completa in locale servono un Mongo (va bene vuoto) e un `MONGO_URL`
vero, che sta su Render → `pharmatrack-api` → Environment.

Per vedere l'app: `cd backend && uvicorn server:app --reload` in un terminale e
`cd frontend && npm run dev` nell'altro. Il frontend parla con
`http://localhost:8000` (`VITE_BACKEND_URL`). Il login demo funziona anche in
locale: i due pulsanti della pagina iniziale chiamano `POST /api/auth/demo` e
la sessione la apre il server.

---

## 3. Da dove cominciare a leggere

Nell'ordine, senza saltare:

1. [`AGENTS.md`](../AGENTS.md) — le regole e il perché di ognuna (ogni regola è
   un guasto già successo, con la data accanto).
2. [`docs/ARCHITETTURA.md`](ARCHITETTURA.md) — la mappa: ruoli, il viaggio di
   una richiesta, la macchina a stati delle consegne, come si rilascia.
3. [`CONTRIBUTING.md`](../CONTRIBUTING.md) — il giro di lavoro pratico e le
   ricette (rotta nuova, pagina nuova, campo nuovo, lettura nuova).
4. [`docs/SICUREZZA.md`](SICUREZZA.md) — cosa è protetto e cosa resta scoperto.
   Serve per non riaprire un buco già chiuso.

---

## 4. Tre lavori buoni per cominciare

Scelti perché toccano il progetto vero e si vedono finiti in un giorno, senza
mettere a rischio la produzione.

**a) Prendi una ricetta di `CONTRIBUTING.md` e falla davvero.** Segui alla
lettera, per esempio, "Una rotta API nuova" e "Una lettura nuova nel frontend"
su un dato che non serve a nessuno (poi cancella il ramo). Dove la ricetta non
basta, correggi la ricetta nella stessa PR. È il lavoro più utile che può fare
chi arriva: chi ha appena imparato qualcosa è l'unico che si accorge di cosa
manca nella spiegazione.

**b) Copri un ramo di errore con un test.** Le guardie coprono i percorsi
felici meglio dei rifiuti: un endpoint che deve rispondere 403 a un fattorino
che chiede i dati di un'altra farmacia, una fascia oraria scritta male, un
importo negativo. Un test unitario in `backend/tests/unit/` o in
`frontend/src/**/__tests__/`, che descrive il caso nel nome. Non serve toccare
il codice: se il test è rosso, hai trovato un difetto vero, e allora chiedi
prima di correggerlo.

**c) Aggiungi una guardia piccola.** I controlli automatici stanno in
`backend/tests/unit/test_regole_repository.py` e in
`frontend/src/__tests__/regole-repository.test.js`: se hai visto una classe di
errore ripetersi (un file fuori posto, un'etichetta duplicata, un link alla
documentazione che punta nel vuoto), scrivi il controllo che la blocca e
provalo piantando l'errore apposta. Una guardia non provata non è una guardia.

Quello che **non** è un buon primo lavoro: rifattorizzare una pagina grande
senza una richiesta, "normalizzare" le etichette di stato (è una scelta di
prodotto ancora aperta), toccare i pin Python, o cambiare i testi che leggono
le farmacie.

---

## 5. Cinque cose da non toccare senza Federico

1. **Gli account demo** (`test@farmaciaprova.it` e il fattorino) e i due
   pulsanti demo della pagina iniziale: sono la vetrina del prodotto. La
   sessione la apre il server, mai il browser.
2. **La farmacia di prova della suite notturna**
   (`federicomellino+pharmatrack-qa@…`): è un tenant vero con una consegna
   dentro. Non cancellarla, non cambiarle la password.
3. **Le variabili d'ambiente e `ADMIN_PASSWORD`** su Render e Vercel: una
   modifica sbagliata lì si vede in produzione, non in CI.
4. **I dati veri delle farmacie**: niente cancellazioni o scritture in
   produzione senza il suo via. Il repository è pubblico.
5. **Piani, prezzi e fatturazione**: sono decisioni di prodotto, non di codice.

---

## 6. Se sei bloccato

- Un controllo rosso in locale e non capisci perché: `./verifica.sh` stampa il
  riepilogo controllo per controllo, e ogni guardia ha un messaggio che dice
  quale file e quale regola.
- Un deploy rosso: i log della build stanno su Vercel (frontend) e Render
  (backend). Se il backend non riparte, la ricetta è in
  [`CONTRIBUTING.md` §5](../CONTRIBUTING.md#5-dopo-il-merge).
- Un dubbio su cosa è rotto in produzione: la skill `pharmatrack_health --full`
  controlla deploy, release servita, backend e Sentry in un colpo solo.
- Una scelta di prodotto (testi, flussi, prezzi): si chiede, non si decide.
