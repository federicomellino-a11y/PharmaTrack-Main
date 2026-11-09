/* Quando vale la pena mandare la posizione del fattorino al server.

   Stava dentro dashboard fattorino, mescolata alla chiamata di rete: cosi' la
   regola si legge da sola e si puo' provare senza geolocalizzazione.
*/

// Circa 5 metri: sotto questa differenza il movimento non aggiunge informazione.
export const LOCATION_DISTANCE_THRESHOLD = 0.00005;
// 15 secondi: sotto questa distanza di tempo non si ripete l'invio.
export const LOCATION_MIN_INTERVAL = 15000;

export const vaInviataPosizione = (precedente, attuale, adesso) => {
  if (!precedente) return true;
  const stessaZona = Math.abs(precedente.lat - attuale.lat) < LOCATION_DISTANCE_THRESHOLD
    && Math.abs(precedente.lng - attuale.lng) < LOCATION_DISTANCE_THRESHOLD;
  const inviataDaPoco = adesso - precedente.timestamp < LOCATION_MIN_INTERVAL;
  return !(stessaZona && inviataDaPoco);
};

export default vaInviataPosizione;
