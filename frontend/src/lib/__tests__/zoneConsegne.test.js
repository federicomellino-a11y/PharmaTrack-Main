import { describe, it, expect } from 'vitest';
import { chiaveZona, raggruppaPerZona, scomponiIndirizzo, titoloZona } from '../zoneConsegne';

const consegna = (over = {}) => ({
  delivery_id: Math.random().toString(36).slice(2),
  customer_address: 'Via Roma 12, Milano',
  scheduled_time: null,
  ...over,
});

describe('scomponiIndirizzo', () => {
  it('divide la via dal civico', () => {
    expect(scomponiIndirizzo('Via Roma 12, Milano')).toEqual({ via: 'Via Roma', civico: 12 });
  });

  it('tiene i numeri dentro il nome della via', () => {
    expect(scomponiIndirizzo('Via 4 Novembre 8')).toEqual({ via: 'Via 4 Novembre', civico: 8 });
  });

  it('legge il civico con la barra e con la lettera', () => {
    expect(scomponiIndirizzo('Viale Kennedy 100/A, Monza').civico).toBe(100);
    expect(scomponiIndirizzo('Via Verdi 12 B').civico).toBe(12);
  });

  it('senza civico lascia il numero nullo', () => {
    expect(scomponiIndirizzo('Piazza Duomo snc')).toEqual({ via: 'Piazza Duomo', civico: null });
  });

  it('indirizzo vuoto non produce una via inventata', () => {
    expect(scomponiIndirizzo('').via).toBeNull();
    expect(scomponiIndirizzo(null).via).toBeNull();
  });
});

describe('chiaveZona e titoloZona', () => {
  it('la stessa via in maiuscolo e minuscolo e una zona sola', () => {
    expect(chiaveZona({ customer_address: 'VIA ROMA 3' })).toBe(chiaveZona({ customer_address: 'via roma 12' }));
  });

  it('senza via usa il CAP', () => {
    const chiave = chiaveZona({ customer_address: '20100' });
    expect(chiave).toBe('cap:20100');
    expect(titoloZona(chiave, [])).toBe('Zona 20100');
  });

  it('senza niente il gruppo si chiama "da completare"', () => {
    expect(chiaveZona({})).toBe('altro');
    expect(titoloZona('altro', [])).toBe('Indirizzo da completare');
  });

  it('il titolo scrive la via come l ha scritta la farmacia', () => {
    const gruppo = [consegna({ customer_address: 'Via Roma 12, Milano' })];
    expect(titoloZona('via roma', gruppo)).toBe('Via Roma');
  });
});

describe('raggruppaPerZona', () => {
  it('mette insieme le consegne della stessa via, anche non consecutive', () => {
    const gruppi = raggruppaPerZona([
      consegna({ delivery_id: 'a', customer_address: 'Via Roma 12' }),
      consegna({ delivery_id: 'b', customer_address: 'Via Verdi 2' }),
      consegna({ delivery_id: 'c', customer_address: 'Via Roma 3' }),
    ]);
    const roma = gruppi.find((g) => g.titolo === 'Via Roma');
    expect(roma.consegne.map((c) => c.delivery_id)).toEqual(['c', 'a']);
  });

  it('dentro la via ordina per civico', () => {
    const gruppi = raggruppaPerZona([
      consegna({ delivery_id: 'alto', customer_address: 'Via Roma 120' }),
      consegna({ delivery_id: 'basso', customer_address: 'Via Roma 3' }),
      consegna({ delivery_id: 'mezzo', customer_address: 'Via Roma 45' }),
    ]);
    expect(gruppi[0].consegne.map((c) => c.delivery_id)).toEqual(['basso', 'mezzo', 'alto']);
  });

  it('prima chi ha la fascia piu stretta', () => {
    const gruppi = raggruppaPerZona([
      consegna({ delivery_id: 'tardi', customer_address: 'Via Verdi 2', scheduled_time: '18:00' }),
      consegna({ delivery_id: 'presto', customer_address: 'Via Roma 2', scheduled_time: '09:00' }),
    ]);
    expect(gruppi[0].titolo).toBe('Via Roma');
  });

  it('chi non ha fascia va in fondo, non in cima', () => {
    const gruppi = raggruppaPerZona([
      consegna({ delivery_id: 'senza', customer_address: 'Via Neri 2' }),
      consegna({ delivery_id: 'con', customer_address: 'Via Roma 2', scheduled_time: '16:00' }),
    ]);
    expect(gruppi[0].titolo).toBe('Via Roma');
  });

  it('elenco vuoto o con voci nulle non esplode', () => {
    expect(raggruppaPerZona([])).toEqual([]);
    expect(raggruppaPerZona(null)).toEqual([]);
    expect(raggruppaPerZona([null, undefined])).toEqual([]);
  });

  it('una sola consegna fa un gruppo solo', () => {
    const gruppi = raggruppaPerZona([consegna({ delivery_id: 'x' })]);
    expect(gruppi).toHaveLength(1);
    expect(gruppi[0].consegne).toHaveLength(1);
  });
});
