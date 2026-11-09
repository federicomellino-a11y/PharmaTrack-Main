import { describe, it, expect } from 'vitest';
import { soldiConsegna } from '../deliveryDisplay';

describe('soldiConsegna', () => {
  it('mostra in grande quello che entra, non il taglio di banconota', () => {
    const soldi = soldiConsegna({ amount: 8, amount_given: 10, payment_method: 'cash' });
    expect(soldi.incasso).toBe(8);
    expect(soldi.pagato).toBe(10);
    expect(soldi.resto).toBe(2);
  });

  it('senza resto non c e niente da mostrare sotto', () => {
    const soldi = soldiConsegna({ amount: 12.5, amount_given: 12.5, payment_method: 'cash' });
    expect(soldi.incasso).toBe(12.5);
    expect(soldi.pagato).toBeNull();
    expect(soldi.resto).toBe(0);
  });

  it('il POS non ha resto', () => {
    expect(soldiConsegna({ amount: 15, payment_method: 'pos' })).toEqual({ incasso: 15, pagato: null, resto: 0 });
  });
});
