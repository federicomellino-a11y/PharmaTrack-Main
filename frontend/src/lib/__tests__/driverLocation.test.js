import { describe, expect, it } from 'vitest';
import { LOCATION_MIN_INTERVAL, vaInviataPosizione } from '../driverLocation';

const base = { lat: 40.85, lng: 14.27 };

describe('vaInviataPosizione', () => {
  it('manda sempre il primo punto', () => {
    expect(vaInviataPosizione(null, base, 1000)).toBe(true);
  });

  it('non rimanda se il fattorino è fermo e l invio è recente', () => {
    const precedente = { ...base, timestamp: 1000 };
    expect(vaInviataPosizione(precedente, base, 1000 + LOCATION_MIN_INTERVAL - 1)).toBe(false);
  });

  it('rimanda se è passato abbastanza tempo anche restando fermo', () => {
    const precedente = { ...base, timestamp: 1000 };
    expect(vaInviataPosizione(precedente, base, 1000 + LOCATION_MIN_INTERVAL + 1)).toBe(true);
  });

  it('rimanda subito se si è spostato davvero', () => {
    const precedente = { ...base, timestamp: 1000 };
    expect(vaInviataPosizione(precedente, { lat: 40.86, lng: 14.27 }, 1200)).toBe(true);
  });

  it('non considera spostamento un tremolio del GPS', () => {
    const precedente = { ...base, timestamp: 1000 };
    expect(vaInviataPosizione(precedente, { lat: 40.850001, lng: 14.270001 }, 1200)).toBe(false);
  });
});
