import { describe, it, expect } from 'vitest';
import { costruisciCsvClienti } from '../clientiCsv';

const cliente = {
  customer_id: 'c1',
  name: 'Maria Rossi',
  phone: '3331112222',
  extra_phones: ['3339998888', ''],
  email: 'maria@example.it',
  fiscal_code: 'RSSMRA50A41F205X',
  address: 'Via Roma 1, Milano',
  birth_date: '1950-01-31T00:00:00.000Z',
  created_at: '2026-06-01T09:00:00.000Z',
  notes: 'citofono "B"',
};

describe('costruisciCsvClienti', () => {
  it('scrive intestazione e una riga per cliente', () => {
    const righe = costruisciCsvClienti([cliente]).split('\n');
    expect(righe).toHaveLength(2);
    expect(righe[0].replace('\ufeff', '')).toBe(
      'Nome,Telefono,Altri telefoni,Email,Codice fiscale,Indirizzo,Data di nascita,Cliente dal,Note'
    );
  });

  it('mette i recapiti al posto giusto', () => {
    const riga = costruisciCsvClienti([cliente]).split('\n')[1];
    expect(riga).toContain('"Maria Rossi"');
    expect(riga).toContain('"3331112222"');
    expect(riga).toContain('"3339998888"'); // il secondo numero, non quello vuoto
    expect(riga).toContain('"RSSMRA50A41F205X"');
    expect(riga).toContain('"Via Roma 1, Milano"');
  });

  it('taglia le date all anno-mese-giorno', () => {
    const riga = costruisciCsvClienti([cliente]).split('\n')[1];
    expect(riga).toContain('"1950-01-31"');
    expect(riga).toContain('"2026-06-01"');
  });

  it('raddoppia le virgolette invece di rompere il file', () => {
    const riga = costruisciCsvClienti([cliente]).split('\n')[1];
    expect(riga).toContain('"citofono ""B"""');
  });

  it('regge clienti con campi mancanti senza scrivere undefined', () => {
    const riga = costruisciCsvClienti([{ name: 'Solo Nome' }]).split('\n')[1];
    expect(riga).not.toContain('undefined');
    expect(riga).toContain('"Solo Nome"');
  });

  it('comincia col BOM per Excel e con un elenco vuoto resta l intestazione', () => {
    expect(costruisciCsvClienti([cliente]).charCodeAt(0)).toBe(0xfeff);
    expect(costruisciCsvClienti([]).split('\n')).toHaveLength(1);
    expect(costruisciCsvClienti(null).split('\n')).toHaveLength(1);
  });
});
