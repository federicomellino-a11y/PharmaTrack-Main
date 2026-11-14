import { describe, it, expect } from 'vitest';
import {
  SOGLIA_LIVE_MIN,
  SOGLIA_RITARDO_MIN,
  statoPresenza,
  testoUltimoAggiornamento,
  etaStimataMinuti,
  testoEta,
  haPosizione,
  minutiDaAggiornamento,
} from '../trackingPresenze';

const ADESSO = new Date('2026-11-14T10:00:00Z').getTime();
const prima = (minuti) => new Date(ADESSO - minuti * 60000).toISOString();

const fattorino = (extra = {}) => ({
  driver_id: 'd1',
  name: 'Luca',
  is_active: true,
  current_lat: 40.85,
  current_lng: 14.30,
  last_location_update: prima(1),
  ...extra,
});

describe('stato di presenza del fattorino', () => {
  it('e live quando la posizione e freschissima', () => {
    const stato = statoPresenza(fattorino({ last_location_update: prima(0) }), ADESSO);
    expect(stato.stato).toBe('live');
  });

  it('e live fino alla soglia, in ritardo appena la supera', () => {
    expect(statoPresenza(fattorino({ last_location_update: prima(SOGLIA_LIVE_MIN) }), ADESSO).stato).toBe('live');
    expect(statoPresenza(fattorino({ last_location_update: prima(SOGLIA_RITARDO_MIN + 1) }), ADESSO).stato).toBe('in_ritardo');
  });

  it('un fattorino spento non e disponibile, anche con coordinate salvate', () => {
    const stato = statoPresenza(fattorino({ is_active: false }), ADESSO);
    expect(stato.stato).toBe('non_disponibile');
    expect(stato.motivo).toMatch(/non attivo/i);
  });

  it('coordinate mancanti valgono non disponibile, non live', () => {
    expect(statoPresenza(fattorino({ current_lat: null }), ADESSO).stato).toBe('non_disponibile');
    expect(statoPresenza(fattorino({ current_lng: undefined }), ADESSO).stato).toBe('non_disponibile');
  });

  it('coordinate senza orario non vengono spacciate per live', () => {
    const stato = statoPresenza(fattorino({ last_location_update: null }), ADESSO);
    expect(stato.stato).toBe('non_disponibile');
    expect(stato.motivo).toMatch(/orario/i);
  });

  it('un orario illeggibile non manda in errore', () => {
    const stato = statoPresenza(fattorino({ last_location_update: 'non-una-data' }), ADESSO);
    expect(stato.stato).toBe('non_disponibile');
  });

  it('le coordinate zero sono valide, i valori vuoti no', () => {
    expect(haPosizione({ current_lat: 0, current_lng: 0 })).toBe(true);
    expect(haPosizione({ current_lat: '', current_lng: 1 })).toBe(false);
  });

  it('conta i minuti reali dall ultimo aggiornamento', () => {
    expect(minutiDaAggiornamento(fattorino({ last_location_update: prima(42) }), ADESSO)).toBe(42);
    expect(minutiDaAggiornamento(fattorino({ last_location_update: null }), ADESSO)).toBeNull();
  });

  it('descrive l ultimo aggiornamento in italiano, senza gergo', () => {
    expect(testoUltimoAggiornamento(fattorino({ last_location_update: prima(0) }), ADESSO))
      .toBe('posizione aggiornata ora');
    expect(testoUltimoAggiornamento(fattorino({ last_location_update: prima(20) }), ADESSO))
      .toContain('20 min fa');
    expect(testoUltimoAggiornamento(fattorino({ last_location_update: prima(60 * 5) }), ADESSO))
      .toContain('5 h fa');
  });
});

describe('stima del tempo di percorrenza', () => {
  it('e dichiarata come linea d aria, mai come tempo stradale', () => {
    const testo = testoEta(2);
    expect(testo).toContain('linea d\'aria');
    expect(testo).toContain('≈');
  });

  it('non va a zero minuti nemmeno per distanze minime', () => {
    expect(etaStimataMinuti(0.05)).toBe(1);
  });

  it('cresce con la distanza', () => {
    expect(etaStimataMinuti(10)).toBeGreaterThan(etaStimataMinuti(5));
    expect(etaStimataMinuti(null)).toBeNull();
    expect(testoEta(null)).toBeNull();
  });
});
