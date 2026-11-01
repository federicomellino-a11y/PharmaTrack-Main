import { describe, it, expect } from 'vitest';
import { ensureArray, ensureObject } from '../collections';

describe('ensureArray', () => {
  it('restituisce lo stesso array se lo riceve', () => {
    const input = [1, 2];
    expect(ensureArray(input)).toBe(input);
  });

  it('trasforma null, undefined e oggetti in array vuoto', () => {
    expect(ensureArray(null)).toEqual([]);
    expect(ensureArray(undefined)).toEqual([]);
    expect(ensureArray({ items: [] })).toEqual([]);
    expect(ensureArray('abc')).toEqual([]);
  });
});

describe('ensureObject', () => {
  it('restituisce lo stesso oggetto se lo riceve', () => {
    const input = { a: 1 };
    expect(ensureObject(input)).toBe(input);
  });

  it('scarta array, null e primitivi', () => {
    expect(ensureObject([])).toEqual({});
    expect(ensureObject(null)).toEqual({});
    expect(ensureObject(7)).toEqual({});
    expect(ensureObject('testo')).toEqual({});
  });
});
