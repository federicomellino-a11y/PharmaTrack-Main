// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';

import useDeliveryForm, { MODULO_VUOTO, normalizzaImporto } from '../useDeliveryForm';

describe('normalizzaImporto', () => {
  it('tratta vuoto, null e undefined come "non scritto"', () => {
    expect(normalizzaImporto('')).toBeNull();
    expect(normalizzaImporto(null)).toBeNull();
    expect(normalizzaImporto(undefined)).toBeNull();
  });

  it('legge i numeri e scarta il testo', () => {
    expect(normalizzaImporto('12.50')).toBe(12.5);
    expect(normalizzaImporto(8)).toBe(8);
    expect(normalizzaImporto('abc')).toBeNull();
  });
});

describe('useDeliveryForm', () => {
  it('parte da una consegna vuota in contanti', () => {
    const { result } = renderHook(() => useDeliveryForm());
    expect(result.current.form).toEqual(MODULO_VUOTO);
    expect(result.current.form.payment_method).toBe('cash');
    expect(result.current.fasciaScelta).toBe('subito');
    expect(result.current.change_due).toBeNull();
  });

  it('calcola il resto quando ci sono importo e pagato', () => {
    const { result } = renderHook(() => useDeliveryForm());
    act(() => result.current.setForm({ ...MODULO_VUOTO, amount: '8', amount_given: '10' }));
    expect(result.current.change_due).toBe(2);
    expect(result.current.amountValue).toBe(8);
    expect(result.current.amountGivenValue).toBe(10);
  });

  it('non inventa un resto se manca una delle due cifre', () => {
    const { result } = renderHook(() => useDeliveryForm());
    act(() => result.current.setForm({ ...MODULO_VUOTO, amount: '8' }));
    expect(result.current.change_due).toBeNull();
    act(() => result.current.setForm({ ...MODULO_VUOTO, amount_given: '10' }));
    expect(result.current.change_due).toBeNull();
  });

  it('reset riporta modulo e fascia al punto di partenza', () => {
    const { result } = renderHook(() => useDeliveryForm());
    act(() => {
      result.current.setForm({ ...MODULO_VUOTO, customer_id: 'cli_1', amount: '5' });
      result.current.setFasciaScelta('9-12');
    });
    act(() => result.current.reset());
    expect(result.current.form).toEqual(MODULO_VUOTO);
    expect(result.current.fasciaScelta).toBe('subito');
  });
});
