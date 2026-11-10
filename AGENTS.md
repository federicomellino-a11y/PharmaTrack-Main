# AGENTS.md — come si mette mano a PharmaTrack senza rompere niente

Questo file è la prima cosa da leggere, per una persona o per un programma
automatico. Non descrive l'applicazione (per quello c'è `README.md`): descrive
cosa si può toccare, dove vive ogni cosa, e come si verifica di non aver rotto
niente. `CONTRIBUTING.md` è la versione per le persone, con le ricette passo
passo; qui ci sono le regole e il perché.

## In tre righe

- `main` **è** la produzione: ogni push su `main` deploya il frontend su Vercel e il backend su Render. Non esiste uno staging separato.
- Ogni modifica passa da: branch → 4 check verdi → squash merge → verifica del deploy.
- Le regole di questo file non sono questioni di stile: ognuna è un guasto già
  successo, con la data accanto.

## Prima di scrivere una riga

1. **Cerca se quella cosa esiste già.** Qui il difetto più frequente non è
   scrivere male: è scrivere una seconda copia di qualcosa che c'era (le liste di
   stati erano copiate 12 volte, il documento di consegna era scritto due volte
   con le copie già divergenti).
2. **Se tocchi soldi, stati di consegna, incassi, turni o dati dei clienti**,
   scrivi prima il test che descrive la regola, poi il codice. E lascia un test
   di contratto che fallisca se quella regola sparisce.
3. **Un file nuovo deve avere un chiamante o un test.** Se nessuno lo importa è
   codice morto, e il codice morto inganna chi legge.

## Comandi

```bash
# Frontend (da frontend/)
npm ci                 # una volta
npm run lint           # ESLint
npm run typecheck      # tsc, copre anche i .tsx
npm test               # vitest, 177+ test
npm run build          # build di produzione
npm run test:e2e       # Playwright (serve la build e Chromium)

# Backend (da backend/)
pip install -r requirements.txt
python -m pytest tests/unit -q     # veloci, senza rete e senza database

# Controllo completo di produzione (dal sandbox dell'agente)
run_skill("pharmatrack_health", "--full")
```

## Dove mettere le mani

| Devo cambiare | Dove |
|---|---|
| Una rotta API | `backend/app/routers/<nome>.py`, poi **agganciala** in `server.py` nel blocco `for module in [...]` |
| Una regola pura (piani, fasce, report, transizioni) | `backend/app/core/` |
| Un campo di un dato | `backend/app/models/schemas.py` |
| Una pagina o una schermata | `frontend/src/pages/`, e **montala** in `App.tsx` |
| Un pezzo di schermata | `frontend/src/components/<area>/`, un file per componente |
| Come si legge un dato | chiave + lettura in `frontend/src/lib/api.js`, hook in `frontend/src/hooks/queries.js` |
| Un test veloce | `backend/tests/unit/` (pytest) o `src/**/__tests__/` (vitest) |
| Un test che gira contro l'API vera | `backend/tests/` (suite notturna: non deve fare DELETE) |

## Regole non negoziabili

1. **Stati di consegna.** L'unica autorità è `valuta_scrittura(...)` in
   `backend/app/core/delivery_lifecycle.py`. Nessun endpoint scrive uno stato
   per conto suo, nessun elenco di stati viene ricopiato: si usano
   `TRANSIZIONI`, `BILLED_STATUSES`, `FOLLOW_UP_STATUSES`, `STATI_RIPRISTINABILI`.
   Cinque difetti di fila sono nati da regole scritte a mano accanto alla tabella.
2. **Letture dal server nel frontend.** La pagina non chiama `axios` per leggere:
   coppia chiave/lettura in `lib/api.js`, hook in `hooks/queries.js`. Il test
   `src/pages/__tests__/migrazione-api.test.js` blocca le scorciatoie. Due sole
   eccezioni ammesse: `PublicTracking.jsx` (lookup pubblico con token) e
   `pharmacy/Integrations.jsx` (download di un blob).
3. **Orari.** `from app.core.clock import adesso, ROME_TZ`. Mai `datetime.now()`
   nudo: l'8/11 un `NameError` silenzioso dentro un `try` produceva link di
   tracking con l'ora UTC.
4. **Testi e formati.** Etichette di stato e icone in
   `frontend/src/lib/deliveryDisplay.js`, valute e date in `lib/format.js`.
   Attenzione: le etichette di stato hanno ancora tre formulazioni diverse per
   contesto (scelta di prodotto non ancora presa): non "normalizzarle" per
   iniziativa propria, cambia quello che leggono le farmacie.
5. **Componenti estratti.** Il file nuovo deve avere `import React` anche se non
   compare (i test vitest usano la trasformazione classica: senza, "React is not
   defined") e deve importare **tutti** i simboli che usa. ESLint non vede gli
   identificatori JSX: `src/__tests__/jsx-defined.test.js` sì.
6. **Dipendenze backend.** Pin esatti in `requirements.txt`. Un intervallo ha
   steso la produzione il 1/11 (fastapi 0.110 → 0.162, build Render fallita,
   backend giù un'ora, CI verde). Dopo ogni modifica ai pin: venv pulito, poi
   verifica del deploy Render.
7. **Segreti.** Mai nel repo, mai in un file versionato, nemmeno in un commento.
   Le variabili stanno su Render (backend), Vercel (frontend) e nei secret di
   GitHub (workflow).
8. **Dati veri.** Niente cancellazioni o scritture sui dati di produzione senza
   il via di Federico. `tests/test_pharmatrack.py` e `tests/test_winfarm_import.py`
   fanno `DELETE` e per questo **non** girano in CI: non aggiungerli.
9. **Dimensione e nomi.** Tetto 650 righe per pagine e componenti, 700 per il
   resto; Python `snake_case`, componenti React con l'iniziale maiuscola. Se una
   pagina cresce, si estrae un componente o un hook: è il lavoro che ha portato
   `Deliveries.jsx` da 1.403 a 566 righe.
10. **Niente seconde copie di utility.** Formattazione date/valute, etichette,
    regole di ritardo, CSV, bolla di stampa: ognuna ha già il suo modulo in
    `frontend/src/lib/` o `backend/app/core/`.

## Le guardie che ti dicono cosa hai rotto

| Test | Cosa blocca |
|---|---|
| `backend/tests/unit/test_regole_repository.py` | file fuori posto in `backend/`, router non agganciato in `server.py`, segnaposto TODO/FIXME, `console.log`, dipendenze senza pin, segreti nel codice, file troppo lunghi, nomi incoerenti |
| `backend/tests/unit/test_delivery_transitions.py` | un endpoint che dichiara un'origine di stato per conto suo |
| `backend/tests/unit/test_delivery_creation.py` | il documento di consegna ricostruito dentro un router |
| `backend/tests/unit/test_analytics_core.py` | aggregazioni Mongo che rientrano nel router |
| `frontend/src/__tests__/jsx-defined.test.js` | componenti usati in JSX e mai importati (pagina bianca) |
| `frontend/src/pages/__tests__/migrazione-api.test.js` | `axios.get` fuori dal contratto di `lib/api.js` |
| `frontend/src/__tests__/regole-repository.test.js` | pagine non montate, componenti orfani, file oltre il tetto, `console.log` |

## Dopo il merge (obbligatorio)

1. `run_skill("pharmatrack_health", "--full")`: deve dire tutto verde
   (deploy Vercel READY, release nel bundle = commit, deploy Render live,
   Sentry 0 issue sulla release, endpoint 200, CI verde).
2. Se il backend non è ripartito: Render → `pharmatrack-api` → Deploys →
   Redeploy dell'ultimo commit sano.
3. Se il frontend ha un errore in produzione: `git revert <commit>` su `main`
   (il revert deploya da solo) oppure Redeploy da Vercel del deploy precedente.
4. Sentry: filtrare per `release:pharmatrack@<sha>`. Le issue senza release
   corrente vengono da bundle vecchi rimasti aperti in un browser, non da un bug.

## Cosa non si tocca senza Federico

- **Gli account demo** (`test@farmaciaprova.it` e il fattorino) e i due pulsanti
  demo in `LandingPage.jsx`: la suite di integrazione notturna usa quelle
  credenziali.
- **`ADMIN_PASSWORD` e le env var** dei servizi Render e Vercel.
- **Il repository è pubblico**: tutto ciò che si committa è leggibile da fuori.
  Non mettere dati di clienti reali, né indirizzi, né nomi.
- **Piani, prezzi e fatturazione**: sono decisioni di prodotto.

## Lingua

Commenti e nomi di dominio in italiano (consegna, fattorino, turno, fascia),
identificatori tecnici e nomi di libreria in inglese. I messaggi di commit
seguono `tipo(area): cosa cambia` (`fix(deliveries): ...`, `chore(docs): ...`).
