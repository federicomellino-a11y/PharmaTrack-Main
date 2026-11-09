import { describe, it, expect } from 'vitest';
import { consegnaInRitardo, soldiConsegna } from '../deliveryDisplay';

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

describe('consegnaInRitardo', () => {
  const oggi = new Date(2026, 10, 9, 15, 0); // 9 novembre 2026, 15:00

  it('e in ritardo se la fascia di oggi e gia passata', () => {
    expect(consegnaInRitardo({ status: 'pronta', scheduled_date: '2026-11-09', scheduled_time: '12:00' }, oggi)).toBe(true);
  });

  it('non e in ritardo se la fascia deve ancora arrivare', () => {
    expect(consegnaInRitardo({ status: 'pronta', scheduled_date: '2026-11-09', scheduled_time: '18:00' }, oggi)).toBe(false);
  });

  it('usa la fine della fascia, non l inizio', () => {
    expect(consegnaInRitardo({ status: 'assigned', scheduled_date: '2026-11-09', scheduled_time: '10:00', slot_to: '16:00' }, oggi)).toBe(false);
  });

  it('un giorno passato e sempre in ritardo', () => {
    expect(consegnaInRitardo({ status: 'in_transit', scheduled_date: '2026-11-08', scheduled_time: '23:00' }, oggi)).toBe(true);
  });

  it('una consegna chiusa non e in ritardo', () => {
    expect(consegnaInRitardo({ status: 'delivered', scheduled_date: '2026-11-01', scheduled_time: '09:00' }, oggi)).toBe(false);
  });

  it('senza orario non si puo dire', () => {
    expect(consegnaInRitardo({ status: 'pronta' }, oggi)).toBe(false);
  });
});
