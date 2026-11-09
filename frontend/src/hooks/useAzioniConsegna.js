import axios from 'axios';
import { toast } from 'sonner';
import { API } from '@/lib/config';
import { formatCurrency } from '@/lib/format';
import { avanzamentoFarmacia } from '@/lib/deliveryActions';
import { confirmAction } from '../components/ConfirmDialog';

/**
 * I gesti che cambiano lo stato o i soldi di una consegna: conferma incasso,
 * contestazione, annullamento, ripristino, avanzamento della farmacia.
 *
 * Stanno qui e non dentro la pagina perche' toccano i soldi: cosi' ognuno si
 * puo' provare da solo, compreso il caso in cui la farmacia cambia idea e il
 * caso in cui il backend rifiuta (409) e non si deve ricaricare nulla.
 *
 * @param {object} opzioni
 * @param {Function} opzioni.ricarica chiamata solo dopo un gesto riuscito
 * @param {Function} opzioni.onAssegnaRichiesta consegna senza fattorino da assegnare
 */
export default function useAzioniConsegna({ ricarica, onAssegnaRichiesta } = {}) {
  const ricaricaLista = ricarica || (() => {});

  const confermaIncasso = async (consegna) => {
    const nota = window.prompt(
      `Confermi l'incasso di ${formatCurrency(consegna.amount)} da ${consegna.customer_name}?\n\nLascia una nota se vuoi (opzionale).`,
      ''
    );
    if (nota === null) return; // la farmacia ha annullato il dialogo
    try {
      await axios.post(
        `${API}/deliveries/${consegna.delivery_id}/confirm-payment`,
        { confirmed_amount: consegna.amount, note: nota || null },
        { withCredentials: true }
      );
      toast.success('✓ Incasso confermato');
      ricaricaLista();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Errore conferma');
    }
  };

  const contestaIncasso = async (consegna) => {
    const motivo = window.prompt(
      `Segnala un problema con l'incasso di ${consegna.customer_name}.\n\nMotivo (es: importo errato, manca parte del contante):`,
      ''
    );
    if (!motivo || !motivo.trim()) return;
    try {
      await axios.post(
        `${API}/deliveries/${consegna.delivery_id}/dispute-payment`,
        { reason: motivo.trim() },
        { withCredentials: true }
      );
      toast.success('Contestazione registrata');
      ricaricaLista();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Errore');
    }
  };

  const annulla = async (id) => {
    const confermato = await confirmAction({
      title: 'Annullare questa consegna?',
      description: 'Potrai ripristinarla dalla sezione archivio.',
      confirmLabel: 'Annulla consegna',
      destructive: true,
    });
    if (!confermato) return;
    try {
      await axios.put(`${API}/deliveries/${id}`, { status: 'cancelled' }, { withCredentials: true });
      toast.success('Consegna annullata');
      ricaricaLista();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Errore');
    }
  };

  const ripristina = async (id) => {
    try {
      await axios.post(`${API}/deliveries/${id}/restore`, {}, { withCredentials: true });
      toast.success('Consegna ripristinata');
      ricaricaLista();
    } catch (error) {
      toast.error(error?.response?.data?.detail || 'Ripristino non riuscito');
    }
  };

  const avanzaStato = async (consegna) => {
    const azione = avanzamentoFarmacia(consegna.status);
    if (!azione) return;
    if (consegna.status === 'assigned' && !consegna.driver_id) {
      toast.error('Assegna prima un fattorino per avviare la consegna');
      if (onAssegnaRichiesta) onAssegnaRichiesta(consegna);
      return;
    }
    try {
      await axios.put(
        `${API}/deliveries/${consegna.delivery_id}`,
        { status: azione.stato },
        { withCredentials: true }
      );
      toast.success(`✓ ${azione.etichetta}`);
      ricaricaLista();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Errore aggiornamento stato');
    }
  };

  return { confermaIncasso, contestaIncasso, annulla, ripristina, avanzaStato };
}
