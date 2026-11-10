import { describe, it, expect } from 'vitest';
import { testoFascia, testoPromessa } from '../fasce';

describe('testoFascia', () => {
  it('unisce inizio e fine', () => {
    expect(testoFascia('15:00', '18:00')).toBe('15:00–18:00');
  });

  it('con solo l inizio resta l orario', () => {
    expect(testoFascia('15:30', null)).toBe('15:30');
  });

  it('senza orario non c e testo', () => {
    expect(testoFascia(null, null)).toBeNull();
  });
});

describe('testoPromessa', () => {
  it('mette il giorno davanti alla fascia', () => {
    expect(testoPromessa('domani', '09:00–12:00')).toBe('domani 09:00–12:00');
  });

  it('se il giorno non si conosce resta la fascia', () => {
    expect(testoPromessa(null, '09:00–12:00')).toBe('09:00–12:00');
  });

  it('senza fascia dice il giorno solo se e oggi o domani', () => {
    expect(testoPromessa('oggi', null)).toBe('oggi');
    expect(testoPromessa('domani', null)).toBe('domani');
    expect(testoPromessa('giovedì', null)).toBeNull();
    expect(testoPromessa('25/11/2026', null)).toBeNull();
  });

  it('senza niente non promette niente', () => {
    expect(testoPromessa(null, null)).toBeNull();
  });
});
