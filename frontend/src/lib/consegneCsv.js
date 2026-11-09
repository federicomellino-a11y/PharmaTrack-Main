import { PRIORITY_LABELS, STATUS_LABELS } from './deliveryDisplay';

/**
 * Il foglio delle consegne, senza toccare il browser: cosi' si puo' provare
 * quello che finisce davvero dentro il file.
 */
export function costruisciCsv(consegne, drivers = []) {
  const esc = (valore) => '"' + String(valore ?? '').replace(/"/g, '""') + '"';
  const intestazione = ['Data', 'Cliente', 'Telefono', 'Indirizzo', 'Stato', 'Fattorino',
    'Pagamento', 'Importo', 'Pagato con', 'Resto', 'Riferimento vendita', 'Motivo mancata',
    'Priorita', 'Note'];
  const righe = [intestazione.join(',')];
  (consegne || []).forEach((d) => {
    const fattorino = (drivers || []).find((dr) => dr.driver_id === d.driver_id);
    righe.push([
      d.created_at ? new Date(d.created_at).toLocaleString('it-IT') : '',
      d.customer_name,
      d.customer_phone,
      d.customer_address,
      STATUS_LABELS[d.status] || d.status,
      fattorino?.name || '',
      d.payment_method === 'cash' ? 'Contanti' : 'POS',
      d.amount != null ? String(d.amount).replace('.', ',') : '',
      d.amount_given != null ? String(d.amount_given).replace('.', ',') : '',
      d.change_due != null ? String(d.change_due).replace('.', ',') : '',
      d.external_ref || '',
      d.failure_reason || '',
      PRIORITY_LABELS[d.priority] || '',
      d.notes || '',
    ].map(esc).join(','));
  });
  // Il BOM serve a Excel: senza, apre in ANSI e sbaglia gli accenti.
  return '\ufeff' + righe.join('\n');
}

/** Scarica il CSV gia' costruito. */
export function scaricaCsv(contenuto, nomeFile) {
  const blob = new Blob([contenuto], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = nomeFile || 'consegne-' + new Date().toISOString().slice(0, 10) + '.csv';
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
