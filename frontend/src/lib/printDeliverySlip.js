/* La bolla di consegna: quella che si stampa e si fa firmare al cliente.

   Era una funzione di 70 righe in cima a Deliveries.jsx, con dentro l'HTML, il
   foglio di stile e l'apertura della finestra di stampa. Qui la costruzione del
   documento e' separata dalla stampa, cosi' si puo' controllare cosa contiene
   senza aprire finestre.

   Correzione mentre la spostavo: il commento diceva "XSS-safe" ma nome cliente,
   indirizzo, note e nome del fattorino finivano nell'HTML senza essere
   convertiti. Un indirizzo con un carattere "<" rompeva la bolla, e le note le
   scrive la farmacia. Ora tutti i valori passano da esc().
*/

import { toast } from 'sonner';
import { formatCurrency } from './format';

const ETICHETTE_PAGAMENTO = { cash: 'Contanti', pos: 'POS', other: 'Altro' };
import { STATUS_LABELS as ETICHETTE_STATO } from './deliveryDisplay';

export const esc = (valore) => String(valore ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

/** Il documento completo, pronto da stampare. Non apre finestre. */
export const costruisciBollaConsegna = (delivery, drivers = [], user = null, adesso = new Date()) => {
  const driver = (drivers || []).find((dr) => dr.driver_id === delivery.driver_id);
  const paymentLabel = ETICHETTE_PAGAMENTO[delivery.payment_method] || delivery.payment_method;
  const statusLabel = ETICHETTE_STATO[delivery.status] || delivery.status;
  const codice = (delivery.delivery_id || '').slice(-8).toUpperCase();
  const resto = delivery.amount_given && delivery.amount !== undefined && delivery.amount !== null
    ? delivery.amount_given - delivery.amount
    : null;

  return `<!DOCTYPE html><html lang="it"><head><meta charset="UTF-8"><title>Bolla Consegna</title>
  <style>
    body { font-family: 'Helvetica Neue', Arial, sans-serif; margin: 0; padding: 32px; color: #111; font-size: 14px; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #00897B; padding-bottom: 16px; margin-bottom: 20px; }
    .pharmacy-name { font-size: 20px; font-weight: 700; color: #00897B; }
    .badge { background: #00897B; color: white; padding: 4px 10px; border-radius: 20px; font-size: 12px; font-weight: 600; }
    .id { font-size: 12px; color: #666; margin-top: 4px; }
    .section { margin-bottom: 18px; }
    .section-title { font-size: 11px; font-weight: 700; color: #999; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 8px; }
    .row { display: flex; gap: 8px; margin-bottom: 6px; }
    .label { color: #666; min-width: 100px; font-size: 13px; }
    .value { font-weight: 600; font-size: 13px; }
    .amount-box { background: #f0fdf4; border: 1.5px solid #86efac; border-radius: 8px; padding: 14px; margin-bottom: 18px; }
    .amount-big { font-size: 28px; font-weight: 800; color: #16a34a; }
    .notes-box { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px; font-style: italic; color: #4b5563; }
    .footer { margin-top: 32px; border-top: 1px dashed #ccc; padding-top: 16px; display: flex; justify-content: space-between; }
    .signature-box { border-top: 1px solid #333; width: 160px; margin-top: 40px; padding-top: 4px; font-size: 11px; color: #666; text-align: center; }
    @media print { body { padding: 16px; } }
  </style></head><body>
  <div class="header">
    <div>
      <div class="pharmacy-name">PharmaTrack</div>
      <div class="id">Consegna #${esc(codice)}</div>
      ${user?.pharmacy_name ? `<div style="font-size:13px;color:#444;margin-top:2px;">${esc(user.pharmacy_name)}</div>` : ''}
    </div>
    <div style="text-align:right">
      <span class="badge">${esc(statusLabel)}</span>
      <div style="font-size:12px;color:#666;margin-top:6px;">${esc(new Date(delivery.created_at).toLocaleString('it-IT'))}</div>
    </div>
  </div>
  <div class="section">
    <div class="section-title">Cliente</div>
    <div class="row"><span class="label">Nome</span><span class="value">${esc(delivery.customer_name || '-')}</span></div>
    <div class="row"><span class="label">Telefono</span><span class="value">${esc(delivery.customer_phone || '-')}</span></div>
    <div class="row"><span class="label">Indirizzo</span><span class="value">${esc(delivery.customer_address || '-')}</span></div>
  </div>
  ${driver ? `<div class="section"><div class="section-title">Fattorino</div>
    <div class="row"><span class="label">Nome</span><span class="value">${esc(driver.name)}</span></div>
    <div class="row"><span class="label">Telefono</span><span class="value">${esc(driver.phone || '-')}</span></div>
    <div class="row"><span class="label">Veicolo</span><span class="value">${esc(driver.vehicle_type || '-')}</span></div>
  </div>` : ''}
  ${delivery.amount ? `<div class="amount-box">
    <div style="font-size:12px;color:#16a34a;font-weight:600;margin-bottom:4px;">IMPORTO DA RISCUOTERE</div>
    <div class="amount-big">${formatCurrency(delivery.amount)}</div>
    <div style="font-size:13px;color:#666;margin-top:4px;">Pagamento: ${esc(paymentLabel)}${resto !== null ? ` · Consegnati: ${formatCurrency(delivery.amount_given)} · Resto: ${formatCurrency(resto)}` : ''}</div>
  </div>` : ''}
  ${delivery.notes ? `<div class="section"><div class="section-title">Note / Farmaci</div><div class="notes-box">${esc(delivery.notes)}</div></div>` : ''}
  <div class="footer">
    <div><div class="signature-box">Firma cliente</div></div>
    <div style="font-size:11px;color:#aaa;">Stampato il ${esc(adesso.toLocaleString('it-IT'))}</div>
  </div>
  </body></html>`;
};

/** Apre la finestra di stampa. Restituisce false se il browser blocca i popup. */
export const printDeliverySlip = (delivery, drivers = [], user = null) => {
  const html = costruisciBollaConsegna(delivery, drivers, user);
  const finestra = window.open('', '_blank', 'width=700,height=900');
  if (!finestra) {
    toast.error('Abilita i popup per stampare la bolla');
    return false;
  }
  // Niente document.write: si popola il documento gia' aperto, cosi' la bolla
  // non dipende da quella API deprecata.
  finestra.document.open();
  finestra.document.documentElement.innerHTML = html
    .replace(/^<!DOCTYPE html>/i, '')
    .replace(/<\/?html[^>]*>/gi, '');
  finestra.document.close();
  finestra.onload = () => { finestra.print(); };
  return true;
};

export default printDeliverySlip;
