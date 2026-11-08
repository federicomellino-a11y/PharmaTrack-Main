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

export const STATUS_LABELS = {
  da_preparare: 'Da preparare',
  pending: 'Da preparare',
  pronta: 'Pronta',
  assigned: 'Assegnata',
  picked_up: 'Ritirata',
  in_transit: 'In consegna',
  delivered_pending_confirmation: 'Da confermare incasso',
  delivered: 'Consegnata',
  cancelled: 'Annullata',
  not_delivered: 'Non consegnata',
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
