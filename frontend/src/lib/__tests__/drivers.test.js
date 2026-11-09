import { describe, expect, it } from 'vitest';
import { etichettaMezzo, filtraFattorini, messaggioPiano, vehicleLabels } from '../drivers';

const fattorini = [
  { driver_id: 'd1', name: 'Marco Bianchi', email: 'marco@farmacia.it', phone: '3331112222' },
  { driver_id: 'd2', name: 'Sara Rossi', email: 'sara@farmacia.it', phone: '3339998888' },
  { driver_id: 'd3', name: 'Pietro Verdi', email: null, phone: null },
];

describe('filtraFattorini', () => {
  it('senza termine restituisce tutti', () => {
    expect(filtraFattorini(fattorini, '')).toHaveLength(3);
    expect(filtraFattorini(fattorini, '   ')).toHaveLength(3);
  });

  it('cerca nel nome senza badare a maiuscole', () => {
    expect(filtraFattorini(fattorini, 'sara').map((f) => f.driver_id)).toEqual(['d2']);
    expect(filtraFattorini(fattorini, 'MARCO').map((f) => f.driver_id)).toEqual(['d1']);
  });

  it('cerca anche nell email', () => {
    expect(filtraFattorini(fattorini, 'farmacia.it').map((f) => f.driver_id)).toEqual(['d1', 'd2']);
  });

  it('cerca per telefono', () => {
    expect(filtraFattorini(fattorini, '999888').map((f) => f.driver_id)).toEqual(['d2']);
  });

  it('non si rompe se un fattorino non ha telefono o email', () => {
    expect(() => filtraFattorini(fattorini, 'pietro')).not.toThrow();
    expect(filtraFattorini(fattorini, 'pietro').map((f) => f.driver_id)).toEqual(['d3']);
  });

  it('con un elenco vuoto risponde vuoto', () => {
    expect(filtraFattorini([], 'marco')).toEqual([]);
    expect(filtraFattorini(undefined, 'marco')).toEqual([]);
  });
});

describe('etichettaMezzo', () => {
  it('traduce i mezzi conosciuti', () => {
    expect(Object.keys(vehicleLabels)).toEqual(['scooter', 'bike', 'car', 'van']);
    expect(etichettaMezzo('van')).toBe('Furgone');
  });

  it('lascia passare un mezzo sconosciuto invece di mostrare vuoto', () => {
    expect(etichettaMezzo('monopattino')).toBe('monopattino');
    expect(etichettaMezzo(null)).toBe('');
  });
});

describe('messaggioPiano', () => {
  it('spiega il 402 con il testo del server', () => {
    const errore = { response: { status: 402, data: { detail: 'Hai raggiunto le 40 consegne del piano Prova' } } };
    expect(messaggioPiano(errore, 'Errore')).toBe('Hai raggiunto le 40 consegne del piano Prova');
  });

  it('usa il ripiego quando il 402 non spiega niente', () => {
    expect(messaggioPiano({ response: { status: 402, data: {} } }, 'Errore')).toBe('Limite del piano raggiunto.');
  });

  it('per gli altri errori restituisce il ripiego', () => {
    expect(messaggioPiano({ response: { status: 500, data: { detail: 'Boom' } } }, 'Errore')).toBe('Errore');
    expect(messaggioPiano(undefined, 'Errore')).toBe('Errore');
  });
});
