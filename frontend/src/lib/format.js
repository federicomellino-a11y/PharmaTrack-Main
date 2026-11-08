/*Un solo posto per formattare date e soldi.

Il 8/11/2026 nei file di pagina c'erano 7 copie di formatCurrency e 6 di
formatDate/formatDateTime, scritte da persone e strumenti diversi. Non erano
identiche: alcune mostravano l'anno, altre no, una sola gestiva le opzioni.
Qui ci sono le varianti che servono davvero, con il nome che dice quale forma
produce, cosi' non si sceglie piu' a caso.
*/

const VALUTA = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' });

/** 12.5 -> "12,50 €" (stringa vuota o niente -> "0,00 €") */
export const formatCurrency = (valore) => VALUTA.format(Number(valore || 0));

/** Solo data: "08 nov 2026". Accetta opzioni per i casi particolari. */
export const formatDate = (valore, opzioni = { day: '2-digit', month: 'short', year: 'numeric' }) =>
  valore ? new Date(valore).toLocaleDateString('it-IT', opzioni) : '-';

/** Data e ora senza anno: "08 nov, 20:14". Per gli elenchi operativi di oggi. */
export const formatDateTime = (valore) =>
  valore
    ? new Date(valore).toLocaleString('it-IT', {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '-';

/** Data e ora con anno: "08 nov 2026, 20:14". Per lo storico e le anagrafiche. */
export const formatDateTimeFull = (valore) =>
  valore
    ? new Date(valore).toLocaleString('it-IT', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '-';

/** Formato esteso del sistema: "08/11/2026, 20:14:03". Solo per i log tecnici. */
export const formatDateTimeLong = (valore) =>
  valore ? new Date(valore).toLocaleString('it-IT') : '-';

/** "3 giorni fa", "adesso", "2 ore fa". Per gli ultimi accessi e i battiti. */
export const formatTimeAgo = (valore) => {
  if (!valore) return '-';
  const istante = new Date(valore).getTime();
  if (Number.isNaN(istante)) return '-';
  const minuti = Math.round((Date.now() - istante) / 60000);
  if (minuti < 1) return 'adesso';
  if (minuti < 60) return `${minuti} ${minuti === 1 ? 'minuto' : 'minuti'} fa`;
  const ore = Math.round(minuti / 60);
  if (ore < 24) return `${ore} ${ore === 1 ? 'ora' : 'ore'} fa`;
  const giorni = Math.round(ore / 24);
  return `${giorni} ${giorni === 1 ? 'giorno' : 'giorni'} fa`;
};
