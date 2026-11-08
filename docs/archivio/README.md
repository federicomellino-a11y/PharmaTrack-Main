# Archivio

Documenti che non servono al funzionamento ma spiegano da dove viene il progetto.

## emergent-manifest-2026-08-20.yml

Manifest lasciato da Emergent nella cartella `.emergent/` (rimossa il 8/11/2026 insieme al resto dei residui). Non serve a niente a runtime: e' la fotografia di cosa quella piattaforma aveva aggiunto e di cosa era rimasto in sospeso.

Confrontato con il codice attuale:

| Voce del manifest | Stato nel codice |
|---|---|
| `slowapi` (rate limit) | presente e in uso (`app/core/limiter.py`) |
| `sentry-sdk` | presente e in uso (`app/core/sentry.py`) |
| analytics + export CSV | presente (`routers/analytics.py`, Reports) |
| error boundary | presente (`components/ErrorBoundary`) |
| test pytest | presente (`backend/tests`) |
| `billing_stripe_subscriptions` | **mai entrato**: zero riferimenti a stripe |
| `api_token_bearer_auth` | **mai entrato**: zero riferimenti a api_tokens |

Le due voci mai entrate chiedevano anche collezioni (`subscriptions`, `api_tokens`) e variabili `STRIPE_*` su Render, che infatti non esistono. Il `status: ready_for_merge_after_rebase` era quindi ottimistico: quel ramo non e' mai stato rebasato ne' mergiato.
