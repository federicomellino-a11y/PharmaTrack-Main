# PharmaTrack — Product Requirements Document

## Original problem statement
Repository GitHub: https://github.com/federicomellino-a11y/PharmaTrack-Replit.git  
Sviluppato su Replit, deployato live, ora vogliamo continuare lo sviluppo facendo modifiche strutturali, grafiche e aggiungendo nuove funzioni.  
Esempio di feature richiesta: doppia conferma consegna+incasso (la farmacia deve confermare l'avvenuto incasso dopo che il fattorino ha consegnato).  
**User feedback chiave**: "Il farmacista deve fare tutto di fretta, prepara la consegna mentre è al banco con altra gente. Tutto deve essere veloce e organizzato. Velocizzare le operazioni in tutte le sezioni."

## Architecture
- **Frontend**: React 19 + Vite + Tailwind 4 + Shadcn/UI · `/app/frontend` (porta 3000 via supervisor)
- **Backend**: FastAPI + MongoDB Motor · `/app/backend/server.py` (porta 8001)
- **DB**: MongoDB locale `mongodb://localhost:27017` · DB_NAME=`pharmatrack`
- **Realtime**: WebSocket + WebPush (VAPID — provider keys non ancora configurate in Emergent)
- **Email**: Brevo SMTP (non configurato in Emergent)

## User Personas
- **Farmacia** (utente principale): gestisce consegne, fattorini, clienti, incassi
- **Fattorino** (driver app, dark mode): consulta consegne assegnate, aggiorna stato, gestisce turno
- **Super Admin**: console nascosta `/console-federico` per monitorare farmacie

## Core Requirements (statici, ereditati da Replit)
- Multi-portal (farmacia / fattorino / admin) con auth cookie session
- CRUD: clienti, fattorini, consegne, medici, numeri utili, note
- Chat real-time farmacia ↔ fattorino
- Tracking live posizione fattorino
- Notifiche push + in-app
- Stampa bolla consegna PDF

## Implemented (con date)

### 2026-04-25 — Migrazione su Emergent ✓
- Repo Replit clonato e adattato (Vite invece dei plugin Replit)
- Backend + Frontend + MongoDB attivi via supervisor
- Seed test data (`seed_data.py`)
- CORS configurato per origin Emergent

### 2026-04-25/28 — Fase 1: Doppia conferma + Turno fattorino ✓
**Backend** (`server.py`):
- Nuovo stato `delivered_pending_confirmation` tra `in_transit` e `delivered`
- `PUT /api/driver/deliveries/{id}/status` con status="delivered" ora salva `delivered_pending_confirmation`
- `POST /api/deliveries/{id}/confirm-payment` (farmacia): conferma incasso → status finale `delivered`, payment_collected=true
- `POST /api/deliveries/{id}/dispute-payment` (farmacia): segnala discrepanza, mantiene pending
- `GET /api/deliveries?status=active` ora include pending_confirmation; nuovo filtro `?status=pending_confirmation`
- Idempotente: rifiuta doppia conferma su delivery già `delivered+payment_collected=true`

**Turni fattorino** (collection `driver_shifts`):
- `POST /api/driver/shifts/start` — crea turno aperto (idempotente)
- `GET /api/driver/shifts/current` — turno aperto + auto-attach delivery aggiornate
- `POST /api/driver/shifts/close` — chiude turno con `declared_cash` opzionale
- `GET /api/driver/shifts` — storico turni driver
- `GET /api/shifts` (farmacia) — lista turni con filtri `driver_id`, `status_filter`
- `GET /api/shifts/{id}` — dettaglio turno con consegne
- `POST /api/shifts/{id}/settle` — farmacia conferma incasso turno (auto-conferma tutte le pending del turno)
- Helper `_attach_delivery_to_open_shift` aggancia delivery al turno aperto

**Frontend**:
- `pages/pharmacy/Deliveries.jsx`: tab "Da incassare" con badge animato; bottone verde prominente "Conferma incasso" + bottone contesta (alert); icona Euro pulsante per status pending_confirmation
- `pages/pharmacy/Shifts.jsx` (NEW): pagina Turni & Cassa con KPI (aperti/da confermare/cassa oggi), filtri, dialog conferma con campo cassa atteso vs ricevuto, dialog dettaglio con riepilogo consegne
- `pages/driver/Dashboard.jsx`: card "Turno" in alto con bottoni Inizia/Chiudi; KPI live (consegne, contanti, POS); banner attesa conferma
- `components/Layout.jsx`:
  - Voce sidebar "Turni & Cassa" (icona Wallet)
  - **Scorciatoie tastiera per velocità al banco**: `N`=nuova consegna, `C`=clienti, `D`=dashboard, `S`=turni, `/`=focus search
- Test backend: 14/14 pytest passati (`test_pharmatrack.py`)

### Test Credentials
Vedi `/app/memory/test_credentials.md`

## Backlog prioritizzato

### P0 (prossimo sprint, valore operativo immediato)
- **POD (Proof of delivery)**: foto pacco + firma digitale (canvas) lato driver
- **Notifica cliente** "il fattorino sta arrivando" (al passaggio in `in_transit`) — richiede SMTP/SMS configurato
- **Quick-create cliente da nuova consegna** (nested dialog) — già parzialmente presente, da rifinire
- **Stampa bolla rapida** + ricevuta incasso al confermato
- **Dashboard farmacia "today view"**: cassa oggi, consegne in corso, fattorini attivi, KPI live
- **Bulk actions** sulla lista deliveries: assegna a driver, segna pronte multiple

### P1 (shippability)
- Consegne ricorrenti (cronici) — schedule mensile auto-create
- Ottimizzazione percorso multi-consegna (Google Directions Waypoints)
- Export CSV/PDF archivio mensile
- 2FA admin + audit log
- Rate limit login (anti-brute force)

### P2 (crescita)
- Rating cliente post-consegna (link pubblico)
- Chat cliente (link pubblico token-based)
- PWA installabile per fattorini con coda offline
- Multi-farmacia per catene
- Gestione ricette NRE / lotti / scadenze farmaci

## Integrations needed (non ancora configurate)
- **VAPID keys** per WebPush (richieste dall'utente "magari dopo le integriamo")
- **Brevo SMTP** per reset password / notifiche email
- **Google OAuth client id** per login social
- **Google Maps** per Places API (legacy in uso, da migrare a New)
- **Twilio/WhatsApp Business** per notifiche cliente (da decidere se attivare)

## Mocked items
Nessuna API mocked. Tutte le integrazioni REAL (sebbene VAPID/SMTP non configurate, gli endpoint sono no-op when unconfigured).

## Next session
1. Mostrare la nuova UX all'utente, raccogliere feedback
2. Sviluppare P0 features
3. Quando l'utente è pronto: integrare VAPID/SMTP keys lato Replit/produzione
4. Push delle modifiche a GitHub via "Save to Github"
