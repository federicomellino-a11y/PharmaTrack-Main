/* La prossima mossa di una consegna, scritta una volta sola.

   Il backend decide quali passaggi sono ammessi (delivery_lifecycle.TRANSIZIONI);
   qui c'e' solo la traduzione in un pulsante: quale stato mandare e come si
   chiama. Prima questa catena stava dentro il dettaglio del fattorino e le
   schermate della farmacia avevano ciascuna il proprio elenco di stati.
*/
import { STATUS_LABELS } from './deliveryDisplay';

const PASSI_FARMACIA = {
  da_preparare: 'pronta',
  pending: 'pronta',
  pronta: 'assigned',
  assigned: 'picked_up',
  picked_up: 'in_transit',
  in_transit: 'delivered_pending_confirmation',
  delivered_pending_confirmation: 'delivered',
  delivered: null,
  cancelled: null,
  not_delivered: null,
};

const PASSI_FATTORINO = {
  assigned: 'picked_up',
  picked_up: 'in_transit',
  // Il fattorino manda "delivered": il backend lo registra come consegna fatta
  // in attesa che la farmacia confermi l'incasso.
  in_transit: 'delivered',
};

const ETICHETTE_AZIONE = {
  'farmacia:pronta': 'Segna pronta',
  'farmacia:assigned': 'Affida al fattorino',
  'farmacia:picked_up': 'Segna ritirata',
  'farmacia:in_transit': 'Avvia consegna',
  'farmacia:delivered_pending_confirmation': 'Conferma incasso',
  'fattorino:picked_up': 'Ritira',
  'fattorino:in_transit': 'Parti',
  'fattorino:delivered': 'Consegnato',
};

/** Lo stato che viene dopo, o null se la consegna e' ferma. */
export const statoSuccessivo = (stato, ruolo = 'farmacia') =>
  (ruolo === 'fattorino' ? PASSI_FATTORINO : PASSI_FARMACIA)[stato] ?? null;

/** L'azione principale: che stato mandare e con che parola sul pulsante. */
export const prossimaAzione = (stato, ruolo = 'farmacia') => {
  const successivo = statoSuccessivo(stato, ruolo);
  if (!successivo) return null;
  return {
    stato: successivo,
    etichetta: ETICHETTE_AZIONE[`${ruolo}:${successivo}`] || STATUS_LABELS[successivo] || successivo,
  };
};

/* L'avanzamento in un click della farmacia: dal banco il fattorino ha gia'
   ritirato, quindi da "affidata" si va direttamente "in giro" (il backend lo
   permette). L'ultimo passo non e' l'incasso: la consegna arriva in attesa che
   la farmacia confermi i soldi, che resta un gesto suo. */
const AVANZAMENTO_FARMACIA = {
  assigned: 'in_transit',
  picked_up: 'in_transit',
  in_transit: 'delivered_pending_confirmation',
};

const ETICHETTE_AVANZAMENTO = {
  in_transit: 'In consegna',
  delivered_pending_confirmation: 'Consegnata da incassare',
};

/** Lo stato da mandare quando la farmacia preme "avanti", o null se non c'e'. */
export const avanzamentoFarmacia = (stato) => {
  const successivo = AVANZAMENTO_FARMACIA[stato];
  if (!successivo) return null;
  return {
    stato: successivo,
    etichetta: ETICHETTE_AVANZAMENTO[successivo] || STATUS_LABELS[successivo] || successivo,
  };
};

/* Cosa si puo' fare su una consegna ferma in un certo stato. Prima queste
   regole vivevano dentro il JSX come confronti di stringhe, e la fila di
   pulsanti offriva azioni che il backend poi rifiutava con un 409. */
const FASI_ANNULLABILI = ['da_preparare', 'pending', 'pronta', 'assigned', 'picked_up', 'in_transit'];
/* Il backend riapre tutto cio' che e' in archivio (can_restore). Qui resta
   fuori solo "consegnata da incassare", dove la lista mostra gia' i suoi due
   gesti (conferma incasso, contesta): un terzo pulsante confonderebbe. */
const FASI_RIPRISTINABILI = ['delivered', 'cancelled', 'not_delivered'];

/** Si annulla finche' la consegna e' in giro; da "in attesa di incasso" si contesta, non si annulla. */
export const puoAnnullare = (stato) => FASI_ANNULLABILI.includes(stato);

/** Si riapre una consegna annullata o segnata come non consegnata. */
export const puoRipristinare = (stato) => FASI_RIPRISTINABILI.includes(stato);

export default prossimaAzione;
