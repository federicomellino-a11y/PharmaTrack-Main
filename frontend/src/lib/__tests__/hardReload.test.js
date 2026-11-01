import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { hardReload } from '../hardReload';

describe('hardReload', () => {
  const originalWindow = globalThis.window;

  beforeEach(() => {
    globalThis.window = {
      location: {
        href: 'https://pharmatrack-zeta.vercel.app/tracking?foo=1',
        replace: vi.fn(),
      },
    };
  });

  afterEach(() => {
    globalThis.window = originalWindow;
  });

  it('conserva i parametri esistenti e aggiunge la versione', () => {
    hardReload();
    const url = globalThis.window.location.replace.mock.calls[0][0];
    expect(url).toContain('foo=1');
    expect(url).toMatch(/[?&]v=\d{10,}/);
  });

  it('non esplode senza window', () => {
    delete globalThis.window;
    expect(() => hardReload()).not.toThrow();
  });
});
