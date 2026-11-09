import { describe, expect, it } from 'vitest';
import { buildInitialCustomerStats, calculateAge, mergeCustomerIntoList } from '../customers';

describe('calculateAge', () => {
  it('calcola gli anni compiuti, non quelli anagrafici', () => {
    const oggi = new Date();
    const nato = new Date(oggi.getFullYear() - 40, oggi.getMonth(), oggi.getDate());
    expect(calculateAge(nato.toISOString().slice(0, 10))).toBe(40);
  });

  it('toglie un anno se il compleanno non è ancora arrivato', () => {
    const oggi = new Date();
    const domani = new Date(oggi.getTime() + 86400000);
    const nato = new Date(oggi.getFullYear() - 30, domani.getMonth(), domani.getDate());
    const atteso = nato > new Date(oggi.getFullYear() - 30, oggi.getMonth(), oggi.getDate()) ? 29 : 30;
    expect(calculateAge(nato.toISOString().slice(0, 10))).toBe(atteso);
  });

  it('restituisce null senza data o con data nel futuro', () => {
    expect(calculateAge(null)).toBeNull();
    expect(calculateAge('')).toBeNull();
    expect(calculateAge(new Date(Date.now() + 86400000 * 400).toISOString().slice(0, 10))).toBeNull();
  });
});

describe('mergeCustomerIntoList', () => {
  it('sostituisce il cliente esistente senza spostarlo', () => {
    const lista = [{ customer_id: 'a', name: 'Anna' }, { customer_id: 'b', name: 'Bruno' }];
    const unita = mergeCustomerIntoList(lista, { customer_id: 'b', name: 'Bruno Rossi' });
    expect(unita.map((c) => c.name)).toEqual(['Anna', 'Bruno Rossi']);
  });

  it('mette in testa un cliente nuovo', () => {
    const unita = mergeCustomerIntoList([{ customer_id: 'a' }], { customer_id: 'z' });
    expect(unita[0].customer_id).toBe('z');
    expect(unita).toHaveLength(2);
  });

  it('regge una lista non valida', () => {
    expect(mergeCustomerIntoList(null, { customer_id: 'x' })).toEqual([{ customer_id: 'x' }]);
  });
});

describe('buildInitialCustomerStats', () => {
  it('parte da zeri e segna l indirizzo verificato solo con coordinate', () => {
    const senza = buildInitialCustomerStats({ customer_id: 'a' });
    expect(senza.stats.total_deliveries).toBe(0);
    expect(senza.stats.verified_address).toBe(false);
    expect(senza.stats.payment_breakdown.cash).toEqual({ count: 0, total: 0 });

    const con = buildInitialCustomerStats({ customer_id: 'a', customer_lat: 40.8, customer_lng: 14.3 });
    expect(con.stats.verified_address).toBe(true);
  });
});
