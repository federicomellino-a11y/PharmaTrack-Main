# CLAUDE.md

Le regole di questo repository stanno in [`AGENTS.md`](AGENTS.md): leggile prima
di modificare qualunque cosa. Contengono cosa si può toccare, dove vive ogni
cosa, e il motivo (con la data) di ogni regola.

In sintesi, quello che serve sapere subito:

- `main` è la produzione. Ogni merge deploya su Vercel e Render: non esiste uno
  staging. Le modifiche passano da branch → PR → 5 check verdi → squash merge.
- Prima di aprire una PR: `./verifica.sh` (aggiungi `--completo` se hai toccato
  il frontend: esegue anche gli E2E sul build nuovo).
- Non scrivere una seconda copia di qualcosa che esiste già: stati di consegna
  solo da `backend/app/core/delivery_lifecycle.py` (`valuta_scrittura`), letture
  frontend solo da `frontend/src/lib/api.js` + `hooks/queries.js`, orari solo da
  `backend/app/core/clock.py`, etichette e valute solo da `frontend/src/lib/`.
- Non toccare: gli account demo e la farmacia QA dei test notturni, le env var
  dei servizi, i test che fanno `DELETE` sui dati veri, i pin delle dipendenze
  senza un venv pulito.
- Il repository è pubblico: niente dati di clienti reali, niente segreti.

Ricette passo passo (rotta nuova, pagina nuova, campo nuovo, componente
estratto) e checklist: [`CONTRIBUTING.md`](CONTRIBUTING.md).
Architettura, macchina a stati e rilascio: `docs/ARCHITETTURA.md`.
