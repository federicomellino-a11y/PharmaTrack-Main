// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/* Il service worker serve per le notifiche e per rendere il sito installabile,
   ma non deve diventare un peso: Chrome segnala "Fetch event handler is
   recognized as no-op" quando l'handler esiste e non chiama mai respondWith,
   perche' in quel caso ogni navigazione attraversa il worker senza vantaggi.
   Questi controlli tengono il file lineare: niente cache, navigazioni gestite,
   notifiche intatte. */

const sorgente = readFileSync(resolve(import.meta.dirname, '../../../public/sw.js'), 'utf8');

describe('service worker', () => {
  it('non registra un handler fetch vuoto', () => {
    expect(sorgente).not.toMatch(/addEventListener\(\s*['"]fetch['"]\s*,\s*\(\s*\)\s*=>\s*\{\s*\}\s*\)/);
  });

  it('gestisce le navigazioni con respondWith, cosi Chrome non lo segnala come no-op', () => {
    expect(sorgente).toContain("addEventListener('fetch'");
    expect(sorgente).toMatch(/mode\s*===\s*'navigate'/);
    expect(sorgente).toContain('respondWith');
  });

  it('non mette in cache niente: l app deve vedere sempre l ultimo deploy', () => {
    expect(sorgente).not.toContain('caches.open');
    expect(sorgente).not.toContain('cache.put');
    expect(sorgente).not.toContain('cache.match');
  });

  it('conserva push e click sulla notifica', () => {
    expect(sorgente).toContain("addEventListener('push'");
    expect(sorgente).toContain('showNotification');
    expect(sorgente).toContain("addEventListener('notificationclick'");
  });
});
