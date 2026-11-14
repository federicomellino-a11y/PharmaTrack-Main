import { describe, it, expect } from 'vitest';
import {
  FILTRI_VUOTI,
  STATI_ARCHIVIO,
  PAGAMENTI_ARCHIVIO,
  giornoISO,
  intervalloPeriodo,
  parametriArchivio,
  queryArchivio,
  quantiFiltri,
  azzeraFiltri,
} from '../archivioFiltri';

// Il 14 novembre 2026 e' un sabato, ora italiana (CET).
const ADESSO = new Date(2026, 10, 14, 20, 20);

describe('archivioFiltri', () => {
  it('senza filtri chiede solo pagina e limite', () => {
    expect(parametriArchivio({ page: 2, limit: 20, filtri: FILTRI_VUOTI }))
      .toEqual({ page: 2, limit: 20 });
  });

  it('"tutti" e "sempre" non viaggiano verso il server', () => {
    const query = queryArchivio({
      page: 1,
      limit: 20,
      filtri: { q: '  ', stato: 'tutti', fattorino: 'tutti', pagamento: 'tutti', periodo: 'sempre' },
    });
    expect(query).toBe('page=1&limit=20');
  });

  it('traduce i filtri accesi nei nomi che il backend conosce', () => {
    const parametri = parametriArchivio({
      page: 1,
      limit: 20,
      filtri: { q: ' mario ', stato: 'cancelled', fattorino: 'drv-1', pagamento: 'pos', periodo: 'sempre' },
    });
    expect(parametri).toEqual({
      page: 1,
      limit: 20,
      q: 'mario',
      status: 'cancelled',
      driver_id: 'drv-1',
      payment_method: 'pos',
    });
  });

  it('il testo della ricerca viene codificato, non incollato nell\'indirizzo', () => {
    const query = queryArchivio({ page: 1, limit: 20, filtri: { ...FILTRI_VUOTI, q: 'via roma 1 & c' } });
    expect(query).toContain('q=via%20roma%201%20%26%20c');
  });

  it('oggi e\' un solo giorno', () => {
    expect(intervalloPeriodo('oggi', ADESSO)).toEqual({ date_from: '2026-11-14', date_to: '2026-11-14' });
  });

  it('"ultimi 7 giorni" comprende oggi e i sei prima', () => {
    expect(intervalloPeriodo('7', ADESSO)).toEqual({ date_from: '2026-11-08', date_to: '2026-11-14' });
  });

  it('"questo mese" parte dal primo del mese', () => {
    expect(intervalloPeriodo('mese', ADESSO)).toEqual({ date_from: '2026-11-01', date_to: '2026-11-14' });
  });

  it('il periodo attraversa il cambio d\'anno senza sbagliare', () => {
    expect(intervalloPeriodo('30', new Date(2027, 0, 3, 9, 0)))
      .toEqual({ date_from: '2026-12-05', date_to: '2027-01-03' });
  });

  it('"sempre" non mette alcun confine di data', () => {
    const parametri = parametriArchivio({ page: 1, limit: 20, filtri: { ...FILTRI_VUOTI, periodo: 'sempre' } });
    expect(parametri.date_from).toBeUndefined();
    expect(parametri.date_to).toBeUndefined();
  });

  it('conta i filtri accesi per decidere se mostrare "Azzera"', () => {
    expect(quantiFiltri(FILTRI_VUOTI)).toBe(0);
    expect(quantiFiltri({ ...FILTRI_VUOTI, q: 'anna' })).toBe(1);
    expect(quantiFiltri({ ...FILTRI_VUOTI, q: 'anna', periodo: 'oggi', pagamento: 'cash' })).toBe(3);
    // gli spazi non sono una ricerca
    expect(quantiFiltri({ ...FILTRI_VUOTI, q: '   ' })).toBe(0);
  });

  it('azzeraFiltri restituisce una copia, non l\'oggetto condiviso', () => {
    const copia = azzeraFiltri();
    copia.q = 'x';
    expect(FILTRI_VUOTI.q).toBe('');
  });

  it('gli stati offerti sono quelli che finiscono in archivio', () => {
    expect(STATI_ARCHIVIO.map((s) => s.valore)).toEqual([
      'delivered', 'delivered_pending_confirmation', 'not_delivered', 'cancelled',
    ]);
    expect(PAGAMENTI_ARCHIVIO.map((p) => p.valore)).toEqual(['cash', 'pos', 'other']);
  });

  it('giornoISO scrive la data locale, non quella UTC', () => {
    expect(giornoISO(new Date(2026, 0, 5, 0, 30))).toBe('2026-01-05');
  });
});
