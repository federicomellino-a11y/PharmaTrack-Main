import { describe, it, expect } from 'vitest';
import {
  formatCurrency,
  formatDate,
  formatDateTime,
  formatDateTimeFull,
  formatDateTimeLong,
  formatTimeAgo,
} from '../format';

// Questi test servono a una cosa sola: fissare le forme, cosi' quando una pagina
// viene riscritta il testo che la farmacia legge non cambia per distrazione.
describe('formattazione condivisa', () => {
  it('i soldi sono sempre in euro con due decimali', () => {
    expect(formatCurrency(12.5)).toMatch(/12,50/);
    expect(formatCurrency(0)).toMatch(/0,00/);
    expect(formatCurrency(undefined)).toMatch(/0,00/);
  });

  it('i valori mancanti diventano un trattino, non "Invalid Date"', () => {
    expect(formatDate(null)).toBe('-');
    expect(formatDateTime(undefined)).toBe('-');
    expect(formatDateTimeFull('')).toBe('-');
    expect(formatDateTimeLong(null)).toBe('-');
  });

  it('data senza ora, ora senza anno, ora con anno: tre forme distinte', () => {
    const istante = '2026-11-08T19:14:00+01:00';
    expect(formatDate(istante)).not.toMatch(/:/);          // nessuna ora
    expect(formatDateTime(istante)).toMatch(/:/);          // ha l'ora
    expect(formatDateTime(istante)).not.toMatch(/2026/);   // niente anno
    expect(formatDateTimeFull(istante)).toMatch(/2026/);   // anno presente
  });

  it('il tempo passato si legge in italiano', () => {
    const adesso = new Date();
    expect(formatTimeAgo(adesso)).toBe('adesso');
    expect(formatTimeAgo(new Date(adesso.getTime() - 90 * 60 * 1000))).toBe('2 ore fa'.replace('2', '2'));
    expect(formatTimeAgo(new Date(adesso.getTime() - 26 * 60 * 60 * 1000))).toContain('giorno');
  });
});
