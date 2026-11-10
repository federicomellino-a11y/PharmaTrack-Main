## Cosa cambia

<!-- Una riga: cosa fa questa modifica e perché serve. -->

## Tipo

- [ ] Correzione di un difetto (fix)
- [ ] Funzionalità nuova (feat)
- [ ] Pulizia, documentazione, dipendenze (chore/docs)

## Dove ho messo le mani

<!-- File o cartelle toccate, per orientare la revisione. -->

## Verifiche fatte

- [ ] `npm run lint` + `npm run typecheck` + `npm test` + `npm run build`
- [ ] `npm run test:e2e` sul build nuovo (se ho toccato il frontend)
- [ ] `python -m pytest tests/unit -q`
- [ ] se ho toccato i pin Python: venv pulito e deploy Render verificato dopo il merge

## Controlli che valgono sempre

- [ ] nessun `console.log`, nessun `TODO`, nessun file nuovo senza chiamante
- [ ] nessun segreto e nessun dato reale di clienti (il repo è pubblico)
- [ ] se ho cambiato comportamento: c'è un test che lo descrive
- [ ] se ho toccato soldi, stati di consegna, incassi o turni: c'è un test di
      contratto che fallisce se la regola sparisce

## Dopo il merge

- [ ] `pharmatrack_health --full` tutto verde (deploy, release nel bundle,
      Render live, Sentry 0 sulla release, endpoint 200)

Regole e perché: [`AGENTS.md`](../AGENTS.md). Giro di lavoro: [`CONTRIBUTING.md`](../CONTRIBUTING.md).
