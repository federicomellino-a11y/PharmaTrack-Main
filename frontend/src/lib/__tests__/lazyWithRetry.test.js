// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../hardReload', () => ({ hardReload: vi.fn() }));

import { reloadOnceForChunkError, CHUNK_RELOAD_KEY, CHUNK_RELOAD_WINDOW_MS } from '../lazyWithRetry';
import { hardReload } from '../hardReload';

describe('reloadOnceForChunkError', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    hardReload.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('ricarica forzando il bypass della cache la prima volta', () => {
    expect(reloadOnceForChunkError(1_000_000)).toBe(true);
    expect(hardReload).toHaveBeenCalledTimes(1);
  });

  it('non entra in ciclo se il guasto si ripete subito', () => {
    reloadOnceForChunkError(1_000_000);
    expect(reloadOnceForChunkError(1_000_000 + CHUNK_RELOAD_WINDOW_MS - 1)).toBe(false);
    expect(hardReload).toHaveBeenCalledTimes(1);
  });

  it('torna a ricaricare dopo la finestra di guardia', () => {
    reloadOnceForChunkError(1_000_000);
    expect(reloadOnceForChunkError(1_000_000 + CHUNK_RELOAD_WINDOW_MS + 1)).toBe(true);
    expect(hardReload).toHaveBeenCalledTimes(2);
  });

  it('non ricarica se sessionStorage non è disponibile (meglio un errore che un loop)', () => {
    const vero = window.sessionStorage;
    Object.defineProperty(window, 'sessionStorage', {
      configurable: true,
      get() { throw new Error('storage bloccato'); },
    });
    expect(reloadOnceForChunkError(1_000_000)).toBe(false);
    expect(hardReload).not.toHaveBeenCalled();
    Object.defineProperty(window, 'sessionStorage', { configurable: true, value: vero });
  });

  it('registra il momento del tentativo per la guardia', () => {
    reloadOnceForChunkError(1_234_567);
    expect(window.sessionStorage.getItem(CHUNK_RELOAD_KEY)).toBe('1234567');
  });
});
