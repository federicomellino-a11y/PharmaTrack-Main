import { lazy } from 'react';
import { hardReload } from './hardReload';

/**
 * Dopo un deploy cambiano gli hash dei chunk: un tab rimasto aperto chiede il
 * file vecchio, Vercel non lo trova e (per la regola SPA) risponde con l'HTML,
 * quindi il browser rifiuta il modulo per MIME type e la pagina va in errore.
 * Invece di mostrare un boundary, ricarichiamo una volta sola forzando il
 * bypass della cache e solo se non l'abbiamo appena fatto (guardia anti-loop).
 */
export const CHUNK_RELOAD_KEY = 'pt_chunk_reload_at';
export const CHUNK_RELOAD_WINDOW_MS = 10000;

export function reloadOnceForChunkError(now = Date.now()) {
  try {
    const last = Number(window.sessionStorage.getItem(CHUNK_RELOAD_KEY) || 0);
    if (now - last < CHUNK_RELOAD_WINDOW_MS) return false;
    window.sessionStorage.setItem(CHUNK_RELOAD_KEY, String(now));
  } catch {
    // sessionStorage non disponibile: non possiamo garantire la guardia,
    // meglio non ricaricare che rischiare un ciclo infinito.
    return false;
  }
  hardReload();
  return true;
}

export function lazyWithRetry(factory) {
  return lazy(async () => {
    try {
      return await factory();
    } catch (error) {
      reloadOnceForChunkError();
      throw error;
    }
  });
}
