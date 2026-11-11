# CONTRIBUTING — mettere mano a PharmaTrack

Le regole e il perché di ogni regola stanno in [`AGENTS.md`](AGENTS.md). Questo
file è la parte pratica: come si prepara la macchina, come si fa una modifica e
come si è sicuri di non aver rotto niente.

`main` **è** la produzione. Un merge su `main` pubblica su Vercel e Render in
pochi minuti, davanti alle farmacie che usano il gestionale.

Se è il tuo primo giorno, prima di questa pagina c'è
[`docs/PRIMO-GIORNO.md`](docs/PRIMO-GIORNO.md): accessi da chiedere, avvio in
locale, tre lavori per cominciare.

---

## 1. Preparare la macchina (una volta)

```bash
git clone https://github.com/federicomellino-a11y/PharmaTrack-Main.git
cd PharmaTrack-Main

# Frontend
cd frontend && npm ci && cd ..

# Backend
cd backend && python -m venv .venv && . .venv/bin/activate && pip install -r requirements.txt && cd ..
```

Per far girare l'app in locale servono le variabili d'ambiente: copia
`backend/.env.example` in `backend/.env` e `frontend/.env.example` in
`frontend/.env`. Il database è su MongoDB Atlas (la stringa sta su Render →
`pharmatrack-api` → Environment, variabile `MONGO_URL`).

I test unitari **non** hanno bisogno di database né di rete: partono subito.

---

## 2. Il giro di lavoro

```bash
git checkout main && git pull
git checkout -b fix/cosa-sto-sistemando

# ... modifica ...

# Tutto in un comando, con il riepilogo controllo per controllo
./verifica.sh
# e prima di una modifica che tocca il frontend, anche:
./verifica.sh --completo     # aggiunge gli E2E sul build nuovo

# se hai toccato configurazione, script o .env: nessun segreto finito nel repo
bash scripts/controlla-segreti.sh

# oppure i singoli pezzi
cd frontend && npm run lint && npm run typecheck && npm test && npm run build && cd ..
cd backend && python -m pytest tests/unit -q && cd ..

git add -A
git commit -F messaggio.txt        # -F: gli apostrofi nel messaggio spezzano -m
git push -u origin fix/cosa-sto-sistemando
```

Poi si apre la pull request. I quattro check devono essere verdi prima del
merge (branch protection li impone):

- `Backend (compile)`
- `Backend (dipendenze + test unitari)`
- `Frontend (build)`
- `Frontend (E2E)`

Merge con **squash**: la storia di `main` resta una riga per modifica.

---

## 3. Ricette

### Una rotta API nuova

1. Crea `backend/app/routers/<nome>.py` con `router = APIRouter()` a livello di modulo.
2. **Agganciala** in `server.py` nel blocco `for module in [...]` e aggiungi la
   voce in `_ROUTER_TAGS` (il tag finisce nella documentazione OpenAPI).
3. Se serve una regola di calcolo, mettila in `backend/app/core/`, non nel router.
4. Test in `backend/tests/unit/test_<nome>.py`.
5. Il test `test_regole_repository.py` fallisce se ti dimentichi il passo 2.

### Una pagina (o una schermata) nuova

1. Crea il file in `frontend/src/pages/` (o `pages/pharmacy|driver|admin/`).
2. **Montalo** in `App.tsx` con `lazyWithRetry(() => import('./pages/...'))`.
3. I dati si leggono con un hook di `hooks/queries.js`, mai con `axios` diretto.
4. Aggiungi la pagina a `frontend/e2e/smoke.spec.js` (le pagine non aperte da
   nessun test sono il posto dove i difetti vivono indisturbati).
5. `regole-repository.test.js` fallisce se la pagina non è montata.

### Un campo nuovo su un dato esistente

1. `backend/app/models/schemas.py`: il campo con il suo tipo e il default.
2. Se il documento viene costruito in un posto solo (`app/core/delivery_creation.py`
   per le consegne), aggiungilo lì.
3. Attenzione ai documenti già a database: il campo nuovo deve avere un default
   sensato, non un `null` che poi esplode nel frontend (il 10/11 è stato
   aggiunto `app/core/legacy_deliveries.py` proprio per i vecchi null).
4. Un test di contratto che verifichi il default.

### Una lettura nuova nel frontend

1. Chiave in `lib/api.js` (`chiavi.qualcosa`) e funzione in `letture`.
2. Hook in `hooks/queries.js` che usa quella lettura.
3. Dopo una scrittura, invalida **tutte** le chiavi toccate (non solo la
   principale) altrimenti i numeri in home restano vecchi.

### Un componente estratto da una pagina lunga

1. Crea il file in `components/<area>/`, con `import React` in cima.
2. Importa **tutti** i simboli che il blocco usa: icone, helper minuscoli,
   valori destrutturati dagli hook.
3. Passa i dati e i gestori come props: il componente non fa query di rete.
4. `npm run build`, poi **anche** `npm run test:e2e` sul build nuovo: è l'unico
   controllo che vede una prop orfana o un componente non importato.

---

## 4. Checklist prima di aprire la pull request

- [ ] `./verifica.sh` verde (lint, tipi, test unitari, build)
- [ ] `./verifica.sh --completo` verde se ho toccato il frontend (aggiunge gli E2E)
- [ ] se ho toccato i pin Python: installazione in venv pulito, e dopo il merge
      controllo del deploy Render
- [ ] nessun `console.log`, nessun `TODO`, nessun file nuovo senza chiamante
- [ ] nessun segreto, nessun dato reale di clienti (il repo è pubblico)
- [ ] se ho cambiato comportamento: c'è un test che lo descrive
- [ ] se ho toccato soldi, stati, incassi o turni: c'è un test di contratto

---

## 5. Dopo il merge

Il merge deploya da solo. Verifica **prima di considerare finito** il lavoro:

```bash
run_skill("pharmatrack_health", "--full")
```

Deve essere tutto verde: deploy Vercel READY, release nel bundle uguale al
commit, deploy Render live, Sentry senza issue sulla release corrente, endpoint
a 200, CI verde. Se qualcosa è rosso, si ripara o si fa `git revert` del commit
(il revert deploya a sua volta), non si lascia lì.

### Se il backend è aggiornato, senza chiave di Render

Non serve più `RENDER_API_KEY` (dal 10/11 non c'è). Render registra ogni deploy
come **GitHub Deployment** sul commit di `main`, quindi lo stato si legge con il
token di GitHub che hai già:

```bash
curl -s -H "Authorization: Bearer $GITHUB_TOKEN" \
  "https://api.github.com/repos/federicomellino-a11y/PharmaTrack-Main/deployments?per_page=5" \
  | python3 -c 'import json,sys; [print(d["id"], d["ref"]) for d in json.load(sys.stdin)]'
# prendi l'id dove ref è "main - pharmatrack-api", poi:
curl -s -H "Authorization: Bearer $GITHUB_TOKEN" \
  "https://api.github.com/repos/federicomellino-a11y/PharmaTrack-Main/deployments/<id>/statuses"
# state: success = backend in produzione
```

Il workflow **Verifica produzione** lo fa già da solo a ogni merge su `main`:
guarda `/api/health`, i chunk del sito, il login demo dei due ruoli e lo stato
del deploy Render, e diventa rosso se qualcosa non torna (con un secondo
tentativo 90 secondi dopo, perché il deploy parte insieme). Nota: `/api/health`
**non** riporta la release, quindi da solo non conferma un deploy.

---

## 6. Se non sei sicuro

- Le regole e il perché: [`AGENTS.md`](AGENTS.md).
- Architettura, URL e trappole già pagate: skill `pharmatrack_context`.
- Salute della produzione: skill `pharmatrack_health`.
- Rilascio: skill `pharmatrack_deploy`.
- Decisioni di prodotto (prezzi, sezioni da togliere, etichette da unificare):
  Federico.
