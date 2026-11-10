import { useCallback, useMemo, useState } from 'react';

/* Lo stato del modulo consegna, in un posto solo.

   Stava sparso in Deliveries.jsx: `form`, `fasciaScelta`, `resetForm`,
   `change_due` e il calcolo degli importi erano cinque pezzi separati, e per
   sapere cosa contiene una consegna nuova bisognava leggere tutta la pagina.
   Qui dentro c'e' solo questo: nessuna chiamata di rete, nessun dialogo.

   `change_due` e' il resto: quanto ha dato il cliente meno quanto costa, e vale
   null finche' una delle due cifre non c'e'. Non e' un dettaglio grafico, e' il
   numero che finisce in cassa, quindi ha un test suo.
*/

// Importi: stringa vuota, null e undefined valgono "non scritto".
export const normalizzaImporto = (valore) => {
  if (valore === '' || valore === null || valore === undefined) return null;
  const numero = parseFloat(valore);
  return Number.isNaN(numero) ? null : numero;
};

export const MODULO_VUOTO = {
  customer_id: 'none',
  notes: '',
  payment_method: 'cash',
  amount: '',
  amount_given: '',
  scheduled_date: '',
  scheduled_time: '',
  slot_to: null,
  priority: 'normal',
  nre: '',
    // Solo nella modifica: lo stato scelto e il motivo di una correzione.
    status: null,
    force_reason: '',
};

/* La fascia iniziale arriva dalle impostazioni della farmacia
   (settings.fascia_predefinita): chi consegna sempre il pomeriggio trova il
   modulo gia' sul pomeriggio. Senza impostazioni resta "La prima possibile",
   che e' quello che l'app faceva prima di avere una scelta. */
export default function useDeliveryForm({ fasciaIniziale } = {}) {
  const valoreIniziale = fasciaIniziale?.valore || 'subito';
  const moduloIniziale = fasciaIniziale?.da && fasciaIniziale.da !== '__manuale__'
    ? { ...MODULO_VUOTO, scheduled_time: fasciaIniziale.da, slot_to: fasciaIniziale.a || null }
    : MODULO_VUOTO;

  const [form, setForm] = useState(moduloIniziale);
  const [fasciaScelta, setFasciaScelta] = useState(valoreIniziale);

  const reset = useCallback(() => {
    setForm(moduloIniziale);
    setFasciaScelta(valoreIniziale);
  }, [moduloIniziale, valoreIniziale]);

  const amountValue = normalizzaImporto(form.amount);
  const amountGivenValue = normalizzaImporto(form.amount_given);

  const change_due = useMemo(
    () => (amountValue !== null && amountGivenValue !== null ? amountGivenValue - amountValue : null),
    [amountValue, amountGivenValue],
  );

  return { form, setForm, fasciaScelta, setFasciaScelta, reset, change_due, amountValue, amountGivenValue };
}
