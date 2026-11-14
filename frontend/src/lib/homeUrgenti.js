import { consegnaInRitardo } from './deliveryDisplay';
import { statoPresenza } from './trackingPresenze';

/* "Da gestire ora": le cinque domande che la farmacia si fa aprendo il
   gestionale, con il numero accanto.

   1. chi e' in ritardo adesso
   2. quali ordini non hanno ancora un fattorino
   3. quali incassi aspettano conferma
   4. quali fattorini non mandano la posizione
   5. quali turni non sono stati quadrati

   Regole pure, nessun React: cosi' i numeri si possono verificare con un test
   invece che guardando la schermata. */

export const STATI_DA_ASSEGNARE = ['da_preparare', 'pending', 'pronta'];

const testoIndirizzo = (consegna) => consegna?.customer_address || 'Indirizzo non indicato';

// Due funzioni esistenti leggono l'ora in due modi (Date per il ritardo, ms
// per la posizione): qui si accetta l'uno o l'altro e si passa a ciascuna la
// forma che si aspetta.
const comeData = (adesso) => (adesso instanceof Date ? adesso : new Date(adesso ?? Date.now()));

export const consegneInRitardo = (consegne = [], adesso = Date.now()) => {
  const momento = comeData(adesso);
  return (consegne || []).filter((consegna) => consegna && consegnaInRitardo(consegna, momento));
};

export const consegneDaAssegnare = (consegne = []) =>
  (consegne || []).filter((consegna) => (
    consegna && !consegna.driver_id && STATI_DA_ASSEGNARE.includes(consegna.status)
  ));

export const incassiDaConfermare = (consegne = []) =>
  (consegne || []).filter((consegna) => consegna?.status === 'delivered_pending_confirmation');

// Un fattorino attivo che non manda la posizione e' un fattorino di cui non
// si sa dove sia: conta solo se e' acceso, altrimenti e' semplicemente a casa.
export const fattoriniSenzaPosizione = (fattorini = [], adesso = Date.now()) => {
  const momento = comeData(adesso).getTime();
  return (fattorini || []).filter((fattorino) => (
    fattorino?.is_active && statoPresenza(fattorino, momento).stato !== 'live'
  ));
};

// Un turno e' da controllare finche' la farmacia non lo ha quadrato.
export const turniDaControllare = (turni = []) =>
  (turni || []).filter((turno) => turno && turno.status !== 'settled');

/**
 * Le cinque voci della sezione, gia' ordinate per urgenza.
 * Ogni voce porta il conteggio, il collegamento principale e le prime righe
 * da mostrare: chi ha fretta clicca il numero, chi vuole il dettaglio lo legge.
 */
export const costruisciDaGestire = ({
  consegne = [],
  fattorini = [],
  turni = [],
  adesso = Date.now(),
  turniDisponibili = true,
} = {}) => {
  const momento = comeData(adesso);
  const ritardo = consegneInRitardo(consegne, momento);
  const daAssegnare = consegneDaAssegnare(consegne);
  const incassi = incassiDaConfermare(consegne);
  const senzaPosizione = fattoriniSenzaPosizione(fattorini, momento);
  const turniAperti = turniDisponibili ? turniDaControllare(turni) : [];

  const voci = [
    {
      chiave: 'ritardo',
      etichetta: 'Consegne in ritardo',
      descrizione: 'Fascia oraria già passata',
      tono: 'rosso',
      conteggio: ritardo.length,
      to: ritardo.length === 1
        ? `/deliveries?delivery=${ritardo[0].delivery_id}`
        : '/deliveries?vista=ritardo',
      righe: ritardo.slice(0, 4).map((consegna) => ({
        id: consegna.delivery_id,
        titolo: consegna.customer_name || 'Cliente',
        dettaglio: testoIndirizzo(consegna),
        to: `/deliveries?delivery=${consegna.delivery_id}`,
      })),
    },
    {
      chiave: 'da_assegnare',
      etichetta: 'Ordini da assegnare',
      descrizione: 'Nessun fattorino collegato',
      tono: 'ambra',
      conteggio: daAssegnare.length,
      to: '/deliveries?vista=da_assegnare',
      righe: daAssegnare.slice(0, 4).map((consegna) => ({
        id: consegna.delivery_id,
        titolo: consegna.customer_name || 'Cliente',
        dettaglio: testoIndirizzo(consegna),
        to: `/deliveries?delivery=${consegna.delivery_id}`,
      })),
    },
    {
      chiave: 'incassi',
      etichetta: 'Incassi da confermare',
      descrizione: 'Consegnate, soldi non ancora chiusi',
      tono: 'ambra',
      conteggio: incassi.length,
      to: '/deliveries?tab=pending_confirmation',
      righe: incassi.slice(0, 4).map((consegna) => ({
        id: consegna.delivery_id,
        titolo: consegna.customer_name || 'Cliente',
        dettaglio: consegna.amount ? `€ ${Number(consegna.amount).toFixed(2).replace('.', ',')}` : 'Importo da definire',
        to: `/deliveries?delivery=${consegna.delivery_id}`,
      })),
    },
    {
      chiave: 'fattorini',
      etichetta: 'Fattorini senza posizione',
      descrizione: 'Posizione ferma o mai arrivata',
      tono: 'ambra',
      conteggio: senzaPosizione.length,
      to: '/tracking',
      righe: senzaPosizione.slice(0, 4).map((fattorino) => ({
        id: fattorino.driver_id,
        titolo: fattorino.name || 'Fattorino',
        dettaglio: statoPresenza(fattorino, momento.getTime()).motivo,
        to: '/tracking',
      })),
    },
    {
      chiave: 'turni',
      etichetta: 'Turni da controllare',
      descrizione: 'Da chiudere o da quadrare',
      tono: 'ambra',
      conteggio: turniAperti.length,
      to: '/shifts',
      nascosta: !turniDisponibili,
      righe: turniAperti.slice(0, 4).map((turno) => ({
        id: turno.shift_id,
        titolo: turno.driver_name || 'Turno',
        dettaglio: turno.status === 'closed' ? 'Chiuso, da quadrare' : 'Ancora aperto',
        to: '/shifts',
      })),
    },
  ];

  return voci.filter((voce) => !voce.nascosta);
};

/** Il totale da mettere nel titolo della sezione. */
export const totaleDaGestire = (voci = []) =>
  voci.reduce((totale, voce) => totale + (voce.conteggio || 0), 0);
