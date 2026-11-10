/* Le consegne ancora in mano alla farmacia, e come dirlo al banco.

   La stessa domanda ("questo cliente ha già una consegna aperta?") si fa in
   due punti: l'aggiunta rapida e la creazione manuale. Era scritta due volte,
   con due elenchi di stati diversi: chi selezionava lo stesso cliente dalla
   pagina Consegne non vedeva nessun avviso e lo scopriva dal 409 del server,
   cioe' a danno fatto. Da qui la regola e' una sola.

   Attenzione a "delivered_pending_confirmation": la consegna e' fatta ma non
   ancora incassata, quindi resta aperta finche' la farmacia non conferma.
*/
import { STATUS_LABELS } from './deliveryDisplay';
import { testoFascia } from './fasce';

export const STATI_APERTI = [
  'da_preparare',
  'pending',
  'pronta',
  'assigned',
  'picked_up',
  'in_transit',
  'delivered_pending_confirmation',
];

/** Le consegne aperte di un cliente, dalla piu' recente. */
export function consegneAperteDelCliente(consegne, customerId) {
  if (!customerId) return [];
  return (consegne || [])
    .filter((c) => c && c.customer_id === customerId && STATI_APERTI.includes(c.status))
    .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
}

/** Il testo dell'avviso, uno solo per i due punti in cui compare. */
export function avvisoConsegnaAperta(aperte) {
  if (!aperte || aperte.length === 0) return null;
  const prima = aperte[0];
  const stato = (STATUS_LABELS[prima.status] || prima.status || 'in corso').toLowerCase();
  const fascia = testoFascia(prima.scheduled_time, prima.slot_to);
  const dettaglio = [stato, fascia].filter(Boolean).join(' · ');
  if (aperte.length === 1) {
    return `Questo cliente ha già una consegna aperta (${dettaglio}). Se è la stessa, non serve crearne un'altra.`;
  }
  return `Questo cliente ha ${aperte.length} consegne aperte (una è ${dettaglio}). Controlla che non sia la stessa.`;
}
