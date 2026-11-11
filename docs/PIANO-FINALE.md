# PIANO FINALE — sicurezza e pulizia

Obiettivo, nelle parole di Federico: **chiunque deve poter lavorare su
PharmaTrack senza rischiare di rompere qualcosa**, con uno schema chiaro e tutto
pronto. Questo file è il programma: cosa si fa, in che ordine, come si verifica
che sia fatto, e cosa serve da lui.

Stato al 12 novembre 2026. Il **blocco 0 è già in produzione**; gli altri sono
pronti per essere eseguiti uno per giro.

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
| 0.3 | `backend/tests/unit/test_env_contract.py` | `.env.example` prometteva `MONGO_DB_NAME` (il codice legge `DB_NAME`, senza default: `KeyError` al primo avvio) e `SESSION_SECRET` (che nessuno legge); `render.yaml` dichiarava tre variabili morte | 8 test; rosso se codice, esempi e `render.yaml` divergono |
| 0.4 | `backend/.env.example` e `frontend/.env.example` riscritti | un file di esempio sbagliato costa mezz'ora a chi arriva e insegna una difesa inesistente | il test 0.3 è verde |
| 0.5 | `scripts/controlla-segreti.sh` + job CI `Sicurezza (segreti)` | GitHub secret scanning richiede Advanced Security, che qui non c'è; il 4/11 una password admin è rimasta versionata per settimane | controlla i file versionati e il bundle dopo il build; provato piantando una chiave AWS finta |
| 0.6 | `render.yaml` ripulito | togliere le variabili morte evita che qualcuno le "configuri" credendo che servano | deploy Render verificato dopo il merge |

---

## Blocco 1 — le credenziali demo (P0, il buco più grosso)

Oggi il bundle pubblico contiene `test@farmaciaprova.it` / `Test1234!` e
`luca@fattorino.it` / `Driver123!`. Non è solo una password in chiaro: quel
tenant **è lo stesso account su cui girano i test di integrazione notturni**, e
quindi chiunque può entrare e falsificare o cancellare i dati su cui misuriamo la
sicurezza dell'isolamento fra farmacie.

| # | Intervento | Come | Rischio | Verifica |
| --- | --- | --- | --- | --- |
| 1.1 | Login demo lato server | `POST /api/auth/demo` che accetta `{"ruolo":"pharmacy"|"driver"}`, legge le credenziali da `DEMO_PHARMACY_*` / `DEMO_DRIVER_*` su Render e restituisce il cookie come un login normale. La landing chiama solo quello | basso | i pulsanti Demo entrano; nel bundle non c'è più nessuna password |
| 1.2 | Test che chiude la porta | nel job frontend: dopo il build, fallisce se `dist/` contiene `farmaciaprova`, `Test1234!`, `Driver123!` o il pattern `password:"..."`. Sostituisce la fiducia con una guardia | nullo | provato piantando le stringhe |
| 1.3 | Tenant di test dedicato | farmacia `test-suite@...` creata con un workflow usa e getta via `MONGO_URL_ADMIN` (gli utenti non si creano da codice con le chiavi Atlas), secret `PT_TEST_EMAIL` / `PT_TEST_PASSWORD` aggiornati, una notte di test verdi | medio: tocca la suite notturna | il run delle 03:00 passa su 17 test |
| 1.4 | Demo libera di sporcarsi | con il test su un altro account, il tenant demo può essere usato da chiunque senza conseguenze; aggiungere un reset settimanale facoltativo (svuota consegne e clienti creati dalla demo) | basso | login demo → crea consegna → la demo altrui non si rompe |

**Serve da Federico:** un via libera prima di 1.3 (crea un account di produzione e
cambia i secret dei test). 1.1 e 1.2 posso farli subito.

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

Tutti e quattro girano in `tests/unit` o in vitest, quindi costano secondi.

---

## Blocco 3 — pulizia del repository

| # | Intervento | Dettaglio |
| --- | --- | --- |
| 3.1 | 8 rami morti | `feature/auto-*`, `feature/report-pro-schede`, `feature/serratura-piani`, `feature/ricorrenze-analisi-cliente`, `feature/notifiche-interruttore-unico`: residui di squash merge. Due hanno commit "avanti" che sono la stessa roba già in `main`: si confronta il diff prima di cancellare |
| 3.2 | `delete_branch_on_merge` | impostazione del repository: i rami si cancellano da soli dopo il merge, così il problema non si ripresenta |
| 3.3 | Dependabot | raggruppare gli aggiornamenti (un PR a settimana invece di dieci), escludere i salti di minor per Python (il 1/11 un bump raggruppato ha steso il backend) |
| 3.4 | Residui | `docs/archivio` e `docs/outreach`: verificare che siano storia utile e non peso; `memory/` non deve tornare |

---

## Blocco 4 — operatività (accorgersi in un minuto)

| # | Intervento | Cosa risolve |
| --- | --- | --- |
| 4.1 | `verifica-produzione.yml`: dopo ogni push su `main`, pinga `/api/health`, scarica l'entry `index-*.js`, controlla che ogni `assets/*.js` referenziato risponda `application/javascript`, e fa un login demo | il caso "deploy verde ma sito bianco" (già successo due volte) lo vede GitHub, non l'utente |
| 4.2 | Verifica Render senza `RENDER_API_KEY` | è già possibile: Render registra il deploy come GitHub Deployment sul commit, quindi `GET /deployments?ref=main` + `/statuses` dicono se il backend è su. Va scritto in `CONTRIBUTING.md` e usato dalla skill di salute, così non serve un token che non c'è |
| 4.3 | Allarmi | `allarmi.yml` esiste e manda email a `ALERT_EMAIL`: verificare che copra anche "deploy fallito", non solo "API giù" |

---

## Blocco 5 — chi arriva domani

| # | Intervento | Contenuto |
| --- | --- | --- |
| 5.1 | `docs/PRIMO-GIORNO.md` | quali accessi servono (GitHub, Vercel, Render, Atlas, Sentry, Brevo) e chi li dà; come si avvia in locale in 5 minuti; i tre lavori buoni per iniziare; le cinque cose da non toccare senza Federico |
| 5.2 | PR template aggiornato | al posto di "ho testato": le caselle vere (`./verifica.sh --completo` verde, deploy verificato se tocca `backend/`, nessun segreto, docs aggiornate se cambia uno schema) |
| 5.3 | `AGENTS.md` e `README` allineati | link a ARCHITETTURA e SICUREZZA in testa, così la prima pagina porta allo schema |

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
fatto   blocco 0            la rete: schema, segreti, contratto variabili
  ▼
1.1-1.2 blocco 1 (prima metà)   credenziali fuori dal bundle, con la guardia
  ▼
2.1-2.4 blocco 2            guardie sui rinomini
  ▼
3.1-3.2 blocco 3 (prima metà)   rami morti e cancellazione automatica
  ▼
4.1-4.2 blocco 4            verifica automatica del deploy
  ▼
1.3-1.4 blocco 1 (seconda metà) tenant di test dedicato e demo libera   ← serve il via di Federico
  ▼
3.3-3.4 · 5.1-5.3           dependabot, docs di ingresso
  ▼
6.x                        le tre decisioni
```

Ogni blocco è un rilascio a sé: `./verifica.sh --completo` verde, PR, merge,
verifica in produzione, e questo file aggiornato (la colonna "stato" è la
verità su cosa è chiuso).
