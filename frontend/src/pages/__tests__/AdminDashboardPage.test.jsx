// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

// La console admin non ha copertura E2E (sta dietro un percorso segreto e un
// login separato): questo test verifica che le quattro letture passino dagli
// hook di react-query e che la pagina regga sia il caricamento sia i dati.
vi.mock('@/hooks/queries', () => ({
  useAdminOverviewQuery: vi.fn(),
  useAdminUsersQuery: vi.fn(),
  useAdminDatabaseStatsQuery: vi.fn(),
  useAdminDatabaseHealthQuery: vi.fn(),
}));
const invalidateQueries = vi.fn();
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries }) }));
vi.mock('../../contexts/AdminAuthContext', () => ({
  useAdminAuth: () => ({ admin: { name: 'Federico', email: 'admin@pharmatrack.it' }, logout: vi.fn() }),
}));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() } }));

import AdminDashboardPage from '../admin/Dashboard';
import {
  useAdminOverviewQuery,
  useAdminUsersQuery,
  useAdminDatabaseStatsQuery,
  useAdminDatabaseHealthQuery,
} from '@/hooks/queries';

const query = (data) => ({ data, isLoading: false, isFetching: false, error: null });

beforeEach(() => {
  useAdminOverviewQuery.mockReturnValue(query({
    summary: { users: 3, drivers: 2, deliveries: 12 },
    latest_users: [],
  }));
  useAdminUsersQuery.mockReturnValue(query([
    { user_id: 'u1', name: 'Farmacia Prova', email: 'prova@farmacia.it', is_active: true },
  ]));
  useAdminDatabaseStatsQuery.mockReturnValue(query({ collections: {}, sessions: {} }));
  useAdminDatabaseHealthQuery.mockReturnValue(query({ status: 'ok' }));
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('AdminDashboardPage', () => {
  it('usa le quattro query della console invece di axios', () => {
    render(<AdminDashboardPage />);
    expect(useAdminOverviewQuery).toHaveBeenCalled();
    expect(useAdminUsersQuery).toHaveBeenCalled();
    expect(useAdminDatabaseStatsQuery).toHaveBeenCalled();
    expect(useAdminDatabaseHealthQuery).toHaveBeenCalled();
  });

  it('mostra gli utenti arrivati dalla cache e il conteggio farmacie', () => {
    render(<AdminDashboardPage />);
    expect(screen.getByText(/Farmacia Prova/)).toBeTruthy();
    expect(screen.getByText('Console super admin')).toBeTruthy();
  });

  it('mostra lo spinner finche' + "'" + ' la prima lettura non risponde', () => {
    useAdminOverviewQuery.mockReturnValue({ data: undefined, isLoading: true, isFetching: true, error: null });
    render(<AdminDashboardPage />);
    expect(screen.queryByText('Console super admin')).toBeNull();
    expect(document.querySelector('.spinner')).toBeTruthy();
  });
});
