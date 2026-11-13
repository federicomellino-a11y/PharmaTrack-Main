/* Come si chiama e come si disegna una consegna, in un posto solo.

Le etichette di stato erano ricopiate in Deliveries, Archive e DockPage, e le
icone vivevano dentro la pagina piu' grande del progetto. Chi aggiunge uno stato
deve ora toccare questo file e nient'altro.
*/
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  Euro,
  Package,
  Truck,
  User,
  XCircle,
} from 'lucide-react';

/* Le fasi di una consegna, con il nome che si legge.

   Fino a ieri le stesse fasi avevano tre nomi: "In attesa" in dashboard,
   "Assegnata" nella bolla, "Da ritirare" al fattorino, "In transito" in admin.
   Da qui in poi il nome e' uno, tranne dove il ruolo cambia davvero la domanda:
   per il fattorino "Affidata" non significa niente, "Da ritirare" si'. */
export const STATUS_LABELS = {
  da_preparare: 'Da preparare',
  pending: 'Da preparare', // doppione storico: si legge come la fase che e'
  pronta: 'Pronta',
  assigned: 'Affidata',
  picked_up: 'Ritirata',
  in_transit: 'In consegna',
  delivered_pending_confirmation: 'Consegnata da incassare',
  delivered: 'Incassata',
  cancelled: 'Annullata',
  not_delivered: 'Non consegnata',
};

/** Le stesse fasi viste dal fattorino: cosa deve fare, non dove sta la pratica. */
export const ETICHETTE_FATTORINO = {
  ...STATUS_LABELS,
  assigned: 'Da ritirare',
  delivered_pending_confirmation: 'Consegnata · in attesa farmacia',
};

export const STATUS_ICONS = {
  da_preparare: Clock,
  pending: Clock,
  pronta: ClipboardCheck,
  assigned: User,
  picked_up: Package,
  in_transit: Truck,
  delivered_pending_confirmation: Euro,
  delivered: CheckCircle2,
  cancelled: XCircle,
  not_delivered: AlertTriangle,
};

export const PRIORITY_LABELS = { low: 'Bassa', normal: 'Normale', high: 'Alta', urgent: 'Urgente' };
export const PRIORITY_ICONS = { low: null, normal: null, high: AlertTriangle, urgent: AlertTriangle };

/** "In consegna" per in_transit; se lo stato e' nuovo e sconosciuto, lo mostra grezzo. */
export const etichettaStato = (stato) => STATUS_LABELS[stato] || stato || '';
export const iconaStato = (stato) => STATUS_ICONS[stato] || null;
export const etichettaPriorita = (priorita) => PRIORITY_LABELS[priorita] || '';


/**
 * I soldi di una consegna, come vanno letti al banco.
 * `incasso` e' quanto entra davvero (il resto torna al cliente), `pagato` e'
 * quello che il cliente ha messo sul tavolo. Prima la riga mostrava in grande
 * il pagato, e sembrava che la farmacia avesse incassato anche il resto.
 */
export function soldiConsegna(consegna) {
  const importo = Number(consegna?.amount) || 0;
  const pagato = Number(consegna?.amount_given) || null;
  const conResto = consegna?.payment_method === 'cash' && pagato !== null && pagato > importo;
  return {
    incasso: importo,
    pagato: conResto ? pagato : null,
    resto: conResto ? Math.round((pagato - importo) * 100) / 100 : 0,
  };
}


/**
 * Una consegna e' "in ritardo" quando e' ancora da fare e la fascia promessa e'
 * passata. La regola stava dentro la pagina Consegne: non si poteva provare
 * senza montare la pagina e l'ora veniva presa dall'orologio.
 */
export function consegnaInRitardo(consegna, adesso = new Date()) {
  if (!consegna?.scheduled_time) return false;
  const daFare = ['da_preparare', 'pronta', 'pending', 'assigned', 'picked_up', 'in_transit'];
  if (!daFare.includes(consegna.status)) return false;
  const fine = (consegna.slot_to || consegna.scheduled_time).slice(0, 5);
  const giorno = consegna.scheduled_date || (consegna.created_at ? consegna.created_at.slice(0, 10) : null);
  if (giorno) {
    const oggi = adesso.toLocaleDateString('sv-SE');
    if (giorno < oggi) return true;
    if (giorno > oggi) return false;
  }
  const minuti = adesso.getHours() * 60 + adesso.getMinutes();
  const [ore, min] = fine.split(':').map(Number);
  return Number.isFinite(ore) && minuti > ore * 60 + min;
}

/** Quando una consegna si e' chiusa: consegnata, annullata o non consegnata. Null se e' ancora aperta. */
export function chiusaIl(consegna) {
  if (!consegna) return null;
  if (consegna.actual_delivery) return consegna.actual_delivery;
  return ['delivered', 'cancelled', 'not_delivered'].includes(consegna.status) ? consegna.updated_at || null : null;
}
