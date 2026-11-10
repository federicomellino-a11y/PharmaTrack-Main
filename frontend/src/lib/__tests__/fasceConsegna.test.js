import { describe, expect, it } from 'vitest';

import {
  FASCE_PREDEFINITE,
  fasciaDi,
  fasceDellaFarmacia,
  normalizzaFasce,
  testoFasciaBreve,
} from '../fasce';

const utenteCon = (fasce) => ({ settings: { fasce } });

describe('fasceDellaFarmacia', () => {
  it('senza impostazioni propone le fasce di sempre, con le due fisse agli estremi', () => {
    const fasce = fasceDellaFarmacia({});
    expect(fasce[0].valore).toBe('subito');
    expect(fasce[fasce.length - 1].valore).toBe('preciso');
    expect(fasce).toHaveLength(FASCE_PREDEFINITE.length + 2);
    expect(fasce[1]).toMatchObject({ da: '09:00', a: '12:00' });
  });

  it('usa le fasce della farmacia al posto di quelle predefinite', () => {
    const fasce = fasceDellaFarmacia(utenteCon([
      { etichetta: 'Solo pomeriggio', da: '15:30', a: '19:30' },
    ]));
    expect(fasce.map((f) => f.valore)).toEqual(['subito', '15:30-19:30', 'preciso']);
  });

  it('un elenco vuoto o storto ricade sulle predefinite', () => {
    expect(fasceDellaFarmacia(utenteCon([]))).toHaveLength(FASCE_PREDEFINITE.length + 2);
    expect(fasceDellaFarmacia({ settings: { fasce: 'mattina' } })).toHaveLength(FASCE_PREDEFINITE.length + 2);
    expect(fasceDellaFarmacia(utenteCon([{ etichetta: 'Rotta' }]))).toHaveLength(FASCE_PREDEFINITE.length + 2);
  });

  it('una consegna con orari non previsti resta leggibile', () => {
    const fasce = fasceDellaFarmacia(utenteCon([{ etichetta: 'Pomeriggio', da: '15:00', a: '18:00' }]));
    expect(fasciaDi('15:00', '18:00', fasce).valore).toBe('15:00-18:00');
    const fuori = fasciaDi('10:00', '11:00', fasce);
    expect(fuori.valore).toBe('preciso');
    expect(fuori.etichetta).toBe('10:00–11:00');
  });

  it('scrive l’etichetta con gli orari accanto', () => {
    expect(testoFasciaBreve({ etichetta: 'Mattina', da: '09:00', a: '12:00' })).toBe('Mattina (09:00–12:00)');
    expect(testoFasciaBreve({ etichetta: '', da: '09:00', a: '12:00' })).toBe('09:00–12:00');
  });
});

describe('normalizzaFasce', () => {
  it('ripulisce gli spazi e completa l’etichetta mancante', () => {
    const esito = normalizzaFasce([{ etichetta: '  ', da: '09:00 ', a: '12:00' }]);
    expect(esito.ok).toBe(true);
    expect(esito.fasce).toEqual([{ etichetta: '09:00–12:00', da: '09:00', a: '12:00' }]);
  });

  it('rifiuta una fascia senza fine, una rovesciata e una ripetuta', () => {
    expect(normalizzaFasce([{ etichetta: 'Mattina', da: '09:00', a: '' }]).ok).toBe(false);
    expect(normalizzaFasce([{ etichetta: 'X', da: '18:00', a: '15:00' }]).ok).toBe(false);
    expect(normalizzaFasce([
      { etichetta: 'A', da: '09:00', a: '12:00' },
      { etichetta: 'B', da: '09:00', a: '12:00' },
    ]).ok).toBe(false);
  });

  it('rifiuta un elenco vuoto e piu’ di otto fasce', () => {
    expect(normalizzaFasce([]).ok).toBe(false);
    const troppe = Array.from({ length: 9 }, (_, i) => ({
      etichetta: `F${i}`,
      da: `${String(7 + i).padStart(2, '0')}:00`,
      a: `${String(8 + i).padStart(2, '0')}:00`,
    }));
    expect(normalizzaFasce(troppe).ok).toBe(false);
  });
});
