// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

// La pagina importa Leaflet e i contesti dell'app: qui interessa solo che
// renderizzi senza crash dopo la migrazione a react-query.
vi.mock('@/hooks/queries', () => ({
  useDeliveriesQuery: vi.fn(),
  useDriversQuery: vi.fn(),
  usePlanQuery: () => ({ data: { pro: true } }),
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

const adesso = () => new Date();
const minutiFa = (minuti) => new Date(Date.now() - minuti * 60000).toISOString();

const driver = {
  driver_id: 'd1', name: 'Luca Bianchi', is_active: true,
  current_lat: 40.85, current_lng: 14.30,
  last_location_update: minutiFa(1),
};

const driverFermo = {
  driver_id: 'd2', name: 'Marco Fermo', is_active: true,
  current_lat: 40.86, current_lng: 14.32,
  last_location_update: minutiFa(90),
};

const driverSpento = {
  driver_id: 'd3', name: 'Sara Spenta', is_active: false,
  current_lat: 40.87, current_lng: 14.33,
  last_location_update: minutiFa(2),
};

const driverSenzaPosizione = {
  driver_id: 'd4', name: 'Nino Senza Gps', is_active: true,
  current_lat: null, current_lng: null,
  last_location_update: null,
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

  it('distingue live, in ritardo e non disponibile dalla data reale del GPS', () => {
    setQueries({ drivers: [driver, driverFermo, driverSpento, driverSenzaPosizione], deliveries: [] });
    render(<TrackingPage />);
    expect(screen.getByTestId('tracking-conteggio-live').textContent).toContain('1');
    expect(screen.getByTestId('tracking-conteggio-in-ritardo').textContent).toContain('1');
    expect(screen.getByTestId('tracking-conteggio-non-disponibile').textContent).toContain('2');
    // il fermo sta nella sua sezione, non in quella dei live
    const live = screen.getByTestId('sezione-presenza-live');
    const ritardo = screen.getByTestId('sezione-presenza-in-ritardo');
    expect(live.textContent).toContain('Luca Bianchi');
    expect(live.textContent).not.toContain('Marco Fermo');
    expect(ritardo.textContent).toContain('Marco Fermo');
    expect(ritardo.textContent).toMatch(/min fa|h fa/);
  });

  it('un fattorino con coordinate ma senza orario non viene mostrato come online', () => {
    const senzaOrario = { ...driver, driver_id: 'd9', name: 'Ignoto', last_location_update: null };
    setQueries({ drivers: [senzaOrario], deliveries: [] });
    render(<TrackingPage />);
    expect(screen.getByTestId('tracking-conteggio-live').textContent).toContain('0');
    expect(screen.getByTestId('sezione-presenza-non-disponibile').textContent).toContain('Ignoto');
  });

  it('dichiara la stima in linea d aria invece del tempo stradale', () => {
    setQueries({ drivers: [driver], deliveries: [delivery] });
    render(<TrackingPage />);
    expect(document.body.textContent).toContain("stima in linea d'aria");
  });

  it('resta in caricamento finche la cache non risponde', () => {
    setQueries({ drivers: [], deliveries: [], loading: true });
    render(<TrackingPage />);
    expect(screen.queryByTestId('tracking-page')).toBeNull();
  });
});
