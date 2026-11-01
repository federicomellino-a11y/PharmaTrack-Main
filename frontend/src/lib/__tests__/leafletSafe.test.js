import { describe, it, expect, vi } from 'vitest';
import { safeInvalidateSize } from '../leafletSafe';

const makeMap = ({ connected = true, width = 800, pane = true } = {}) => ({
  getContainer: () => ({ isConnected: connected, offsetWidth: width }),
  getPane: () => (pane ? { id: 'mapPane' } : undefined),
  invalidateSize: vi.fn(),
});

describe('safeInvalidateSize', () => {
  it('invalida quando la mappa e montata e ha dimensione', () => {
    const map = makeMap();
    safeInvalidateSize(map);
    expect(map.invalidateSize).toHaveBeenCalledTimes(1);
  });

  it('non fa nulla senza mappa', () => {
    expect(() => safeInvalidateSize(null)).not.toThrow();
  });

  it('non invalida se la mappa e smontata', () => {
    const map = makeMap({ connected: false });
    safeInvalidateSize(map);
    expect(map.invalidateSize).not.toHaveBeenCalled();
  });

  it('non invalida se il contenitore ha altezza zero', () => {
    const map = makeMap({ width: 0 });
    safeInvalidateSize(map);
    expect(map.invalidateSize).not.toHaveBeenCalled();
  });

  it('non invalida se il mapPane non esiste piu', () => {
    const map = makeMap({ pane: false });
    safeInvalidateSize(map);
    expect(map.invalidateSize).not.toHaveBeenCalled();
  });

  it('assorbe le eccezioni di Leaflet', () => {
    const map = {
      getContainer: () => ({ isConnected: true, offsetWidth: 10 }),
      getPane: () => ({}),
      invalidateSize: () => { throw new TypeError("Cannot read properties of undefined (reading '_leaflet_pos')"); },
    };
    expect(() => safeInvalidateSize(map)).not.toThrow();
  });
});
