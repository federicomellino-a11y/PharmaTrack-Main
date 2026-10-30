/** Etichetta di viaggio da attaccare al pacco (stampa o PDF). */
export function printDeliveryLabel(delivery = {}) {
  if (typeof window === 'undefined') return false;
  const esc = (value) => String(value ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  const amount = delivery.amount != null
    ? new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(Number(delivery.amount) || 0)
    : '';
  const payLabel = { cash: 'Contanti', pos: 'POS', other: 'Altro' }[delivery.payment_method] || '';
  const win = window.open('', '_blank', 'width=460,height=680');
  if (!win) return false;
  const notes = delivery.notes ? `<div class="notes">${esc(delivery.notes)}</div>` : '';
  win.document.write(`<!doctype html><html lang="it"><head><meta charset="utf-8">
<title>Etichetta ${esc(delivery.delivery_id || '')}</title>
<style>
  body{font-family:system-ui,-apple-system,"Segoe UI",sans-serif;margin:0;padding:14px;color:#111}
  .label{border:2px solid #111;border-radius:12px;padding:14px}
  .kicker{font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#555}
  h1{font-size:19px;margin:2px 0 6px;line-height:1.2}
  .addr{font-size:14px;line-height:1.35}
  .phone{font-size:17px;font-weight:700;margin-top:6px}
  .notes{margin-top:10px;font-size:12px;background:#f3f3f3;padding:7px;border-radius:8px}
  .meta{display:flex;justify-content:space-between;gap:8px;margin-top:12px;border-top:1px dashed #999;padding-top:8px;font-size:12px}
  @media print{@page{size:100mm 150mm;margin:6mm}body{padding:0}}
</style></head><body onload="window.focus();window.print()">
  <div class="label">
    <div class="kicker">Consegna a domicilio</div>
    <h1>${esc(delivery.customer_name || 'Cliente')}</h1>
    <div class="addr">${esc(delivery.customer_address || '')}</div>
    <div class="phone">${esc(delivery.customer_phone || '')}</div>
    ${notes}
    <div class="meta"><span>${esc(String(delivery.delivery_id || '').toUpperCase())}</span><span>${esc(payLabel)}${amount ? ' · ' + esc(amount) : ''}</span></div>
  </div>
</body></html>`);
  win.document.close();
  return true;
}
