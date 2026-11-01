// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

// La pagina importa Leaflet e i contesti dell'app: qui interessa solo che
// renderizzi senza crash dopo la migrazione a react-query.
vi.mock('@/hooks/queries', () => ({
  useDeliveriesQuery: vi.fn(),
  useDriversQuery: vi.fn(),
}));
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries: vi.fn() }) }));
vi.mock('react-leaflet', () => ({
  MapContainer: ({ children }) => <div data-testid="mappa">{children}</div>,
  TileLayer: () => null,
  Marker: ({ children }) => <div>{children}</div>,
  Popup: ({ children }) => <div>{children}</div>,
  useMap: () => ({ setView: vi.fn(), getZoom: vi.fn(() => 13), invalidateSize: vi.fn(), getContainer: () => null, getPane: () => null }),
}));
vi.mock('leaflet', () => {
  class DivIcon {
    constructor(options) { this.options = options; }
  }
  class DefaultIcon {
    constructor(options) { this.options = options; }
    static mergeOptions() {}
  }
  return { default: { Icon: { Default: DefaultIcon }, DivIcon } };
});
vi.mock('../../contexts/SocketContext', () => ({ useSocket: () => ({ driverLocations: {} }) }));
vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ user: { pharmacy_address: 'Via Roma 1, Volla' } }) }));
vi.mock('../../components/Layout', () => ({ Layout: ({ children }) => <div>{children}</div> }));
vi.mock('../../lib/geocoding', () => ({ geocodeAddress: vi.fn(async () => null) }));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), info: vi.fn(), success: vi.fn() } }));

import TrackingPage from '../pharmacy/Tracking';
import { useDeliveriesQuery, useDriversQuery } from '@/hooks/queries';

const driver = {
  driver_id: 'd1', name: 'Luca Bianchi', is_active: true,
  current_lat: 40.85, current_lng: 14.30,
};

const delivery = {
  delivery_id: 'c1', status: 'assigned', customer_name: 'Anna Verdi',
  customer_address: 'Via Napoli 5', customer_lat: 40.86, customer_lng: 14.31,
  driver_id: 'd1',
};

const setQueries = ({ drivers = [], deliveries = [], loading = false } = {}) => {
  useDriversQuery.mockReturnValue({ data: drivers, isLoading: loading, isError: false });
  useDeliveriesQuery.mockReturnValue({ data: deliveries, isLoading: loading, isError: false });
};

describe('TrackingPage', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('renderizza la pagina con i dati dalla cache senza andare in errore', () => {
    setQueries({ drivers: [driver], deliveries: [delivery] });
    render(<TrackingPage />);
    expect(screen.getByTestId('tracking-page')).toBeTruthy();
  });

  it('elenca il fattorino collegato e la consegna attiva', () => {
    setQueries({ drivers: [driver], deliveries: [delivery] });
    render(<TrackingPage />);
    const contenuto = document.body.textContent || '';
    expect(contenuto).toContain('Luca Bianchi');
    expect(contenuto).toMatch(/Anna Verdi|Via Napoli 5|1 consegn/);
  });

  it('mostra la mappa anche senza fattorini attivi', () => {
    setQueries({ drivers: [], deliveries: [] });
    render(<TrackingPage />);
    expect(screen.getByTestId('tracking-page')).toBeTruthy();
    expect(screen.getByTestId('mappa')).toBeTruthy();
  });

  it('resta in caricamento finche la cache non risponde', () => {
    setQueries({ drivers: [], deliveries: [], loading: true });
    render(<TrackingPage />);
    expect(screen.queryByTestId('tracking-page')).toBeNull();
  });
});
