import { describe, it, expect } from 'vitest';
import {
  ESPORTAZIONI, costruisciCsvFattorini, costruisciCsvReport, costruisciCsvTurni,
} from '../esportazioni';

const righe = (csv) => csv.replace(/^\ufeff/, '').split('\n');

describe('catalogo delle esportazioni', () => {
  it('ogni voce ha chiave, nome e descrizione', () => {
    ESPORTAZIONI.forEach((voce) => {
      expect(voce.chiave).toBeTruthy();
      expect(voce.nome).toBeTruthy();
      expect(voce.descrizione).toBeTruthy();
    });
  });

  it('turni e report stanno nel Professional, gli altri no', () => {
    const pro = ESPORTAZIONI.filter((voce) => voce.funzionePro).map((voce) => voce.chiave);
    expect(pro).toEqual(['turni', 'report']);
    expect(ESPORTAZIONI.find((voce) => voce.chiave === 'clienti').funzionePro).toBeUndefined();
  });
});

describe('costruisciCsvTurni', () => {
  const turno = {
    driver_name: 'Luca',
    started_at: '2026-11-10T08:00:00+00:00',
    closed_at: '2026-11-10T13:00:00+00:00',
    status: 'settled',
    confirmed_cash: 85.5,
    discrepancy: -1.5,
    totals: { deliveries: 7, cash_total: 87, pos_total: 12.5 },
  };

  it('porta atteso, ricevuto e differenza sulla stessa riga', () => {
    const riga = righe(costruisciCsvTurni([turno]))[1];
    expect(riga).toContain('"Luca"');
    expect(riga).toContain('"87,00"');
    expect(riga).toContain('"85,50"');
    expect(riga).toContain('"-1,50"');
    expect(riga).toContain('"Confermato"');
  });

  it('un turno ancora aperto non inventa incassi ricevuti', () => {
    const riga = righe(costruisciCsvTurni([{ status: 'open', totals: {} }]))[1];
    expect(riga).toContain('"Aperto"');
    expect(riga).toContain('"0,00"');
  });

  it('senza turni esce solo l intestazione', () => {
    expect(righe(costruisciCsvTurni([]))).toHaveLength(1);
    expect(righe(costruisciCsvTurni(null))).toHaveLength(1);
  });
});

describe('costruisciCsvFattorini', () => {
  it('scrive Sì e No invece di true e false', () => {
    const csv = costruisciCsvFattorini([
      { name: 'Luca', phone: '3331234567', is_active: true },
      { name: 'Marco', is_active: false },
    ]);
    const [, primo, secondo] = righe(csv);
    expect(primo).toContain('"Sì"');
    expect(secondo).toContain('"No"');
  });

  it('regge un elenco vuoto', () => {
    expect(righe(costruisciCsvFattorini(undefined))).toHaveLength(1);
  });
});

describe('costruisciCsvReport', () => {
  it('mette in fila riepilogo, giorni, clienti e fattorini', () => {
    const csv = costruisciCsvReport({
      summary: {
        total_revenue: 100.5, delivered_count: 4, total_deliveries: 5, completion_rate: 80, avg_order_value: 25.1,
      },
      daily_revenue: [{ date: '2026-11-09', revenue: 50.25, count: 2 }],
      top_customers: [{ name: 'Rossi', deliveries: 3, revenue: 75 }],
      driver_performance: [{ name: 'Luca', deliveries: 4, revenue: 100.5 }],
    }, 'month');

    const testo = righe(csv).join('\n');
    expect(testo).toContain('"€100.50"');
    expect(testo).toContain('Periodo: Mese');
    expect(testo).toContain('FATTURATO GIORNALIERO');
    expect(testo).toContain('"Rossi"');
    expect(testo).toContain('PERFORMANCE FATTORINI');
  });

  it('con dati vuoti non si rompe e resta a zero', () => {
    const testo = righe(costruisciCsvReport(null, 'week')).join('\n');
    expect(testo).toContain('Periodo: Settimana');
    expect(testo).toContain('"€0.00"');
    expect(testo).not.toContain('FATTURATO GIORNALIERO');
  });
});
