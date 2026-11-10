/* Le consegne del fattorino, raggruppate per via.

   Perche' non e' l'ottimizzazione dei percorsi: quella richiede un servizio di
   routing e una decisione su chi paga le chiamate. Qui si fa la cosa che serve
   davvero al giro, cioe' non far saltare il fattorino da un capo all'altro
   della citta' perche' l'ordine e' quello di inserimento. Le consegne della
   stessa via (o dello stesso CAP quando la via non si legge) finiscono vicine.

   Regola volutamente semplice e verificabile: la chiave e' il nome della via,
   senza civico. Due vie diverse a cento metri restano due gruppi, e va bene:
   meglio un raggruppamento che si spiega al telefono che uno che sbaglia.
*/

const VUOTI = new Set(['snc', 's.n.c.', 's.n.c', 'n.c.', 'nc']);

/** "Via Roma 12, Milano" -> { via: "Via Roma", civico: 12 }. */
export function scomponiIndirizzo(indirizzo) {
  if (!indirizzo) return { via: null, civico: null };
  const primo = String(indirizzo).split(',')[0].trim();
  const civicoTrovato = primo.match(/(\d+)(?:\s*\/?\s*[a-zA-Z])?\s*$/);
  const civico = civicoTrovato ? Number(civicoTrovato[1]) : null;
  const senzaCivico = primo
    .replace(/[\s,]+(\d+(?:\s*\/?\s*[a-zA-Z])?|snc|s\.n\.c\.?)\s*$/i, '')
    .replace(/[\s,]+$/, '')
    .trim();
  // Un indirizzo fatto di solo numero ("20100") non e' una via: e' un CAP.
  if (!senzaCivico || /^[\d\s/]+[a-zA-Z]?$/.test(senzaCivico) || VUOTI.has(senzaCivico.toLowerCase())) {
    return { via: null, civico };
  }
  return { via: senzaCivico, civico };
}

/** La chiave di raggruppamento: la via, o il CAP, o niente. */
export function chiaveZona(consegna) {
  const { via } = scomponiIndirizzo(consegna?.customer_address);
  if (via) return via.toLowerCase().replace(/\s+/g, ' ');
  const cap = String(consegna?.customer_address || '').match(/\b(\d{5})\b/);
  if (cap) return `cap:${cap[1]}`;
  return 'altro';
}

/** L'etichetta da mostrare: "Via Roma", "Zona 20100", "Indirizzo da completare". */
export function titoloZona(chiave, consegne) {
  if (chiave === 'altro') return 'Indirizzo da completare';
  if (chiave.startsWith('cap:')) return `Zona ${chiave.slice(4)}`;
  const prima = consegne?.find((c) => chiaveZona(c) === chiave);
  const { via } = scomponiIndirizzo(prima?.customer_address);
  return via || 'Indirizzo da completare';
}

const minuti = (orario) => {
  if (!orario) return Number.POSITIVE_INFINITY;
  const [ore, min] = String(orario).slice(0, 5).split(':').map(Number);
  return Number.isFinite(ore) && Number.isFinite(min) ? ore * 60 + min : Number.POSITIVE_INFINITY;
};

/**
 * I gruppi, nell'ordine in cui conviene farli: prima chi ha una fascia piu'
 * stretta, e dentro ogni gruppo i civici in fila (1, 3, 5...) invece che a caso.
 */
export function raggruppaPerZona(consegne) {
  const perChiave = new Map();
  (consegne || []).forEach((consegna) => {
    if (!consegna) return;
    const chiave = chiaveZona(consegna);
    if (!perChiave.has(chiave)) perChiave.set(chiave, []);
    perChiave.get(chiave).push(consegna);
  });

  const gruppi = [...perChiave.entries()].map(([chiave, elenco]) => {
    const ordinati = [...elenco].sort((a, b) => {
      const ca = scomponiIndirizzo(a.customer_address).civico;
      const cb = scomponiIndirizzo(b.customer_address).civico;
      if (ca !== null && cb !== null && ca !== cb) return ca - cb;
      if (ca !== null && cb === null) return -1;
      if (ca === null && cb !== null) return 1;
      return minuti(a.scheduled_time) - minuti(b.scheduled_time);
    });
    return {
      chiave,
      titolo: titoloZona(chiave, elenco),
      consegne: ordinati,
      primaFascia: Math.min(...elenco.map((c) => minuti(c.scheduled_time))),
    };
  });

  return gruppi.sort((a, b) => {
    if (a.primaFascia !== b.primaFascia) return a.primaFascia - b.primaFascia;
    if (a.consegne.length !== b.consegne.length) return b.consegne.length - a.consegne.length;
    return a.titolo.localeCompare(b.titolo, 'it');
  });
}

/**
 * L'elenco piatto da disegnare: un'intestazione di zona e poi le sue consegne.
 *
 * Serve a non annidare due cicli nel JSX della dashboard del fattorino: si
 * scorre una lista sola e si guarda se la riga e' una zona o una consegna.
 */
export function elencoConIntestazioni(consegne) {
  const gruppi = raggruppaPerZona(consegne);
  // Con una consegna sola (o tutte nella stessa via) l'intestazione e' rumore.
  const conIntestazioni = gruppi.length > 1;
  return gruppi.flatMap((gruppo) => [
    ...(conIntestazioni
      ? [{ tipo: 'zona', chiave: gruppo.chiave, titolo: gruppo.titolo, quante: gruppo.consegne.length }]
      : []),
    ...gruppo.consegne.map((consegna) => ({ tipo: 'consegna', chiave: consegna.delivery_id, consegna })),
  ]);
}
