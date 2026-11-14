/* Chi dei fattorini e' davvero in strada, adesso.

   Prima la pagina Tracking considerava "online" ogni fattorino che avesse due
   coordinate salvate, anche se l'ultimo aggiornamento era di tre giorni prima.
   Il dato che dice la verita' e' `last_location_update`, che il backend scrive
   a ogni PUT /driver/location: da qui si ricavano tre stati distinti.

   live            posizione aggiornata da poco
   in_ritardo      posizione ferma da un intervallo significativo
   non_disponibile nessuna posizione valida, nessun orario, o fattorino spento
*/

import { formatDateTime } from './format';

// Oltre questo silenzio la posizione non e' piu' "adesso".
export const SOGLIA_LIVE_MIN = 5;
// Oltre questo silenzio il fattorino non e' piu' considerato in movimento.
export const SOGLIA_RITARDO_MIN = 15;

export const STATI_PRESENZA = {
  live: {
    etichetta: 'Live',
    descrizione: 'Posizione aggiornata pochi minuti fa',
    colore: 'emerald',
    testid: 'presenza-live',
  },
  in_ritardo: {
    etichetta: 'In ritardo',
    descrizione: 'Posizione non aggiornata da un po\'',
    colore: 'amber',
    testid: 'presenza-in-ritardo',
  },
  non_disponibile: {
    etichetta: 'Non disponibile',
    descrizione: 'Nessuna posizione valida o fattorino non attivo',
    colore: 'zinc',
    testid: 'presenza-non-disponibile',
  },
};

const numeroValido = (valore) => Number.isFinite(Number(valore)) && valore !== null && valore !== '';

/** Le coordinate ci sono e sono plausibili. */
export const haPosizione = (driver) =>
  numeroValido(driver?.current_lat) && numeroValido(driver?.current_lng);

/** Minuti passati dall'ultima posizione, oppure null se l'orario non si legge. */
export const minutiDaAggiornamento = (driver, adesso = Date.now()) => {
  const valore = driver?.last_location_update;
  if (!valore) return null;
  const allora = new Date(valore).getTime();
  if (Number.isNaN(allora)) return null;
  return Math.max(0, Math.round((adesso - allora) / 60000));
};

/**
 * Stato di presenza del fattorino sulla mappa.
 * Restituisce lo stato, i minuti dall'ultimo aggiornamento e il motivo quando
 * la posizione non e' utilizzabile.
 */
export const statoPresenza = (driver, adesso = Date.now()) => {
  const minuti = minutiDaAggiornamento(driver, adesso);
  const base = { minuti, ultimoAggiornamento: driver?.last_location_update || null };

  if (!driver?.is_active) {
    return { ...base, stato: 'non_disponibile', motivo: 'Fattorino non attivo' };
  }
  if (!haPosizione(driver)) {
    return { ...base, stato: 'non_disponibile', motivo: 'Nessuna posizione ricevuta' };
  }
  if (minuti === null) {
    return { ...base, stato: 'non_disponibile', motivo: 'Orario della posizione mancante' };
  }
  if (minuti > SOGLIA_RITARDO_MIN) {
    return { ...base, stato: 'in_ritardo', motivo: `Fermo da ${minuti} min` };
  }
  return { ...base, stato: 'live', motivo: minuti <= 1 ? 'Aggiornata ora' : `Aggiornata ${minuti} min fa` };
};

/** Riga breve da mettere sotto il nome, in qualunque tema. */
export const testoUltimoAggiornamento = (driver, adesso = Date.now()) => {
  const presenza = statoPresenza(driver, adesso);
  if (presenza.minuti === null) return presenza.motivo;
  if (presenza.minuti <= 1) return 'posizione aggiornata ora';
  if (presenza.minuti < 60) return `ultimo aggiornamento ${presenza.minuti} min fa`;
  const ore = Math.round(presenza.minuti / 60);
  if (ore < 24) return `ultimo aggiornamento ${ore} h fa`;
  return `ultimo aggiornamento il ${formatDateTime(presenza.ultimoAggiornamento)}`;
};

/**
 * Tempo di percorrenza stimato a partire dalla distanza in linea d'aria.
 * Non e' un tempo stradale: la pagina lo dichiara come stima.
 */
export const ETA_FATTORE_STRADALE = 1.35;
export const ETA_VELOCITA_MEDIA_KMH = 24;

export const etaStimataMinuti = (km, fattore = ETA_FATTORE_STRADALE, velocita = ETA_VELOCITA_MEDIA_KMH) => {
  if (km == null || Number.isNaN(Number(km))) return null;
  return Math.max(1, Math.round((Number(km) * fattore / velocita) * 60));
};

/** Testo unico per l'ETA, cosi' nessuna schermata la spaccia per tempo stradale. */
export const testoEta = (km) => {
  const minuti = etaStimataMinuti(km);
  if (minuti === null) return null;
  return `≈ ${minuti} min in linea d'aria`;
};
