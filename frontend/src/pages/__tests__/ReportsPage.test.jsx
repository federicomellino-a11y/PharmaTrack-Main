// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// I grafici non si disegnano in jsdom (ResponsiveContainer vuole una misura
// vera): qui interessa che le schede si aprano e che la stampa le metta in fila.
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }) => <div>{children}</div>,
  AreaChart: ({ children }) => <div>{children}</div>,
  BarChart: ({ children }) => <div>{children}</div>,
  PieChart: ({ children }) => <div>{children}</div>,
  Area: () => null,
  Bar: () => null,
  Pie: () => null,
  Cell: () => null,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
}));
vi.mock('@/hooks/queries', () => ({
  useAnalyticsQuery: vi.fn(),
  useRicorrenzeQuery: vi.fn(),
  usePlanQuery: vi.fn(),
}));
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries: vi.fn() }) }));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock('../../components/Layout', () => ({ Layout: ({ children }) => <div>{children}</div> }));

import ReportsPage from '../pharmacy/Reports';
import { useAnalyticsQuery, useRicorrenzeQuery, usePlanQuery } from '@/hooks/queries';

const dati = {
  period: 'month',
  days: 30,
  summary: {
    total_revenue: 960, delivered_count: 48, total_deliveries: 50,
    cancelled: 2, completion_rate: 96, avg_order_value: 20,
  },
  payment_split: { cash: { revenue: 600, count: 30 }, pos: { revenue: 360, count: 18 } },
  daily_revenue: [
    { date: '2026-11-08', revenue: 320, count: 16 },
    { date: '2026-11-09', revenue: 640, count: 32 },
  ],
  top_customers: [{ customer_id: 'c1', name: 'Anna Verdi', deliveries: 6, revenue: 120 }],
  driver_performance: [{ driver_id: 'd1', name: 'Luca Bianchi', deliveries: 48, revenue: 960 }],
  delivery_times: { avg_minutes: 42, median_minutes: 38, sampled: 48, by_driver: [{ name: 'Luca Bianchi', avg_minutes: 42, count: 48 }] },
  failures: { total: 1, by_reason: [{ reason: 'Assente', count: 1 }] },
  by_hour: [{ hour: 9, count: 12 }, { hour: 10, count: 20 }],
  by_weekday: [{ day: 'lun', count: 20 }, { day: 'mar', count: 12 }],
  busiest: { hour: 10, weekday: 'lun' },
  open_without_driver: 2,
  overdue_slots: 1,
  lapsed_customers: [],
  confronto: {
    previous: { total_revenue: 800, delivered_count: 40, avg_order_value: 20 },
    current: { total_revenue: 960, delivered_count: 48, avg_order_value: 20 },
    delta: { revenue_pct: 20, count_pct: 20, avg_order_pct: 0 },
  },
  clienti: { totali: 10, nuovi: 3, di_ritorno: 7, spesa_media: 96 },
};

const vuoto = { oggi: '2026-11-10', giorni_richiamo: 45, da_fare: [], in_arrivo: [], richiami: [] };

const disegna = () => render(<MemoryRouter><ReportsPage /></MemoryRouter>);

describe('Pagina Report a schede', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    useAnalyticsQuery.mockReturnValue({ data: dati, isLoading: false, isError: false, dataUpdatedAt: Date.now(), refetch: vi.fn() });
    useRicorrenzeQuery.mockReturnValue({ data: vuoto, isLoading: false });
    usePlanQuery.mockReturnValue({ data: { pro: true } });
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('apre la Panoramica e mostra le cinque schede', () => {
    disegna();
    expect(screen.getByTestId('report-tabs').textContent).toContain('Panoramica');
    expect(screen.getByTestId('report-tabs').textContent).toContain('Squadra');
    expect(screen.getByTestId('scheda-panoramica')).toBeTruthy();
    expect(screen.queryByTestId('scheda-incassi')).toBeNull();
  });

  it('passa a un altra scheda senza lasciare la prima sotto', () => {
    disegna();
    // Radix cambia scheda sul mousedown, non sul click: il dito vero preme.
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Incassi' }));
    expect(screen.getByTestId('scheda-incassi')).toBeTruthy();
    expect(screen.queryByTestId('scheda-panoramica')).toBeNull();
    expect(document.body.textContent).toContain('Contanti');
  });

  it('mostra la serratura del piano quando il server risponde 402', () => {
    useAnalyticsQuery.mockReturnValue({
      data: undefined, isLoading: false, isError: true,
      error: { response: { status: 402 } }, dataUpdatedAt: 0, refetch: vi.fn(),
    });
    usePlanQuery.mockReturnValue({ data: { pro: false } });
    disegna();
    expect(screen.getByTestId('pro-gate')).toBeTruthy();
  });

  it('stampa tutte le schede in fila, non solo quella aperta', () => {
    vi.useFakeTimers();
    const stampa = vi.spyOn(window, 'print').mockImplementation(() => {});
    disegna();
    fireEvent.click(screen.getByTestId('print-report-btn'));
    act(() => { vi.advanceTimersByTime(300); });
    expect(stampa).toHaveBeenCalled();
    expect(document.body.textContent).toContain('Come sta andando la farmacia');
    expect(document.body.textContent).toContain('Come sono entrati i soldi');
    expect(document.body.textContent).toContain('Il giro');
  });

  it('sceglie il periodo una volta sola per tutte le schede', () => {
    disegna();
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Trimestre' }));
    expect(useAnalyticsQuery).toHaveBeenLastCalledWith('quarter');
  });
});
