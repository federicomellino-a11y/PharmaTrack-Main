// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { svegliaBackend } from '../svegliaBackend';

/* La sveglia del backend: parte una volta ogni dieci minuti per scheda, non
   aspetta la risposta e non fa rumore quando il server non risponde. */

describe('sveglia del backend', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('chiede la salute una volta e non aspetta la risposta', () => {
    const fetchFinto = vi.fn(() => Promise.resolve({ ok: true }));
    vi.stubGlobal('fetch', fetchFinto);

    svegliaBackend();

    expect(fetchFinto).toHaveBeenCalledTimes(1);
    const [url, opzioni] = fetchFinto.mock.calls[0];
    expect(url).toMatch(/\/api\/health$/);
    expect(opzioni).toEqual({ cache: 'no-store' });
  });

  it('non ripete la richiesta nella stessa scheda prima di dieci minuti', () => {
    const fetchFinto = vi.fn(() => Promise.resolve({ ok: true }));
    vi.stubGlobal('fetch', fetchFinto);

    svegliaBackend();
    svegliaBackend();
    svegliaBackend();

    expect(fetchFinto).toHaveBeenCalledTimes(1);
  });

  it('ripete la richiesta quando il fermo e scaduto', () => {
    const fetchFinto = vi.fn(() => Promise.resolve({ ok: true }));
    vi.stubGlobal('fetch', fetchFinto);

    window.sessionStorage.setItem('pt_ultima_sveglia', String(Date.now() - 11 * 60 * 1000));
    svegliaBackend();

    expect(fetchFinto).toHaveBeenCalledTimes(1);
  });

  it('non solleva errori se il server e spento', () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('rete giu'))));

    expect(() => svegliaBackend()).not.toThrow();
  });
});
