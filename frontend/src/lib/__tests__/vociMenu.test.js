import { describe, expect, it } from 'vitest';
import { VOCI_MENU, ordinaMenu, scalaTesto } from '../vociMenu';

describe('ordine del menu', () => {
  it('senza ordine salvato resta quello di sempre', () => {
    expect(ordinaMenu(VOCI_MENU, [])).toBe(VOCI_MENU);
  });

  it('mette prima le voci scelte e lascia le altre in coda', () => {
    const voci = ordinaMenu(VOCI_MENU, ['/reports', '/chat']);
    expect(voci.slice(0, 3).map((v) => v.path)).toEqual(['/reports', '/chat', '/dashboard']);
    expect(voci.some((v) => v.divider)).toBe(false);
  });

  it('una dimensione sconosciuta torna normale', () => {
    expect(scalaTesto('boh')).toBe(100);
    expect(scalaTesto('grande')).toBe(112.5);
  });
});
