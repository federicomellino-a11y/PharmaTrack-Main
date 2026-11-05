// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  gestisciClickTelefono,
  installaGestioneTelefono,
  numeroPerTel,
  sembraDispositivoConTelefono,
} from '../phoneLink';

describe('numeroPerTel', () => {
  it('toglie spazi, trattini e parentesi', () => {
    expect(numeroPerTel('+39 333-111 2233')).toBe('+393331112233');
    expect(numeroPerTel('(06) 1234567')).toBe('061234567');
  });

  it('regge valori vuoti o strani', () => {
    expect(numeroPerTel(null)).toBe('');
    expect(numeroPerTel(undefined)).toBe('');
    expect(numeroPerTel('n/d')).toBe('');
  });
});

function utenteFinto(userAgent) {
  vi.stubGlobal('navigator', { userAgent, clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
  vi.stubGlobal('matchMedia', undefined);
  if (typeof window !== 'undefined') {
    window.matchMedia = () => ({ matches: false });
  }
}

describe('click su un numero', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('su desktop copia il numero invece di lasciare il click muto', async () => {
    utenteFinto('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)');
    const evento = { preventDefault: vi.fn() };
    const copia = vi.fn().mockResolvedValue(undefined);
    const onCopiato = vi.fn();

    const esito = await gestisciClickTelefono(evento, '+39 333 111 2233', { copia, onCopiato });

    expect(esito).toBe(false);
    expect(evento.preventDefault).toHaveBeenCalled();
    expect(copia).toHaveBeenCalledWith('+393331112233');
    expect(onCopiato).toHaveBeenCalledWith('+393331112233');
  });

  it('su telefono lascia fare al sistema', async () => {
    utenteFinto('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)');
    const evento = { preventDefault: vi.fn() };
    const copia = vi.fn();

    const esito = await gestisciClickTelefono(evento, '3331112233', { copia });

    expect(esito).toBe(true);
    expect(evento.preventDefault).not.toHaveBeenCalled();
    expect(copia).not.toHaveBeenCalled();
  });

  it('con numero vuoto blocca il click e non copia niente', async () => {
    const evento = { preventDefault: vi.fn() };
    const copia = vi.fn();
    expect(await gestisciClickTelefono(evento, '', { copia })).toBe(false);
    expect(evento.preventDefault).toHaveBeenCalled();
    expect(copia).not.toHaveBeenCalled();
  });
});

describe('sembraDispositivoConTelefono', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('riconosce il telefono dallo user agent', () => {
    utenteFinto('Mozilla/5.0 (Linux; Android 14; Pixel 7)');
    expect(sembraDispositivoConTelefono()).toBe(true);
  });

  it('su desktop dice di no', () => {
    utenteFinto('Mozilla/5.0 (Windows NT 10.0; Win64; x64)');
    expect(sembraDispositivoConTelefono()).toBe(false);
  });
});

describe('installazione dell ascoltatore', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('intercetta i link tel e li stacca alla fine', async () => {
    utenteFinto('Mozilla/5.0 (Windows NT 10.0; Win64; x64)');
    const doc = document.implementation.createHTMLDocument('prova');
    const link = doc.createElement('a');
    link.setAttribute('href', 'tel:3331112233');
    doc.body.appendChild(link);

    const stacca = installaGestioneTelefono(doc);
    const evento = new window.Event('click', { bubbles: true, cancelable: true });
    link.dispatchEvent(evento);

    expect(evento.defaultPrevented).toBe(true);
    stacca();
    const secondo = new window.Event('click', { bubbles: true, cancelable: true });
    link.dispatchEvent(secondo);
    expect(secondo.defaultPrevented).toBe(false);
  });
});
