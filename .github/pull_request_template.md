## Cosa cambia

<!-- Una riga: cosa fa questa modifica e perché serve. -->

## Tipo

- [ ] Correzione di un difetto (fix)
- [ ] Funzionalità nuova (feat)
- [ ] Pulizia, documentazione, dipendenze (chore/docs)

## Dove ho messo le mani

<!-- File o cartelle toccate, per orientare la revisione. -->

## Verifiche fatte

- [ ] `./verifica.sh` verde
- [ ] `./verifica.sh --completo` verde (se ho toccato il frontend: aggiunge gli E2E)
- [ ] se ho toccato i pin Python: venv pulito (`pharmatrack_health --pins`) prima
      del merge, deploy Render verificato dopo
- [ ] se ho toccato `backend/`: dopo il merge il deploy Render è live sulla
      revisione giusta (ricetta in `CONTRIBUTING.md` §5, non serve la chiave Render)
- [ ] se ho cambiato uno schema, un campo o un flusso: `docs/ARCHITETTURA.md`
      aggiornato nella stessa PR

## Controlli che valgono sempre

- [ ] nessun `console.log`, nessun `TODO`, nessun file nuovo senza chiamante
- [ ] nessun file temporaneo o di debug committato (`.env`, `*.log`, `dist/`)
- [ ] nessun segreto e nessun dato reale di clienti (il repo è pubblico)
- [ ] se ho cambiato comportamento: c'è un test che lo descrive
- [ ] se ho toccato soldi, stati di consegna, incassi o turni: c'è un test di
      contratto che fallisce se la regola sparisce

## Dopo il merge

- [ ] `pharmatrack_health --full` tutto verde (deploy, release nel bundle,
      Render live, Sentry 0 sulla release, endpoint 200)

Regole e perché: [`AGENTS.md`](../AGENTS.md). Giro di lavoro: [`CONTRIBUTING.md`](../CONTRIBUTING.md).
