# ARCHITETTURA — la mappa di PharmaTrack

Una pagina per rispondere a tre domande: **cosa c'è**, **dove sta**, **cosa
succede quando qualcuno clicca**. Se stai per modificare qualcosa, questo file
e [`AGENTS.md`](../AGENTS.md) sono le due cose da leggere prima.

Ultimo aggiornamento: 12 novembre 2026, `main` a `652ea31`.

---

## 1. Chi usa il sistema

| Ruolo | Entra da | Cosa può fare | Come si riconosce |
| --- | --- | --- | --- |
| **Farmacia** (titolare) | `/login` | Tutto il proprio tenant: consegne, clienti, fattorini, turni, cassa, report, impostazioni | cookie `session_token` → `users` con `user_type=pharmacy` |
| **Fattorino** | `/driver/login` | Solo le proprie consegne, il proprio turno, la chat | cookie `session_token` → `users` con `user_type=driver` |
| **Super admin** | `/console-federico` | Tutti i tenant, lettura database, segnalazioni CSP | cookie `admin_session` |

Un tenant = una farmacia. L'isolamento è per `pharmacy_id` su ogni documento,
verificato dai test notturni (`tests/test_tenant_isolation.py`): una farmacia non
vede né i fattorini né le consegne di un'altra.

---

## 2. Topologia

```
                       ┌──────────────────────────────┐
  farmacia / fattorino │  browser o PWA installata    │
  (telefono o PC)      │  React 19 + Vite + Tailwind  │
                       └──────────────┬───────────────┘
                                      │ HTTPS, cookie di sessione
                    ┌─────────────────┴──────────────────┐
                    │                                    │
        ┌───────────▼────────────┐          ┌────────────▼─────────────┐
        │ Vercel                 │  fetch   │ Render (Frankfurt, free) │
        │ frontend statico       │─────────▶│ FastAPI + Motor          │
        │ + rewrite /api/*       │  /api/*  │ uvicorn, 1 worker        │
        │ + CSP + HSTS           │          │ dorme dopo 15' di silenzio│
        └────────────────────────┘          └────────────┬─────────────┘
                                                         │
                        ┌────────────────────────────────┼──────────────────────┐
                        │                                │                      │
              ┌─────────▼─────────┐        ┌─────────────▼──────┐   ┌───────────▼──────────┐
              │ MongoDB Atlas M0  │        │ Brevo SMTP         │   │ Sentry (de.sentry.io) │
              │ Cluster0, 512 MB  │        │ email transazionali│   │ errori, per release   │
              │ backup = workflow │        └────────────────────┘   └──────────────────────┘
              └───────────────────┘
                        ▲
        ┌───────────────┴─────────────────────────────────────────────┐
        │ GitHub Actions (repo pubblico → minuti gratis)              │
        │  ci.yml              lint, tipi, test, build, E2E, segreti   │
        │  test-integrazione   ogni notte 03:00 contro l'API viva     │
        │  backup-db           ogni notte 01:30, mongodump cifrato    │
        │  dr-test             mensile: ripristino del backup         │
        │  sveglia-backend     ogni 10' 6-20 UTC: tiene su Render     │
        │  allarmi             controlla API, backup e test notturni  │
        └─────────────────────────────────────────────────────────────┘

  PC della farmacia (facoltativo): Winfarm ──▶ Consegna veloce (PowerShell)
     preme Ctrl+Shift+C, legge la schermata, POST /api/integrations/winfarm/bridge
     con header X-Bridge-Token (nessuna sessione browser)
```

**Non esiste uno staging.** `main` *è* la produzione: un merge pubblica su
Vercel e, se il commit tocca `backend/`, ricostruisce Render. Il sostituto dello
staging sono le **preview di Vercel**: ogni pull request ottiene un URL suo
(`pharmatrack-<hash>.vercel.app`) che parla con l'API di produzione in sola
lettura ma monta *il tuo* frontend. È lì che si guarda una modifica di interfaccia
prima del merge.

---

## 3. Dove sta il codice

```
backend/
  server.py                entry: monta i router, lifespan, normalizzazioni all'avvio
  app/
    routers/               una rotta = un file (34 router): deliveries, customers,
                           drivers, driver_deliveries, driver_auth, pharmacy_auth,
                           shifts, messages, photos, analytics, statistics, plan,
                           integrations, admin, csp_reports, health, ...
    core/                  la logica che non parla HTTP
      security.py            sessioni, ruoli, get_current_user/driver/admin
      security_middleware.py header di sicurezza, CORS, difesa CSRF (Origin), rate limit
      delivery_lifecycle.py  LA macchina a stati delle consegne (unica autorità)
      delivery_creation.py   costruzione del documento consegna (unica, condivisa)
      analytics.py           calcolo dei report, il router fa solo cache
      notifications.py       WebPush VAPID
      clock.py               fuso di Roma, un solo posto
    models/ schemas/       pydantic
  tests/
    unit/                  veloci, senza rete e senza database (girano in CI)
    test_*.py              contro l'API viva, girano ogni notte

frontend/
  src/pages/               una pagina = una rotta (33 rotte in App.tsx)
  src/components/          parti riusabili, per area (deliveries/, customers/, ...)
  src/lib/api.js           TUTTE le chiavi di query e le funzioni di lettura
  src/hooks/queries.js     gli hook, uno per lettura: nessun URL qui dentro
  src/lib/                 regole pure e testabili (fasce, giorni, stati, format)
  e2e/                     Playwright sul build vero, con l'API finta

docs/                      questo file, sicurezza, backup, CSP, piani
scripts/                   controlla-segreti.sh, seed e audit del database
verifica.sh                un comando: lint, tipi, test, build (e --completo con E2E)
```

La tabella "dove mettere le mani" (campo → file, pagina → cartella, calcolo →
core) sta in [`AGENTS.md`](../AGENTS.md#dove-mettere-le-mani).

---

## 4. Il viaggio di una richiesta

1. **Login** `POST /api/auth/login` → password bcrypt (costo 10, ri-hash
   trasparente dal 12) → riga in `sessions` + cookie `HttpOnly; Secure;
   SameSite=None; Max-Age=7 giorni`.
   La **demo non esiste più** (rimossa il 13/11: pulsanti, `POST /api/auth/demo`,
   variabili `DEMO_*` e i due account). La verifica di produzione pretende che la
   rotta risponda 404. Il fattorino e la farmacia condividono
   `apri_sessione_fattorino()` / `_apri_sessione()` con il login normale.
2. **Ogni chiamata** passa da `SecurityHeadersMiddleware` (header), dal
   controllo di origine (CSRF), dal rate limit, poi da `get_current_user`, che
   legge la sessione dal database e riempie `request.state`.
3. **Il router** valida lo schema, chiama `app/core/` e scrive su Mongo.
4. **La risposta** invalida le cache React Query della pagina. Dopo un'azione su
   una consegna si invalidano `deliveries`, `drivers`, `statistics`, `archive`,
   `shifts`, `customers`: se ne manca una, la home mostra numeri vecchi.
5. **In tempo reale** (chat e posizioni) il canale è un WebSocket, non il
   polling.

---

## 5. La consegna: la macchina a stati

È la parte che tocca soldi e clienti, quindi ha una regola sola:
**nessun endpoint scrive `status` senza passare da `valuta_scrittura()`** in
`app/core/delivery_lifecycle.py`. La tabella delle transizioni è l'unica
autorità; ogni gesto (annullamento, ripristino, conferma incasso, contestazione,
chiusura turno, foto POD, rimozione fattorino) dichiara la propria `origine` e
viene validato lì. Un test di contratto fallisce se un router dichiara un'origine
per conto suo.

```
da_preparare ──assegnata──▶ assigned ──ritirata──▶ picked_up ──in viaggio──▶ in_transit
     │                          │                       │                        │
     │                          │                       │                        ▼
     └──annullata──▶ cancelled  └───────consegnata──────┴──────────────▶ delivered
                                                                              │
                                             in attesa di conferma ◀──────────┘
                                             delivered_pending_confirmation
                                                    │            │
                                          conferma ▶│            │◀ contestazione
                                                    ▼            ▼
                                                delivered    not_delivered
```

`delivered` e `delivered_pending_confirmation` sono gli stati *fatturati*
(`BILLED_STATUSES`); il ripristino riporta a `da_preparare` azzerando gli incassi
e lasciando traccia in `audit_log`.

---

## 6. Dati (collezioni principali)

| Collezione | Contiene | Note |
| --- | --- | --- |
| `users` | farmacie, fattorini, admin | `password_hash` mai restituito; sessioni separate |
| `sessions` | token → utente | una riga per dispositivo, cancellabile |
| `deliveries` | la consegna | 28 chiavi, tutte scritte da `delivery_creation.py` |
| `customers` | anagrafica pazienti | indirizzo obbligatorio: la consegna non lo inventa |
| `drivers`, `driver_shifts` | fattorini e turni | la chiusura turno riconcilia gli incassi |
| `messages` | chat farmacia ↔ fattorino | WebSocket |
| `audit_log` | chi ha fatto cosa | annullamenti, ripristini, letture dal database |
| `csp_reports` | violazioni CSP segnalate dal browser | solo admin |
| `settings` (dentro la farmacia) | fasce, giorni di consegna, funzioni accese | "assente = acceso" |

---

## 7. Un rilascio, passo per passo

```bash
git checkout main && git pull && git checkout -b fix/cosa-sto-sistemando
# ...modifica...
./verifica.sh --completo          # lint, tipi, test, build, E2E: deve essere verde
git commit -F messaggio.txt       # -F: gli apostrofi spezzano -m
git push -u origin fix/cosa-sto-sistemando
```

1. Si apre la pull request → parte la CI: `Backend (compile)`,
   `Backend (dipendenze + test unitari)`, `Frontend (build)`,
   `Frontend (E2E)`, `Sicurezza (segreti)`. La branch protection impone i primi
   quattro (il quinto va aggiunto all'elenco dopo il primo giro verde).
2. Vercel costruisce una **preview** di quella PR: è lì che si guarda la
   modifica, non in produzione.
3. Squash merge su `main` → Vercel pubblica il frontend; se il commit tocca
   `backend/`, Render ricostruisce (i commit di solo frontend *non* toccano
   Render: è voluto).
4. Verifica: `run_skill("pharmatrack_health", "--full")` oppure, a mano,
   `/api/health`, il sito, e il chunk del frontend che contiene la stringa nuova.

---

## 8. Cosa NON è vero (errori che si fanno leggendo in fretta)

- **"C'è uno staging."** No. La preview di Vercel è un frontend, non un ambiente
  completo: condivide API e database di produzione.
- **"Il backend si aggiorna a ogni merge."** Solo se il commit tocca `backend/`.
- **"`/api/health` dice che release sta girando."** No, non espone la revisione:
  per saperlo si guarda il deployment su GitHub (`ref: main - pharmatrack-api`).
- **"Se la CI è verde, il deploy è andato."** La CI compila; il backend può
  fallire *all'avvio* (è successo il 1 novembre con i pin Python). Dopo un merge
  che tocca `requirements.txt` si guarda Render.
- **"Basta il build per accorgersi di una prop orfana."** No: serve l'E2E, che
  monta il bundle vero.
