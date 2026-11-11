# SICUREZZA — cosa difende cosa, e cosa resta scoperto

Documento di lavoro, non una dichiarazione di conformità. Dice **cosa è
protetto, da chi, e dove sono i buchi**, così chi entra nel progetto sa dove
può appoggiarsi e dove no. Se cambi un meccanismo di autenticazione, un
permesso o un segreto, aggiorna questa pagina nello stesso commit.

Ultimo aggiornamento: 12 novembre 2026.

---

## 1. Le difese che ci sono

| Difesa | Dove vive | Cosa ferma |
| --- | --- | --- |
| Sessione server-side | `app/core/security.py` + `sessions` | token rubato si revoca cancellando la riga; il cookie è `HttpOnly; Secure; SameSite=None`, 7 giorni |
| Ruoli | `get_current_user` / `get_current_driver` / `get_current_admin` | un fattorino non legge i dati della farmacia: cookie diversi |
| Isolamento tenant | filtro `pharmacy_id` in ogni query | una farmacia non vede né i fattorini né le consegne di un'altra (test notturni) |
| Difesa CSRF | `SecurityHeadersMiddleware`: `Origin` ammesso solo se in `CORS_ORIGINS` | POST/PUT/DELETE da un sito ostile; le richieste senza `Origin` (curl, job, bridge) passano, e va bene: un CSRF ha sempre un browser dietro |
| CORS | `CORS_ORIGINS` | letture da origini estranee: nessun `Access-Control-Allow-Origin` |
| Rate limit | middleware + `LOGIN_RATE_LIMIT` ecc. | forza bruta sul login (429 dal quarto tentativo sbagliato), spam su registrazione e segnalazioni pubbliche |
| Header | middleware API + `frontend/vercel.json` | clickjacking (`X-Frame-Options: DENY`, `frame-ancestors 'none'`), sniffing MIME, HTTPS obbligato (HSTS 1 anno, preload) |
| CSP bloccante | `frontend/vercel.json` | script e sorgenti non dichiarate; attiva dal 4/11, zero violazioni reali |
| Documentazione API chiusa | `ENVIRONMENT=production` | `/api/docs`, `/api/redoc`, `/api/openapi.json` rispondono 404 |
| Audit | `audit_log` | chi ha annullato, ripristinato, letto il database: la traccia resta |
| Console admin | `/console-federico` + `admin_session` + TOTP facoltativo (`ADMIN_TOTP_SECRET`) | accesso ai tenant e al database in sola lettura (filtri con operatori in allowlist: niente `$where`) |
| Backup | workflow notturno, AES256 | perdita dati: dump cifrato, 30 giorni, ripristino provato il primo del mese |
| Dipendenze | CI: `npm audit` (high/critical), `pip-audit` | advisory gravi su pacchetti di produzione |
| Segreti | `scripts/controlla-segreti.sh` in CI | chiavi e password versionate per errore, e segreti finiti nel bundle |

Verificato a mano in produzione, non dedotto: CORS ostile senza allow-origin,
429 al quarto login errato, cookie `HttpOnly/Secure/SameSite`, docs a 404,
endpoint admin a 401 senza sessione, una sessione farmacia che non apre la
console admin, bundle senza chiavi server (`AIza`, `sk-`, `mongodb+srv`, `ghp_`).

---

## 2. Dove vivono i segreti (e chi li può ruotare)

| Segreto | Dove | A cosa serve | Se lo perdi |
| --- | --- | --- | --- |
| `MONGO_URL` | Render → Environment | connessione al database | il backend non parte: si rigenera dall'utente Atlas |
| `ADMIN_PASSWORD` | Render → Environment | console admin | si cambia lì, il vecchio vale più niente |
| `ADMIN_TOTP_SECRET` | Render → Environment | 2FA della console (vuoto = spento) | si rigenera dal QR, va rifatto l'enrollment |
| `CORS_ORIGINS` | Render | origini ammesse (e difesa CSRF) | si riscrive: è un elenco di URL |
| `SMTP_*`, `ALERT_EMAIL` | Render | email e allarmi | credenziali Brevo dal pannello Brevo |
| `VAPID_*` | Render | notifiche push | rigenerando le chiavi vanno ri-registrati i dispositivi |
| `CLOUDINARY_*` | Render | foto delle consegne | senza, le foto vanno su disco e si perdono al riavvio |
| `GOOGLE_CLIENT_ID` | Render / Vercel | accesso con Google | Google Cloud → Credentials |
| `VITE_*` | Vercel → Environment | finiscono **nel bundle pubblico**: solo URL e chiavi da browser | si cambiano e si ridistribuisce |
| `PT_TEST_EMAIL` / `PT_TEST_PASSWORD` | GitHub → Secrets | farmacia di prova dei test notturni (`federicomellino+pharmatrack-qa@`), **non** l'account demo | si ricrea la farmacia e si aggiornano i due secret |
| `MONGO_URL_BACKUP` | GitHub → Secrets | dump notturno con utente *sola lettura* | si ricrea l'utente in Atlas |
| `MONGO_URL_ADMIN` | GitHub → Secrets | operazioni straordinarie sul database | — (potere distruttivo: serve l'ok di Federico) |
| `BACKUP_PASSPHRASE` | GitHub → Secrets + gestore password | cifratura dei dump | **senza, i backup sono rumore** |
| `GITHUB_TOKEN`, `VERCEL_TOKEN`, `SENTRY_AUTH_TOKEN` | workspace dell'agente (`/app/.agents/.env`) | rilasci e verifiche | si rigenerano dal pannello del servizio |

Regola: **un segreto che è stato esposto si ruota, non si cancella e basta.**
La storia di git conserva tutto (è già successo con `memory/test_credentials.md`,
rimosso il 4/11 dopo settimane, con la password admin dentro).

---

## 3. Buchi noti, dichiarati

Nell'ordine in cui fanno male.

1. **La demo è aperta per scelta, non per errore.** ~~Credenziali dentro il
   bundle pubblico~~: chiuso l'11/11. Il bundle conteneva
   `test@farmaciaprova.it` / `Test1234!` e `luca@fattorino.it` / `Driver123!`;
   ora la sessione demo la apre il server (`POST /api/auth/demo`) e nel
   JavaScript pubblico non c'è più nessuna credenziale né le variabili
   `VITE_DEMO_*`. La difesa è automatica: `scripts/controlla-segreti.sh --dist`
   controlla il bundle appena costruito e fa fallire la CI se le stringhe
   ricompaiono. Resta aperto, e va bene così, il fatto che chiunque possa
   cliccare "Demo farmacia": quel tenant può essere sporcato. Non è più un
   rischio per le misure, perché dall'11/11 i test di integrazione notturni
   girano su un account dedicato (farmacia `federicomellino+pharmatrack-qa@`,
   secret `PT_TEST_EMAIL` / `PT_TEST_PASSWORD`), non sul tenant demo. Manca solo
   il reset periodico della demo: [`PIANO-FINALE.md`](PIANO-FINALE.md), punto 1.4.
2. **Nessun secret scanning della piattaforma.** GitHub Advanced Security non è
   disponibile su un repo privato personale: la copertura è il nostro script in
   CI, che è volutamente approssimativo (cerca forme note, non entropia).
3. **Nessuna revisione obbligatoria sulle PR.** La branch protection impone i
   check della CI, ma non un revisore: Federico è solo. Una PR può essere
   mergiata da chi l'ha scritta appena i check sono verdi.
4. **Un solo amministratore.** Non esiste un secondo account admin né un
   percorso di recupero: se la password si perde, si rigenera su Render.
5. **Rate limit in memoria.** Con più istanze di Render i contatori non si
   sommano; oggi l'istanza è una sola, quindi regge.
6. **`'unsafe-inline'` nella CSP** resta su `script-src` e `style-src` perché
   Google Sign-In inietta script inline. Analisi e due strade possibili in
   [`SICUREZZA-CSP.md`](SICUREZZA-CSP.md).
7. **La passphrase dei backup è in un solo posto** oltre al gestore password di
   Federico: se sparisce, i dump restano cifrati per sempre.

---

## 4. Prima di toccare qualcosa di sensibile

- **Autenticazione, sessioni, ruoli** → test prima, poi codice. I test di
  sessione (`tests/test_session_security.py`) girano solo di notte contro l'API
  viva: se li tocchi, guarda il workflow `test-integrazione` la notte stessa.
- **Stati delle consegne** → passa da `valuta_scrittura()`, non scrivere `status`
  a mano. C'è un test di contratto che se ne accorge.
- **Un endpoint nuovo** → decidi chi può chiamarlo (`get_current_user`,
  `get_current_driver`, `get_current_admin`, o pubblico) e scrivilo nel test.
- **Un campo nuovo sui clienti** → è un dato personale: la privacy è in
  `docs/PRIVACY_INFORMATIVA_BOZZA.md`, aggiornala.
- **Un segreto nuovo** → sta nell'ambiente (Render/Vercel/GitHub), mai nel repo,
  e va aggiunto alla tabella del punto 2 e a `.env.example`.

---

## 5. Se trovi un problema

Chi trova una falla non apre una issue pubblica con i dettagli. Scrive a
Federico (federicomellino@gmail.com) con: cosa serve per riprodurla, cosa si
può leggere o fare, e se è già stata sfruttata. Poi si ruota il segreto
coinvolto **prima** di correggere il codice: un buco chiuso con la chiave
ancora valida non è chiuso.
