# La Content Security Policy: cosa c'è, cosa manca e perché

Ultimo aggiornamento: 5 novembre 2026.

## La policy in una riga

`frontend/vercel.json` manda una `Content-Security-Policy` **bloccante** (non più
`-Report-Only`) su tutte le rotte. Dal 4 novembre è verificata in produzione con
Playwright su otto pagine pubbliche e sulla console admin: zero violazioni, zero
errori di console oltre ai 401/404 attesi.

## Cosa è già chiuso

- `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`, `frame-ancestors 'none'`: niente plugin,
  niente riscrittura del `<base>`, nessun invio di form verso altri domini, nessun incorniciamento.
- `frame-src` limitato a `accounts.google.com`.
- `img-src`, `connect-src`, `font-src`: solo le sorgenti che servono davvero (tile OSM, cdnjs per i
  marker Leaflet, Google Maps e Geocoding, Sentry, il nostro websocket).
- `upgrade-insecure-requests` (5/11): una risorsa in http finisce automaticamente in https.
- `report-uri` verso `/api/csp-report`: le violazioni finiscono in `csp_reports`, con scadenza a 30
  giorni e rate limit sull'endpoint.

## Cosa resta: `'unsafe-inline'` su script-src e style-src

Questo è il buco. Con `unsafe-inline` un attaccante che riesce a iniettare un
`<script>` nella pagina lo esegue, quindi la CSP smette di essere una difesa
contro XSS e diventa solo una lista di sorgenti.

Il 5 novembre ho misurato cosa succede togliendolo. Ho caricato `/login`,
`/register` e la landing con una policy senza `unsafe-inline` e intercettato gli
eventi `securitypolicyviolation`. Risultato: violazioni su `script-src-elem`,
`script-src-attr`, `style-src-elem` e `style-src-attr`, tutte `inline`.

Le cause:

1. **Google Sign-In** carica `https://accounts.google.com/gsi/client`, che a sua
   volta inserisce script e fogli di stile inline per disegnare il pulsante. Non
   è codice nostro e non possiamo mettergli un attributo `nonce`.
2. **Il nostro script di avvio** dentro `index.html` (326 byte, quello che mostra
   "PharmaTrack non si è caricato" dopo 9 secondi). Questo è nostro: il suo hash
   è `sha256-klq4/SAQveYyWOkj7ryxlS9KK+s0vDT+VIfYvyzzuUo=` e basta elencarlo per
   farlo passare senza `unsafe-inline`. Se cambia una virgola nell'HTML, l'hash
   cambia e lo script smette di girare: va ricalcolato.
3. **Stili inline** di Leaflet e di React (attributi `style` sugli elementi dei
   marker e delle mappe).

## Le due strade per togliere `unsafe-inline`, e perché non sono state prese oggi

**Strada A — hash + `strict-dynamic`.** Si scrive
`script-src 'self' 'sha256-...' 'strict-dynamic' https://accounts.google.com ...`:
nei browser che capiscono la CSP 3 `unsafe-inline` viene ignorato e vale solo
l'hash, i browser vecchi ricadono su `unsafe-inline`. Il nostro script di avvio
passa per hash e i figli che carica sono fidati. Il punto aperto è se gli script
inline iniettati da Google ereditano la fiducia: la specifica dice di sì per gli
script non inseriti dal parser, ma va **provato cliccando davvero "Accedi con
Google"**, e quel click può farlo solo Federico. Se sbaglia la valutazione, il
login Google smette di funzionare per gli utenti veri.

**Strada B — nonce.** È la soluzione pulita: un nonce per richiesta, e
`unsafe-inline` sparisce del tutto. Richiede un middleware edge che riscriva
l'HTML a ogni richiesta, perché su hosting statico il nonce sarebbe uguale per
tutti e quindi inutile. È un cambio di architettura, non una modifica di
configurazione.

## Come si chiude

Il passo successivo, quando c'è tempo e Federico è davanti a un browser:

1. deploy di anteprima con la policy della strada A;
2. click su "Accedi con Google" e verifica che il login arrivi in fondo;
3. se funziona, la policy va in produzione e questo documento si aggiorna.

Fino ad allora la CSP resta quella attuale: utile contro inclusioni da domini
esterni, inutile contro l'iniezione di script inline. È scritto qui perché non
venga scambiato per una protezione completa.
