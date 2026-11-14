// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';

vi.mock('@/hooks/queries', () => ({
  useDeliveriesQuery: vi.fn(),
  useDriversQuery: vi.fn(),
}));
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));
vi.mock('axios', () => ({
  default: {
    interceptors: { response: { use: vi.fn() }, request: { use: vi.fn() } },
    put: vi.fn(async () => ({ data: {} })),
    post: vi.fn(async () => ({ data: {} })),
  },
}));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() } }));

import DockPage from '../DockPage';
import { useDeliveriesQuery, useDriversQuery } from '@/hooks/queries';
import axios from 'axios';

const consegne = [
  { delivery_id: 'a1', status: 'da_preparare', customer_name: 'ROSSI MARIO', amount: 12.5, address: 'Via Roma 1', priority: 'normal' },
  { delivery_id: 'a2', status: 'pronta', customer_name: 'BIANCHI ANNA', amount: 8, address: 'Via Verdi 2', priority: 'urgent' },
  { delivery_id: 'b1', status: 'in_transit', customer_name: 'VERDI LUCA', amount: 20, address: 'Via Napoli 3', driver_id: 'dr1', scheduled_time: '18:30' },
  { delivery_id: 'c1', status: 'delivered_pending_confirmation', customer_name: 'NERI SOFIA', amount: 33.4, address: 'Via Roma 9', driver_id: 'dr1' },
];

const fattorini = [{ driver_id: 'dr1', name: 'Luca Bianchi', is_active: true }];

beforeEach(() => {
  useDeliveriesQuery.mockReturnValue({ data: consegne });
  useDriversQuery.mockReturnValue({ data: fattorini });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('Dock: i contatori sono filtri veri', () => {
  it('conta le tre code e apre quella da smistare', () => {
    render(<DockPage />);
    expect(screen.getByTestId('dock-contatore-smistare').textContent).toContain('2');
    expect(screen.getByTestId('dock-contatore-in_consegna').textContent).toContain('1');
    expect(screen.getByTestId('dock-contatore-incassare').textContent).toContain('1');
    expect(screen.getByTestId('dock-elenco-smistare')).toBeTruthy();
    expect(screen.queryByTestId('dock-elenco-in-consegna')).toBeNull();
  });

  it('"In consegna" apre le consegne in corso, con fattorino e orario', () => {
    render(<DockPage />);
    fireEvent.click(screen.getByTestId('dock-contatore-in_consegna'));
    const elenco = screen.getByTestId('dock-elenco-in-consegna');
    expect(elenco.textContent).toContain('VERDI LUCA');
    expect(elenco.textContent).toContain('Luca Bianchi');
    expect(elenco.textContent).toContain('18:30');
    expect(screen.queryByTestId('dock-elenco-smistare')).toBeNull();
  });

  it('"Da incassare" apre le consegne in attesa di incasso e conferma da li', async () => {
    render(<DockPage />);
    fireEvent.click(screen.getByTestId('dock-contatore-incassare'));
    const elenco = screen.getByTestId('dock-elenco-incassare');
    expect(elenco.textContent).toContain('NERI SOFIA');
    expect(elenco.textContent).toContain('33.40');

    fireEvent.click(screen.getByTestId('dock-incasso-item'));
    fireEvent.click(screen.getByTestId('dock-confirm-payment'));
    await waitFor(() => expect(axios.post).toHaveBeenCalledTimes(1));
    expect(axios.post.mock.calls[0][0]).toContain('/deliveries/c1/confirm-payment');
  });

  it('tornando su "Da smistare" la coda riappare, con la sua ricerca', () => {
    render(<DockPage />);
    fireEvent.click(screen.getByTestId('dock-contatore-incassare'));
    fireEvent.click(screen.getByTestId('dock-contatore-smistare'));
    const elenco = screen.getByTestId('dock-elenco-smistare');
    expect(elenco.textContent).toContain('ROSSI MARIO');
    expect(elenco.textContent).toContain('BIANCHI ANNA');
    // l'urgente resta primo in coda
    expect(elenco.textContent.indexOf('BIANCHI ANNA')).toBeLessThan(elenco.textContent.indexOf('ROSSI MARIO'));
  });

  it('nessun contatore a zero resta senza la sua lista vuota', () => {
    useDeliveriesQuery.mockReturnValue({ data: [] });
    render(<DockPage />);
    fireEvent.click(screen.getByTestId('dock-contatore-in_consegna'));
    expect(screen.getByTestId('dock-elenco-in-consegna').textContent).toContain('Nessuna consegna per strada');
    fireEvent.click(screen.getByTestId('dock-contatore-incassare'));
    expect(screen.getByTestId('dock-elenco-incassare').textContent).toContain('Nessun incasso da confermare');
  });
});
