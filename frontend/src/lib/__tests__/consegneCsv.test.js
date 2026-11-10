import { describe, it, expect } from 'vitest';
import { costruisciCsv } from '../consegneCsv';

const consegna = {
  delivery_id: 'd1',
  created_at: '2026-11-09T10:00:00+01:00',
  customer_name: 'Mario "Rossi"',
  customer_phone: '3331112222',
  customer_address: 'Via Roma 1, Milano',
  status: 'delivered_pending_confirmation',
  driver_id: 'dr1',
  payment_method: 'cash',
  amount: 12.5,
  amount_given: 20,
  change_due: 7.5,
  priority: 'high',
  notes: 'citofono 3',
};

describe('costruisciCsv', () => {
  it('scrive intestazione e una riga per consegna', () => {
    const righe = costruisciCsv([consegna], [{ driver_id: 'dr1', name: 'Luca' }]).split('\n');
    expect(righe).toHaveLength(2);
    expect(righe[0].replace('\ufeff', '').startsWith('Data,Cliente,Telefono')).toBe(true);
    expect(righe[0]).toContain(',Resto,');
  });

  it('mette gli importi con la virgola e il fattorino risolto', () => {
    const riga = costruisciCsv([consegna], [{ driver_id: 'dr1', name: 'Luca' }]).split('\n')[1];
    expect(riga).toContain('"12,5"');
    expect(riga).toContain('"20"');
    expect(riga).toContain('"7,5"');
    expect(riga).toContain('"Luca"');
    expect(riga).toContain('"Contanti"');
    expect(riga).toContain('"Alta"');
  });

  it('raddoppia le virgolette invece di rompere il file', () => {
    const riga = costruisciCsv([consegna]).split('\n')[1];
    expect(riga).toContain('"Mario ""Rossi"""');
  });

  it('comincia col BOM per Excel', () => {
    expect(costruisciCsv([consegna]).charCodeAt(0)).toBe(0xfeff);
  });

  it('con un elenco vuoto resta solo l intestazione', () => {
    expect(costruisciCsv([]).split('\n')).toHaveLength(1);
  });

  // Il commercialista ricostruisce la giornata dalla promessa, non dalla data
  // di inserimento: senza queste due colonne il foglio non gli basta.
  it('porta con se la data prevista e la fascia promessa', () => {
    const conFascia = { ...consegna, scheduled_date: '2026-11-10', scheduled_time: '15:00', slot_to: '18:00' };
    const righe = costruisciCsv([conFascia]).split('\n');
    expect(righe[0]).toContain('Data prevista');
    expect(righe[0]).toContain('Fascia');
    expect(righe[1]).toContain('"2026-11-10"');
    expect(righe[1]).toContain('"15:00–18:00"');
  });

  it('una consegna senza fascia lascia le colonne vuote invece di rompere le virgole', () => {
    const righe = costruisciCsv([consegna]).split('\n');
    const colonne = righe[1].split('","');
    expect(colonne).toHaveLength(16);
  });
});
