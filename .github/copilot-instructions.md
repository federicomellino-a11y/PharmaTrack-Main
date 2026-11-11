# Istruzioni per gli assistenti automatici

Leggi [`AGENTS.md`](../AGENTS.md) prima di proporre una modifica: contiene le
regole del repository e il motivo di ognuna. `CONTRIBUTING.md` ha le ricette
passo passo.

Le cinque cose che sbagliano più spesso gli assistenti, qui:

1. **Duplicare invece di riusare.** Gli stati di consegna passano solo da
   `valuta_scrittura(...)` in `backend/app/core/delivery_lifecycle.py`; le
   letture dal server solo da `frontend/src/lib/api.js` con gli hook di
   `hooks/queries.js`; date e valute da `frontend/src/lib/format.js`; gli orari
   da `backend/app/core/clock.py`.
2. **Dimenticare l'aggancio.** Un router nuovo va registrato in `server.py`; una
   pagina nuova va montata in `App.tsx`. Esistono test che falliscono se lo
   dimentichi: `backend/tests/unit/test_regole_repository.py` e
   `frontend/src/__tests__/regole-repository.test.js`.
3. **Togliere `import React`.** Serve anche quando non compare: i test usano la
   trasformazione classica.
4. **Componenti usati ma non importati.** ESLint non vede gli identificatori
   JSX; li vede `src/__tests__/jsx-defined.test.js`.
5. **Dire "fatto" senza verificare.** `./verifica.sh` (con `--completo` se
   tocchi il frontend) deve essere verde, e dopo il merge si controlla il
   deploy. `main` è la produzione.

Non toccare gli account demo né la farmacia QA dei test notturni, le env var dei
servizi, i test che fanno `DELETE` sui dati veri, i pin delle dipendenze.
