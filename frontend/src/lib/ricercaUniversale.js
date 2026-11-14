import { STATI_DA_ASSEGNARE } from './homeUrgenti';

/* La ricerca "Vai a / Cerca".

   Una sola casella per tre gesti diversi: aprire una pagina, trovare una
   persona (cliente o fattorino), trovare una consegna o un indirizzo. Le
   regole stanno qui, senza React, perche' la ricerca si sbaglia facilmente:
   accenti, maiuscole e numeri di telefono scritti in tre modi.

   Quello che entra nella ricerca e' gia' filtrato dai permessi: le pagine
   arrivano dal menu visibile (funzioni spente escluse), gli elenchi dagli
   stessi hook che usano le pagine. Qui non si decide cosa una persona puo'
   vedere. */

const normalizza = (valore) => String(valore ?? '')
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '');

const soloCifre = (valore) => String(valore ?? '').replace(/\D/g, '');

/** Il termine cercato compare nel testo? Anche a pezzi, anche senza accenti. */
export const corrisponde = (testo, termine) => {
  const cercato = normalizza(termine).trim();
  if (!cercato) return false;
  return normalizza(testo).includes(cercato);
};

/** I telefoni si cercano anche scrivendo solo le ultime cifre. */
const telefonoCorrisponde = (telefono, termine) => {
  const cifre = soloCifre(termine);
  if (cifre.length < 3) return false;
  return soloCifre(telefono).includes(cifre);
};

export const LIMITE_PER_GRUPPO = 5;

const cercaPagine = (pagine, termine) => pagine
  .filter((pagina) => corrisponde(pagina.label, termine))
  .map((pagina) => ({
    id: `pagina-${pagina.path}`,
    titolo: pagina.label,
    dettaglio: 'Pagina',
    to: pagina.path,
    icona: pagina.icon,
  }));

const cercaClienti = (clienti, termine) => clienti
  .filter((cliente) => (
    corrisponde(cliente.name, termine)
    || corrisponde(cliente.address, termine)
    || telefonoCorrisponde(cliente.phone, termine)
  ))
  .map((cliente) => ({
    id: `cliente-${cliente.customer_id}`,
    titolo: cliente.name,
    dettaglio: cliente.address || 'Indirizzo non indicato',
    to: `/customers?customer=${cliente.customer_id}`,
  }));

const cercaConsegne = (consegne, termine) => consegne
  .filter((consegna) => (
    corrisponde(consegna.customer_name, termine)
    || corrisponde(consegna.customer_address, termine)
    || corrisponde(consegna.nre, termine)
    || telefonoCorrisponde(consegna.customer_phone, termine)
  ))
  .map((consegna) => ({
    id: `consegna-${consegna.delivery_id}`,
    titolo: consegna.customer_name || 'Consegna',
    dettaglio: [consegna.customer_address, consegna.status?.replace(/_/g, ' ')]
      .filter(Boolean).join(' · '),
    to: `/deliveries?delivery=${consegna.delivery_id}`,
  }));

const cercaFattorini = (fattorini, termine) => fattorini
  .filter((fattorino) => (
    corrisponde(fattorino.name, termine)
    || corrisponde(fattorino.email, termine)
    || telefonoCorrisponde(fattorino.phone, termine)
  ))
  .map((fattorino) => ({
    id: `fattorino-${fattorino.driver_id}`,
    titolo: fattorino.name || 'Fattorino',
    dettaglio: fattorino.is_active ? 'Fattorino attivo' : 'Fattorino non attivo',
    to: `/drivers?driver=${fattorino.driver_id}`,
  }));

// Un indirizzo porta al cliente che ci abita: e' cosi' che al banco si
// risponde a "chi e' quello di via Roma?".
const cercaIndirizzi = (clienti, termine) => {
  const visti = new Set();
  return clienti
    .filter((cliente) => cliente.address && corrisponde(cliente.address, termine))
    .filter((cliente) => {
      const chiave = normalizza(cliente.address);
      if (visti.has(chiave)) return false;
      visti.add(chiave);
      return true;
    })
    .map((cliente) => ({
      id: `indirizzo-${cliente.customer_id}`,
      titolo: cliente.address,
      dettaglio: cliente.name,
      to: `/customers?customer=${cliente.customer_id}`,
    }));
};

/** Le azioni che non sono ne' pagine ne' schede: si scrivono da qui. */
export const AZIONI_RAPIDE = [
  { id: 'azione-nuova-consegna', titolo: 'Nuova consegna', dettaglio: 'Apri il modulo', to: '/deliveries?new=true' },
  { id: 'azione-nuovo-cliente', titolo: 'Nuovo cliente', dettaglio: 'Anagrafica', to: '/customers?new=true' },
  { id: 'azione-incassi', titolo: 'Incassi da confermare', dettaglio: 'Consegne consegnate', to: '/deliveries?tab=pending_confirmation' },
  { id: 'azione-ritardo', titolo: 'Consegne in ritardo', dettaglio: 'Da recuperare', to: '/deliveries?vista=ritardo' },
  { id: 'azione-da-assegnare', titolo: 'Ordini da assegnare', dettaglio: 'Senza fattorino', to: '/deliveries?vista=da_assegnare' },
];

const cercaAzioni = (termine) => AZIONI_RAPIDE
  .filter((azione) => corrisponde(azione.titolo, termine) || corrisponde(azione.dettaglio, termine))
  .map((azione) => ({ ...azione, icona: undefined }));

/**
 * Tutti i gruppi di risultati per un termine.
 * Con la casella vuota restano le azioni e le pagine: e' la parte "Vai a".
 */
export const cercaOvunque = ({
  termine = '',
  pagine = [],
  clienti = [],
  consegne = [],
  fattorini = [],
  limite = LIMITE_PER_GRUPPO,
} = {}) => {
  const cercato = String(termine || '').trim();
  if (!cercato) {
    return [
      { chiave: 'azioni', etichetta: 'Azioni rapide', risultati: AZIONI_RAPIDE },
      { chiave: 'pagine', etichetta: 'Vai a', risultati: pagine.map((pagina) => ({
        id: `pagina-${pagina.path}`,
        titolo: pagina.label,
        dettaglio: 'Pagina',
        to: pagina.path,
        icona: pagina.icon,
      })) },
    ];
  }

  const gruppi = [
    { chiave: 'pagine', etichetta: 'Pagine e funzioni', risultati: cercaPagine(pagine, cercato) },
    { chiave: 'clienti', etichetta: 'Clienti', risultati: cercaClienti(clienti, cercato) },
    { chiave: 'consegne', etichetta: 'Consegne', risultati: cercaConsegne(consegne, cercato) },
    { chiave: 'fattorini', etichetta: 'Fattorini', risultati: cercaFattorini(fattorini, cercato) },
    { chiave: 'indirizzi', etichetta: 'Indirizzi', risultati: cercaIndirizzi(clienti, cercato) },
    { chiave: 'azioni', etichetta: 'Azioni', risultati: cercaAzioni(cercato) },
  ];

  return gruppi
    .map((gruppo) => ({ ...gruppo, risultati: gruppo.risultati.slice(0, limite) }))
    .filter((gruppo) => gruppo.risultati.length > 0);
};

/** Quante consegne restano senza fattorino: serve al comando, non alla pagina. */
export const quanteDaAssegnare = (consegne = []) =>
  (consegne || []).filter((consegna) => !consegna.driver_id && STATI_DA_ASSEGNARE.includes(consegna.status)).length;
