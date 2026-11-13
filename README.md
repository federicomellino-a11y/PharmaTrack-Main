# 💊 PharmaTrack

**Gestionale consegne a domicilio per farmacie italiane.**
Coordina fattorini, traccia ogni ordine, gestisci cassa e turni, integrazione con Winfarm (Pharmaservice).

🌐 Sito live: [pharmatrack-zeta.vercel.app](https://pharmatrack-zeta.vercel.app)

> **Stai per modificare il codice?** Tre letture, in quest'ordine:
> [`AGENTS.md`](AGENTS.md) (regole e perché), [`docs/ARCHITETTURA.md`](docs/ARCHITETTURA.md)
> (la mappa: ruoli, flusso di una richiesta, macchina a stati, rilascio) e
> [`CONTRIBUTING.md`](CONTRIBUTING.md) (giro di lavoro e ricette).
> Cosa è protetto e cosa no: [`docs/SICUREZZA.md`](docs/SICUREZZA.md).
> `main` è la produzione: un merge pubblica subito.
>
> **Primo giorno qui?** [`docs/PRIMO-GIORNO.md`](docs/PRIMO-GIORNO.md): quali
> accessi chiedere, come avere l'app in locale in cinque minuti, tre lavori
> buoni per cominciare.

---

## ✨ Funzionalità

| Modulo | Cosa fa |
| --- | --- |
| **Doppia conferma incasso** | Driver consegna → status "in attesa conferma". La farmacia conferma l'avvenuto incasso. Zero contestazioni. |
| **Turni & Cassa** | Apri/chiudi turno fattorino, riconciliazione contanti vs POS, auto-conferma incassi turno. |
| **Anagrafica clienti** | Storico, geocoding Google Maps, codice fiscale, recapiti aggiuntivi. |
| **Chat real-time** | Farmacia ↔ fattorino via WebSocket. |
| **Tracking live** | Posizione fattorino aggiornata sulla mappa farmacia. |
| **Notifiche push** | WebPush con VAPID anche con browser chiuso. |
| **Integrazione Winfarm** | Consegna veloce: un tasto sul PC del banco, senza API. |
| **Auth multi-portale** | Farmacia, Fattorino, Admin (path nascosto `/console-federico`). |
| **PWA installabile** | Funziona offline-ready su mobile e desktop. |
| **Report & archivio** | Statistiche, KPI fatturato, export. |

---

## 🏗️ Stack

- **Frontend**: React 19 + Vite + Tailwind 4 + Shadcn/UI → deploy su **Vercel**
- **Backend**: FastAPI + Motor (MongoDB async) + WebSocket → deploy su **Render.com**
- **Database**: MongoDB Atlas (gratis fino a 512 MB)
- **Auth**: cookie session HTTPS + Google OAuth opzionale
- **Email**: Brevo SMTP (transazionale)
- **Push**: WebPush VAPID

---

## 🚀 Deploy in produzione

### 1️⃣ Database — MongoDB Atlas
1. Crea un cluster M0 gratuito su [mongodb.com/cloud](https://mongodb.com/cloud/atlas)
2. Copia la connection string (formato: `mongodb+srv://user:pwd@cluster0.xxx.mongodb.net/...`)
3. In Network Access aggiungi `0.0.0.0/0` (oppure le IP di Render se vuoi restringere)

### 2️⃣ Backend — Render.com (free tier supporta WebSocket)
1. Fork/clona questo repo sul tuo GitHub
2. Vai su [render.com](https://render.com) → Login con GitHub → "New" → "Blueprint"
3. Seleziona la repo → Render legge automaticamente `render.yaml`
4. Compila i secret (marcati `sync: false`):
   - `MONGO_URL` → connection string Atlas
   - `DB_NAME` → nome del database (`Cluster0` in produzione). **Senza questa il backend non parte**
   - `ADMIN_PASSWORD` → password admin
   - `CORS_ORIGINS` → URL del frontend Vercel (es. `https://pharmatrack-zeta.vercel.app`)
   - `SMTP_USERNAME`, `SMTP_PASSWORD` → da [brevo.com](https://brevo.com)
   - `ALERT_EMAIL` → casella che riceve gli allarmi automatici
   - `GOOGLE_CLIENT_ID` → da [console.cloud.google.com](https://console.cloud.google.com) (OAuth Web)
   - `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` → vedi sotto come generarle
   - `VAPID_SUBJECT` → `mailto:tua@email.com`

   L'elenco completo e verificato è `backend/env.example`: un test della CI
   (`backend/tests/unit/test_env_contract.py`) diventa rosso se il codice legge
   una variabile che lì non c'è, o se lì c'è una variabile che nessuno legge.
5. Deploy → in ~3 min il backend è online su `https://pharmatrack-api.onrender.com`
6. ⚠️ Il free tier va in "sleep" dopo 15 min di inattività; primo request impiega 30 sec.

### 3️⃣ Frontend — Vercel
1. Vai su [vercel.com](https://vercel.com) → "Import Project" → seleziona il repo
2. **IMPORTANTE**: in "Configure Project" imposta:
   - **Root Directory** → `frontend` (clicca "Edit" e seleziona la cartella frontend)
   - Framework Preset → Vite (rilevato automaticamente)
3. Aggiungi le Environment Variables:
   - `VITE_BACKEND_URL` = URL backend Render (es. `https://pharmatrack-api.onrender.com`)
   - `REACT_APP_BACKEND_URL` = stesso URL
   - `VITE_GOOGLE_CLIENT_ID` = stesso client id
   - `VITE_VAPID_PUBLIC_KEY` = stessa public key dei VAPID
4. Deploy → frontend online su `https://pharmatrack-zeta.vercel.app`
5. **Torna su Render** e aggiorna `CORS_ORIGINS` con l'URL Vercel finale

### 4️⃣ Genera le VAPID keys (push notifications)
```bash
python3 - <<'PY'
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives import serialization
import base64
priv = ec.generate_private_key(ec.SECP256R1())
pub = priv.public_key()
b64 = lambda b: base64.urlsafe_b64encode(b).rstrip(b'=').decode()
print('VAPID_PUBLIC_KEY=' + b64(pub.public_bytes(serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint)))
print('VAPID_PRIVATE_KEY=' + b64(priv.private_numbers().private_value.to_bytes(32,'big')))
PY
```

---

## 🛠️ Sviluppo locale

```bash
# Backend
cd backend
cp env.example .env  # compila i secret
pip install -r requirements.txt
uvicorn server:app --reload --port 8001

# Frontend (in altro terminale)
cd frontend
cp env.example .env
npm ci
npm run dev  # http://localhost:3000
```

Prima di aprire una pull request basta un comando, che esegue gli stessi
controlli della CI (lint, tipi, test unitari, build; con `--completo` anche gli
E2E) e stampa il riepilogo:

```bash
./verifica.sh
```

### Seed dati di test
```bash
cd backend && python scripts/seed_data.py
```

Genera una farmacia, un fattorino e un amministratore di prova e stampa a video
le credenziali che ha creato (le password stanno in `scripts/seed_data.py`, non
in questo file: il repository è pubblico). La password admin è quella impostata
in `ADMIN_PASSWORD`, se presente.

---

## 🔌 Integrazione Winfarm (Pharmaservice)

Winfarm non espone API. Due strade, dalla pagina **Integrazioni**:

1. **Incolla la vendita** (niente da installare): in Winfarm selezioni la vendita, Ctrl+C,
   la incolli in PharmaTrack e si apre la consegna già compilata.
2. **Consegna veloce** (programma PowerShell per il PC del banco): Ctrl+Shift+C in Winfarm
   e la vendita arriva da sola.

Endpoint REST anche disponibile: `POST /api/integrations/winfarm/import` (dettagli nella pagina `/integrations`).

---

## 📁 Struttura repo

```
.
├── backend/                # FastAPI + MongoDB
│   ├── server.py           # entry FastAPI (~380 righe): monta i router, logica in app/
│   ├── app/                # il codice: routers/ (rotte), core/ (logica), models/ (schemi)
│   ├── scripts/            # seed_data.py (dati di test), audit_db.py (controllo dati)
│   ├── requirements.txt    # 20 dipendenze dirette, pin esatti
│   ├── runtime.txt         # Python 3.11.9
│   ├── env.example
│   └── tests/              # pytest (unit + contratto)
│
├── frontend/               # React + Vite + Tailwind 4
│   ├── src/
│   │   ├── App.tsx
│   │   ├── pages/
│   │   │   ├── pharmacy/   # Dashboard, Deliveries, Customers, Drivers, Shifts, Integrations, ...
│   │   │   ├── driver/     # Dashboard, Chat, Tracking
│   │   │   └── admin/      # Dashboard, Login
│   │   ├── components/
│   │   │   ├── ui/         # Shadcn, solo i pezzi che l'app usa davvero
│   │   │   └── Layout.jsx
│   │   ├── contexts/       # Auth, Socket, Theme, DriverAuth
│   │   ├── hooks/          # queries.js: un hook per ogni lettura
│   │   ├── lib/            # api.js (chiavi + letture), config, utility
│   │   └── __tests__/      # vitest accanto ai file che prova
│   ├── public/
│   │   ├── sw.js                     # service worker PWA
│   │   ├── manifest.webmanifest
│   │   ├── logo.png / logo.webp
│   │   └── favicon.svg, icons/, opengraph.jpg
│   ├── vite.config.ts
│   ├── vercel.json         # config deploy (rewrites SPA, header CSP)
│   ├── tsconfig.json
│   └── env.example
│
├── docs/                   # note tecniche (backup, privacy, CSP) e archivio storico
├── .github/                # CI, test notturni, backup database, allarmi, modello di PR
├── AGENTS.md               # regole per chi mette mano al codice (persone e programmi)
├── CONTRIBUTING.md         # giro di lavoro, ricette, checklist
├── render.yaml             # config deploy backend (Blueprint)
└── README.md               # questo file
```


### Dove mettere le mani

| Cosa devo cambiare | Dove sta |
|---|---|
| Una nuova rotta API | `backend/app/routers/`, poi il router si registra in `server.py` |
| La regola di un calcolo (piani, fasce, report) | `backend/app/core/` |
| Un campo nuovo su un dato | `backend/app/models/schemas.py` |
| Una pagina o una schermata | `frontend/src/pages/` |
| Come si legge un dato dal server | chiave e lettura in `frontend/src/lib/api.js`, hook in `hooks/queries.js` |
| Un test backend veloce senza database | `backend/tests/unit/` |
| Un test che gira contro l'API vera | `backend/tests/` (suite notturna, mai `DELETE`) |
| Le regole del repository | `AGENTS.md`, controllate da `tests/unit/test_regole_repository.py` |

Regola che vale per tutto il frontend: le pagine non chiamano mai `axios` per leggere. Se serve un dato nuovo, si aggiunge la coppia chiave/lettura in `lib/api.js` e l'hook; il test `migrazione-api.test.js` blocca le scorciatoie.

---

## 🔒 Sicurezza

- Cookie session `httpOnly + secure + samesite=none` per cross-origin Vercel↔Render
- Password bcrypt
- CORS whitelist (env `CORS_ORIGINS`)
- Reset password via Brevo con link firmato (1h)
- Admin path nascosto `/console-federico`

⚠️ **Non committare mai `.env`**. Il `.gitignore` esclude `backend/.env` e `frontend/.env`.

---

## 📜 Licenza

Proprietario. Vietata la copia e ridistribuzione senza autorizzazione.
