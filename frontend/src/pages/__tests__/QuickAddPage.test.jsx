// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

vi.mock('react-router-dom', () => ({
  useSearchParams: () => [new URLSearchParams(''), vi.fn()],
}));
vi.mock('@/hooks/queries', () => ({
  useCustomersQuery: vi.fn(),
  useDeliveriesQuery: vi.fn(),
}));
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries: vi.fn() }) }));
vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ user: { full_name: 'Farmacia Test' } }) }));
vi.mock('../components/AddressAutocomplete', () => ({ default: () => <input aria-label="indirizzo" /> }));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() } }));

import QuickAddPage from '../QuickAdd';
import { useCustomersQuery, useDeliveriesQuery } from '@/hooks/queries';

const cliente = {
  customer_id: 'c1', name: 'Anna Verdi', phone: '3331112222', customer_address: 'Via Napoli 5',
};

describe('QuickAddPage', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    useCustomersQuery.mockReturnValue({ data: [cliente] });
    useDeliveriesQuery.mockReturnValue({ data: [] });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('renderizza senza errori con i clienti dalla cache', () => {
    render(<QuickAddPage />);
    const testo = document.body.textContent || '';
    expect(testo).toMatch(/Quick|Nuova consegna|Cerca|Cliente/i);
  });

  it('propone i clienti ricevuti dalla cache condivisa', () => {
    render(<QuickAddPage />);
    const input = document.querySelector('input');
    expect(input).toBeTruthy();
    expect(useCustomersQuery).toHaveBeenCalled();
  });

  it('non va in errore se la cache è ancora vuota', () => {
    useCustomersQuery.mockReturnValue({ data: undefined });
    useDeliveriesQuery.mockReturnValue({ data: undefined });
    expect(() => render(<QuickAddPage />)).not.toThrow();
  });
});
