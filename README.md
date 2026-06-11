# 💊 PharmaTrack

**Gestionale consegne a domicilio per farmacie italiane.**
Coordina fattorini, traccia ogni ordine, gestisci cassa e turni, integrazione con Winfarm (Pharmaservice).

🌐 Demo live: [pharmatrack.vercel.app](https://pharmatrack.vercel.app)

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
| **Bridge Winfarm** | Hotkey AutoHotkey + endpoint REST per importare vendite da Winfarm senza API. |
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
   - `SESSION_SECRET` → stringa casuale lunga (es. `openssl rand -base64 64`)
   - `ADMIN_PASSWORD` → password admin
   - `CORS_ORIGINS` → URL del frontend Vercel (es. `https://pharmatrack.vercel.app`)
   - `SMTP_USERNAME`, `SMTP_PASSWORD` → da [brevo.com](https://brevo.com)
   - `GOOGLE_CLIENT_ID` → da [console.cloud.google.com](https://console.cloud.google.com) (OAuth Web)
   - `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` → vedi sotto come generarle
   - `VAPID_CLAIM_EMAIL` → `mailto:tua@email.com`
5. Deploy → in ~3 min il backend è online su `https://pharmatrack-api.onrender.com`
6. ⚠️ Il free tier va in "sleep" dopo 15 min di inattività; primo request impiega 30 sec.

### 3️⃣ Frontend — Vercel
1. Vai su [vercel.com](https://vercel.com) → "Import Project" → seleziona il repo
2. Vercel rileva `vercel.json` automaticamente
3. Aggiungi le Environment Variables:
   - `VITE_BACKEND_URL` = URL backend Render (es. `https://pharmatrack-api.onrender.com`)
   - `REACT_APP_BACKEND_URL` = stesso URL
   - `VITE_GOOGLE_CLIENT_ID` = stesso client id
   - `VITE_VAPID_PUBLIC_KEY` = stessa public key dei VAPID
4. Deploy → frontend online su `https://pharmatrack.vercel.app`
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
cp .env.example .env  # compila i secret
pip install -r requirements.txt
uvicorn server:app --reload --port 8001

# Frontend (in altro terminale)
cd frontend
cp .env.example .env
yarn install
yarn dev  # http://localhost:3000
```

### Seed dati di test
```bash
cd backend && python seed_data.py
```

Genera:
- Pharmacy: `test@farmaciaprova.it` / `Test1234!`
- Driver: `luca@fattorino.it` / `Driver123!`
- Admin: `Admin@superadmin.it` / `Admin1234!` (sovrascritto da ADMIN_* in .env se diverso)

---

## 🔌 Integrazione Winfarm (Pharmaservice)

Winfarm non espone API. Il bridge funziona via **hotkey AutoHotkey + clipboard**:

1. Dalla farmacia in produzione, vai su **Integrazioni** → scarica `pharmatrack_winfarm.ahk`
2. Installa [AutoHotkey 1.1](https://www.autohotkey.com/)
3. Configura nello script l'URL della tua farmacia
4. Doppio-click per avviare → icona verde "H" in tray
5. Su Winfarm seleziona il blocco di vendita → premi **Alt+C** → si apre PharmaTrack con modulo pre-compilato

Endpoint REST anche disponibile: `POST /api/integrations/winfarm/import` (dettagli nella pagina `/integrations`).

---

## 📁 Struttura repo

```
.
├── backend/                # FastAPI + MongoDB
│   ├── server.py           # 2500+ righe, monolite
│   ├── seed_data.py        # dati di test
│   ├── requirements.txt
│   ├── Procfile            # comando start per Render
│   ├── runtime.txt         # Python 3.11.9
│   ├── .env.example
│   └── tests/              # pytest
│
├── frontend/               # React + Vite + Tailwind 4
│   ├── src/
│   │   ├── App.tsx
│   │   ├── pages/
│   │   │   ├── pharmacy/   # Dashboard, Deliveries, Customers, Drivers, Shifts, Integrations, ...
│   │   │   ├── driver/     # Dashboard, Chat, Tracking
│   │   │   └── admin/      # Dashboard, Login
│   │   ├── components/
│   │   │   ├── ui/         # Shadcn
│   │   │   └── Layout.jsx
│   │   ├── contexts/       # Auth, Socket, Theme, DriverAuth
│   │   └── hooks/
│   ├── public/
│   │   ├── pharmatrack_winfarm.ahk  # script AutoHotkey
│   │   ├── sw.js                     # service worker PWA
│   │   └── manifest.webmanifest
│   ├── vite.config.ts
│   ├── tsconfig.json
│   └── .env.example
│
├── vercel.json             # config deploy frontend
├── render.yaml             # config deploy backend (Blueprint)
└── README.md               # questo file
```

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
