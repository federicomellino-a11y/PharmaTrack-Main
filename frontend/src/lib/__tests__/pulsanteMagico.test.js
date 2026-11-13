import { describe, it, expect } from 'vitest';
import { opzioniPulsante, dataConsegna, noteConsegna } from '../pulsanteMagico';

describe('pulsante magico', () => {
  it('gli extra sono spenti finche non si accendono', () => {
    expect(opzioniPulsante(null)).toEqual({ farmaci: false, etichetta: false, fattorino: false, vendite_oggi: false });
    expect(opzioniPulsante({ settings: { pulsante: { etichetta: true, farmaci: 'si' } } }))
      .toMatchObject({ etichetta: true, farmaci: false });
  });

  it('oggi non scrive la data, domani si, anche a fine mese', () => {
    expect(dataConsegna('oggi')).toBeNull();
    expect(dataConsegna('domani', new Date(2026, 0, 31, 22, 0))).toBe('2026-02-01');
  });

  it('il sacchetto entra nelle note solo se la funzione e accesa', () => {
    expect(noteConsegna({ note: 'Citofono 3', contenuto: 'Tachipirina', pezzi: '2', conSacchetto: true }))
      .toBe('Citofono 3 — Sacchetto: Tachipirina · 2 pezzi');
    expect(noteConsegna({ note: '', pezzi: '1', conSacchetto: true })).toBe('Sacchetto: 1 pezzo');
    expect(noteConsegna({ note: 'Citofono 3', contenuto: 'Tachipirina', conSacchetto: false })).toBe('Citofono 3');
  });
});
