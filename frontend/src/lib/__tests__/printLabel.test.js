// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { printDeliveryLabel } from '../printLabel';

const fakePrintWindow = () => {
  const doc = { write: vi.fn(), close: vi.fn() };
  return { document: doc, focus: vi.fn(), print: vi.fn(), doc };
};

describe('printDeliveryLabel', () => {
  let win;
  const originalOpen = window.open;

  beforeEach(() => {
    win = fakePrintWindow();
    window.open = vi.fn(() => win);
  });

  afterEach(() => {
    window.open = originalOpen;
  });

  it('scrive nell etichetta i dati della consegna', () => {
    printDeliveryLabel({
      delivery_id: 'abc123',
      customer_name: 'Mario Rossi',
      customer_address: 'Via Roma 12, Volla',
      customer_phone: '3331234567',
      amount: 12.5,
      payment_method: 'cash',
      notes: 'Citofono 3',
    });
    const html = win.doc.write.mock.calls[0][0];
    expect(html).toContain('Mario Rossi');
    expect(html).toContain('Via Roma 12, Volla');
    expect(html).toContain('3331234567');
    expect(html).toContain('Contanti');
    expect(html).toContain('Citofono 3');
    expect(html).toContain('ABC123');
  });

  it('neutralizza i caratteri html nei dati del cliente', () => {
    printDeliveryLabel({
      customer_name: '<script>alert(1)</script>',
      customer_address: 'Via <b>Roma</b>',
    });
    const html = win.doc.write.mock.calls[0][0];
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('&lt;b&gt;');
  });

  it('gestisce i campi mancanti senza rompersi', () => {
    expect(() => printDeliveryLabel({})).not.toThrow();
    expect(win.doc.write).toHaveBeenCalled();
  });

  it('restituisce false se il browser blocca la finestra di stampa', () => {
    window.open = vi.fn(() => null);
    expect(printDeliveryLabel({ customer_name: 'X' })).toBe(false);
  });
});
