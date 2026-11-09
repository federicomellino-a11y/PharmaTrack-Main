/* Regole dei fattorini che non hanno bisogno di React ne' della rete.

   Erano sparse in cima a Drivers.jsx, comprese fra un import e l'altro.
*/

export const vehicleLabels = {
  scooter: 'Scooter',
  bike: 'Bicicletta',
  car: 'Auto',
  van: 'Furgone',
};

export const etichettaMezzo = (tipo) => vehicleLabels[tipo] || tipo || '';

/** Ricerca per nome, email o telefono. Il telefono puo' mancare: non deve rompere. */
export const filtraFattorini = (fattorini = [], termine = '') => {
  const cercato = (termine || '').trim().toLowerCase();
  if (!cercato) return fattorini;
  return fattorini.filter((f) => (
    (f?.name || '').toLowerCase().includes(cercato)
    || (f?.email || '').toLowerCase().includes(cercato)
    || (f?.phone || '').includes(termine.trim())
  ));
};

/** Il 402 e' il limite del piano: va spiegato, non mostrato come guasto. */
export const messaggioPiano = (errore, ripiego) => (
  errore?.response?.status === 402
    ? (errore.response.data?.detail || 'Limite del piano raggiunto.')
    : ripiego
);
