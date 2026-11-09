import { describe, expect, it, vi } from 'vitest';
import { costruisciBollaConsegna, esc, printDeliverySlip } from '../printDeliverySlip';

const consegna = {
  delivery_id: 'del_fcc273383639',
  customer_name: 'Anna Rossi',
  customer_phone: '3331234567',
  customer_address: 'Via Roma 1, Milano',
  status: 'assigned',
  payment_method: 'cash',
  amount: 12.5,
  amount_given: 15,
  notes: 'Conservare in frigo',
  created_at: '2026-11-09T09:00:00Z',
};

describe('esc', () => {
  it('converte i caratteri che rompono l HTML', () => {
    expect(esc('<script>alert("x")</script>')).toBe('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;');
    expect(esc("d'Anna & figli")).toBe('d&#39;Anna &amp; figli');
  });

  it('regge valori mancanti', () => {
    expect(esc(null)).toBe('');
    expect(esc(undefined)).toBe('');
  });
});

describe('costruisciBollaConsegna', () => {
  it('riporta cliente, indirizzo, codice consegna e importo', () => {
    const html = costruisciBollaConsegna(consegna, [], { pharmacy_name: 'Farmacia Centro' });
    expect(html).toContain('Anna Rossi');
    expect(html).toContain('Via Roma 1, Milano');
    expect(html).toContain(consegna.delivery_id.slice(-8).toUpperCase());
    expect(html).toContain('Farmacia Centro');
    expect(html).toMatch(/IMPORTO DA RISCUOTERE/);
    expect(html).toContain('Resto');
  });

  it('mostra il fattorino solo se la consegna ne ha uno assegnato', () => {
    const drivers = [{ driver_id: 'd1', name: 'Marco Bianchi', phone: '3339998888', vehicle_type: 'scooter' }];
    expect(costruisciBollaConsegna({ ...consegna, driver_id: 'd1' }, drivers)).toContain('Marco Bianchi');
    expect(costruisciBollaConsegna({ ...consegna, driver_id: null }, drivers)).not.toContain('Marco Bianchi');
  });

  it('senza importo non disegna il riquadro da riscuotere', () => {
    const html = costruisciBollaConsegna({ ...consegna, amount: null, amount_given: null });
    expect(html).not.toContain('IMPORTO DA RISCUOTERE');
  });

  it('senza resto non scrive la riga dei consegnati', () => {
    const html = costruisciBollaConsegna({ ...consegna, amount_given: null });
    expect(html).not.toContain('Consegnati');
  });

  it('non lascia passare HTML dai dati del cliente o dalle note', () => {
    const html = costruisciBollaConsegna({
      ...consegna,
      customer_name: '<img src=x onerror=alert(1)>',
      customer_address: 'Via <b>Roma</b>',
      notes: '</div><script>alert(1)</script>',
    });
    expect(html).not.toContain('<img src=x');
    expect(html).not.toContain('<b>Roma</b>');
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;img src=x');
  });

  it('usa le etichette italiane e ripiega sul valore grezzo', () => {
    expect(costruisciBollaConsegna(consegna)).toContain('Assegnata');
    expect(costruisciBollaConsegna({ ...consegna, status: 'nuovo_stato' })).toContain('nuovo_stato');
    expect(costruisciBollaConsegna({ ...consegna, payment_method: 'bonifico' })).toContain('bonifico');
  });
});

describe('printDeliverySlip', () => {
  it('scrive la bolla nel documento aperto e chiede la stampa', () => {
    const print = vi.fn();
    const documento = {
      open: vi.fn(), close: vi.fn(), documentElement: { innerHTML: '' },
    };
    const finestra = { document: documento, print };
    vi.stubGlobal('window', { open: () => finestra });
    const esito = printDeliverySlip(consegna, [], null);
    expect(esito).toBe(true);
    expect(documento.documentElement.innerHTML).toContain('Anna Rossi');
    expect(documento.documentElement.innerHTML).not.toMatch(/<!DOCTYPE/i);
    finestra.onload();
    expect(print).toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('se il browser blocca i popup lo dice invece di fallire in silenzio', () => {
    vi.stubGlobal('window', { open: () => null });
    expect(printDeliverySlip(consegna, [], null)).toBe(false);
    vi.unstubAllGlobals();
  });
});
