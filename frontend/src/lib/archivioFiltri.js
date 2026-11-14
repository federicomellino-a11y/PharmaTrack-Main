/**
 * Filtri dell'Archivio: le regole di lettura, senza React e senza rete.
 *
 * La ricerca in archivio la fa il database (backend/app/core/archivio.py).
 * Qui si decide solo *cosa* chiedere: il periodo diventa due giorni di
 * calendario italiani, e ogni filtro "tutti" semplicemente non viaggia, cosi'
 * l'indirizzo resta corto e leggibile.
 */

/** I filtri come stanno prima che l'utente tocchi niente. */
export const FILTRI_VUOTI = {
  q: '',
  stato: 'tutti',
  fattorino: 'tutti',
  pagamento: 'tutti',
  periodo: 'sempre',
};

/** Periodi offerti. Il valore e' quello che finisce nell'interrogazione. */
export const PERIODI = [
  { valore: 'sempre', etichetta: 'Sempre' },
  { valore: 'oggi', etichetta: 'Oggi' },
  { valore: '7', etichetta: 'Ultimi 7 giorni' },
  { valore: '30', etichetta: 'Ultimi 30 giorni' },
  { valore: '90', etichetta: 'Ultimi 3 mesi' },
  { valore: 'mese', etichetta: 'Questo mese' },
];

/** Gli stati che possono stare in archivio, con il nome che legge la farmacia. */
export const STATI_ARCHIVIO = [
  { valore: 'delivered', etichetta: 'Incassata' },
  { valore: 'delivered_pending_confirmation', etichetta: 'Consegnata da incassare' },
  { valore: 'not_delivered', etichetta: 'Non consegnata' },
  { valore: 'cancelled', etichetta: 'Annullata' },
];

/** Metodi di pagamento: gli stessi valori della cassa (lib/customers.js). */
export const PAGAMENTI_ARCHIVIO = [
  { valore: 'cash', etichetta: 'Contanti' },
  { valore: 'pos', etichetta: 'POS' },
  { valore: 'other', etichetta: 'Altro' },
];

/** La data locale come "AAAA-MM-GG": il fuso del browser, non quello UTC. */
export function giornoISO(data) {
  const anno = data.getFullYear();
  const mese = String(data.getMonth() + 1).padStart(2, '0');
  const giorno = String(data.getDate()).padStart(2, '0');
  return `${anno}-${mese}-${giorno}`;
}

function giorniFa(adesso, giorni) {
  const copia = new Date(adesso.getTime());
  copia.setDate(copia.getDate() - giorni);
  return copia;
}

/**
 * Il periodo scelto tradotto in due giorni di calendario.
 * `oggi` incluso in tutti i casi: "ultimi 7 giorni" sono oggi e i 6 prima.
 */
export function intervalloPeriodo(periodo, adesso = new Date()) {
  const oggi = giornoISO(adesso);
  switch (periodo) {
    case 'oggi':
      return { date_from: oggi, date_to: oggi };
    case '7':
      return { date_from: giornoISO(giorniFa(adesso, 6)), date_to: oggi };
    case '30':
      return { date_from: giornoISO(giorniFa(adesso, 29)), date_to: oggi };
    case '90':
      return { date_from: giornoISO(giorniFa(adesso, 89)), date_to: oggi };
    case 'mese':
      return {
        date_from: giornoISO(new Date(adesso.getFullYear(), adesso.getMonth(), 1)),
        date_to: oggi,
      };
    default:
      return {};
  }
}

/** I parametri veri per GET /archive, senza le voci "tutti". */
export function parametriArchivio({ page = 1, limit = 20, filtri = FILTRI_VUOTI } = {}) {
  const parametri = { page, limit };
  if (filtri.stato && filtri.stato !== 'tutti') parametri.status = filtri.stato;
  if (filtri.fattorino && filtri.fattorino !== 'tutti') parametri.driver_id = filtri.fattorino;
  if (filtri.pagamento && filtri.pagamento !== 'tutti') parametri.payment_method = filtri.pagamento;
  const testo = (filtri.q || '').trim();
  if (testo) parametri.q = testo;
  if (filtri.periodo && filtri.periodo !== 'sempre') {
    Object.assign(parametri, intervalloPeriodo(filtri.periodo));
  }
  return parametri;
}

/** La query string completa (l'ordine dei parametri e' fisso: cache stabile). */
export function queryArchivio(opzioni) {
  const parametri = parametriArchivio(opzioni);
  return Object.keys(parametri)
    .filter((chiave) => parametri[chiave] !== undefined && parametri[chiave] !== null && parametri[chiave] !== '')
    .map((chiave) => `${chiave}=${encodeURIComponent(parametri[chiave])}`)
    .join('&');
}

/** Quanti filtri sono accesi: serve a mostrare "Azzera" solo quando serve. */
export function quantiFiltri(filtri = FILTRI_VUOTI) {
  const accesi = [
    (filtri.q || '').trim() !== '',
    filtri.stato && filtri.stato !== 'tutti',
    filtri.fattorino && filtri.fattorino !== 'tutti',
    filtri.pagamento && filtri.pagamento !== 'tutti',
    filtri.periodo && filtri.periodo !== 'sempre',
  ];
  return accesi.filter(Boolean).length;
}

/** Riporta i filtri al punto di partenza tenendo il periodo scelto? No: tutto. */
export function azzeraFiltri() {
  return { ...FILTRI_VUOTI };
}
