/**
 * Ricarica l'app forzando il bypass della cache: un semplice reload puo
 * riproporre lo stesso HTML vecchio, che punta a chunk non piu esistenti.
 * Il parametro di versione cambia l'URL e obbliga il browser a richiedere
 * tutto da rete.
 */
export function hardReload() {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  url.searchParams.set('v', String(Date.now()));
  window.location.replace(url.toString());
}
