# PIANO FINALE — sicurezza e pulizia

Obiettivo, nelle parole di Federico: **chiunque deve poter lavorare su
PharmaTrack senza rischiare di rompere qualcosa**, con uno schema chiaro e tutto
pronto. Questo file è il programma: cosa si fa, in che ordine, come si verifica
che sia fatto, e cosa serve da lui.

Stato al 12 novembre 2026. **Blocchi 0, 1 (tranne 1.4), 2, 3, 4 e 5 in
produzione.** Restano 1.4 (reset periodico della demo: serve il via di Federico)
e il blocco 6 (tre decisioni che spettano a lui).

---

## Il principio

Un progetto è "sicuro da toccare" quando sbagliare è difficile e, se sbagli, te
ne accorgi prima di pubblicare. Quindi tre strati, in quest'ordine:

1. **Lo schema**: dove sta cosa, cosa è vietato, cosa succede se clicchi
   (documentazione che non mente, verificata da un test).
2. **Le guardie**: controlli automatici che rendono impossibile mergiare un
   errore noto (segreti, prop orfane, endpoint rinominati, stati scritti a mano).
3. **Le trappole rimosse**: le cose che oggi aspettano solo che qualcuno le
   tocchi (credenziali pubbliche, rami morti, variabili finte).

---

## Blocco 0 — la rete (fatto, `main`)

| # | Intervento | Perché | Verifica |
| --- | --- | --- | --- |
| 0.1 | `docs/ARCHITETTURA.md` | non esisteva un posto unico con topologia, ruoli, flusso di una richiesta, macchina a stati e percorso di rilascio | riletto contro il codice, riga per riga |
| 0.2 | `docs/SICUREZZA.md` | le difese erano sparse in memoria e chat; i buchi noti non erano scritti da nessuna parte | ogni difesa indicata ha un file o un test che la prova |
| 0.3 | `backend/tests/unit/test_env_contract.py` | `env.example` prometteva `MONGO_DB_NAME` (il codice legge `DB_NAME`, senza default: `KeyError` al primo avvio) e `SESSION_SECRET` (che nessuno legge); `render.yaml` dichiarava tre variabili morte | 8 test; rosso se codice, esempi e `render.yaml` divergono |
| 0.4 | `backend/env.example` e `frontend/env.example` riscritti | un file di esempio sbagliato costa mezz'ora a chi arriva e insegna una difesa inesistente | il test 0.3 è verde |
| 0.5 | `scripts/controlla-segreti.sh` + job CI `Sicurezza (segreti)` | GitHub secret scanning richiede Advanced Security, che qui non c'è; il 4/11 una password admin è rimasta versionata per settimane | controlla i file versionati e il bundle dopo il build; provato piantando una chiave AWS finta |
| 0.6 | `render.yaml` ripulito | togliere le variabili morte evita che qualcuno le "configuri" credendo che servano | deploy Render verificato dopo il merge |

---

## Blocco 1 — le credenziali demo (P0, il buco più grosso)

Fino all'11 novembre il bundle pubblico conteneva `test@farmaciaprova.it` /
`Test1234!` e `luca@fattorino.it` / `Driver123!`. Non era solo una password in
chiaro: quel tenant **era lo stesso account su cui giravano i test di
integrazione notturni**, quindi chiunque poteva entrare e falsificare i dati su
cui misuriamo l'isolamento fra farmacie. Oggi il bundle è pulito e i test hanno
un account proprio.

| # | Intervento | Come | Rischio | Verifica |
| --- | --- | --- | --- | --- |
| 1.1 | Login demo lato server | `POST /api/auth/demo` che accetta `{"ruolo":"pharmacy"|"driver"}`, legge le credenziali da `DEMO_PHARMACY_*` / `DEMO_DRIVER_*` su Render e restituisce il cookie come un login normale. La landing chiama solo quello | basso | i pulsanti Demo entrano; nel bundle non c'è più nessuna password |
| 1.2 | Test che chiude la porta | nel job frontend: dopo il build, fallisce se `dist/` contiene `farmaciaprova`, `Test1234!`, `Driver123!` o il pattern `password:"..."`. Sostituisce la fiducia con una guardia | nullo | provato piantando le stringhe |
| 1.3 | Tenant di test dedicato | farmacia `test-suite@...` creata con un workflow usa e getta via `MONGO_URL_ADMIN` (gli utenti non si creano da codice con le chiavi Atlas), secret `PT_TEST_EMAIL` / `PT_TEST_PASSWORD` aggiornati, una notte di test verdi | medio: tocca la suite notturna | il run delle 03:00 passa su 17 test |
| 1.4 | Demo libera di sporcarsi | con il test su un altro account, il tenant demo può essere usato da chiunque senza conseguenze; aggiungere un reset settimanale facoltativo (svuota consegne e clienti creati dalla demo) | basso | login demo → crea consegna → la demo altrui non si rompe |

**Stato, verificato in produzione l'11-12 novembre:**

- **1.1 fatto** (PR 238, `main` a `652ea31`): `POST /api/auth/demo` apre la
  sessione per il ruolo richiesto. Verificato live: 200 con l'email demo giusta
  per farmacia e fattorino, 422 su un ruolo inventato, sessione valida su
  `/auth/me` e `/driver/me`.
- **1.2 fatto** (PR 238): il controllo sta in `scripts/controlla-segreti.sh
  --dist` e gira nel job `Sicurezza (segreti)`, che è fra i cinque check
  obbligatori. Provato piantando le stringhe: la CI va rossa. Il chunk
  `LandingPage-*.js` servito dal sito ha zero occorrenze di `Test1234!`,
  `Driver123!`, `farmaciaprova`, `VITE_DEMO_`.
- **1.3 fatto** (12/11): farmacia `federicomellino+pharmatrack-qa@` creata in
  produzione via `POST /api/auth/register` (niente `MONGO_URL_ADMIN`: non
  serviva), con un cliente, un fattorino e una consegna di prova perché i test
  di isolamento non risultassero verdi a vuoto. Secret `PT_TEST_EMAIL` /
  `PT_TEST_PASSWORD` aggiornati con l'API di GitHub. Prova: 10 test notturni
  verdi in locale sul nuovo account, poi `test-integrazione.yml` lanciato a mano
  → run 43008864168 **success** con tutti e tre gli step.
- **1.4 resta aperto**: reset periodico del tenant demo.

**Serve da Federico:** niente per chiudere il blocco 1; solo la conferma se
vuole il reset automatico della demo (1.4).

---

## Blocco 2 — le guardie che mancano

Il difetto più frequente non è scrivere male una funzione: è **rinominare una
cosa e dimenticare uno dei due lati**. Oggi lo scopri in produzione.

| # | Intervento | Cosa impedisce | Costo |
| --- | --- | --- | --- |
| 2.1 | Test "endpoint chiamati dal frontend esistono nel backend" | rinominare `/api/deliveries/{id}/settle` e lasciare il frontend che chiama il vecchio nome (404 a runtime, CI verde) | S |
| 2.2 | Test "ogni rotta di `App.tsx` ha una pagina e almeno una prova E2E, o è in una lista motivata" | pagina nuova senza nessun test: è così che sono passati `SchedaCliente` rotto e `<Phone/>` non importato | S |
| 2.3 | Contratto già esistente esteso: nessun router scrive `status` a mano | la tabella `delivery_lifecycle` è l'unica autorità sugli stati | S |
| 2.4 | `docs/` verificato: i link interni non devono essere rotti | documentazione che punta a file spostati | S |

Tutti e quattro girano in `tests/unit`, quindi costano secondi.

**Stato al 12 novembre, tutto scritto e verde in locale:**

- **2.1 fatto**: `backend/tests/unit/test_contratto_endpoint.py` confronta le
  chiamate del frontend (111 distinte, sia `${API}/...` sia quelle del livello
  unico di lettura `src/lib/api.js`) con le rotte vere lette da FastAPI (124).
  Provato rinominando `/customers` in `/clienti` e `/deliveries` in
  `/consegne`: va rosso e nomina il file e la chiamata.
- **2.2 fatto**: `test_contratto_rotte.py` legge le 31 rotte di `App.tsx` e
  pretende che il file importato esista e che il percorso compaia in
  `frontend/e2e/`. Le quattro schermate scoperte sono state coperte davvero
  (pubbliche `/reset-password` e `/verify-email` in `rotte.spec.js`, dettaglio
  consegna e chat del fattorino in `smoke.spec.js`), non esentate. Provato
  aggiungendo una rotta finta: va rosso.
- **2.3 fatto**: `test_contratto_stati_consegna.py` legge i router con l'AST e
  pretende che ogni scrittura di uno stato di consegna passi da
  `valuta_scrittura()` o da un costruttore `build_*_updates()`. I filtri
  (`{"status": "delivered"}`, `query["status"]`) sono riconosciuti come letture,
  con un test che verifica la distinzione. Provato piantando
  `modifiche["status"] = "delivered"`: va rosso.
- **2.4 fatto**: `test_documentazione_link.py` verifica i link relativi in
  README, AGENTS e `docs/`, comprese le ancore (`#sezione`), sul modello di
  GitHub. Provato piantando un link a un file inesistente: va rosso.

---

## Blocco 3 — pulizia del repository

| # | Intervento | Dettaglio |
| --- | --- | --- |
| 3.1 | 8 rami morti | `feature/auto-*`, `feature/report-pro-schede`, `feature/serratura-piani`, `feature/ricorrenze-analisi-cliente`, `feature/notifiche-interruttore-unico`: residui di squash merge. Due hanno commit "avanti" che sono la stessa roba già in `main`: si confronta il diff prima di cancellare |
| 3.2 | `delete_branch_on_merge` | impostazione del repository: i rami si cancellano da soli dopo il merge, così il problema non si ripresenta |
| 3.3 | Dependabot | raggruppare gli aggiornamenti (un PR a settimana invece di dieci), escludere i salti di minor per Python (il 1/11 un bump raggruppato ha steso il backend) |
| 3.4 | Residui | `docs/archivio` e `docs/outreach`: verificare che siano storia utile e non peso; `memory/` non deve tornare |

**Stato al 12 novembre:**

- **3.1 fatto**: undici rami cancellati, `main` è l'unico ramo rimasto. Prima di
  cancellare ho confrontato ogni ramo con `main`: nove erano già dentro
  (`ahead_by: 0`), due (`feature/auto-20261110-1902`, commit `b546549` e
  `041795b`; `feature/notifiche-interruttore-unico`, commit `d53a17d`) avevano
  commit "avanti" che erano però la stessa roba arrivata in `main` con squash
  merge (PR 233 e PR 235). Verificato sulle firme: `svegliaBackend.js`,
  `NotificheCard.jsx`, `sveglia-backend.yml` e `test_preferenze_notifiche.py`
  sono in `main`, e `staff.py` è assente in entrambi. Nessuna PR aperta al
  momento della cancellazione.
  SHA cancellati, per ritrovarli se servisse: `f525083` `9e7e3ce` `532a56d`
  `189293f` `b546549` `1bbf2ec` `41d6bad` `d53a17d` `0abc949` `2f0a0e4`
  `1eb7705`.
- **3.2 fatto**: `delete_branch_on_merge` ora è `true` sul repository, quindi il
  ramo sparisce da solo quando la PR viene mergiata.
- **3.3 fatto**: Dependabot era già raggruppato per npm (minor e patch) e pip
  (solo patch, con i major e i minor ignorati: il bump che il 1/11 ha steso il
  backend). Aggiunto il gruppo anche per `github-actions`, che era l'unico a
  poter aprire fino a due PR separate al mese.
- **3.4 fatto (11/11)**: `docs/archivio` resta (manifest Emergent piu' il PRD
  del 2026, che ora sono descritti nel suo `README.md`: prima il PRD non era
  spiegato da nessuna parte). `docs/outreach/` non era documentazione del
  prodotto ma due bozze di email commerciali del 29 ottobre: spostate in
  `docs/archivio/outreach/`, cosi' `docs/` contiene solo la documentazione
  tecnica e le bozze restano recuperabili. `memory/` non e' tornato: git non lo
  traccia e nessun file lo cita.

---

## Blocco 4 — operatività (accorgersi in un minuto)

| # | Intervento | Cosa risolve |
| --- | --- | --- |
| 4.1 | `verifica-produzione.yml`: dopo ogni push su `main`, pinga `/api/health`, scarica l'entry `index-*.js`, controlla che ogni `assets/*.js` referenziato risponda `application/javascript`, e fa un login demo | il caso "deploy verde ma sito bianco" (già successo due volte) lo vede GitHub, non l'utente |
| 4.2 | Verifica Render senza `RENDER_API_KEY` | è già possibile: Render registra il deploy come GitHub Deployment sul commit, quindi `GET /deployments?ref=main` + `/statuses` dicono se il backend è su. Va scritto in `CONTRIBUTING.md` e usato dalla skill di salute, così non serve un token che non c'è |
| 4.3 | Allarmi | `allarmi.yml` esiste e manda email a `ALERT_EMAIL`: verificare che copra anche "deploy fallito", non solo "API giù" |

**Stato al 11 novembre, scritto e provato contro la produzione vera:**

- **4.1 fatto**: `.github/workflows/verifica-produzione.yml` con
  `.github/scripts/verifica_produzione.py`, gira a ogni push su `main` (e a mano).
  Guarda `/api/health`, scarica la home e **ogni** asset che cita controllando il
  tipo (`application/javascript`, `text/css`), apre il login demo dei due ruoli e
  legge lo stato del deploy Render. Se il primo giro è rosso aspetta 90 secondi e
  riprova, perché il deploy parte insieme al controllo. Provato in due modi
  contro la produzione: sul sito vero esce 0 e stampa cinque righe `ok`;
  puntandolo a una pagina inesistente esce 1 e nomina i cinque asset che tornano
  `text/html` invece di javascript, cioè esattamente il guasto "deploy verde,
  sito bianco".
- **4.2 fatto**: `render_check` della skill di salute ora legge i **GitHub
  Deployments**, quindi funziona senza `RENDER_API_KEY`. Due trappole trovate e
  chiuse: Render mette lo sha in `sha` e `main` in `ref`, il nome del servizio sta
  in `environment` (cercarlo nel `ref` non trova mai niente: la prima versione
  rispondeva sempre "nessun deploy"), e il ripiego su `CLOUDINARY_API_KEY` come
  chiave Render era sbagliato, tolto. Ricetta anche in `CONTRIBUTING.md` §5.
- **4.3 fatto**: `allarmi.py` controllava già i run dei workflow; aggiunto il
  controllo su `verifica-produzione.yml`, così un sito rotto o un deploy fallito
  arriva per email invece di aspettare che qualcuno apra le Actions.

---

## Blocco 5 — chi arriva domani

| # | Intervento | Contenuto |
| --- | --- | --- |
| 5.1 | `docs/PRIMO-GIORNO.md` | quali accessi servono (GitHub, Vercel, Render, Atlas, Sentry, Brevo) e chi li dà; come si avvia in locale in 5 minuti; i tre lavori buoni per iniziare; le cinque cose da non toccare senza Federico |
| 5.2 | PR template aggiornato | al posto di "ho testato": le caselle vere (`./verifica.sh --completo` verde, deploy verificato se tocca `backend/`, nessun segreto, docs aggiornate se cambia uno schema) |
| 5.3 | `AGENTS.md` e `README` allineati | link a ARCHITETTURA e SICUREZZA in testa, così la prima pagina porta allo schema |

**Stato al 12 novembre:**

- **5.1 fatto**: `docs/PRIMO-GIORNO.md`. Gli accessi sono in tabella con chi li
  concede e cosa **non** puoi fare senza (GitHub, Vercel, Render, Atlas, Sentry,
  Brevo, Cloudinary), piu' la regola che i segreti di produzione non si chiedono
  e non circolano. Avvio in locale in cinque minuti con i comandi veri e la nota
  che i test unitari non aprono il database. Tre lavori per iniziare scelti per
  essere utili davvero (provarsi una ricetta di `CONTRIBUTING.md` e correggerla,
  coprire un ramo di errore con un test, aggiungere una guardia provandola con
  l'errore piantato) e cosa **non** e' un buon primo lavoro. Le cinque cose da
  non toccare sono le stesse di `AGENTS.md`, scritte una volta sola in due punti
  con lo stesso contenuto.
- **5.2 fatto**: il template della PR ora chiede le caselle vere al posto di "ho
  testato": `./verifica.sh` e `--completo`, pin Python con venv pulito, deploy
  Render verificato se si tocca `backend/` (con il rimando alla ricetta senza
  chiave), `docs/ARCHITETTURA.md` aggiornato se cambia uno schema, nessun file
  temporaneo committato.
- **5.3 fatto**: `README.md` e `AGENTS.md` avevano gia' i link a ARCHITETTURA e
  SICUREZZA in testa; aggiunto il rimando a `PRIMO-GIORNO.md` in entrambi e in
  `CONTRIBUTING.md`, cosi' chi arriva non deve indovinare da dove partire.
  `test_documentazione_link.py` copre anche il file nuovo: se un domani sposto
  una sezione, il link che si rompe lo dice la CI.

---

## Blocco 6 — decisioni che spettano a Federico

| # | Scelta | Alternative |
| --- | --- | --- |
| 6.1 | **Ambiente di prova** | (a) niente, si usa la preview di Vercel + dati demo; (b) secondo servizio Render + secondo progetto Vercel + database separato: ~0 € ma due cose da mantenere, ed è l'unico modo per provare una migrazione dati senza rischio |
| 6.2 | **Render Starter** (7 $/mese) | toglie l'attesa di 40-90 secondi al primo accesso e il workflow che tiene sveglio il backend. Oggi la sveglia funziona, quindi è comodità, non necessità |
| 6.3 | **Secondo amministratore** | un secondo account admin con 2FA: oggi se Federico perde la password l'unica strada è Render → Environment |

---

## Ordine consigliato

```
fatto   blocco 0                la rete: schema, segreti, contratto variabili
  ▼
fatto   blocco 1 (1.1-1.3)      demo lato server, guardia sul bundle, tenant di test
  ▼
fatto   blocco 2 (2.1-2.4)      guardie sui rinomini
  ▼
fatto   blocco 3 (3.1-3.4)      rami morti, cancellazione automatica, dependabot, residui
  ▼
fatto   blocco 4 (4.1-4.3)      verifica automatica del deploy e allarmi
  ▼
fatto   blocco 5 (5.1-5.3)      chi arriva domani: PRIMO-GIORNO, template PR, rimandi
  ▼
1.4     blocco 1 (coda)         reset periodico della demo   ← serve il via di Federico
  ▼
6.x                        le tre decisioni
```

Ogni blocco è un rilascio a sé: `./verifica.sh --completo` verde, PR, merge,
verifica in produzione, e questo file aggiornato (la colonna "stato" è la
verità su cosa è chiuso).
