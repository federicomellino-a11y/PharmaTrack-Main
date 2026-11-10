// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries: vi.fn() }) }));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock('../../components/Layout', () => ({ Layout: ({ children }) => <div>{children}</div> }));
vi.mock('@/hooks/queries', () => ({ useRicorrenzeQuery: vi.fn() }));

import RecallsPage from '../pharmacy/Recalls';
import { useRicorrenzeQuery } from '@/hooks/queries';

const vuoto = { oggi: '2026-11-10', giorni_richiamo: 45, da_fare: [], in_arrivo: [], richiami: [] };

describe('RecallsPage', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('senza liste dice che non c e niente da fare', () => {
    useRicorrenzeQuery.mockReturnValue({ data: vuoto, isLoading: false });
    render(<MemoryRouter><RecallsPage /></MemoryRouter>);
    expect(document.body.textContent).toContain('Nessuna ricorrenza da preparare');
  });

  it('mostra la ricorrenza scaduta con i giorni di ritardo', () => {
    useRicorrenzeQuery.mockReturnValue({
      data: {
        ...vuoto,
        da_fare: [{
          customer_id: 'c1', name: 'Anna Verdi', phone: '3331112222',
          address: 'Via Roma 12', fascia: '15:00–18:00', fascia_da: '15:00',
          fascia_a: '18:00', giorni_ricorrenza: 30, prossima: '2026-10-31',
          giorni_di_ritardo: 10, giorni_da_ultimo_ordine: 40,
        }],
      },
      isLoading: false,
    });
    render(<MemoryRouter><RecallsPage /></MemoryRouter>);
    expect(screen.getByTestId('ricorrenze-da-fare')).toBeTruthy();
    expect(screen.getByText('Anna Verdi')).toBeTruthy();
    expect(screen.getByText('10 gg fa')).toBeTruthy();
    expect(screen.getByText('Prepara').closest('a').getAttribute('href')).toBe('/quick?customer_id=c1');
  });

  it('il paziente sparito finisce nella lista dei richiami', () => {
    useRicorrenzeQuery.mockReturnValue({
      data: {
        ...vuoto,
        richiami: [{
          customer_id: 'c2', name: 'Bruno Neri', phone: null, address: 'Via Verdi 3',
          fascia: null, fascia_da: null, fascia_a: null, giorni_ricorrenza: null,
          ultimo_ordine: '2026-08-01', giorni_da_ultimo_ordine: 101,
        }],
      },
      isLoading: false,
    });
    render(<MemoryRouter><RecallsPage /></MemoryRouter>);
    expect(screen.getByTestId('richiami')).toBeTruthy();
    expect(screen.getByText('Bruno Neri')).toBeTruthy();
    expect(screen.getByText('101 gg')).toBeTruthy();
    // niente telefono: il pulsante di chiamata non compare
    expect(document.querySelector('a[href^="tel:"]')).toBeNull();
  });

  it('la ricorrenza in arrivo dice fra quanti giorni', () => {
    useRicorrenzeQuery.mockReturnValue({
      data: {
        ...vuoto,
        in_arrivo: [{
          customer_id: 'c3', name: 'Carla Blu', phone: '333', address: 'Via Blu 1',
          fascia: null, fascia_da: null, fascia_a: null, giorni_ricorrenza: 30,
          prossima: '2026-11-15', giorni_alla_prossima: 5, giorni_di_ritardo: 0,
        }],
      },
      isLoading: false,
    });
    render(<MemoryRouter><RecallsPage /></MemoryRouter>);
    expect(screen.getByTestId('ricorrenze-in-arrivo')).toBeTruthy();
    expect(screen.getByText('fra 5 gg')).toBeTruthy();
  });

  it('se la lettura fallisce lo dice invece di restare vuota', () => {
    useRicorrenzeQuery.mockReturnValue({ data: undefined, isLoading: false, error: new Error('x') });
    render(<MemoryRouter><RecallsPage /></MemoryRouter>);
    expect(document.body.textContent).toContain('Non riesco a leggere le ricorrenze');
  });
});
