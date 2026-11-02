// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';

const invalidateQueries = vi.fn();
const post = vi.fn();
const del = vi.fn();

vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries }) }));
vi.mock('@/hooks/queries', () => ({ useArchiveQuery: vi.fn() }));
vi.mock('@/lib/config', () => ({ API: 'https://api.test/api' }));
vi.mock('axios', () => ({ default: { post: (...a) => post(...a), delete: (...a) => del(...a) } }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('../../components/Layout', () => ({
  Layout: ({ children }) => <div>{children}</div>,
}));

import ArchivePage from '../pharmacy/Archive';
import { useArchiveQuery } from '@/hooks/queries';
import { toast } from 'sonner';

const consegnata = {
  delivery_id: 'd1', customer_name: 'Anna Verdi', customer_address: 'Via Napoli 5',
  status: 'delivered', amount: 12, marker: null,
};
const annullata = {
  delivery_id: 'd2', customer_name: 'Marco Blu', customer_address: 'Via Roma 1',
  status: 'cancelled', marker: 'annullata', cancellation_reason: 'cliente assente',
};
const ripristinata = {
  delivery_id: 'd3', customer_name: 'Sara Gialli', customer_address: 'Via Sole 3',
  status: 'delivered', marker: 'ripristinata', restored_at: '2026-11-02T10:00:00+00:00',
};

describe('ArchivePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    post.mockResolvedValue({ data: {} });
    del.mockResolvedValue({ data: {} });
    useArchiveQuery.mockReturnValue({
      data: { deliveries: [consegnata, annullata, ripristinata], pages: 1, total: 3 },
      isLoading: false,
    });
  });

  afterEach(cleanup);

  it('mostra le etichette di quello che e\' successo alle consegne', () => {
    render(<ArchivePage />);
    expect(screen.getByTestId('marker-ripristinata')).toBeTruthy();
    expect(screen.getByTestId('cancel-reason').textContent).toContain('cliente assente');
  });

  it('offre Ripristina su ogni riga e Elimina solo su quelle annullate', () => {
    render(<ArchivePage />);
    expect(screen.getByTestId('restore-d1')).toBeTruthy();
    expect(screen.getByTestId('restore-d2')).toBeTruthy();
    // una consegnata si annulla, una annullata si elimina: non il contrario
    expect(screen.getByTestId('cancel-d1')).toBeTruthy();
    expect(screen.getByTestId('delete-d2')).toBeTruthy();
    expect(screen.queryByTestId('delete-d1')).toBeNull();
  });

  it('annulla con motivo e invalida archivio, consegne e KPI', async () => {
    render(<ArchivePage />);
    fireEvent.click(screen.getByTestId('cancel-d1'));
    const input = await screen.findByPlaceholderText(/Motivo/i);
    fireEvent.change(input, { target: { value: 'ordine sbagliato' } });
    fireEvent.click(screen.getByText('Annulla consegna'));

    await waitFor(() => expect(post).toHaveBeenCalledWith(
      'https://api.test/api/deliveries/d1/cancel',
      { reason: 'ordine sbagliato' },
      { withCredentials: true },
    ));
    await waitFor(() => expect(invalidateQueries).toHaveBeenCalled());
  });

  it('elimina definitivamente solo dopo conferma', async () => {
    render(<ArchivePage />);
    expect(del).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('delete-d2'));
    fireEvent.click(await screen.findByTestId('conferma-azione'));
    await waitFor(() => expect(del).toHaveBeenCalledWith(
      'https://api.test/api/deliveries/d2', { withCredentials: true },
    ));
  });

  it('ripristina e avvisa che la consegna torna in lavorazione', async () => {
    render(<ArchivePage />);
    fireEvent.click(screen.getByTestId('restore-d3'));
    fireEvent.click(await screen.findByTestId('conferma-azione'));
    await waitFor(() => expect(post).toHaveBeenCalledWith(
      'https://api.test/api/deliveries/d3/restore', {}, { withCredentials: true },
    ));
    await waitFor(() => expect(toast.success).toHaveBeenCalled());
  });
});
