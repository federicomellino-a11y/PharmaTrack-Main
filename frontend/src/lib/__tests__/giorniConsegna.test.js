import { describe, expect, it } from 'vitest';

import {
  GIORNI_PREDEFINITI,
  dataConsegnaPredefinita,
  giornoDiConsegna,
  giorniConsegnati,
  taglioOrdini,
} from '../giorniConsegna';
import { paginaDiAvvio } from '../paginaAvvio';

// martedi' 10 novembre 2026
const martedi = (ore, minuti = 0) => new Date(2026, 10, 10, ore, minuti);

describe('giorni consegnati', () => {
  it('senza impostazioni consegna dal lunedi al sabato', () => {
    expect(giorniConsegnati({})).toEqual(GIORNI_PREDEFINITI);
    expect(giorniConsegnati({ giorni_consegna: [] })).toEqual(GIORNI_PREDEFINITI);
    expect(giorniConsegnati({ giorni_consegna: 'lun' })).toEqual(GIORNI_PREDEFINITI);
  });

  it('tiene solo i giorni buoni, senza doppioni', () => {
    expect(giorniConsegnati({ giorni_consegna: [1, 1, 9, '3'] })).toEqual([1, 3]);
  });

  it('riconosce se una data e\' giorno di consegna', () => {
    expect(giornoDiConsegna({ giorni_consegna: [1, 2, 3] }, '2026-11-10')).toBe(true);
    expect(giornoDiConsegna({ giorni_consegna: [1, 2, 3] }, '2026-11-15')).toBe(false);
  });
});

describe('data proposta dal modulo consegna', () => {
  it('di martedi mattina propone oggi', () => {
    expect(dataConsegnaPredefinita({ taglio_ordini: '12:00' }, martedi(9))).toBe('2026-11-10');
  });

  it('dopo il taglio slitta al giorno dopo', () => {
    expect(dataConsegnaPredefinita({ taglio_ordini: '12:00' }, martedi(13))).toBe('2026-11-11');
  });

  it('alle 12 in punto vale ancora oggi', () => {
    expect(dataConsegnaPredefinita({ taglio_ordini: '12:00' }, martedi(12, 0))).toBe('2026-11-10');
  });

  it('salta i giorni in cui non si consegna', () => {
    // martedi' pomeriggio, si consegna solo il venerdi'
    const esito = dataConsegnaPredefinita({ giorni_consegna: [5], taglio_ordini: '12:00' }, martedi(15));
    expect(esito).toBe('2026-11-13');
  });

  it('se l\'unico giorno e\' gia\' oggi ma l\'ora e\' passata, va alla settimana dopo', () => {
    const esito = dataConsegnaPredefinita({ giorni_consegna: [2], taglio_ordini: '12:00' }, martedi(18));
    expect(esito).toBe('2026-11-17');
  });

  it('con un taglio scritto male usa il predefinito', () => {
    expect(taglioOrdini({ taglio_ordini: 'dopo pranzo' })).toBe('12:00');
    expect(dataConsegnaPredefinita({ taglio_ordini: 'dopo pranzo' }, martedi(13))).toBe('2026-11-11');
  });
});

describe('pagina di avvio', () => {
  it('senza scelta si apre la home', () => {
    expect(paginaDiAvvio({})).toBe('/dashboard');
    expect(paginaDiAvvio(null)).toBe('/dashboard');
    expect(paginaDiAvvio({ settings: { pagina_iniziale: 'boh' } })).toBe('/dashboard');
  });

  it('rispetta la scelta della farmacia', () => {
    expect(paginaDiAvvio({ settings: { pagina_iniziale: 'deliveries' } })).toBe('/deliveries');
  });
});
