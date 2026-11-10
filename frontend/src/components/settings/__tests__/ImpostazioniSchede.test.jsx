// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), message: vi.fn() } }));
vi.mock('@/hooks/queries', () => ({
  useSessioniQuery: vi.fn(() => ({ data: [], isFetching: false, refetch: vi.fn() })),
}));
vi.mock('axios', () => ({
  default: {
    post: vi.fn(),
    get: vi.fn(),
    delete: vi.fn(),
    interceptors: { response: { use: vi.fn() }, request: { use: vi.fn() } },
  },
}));

// jsdom non ha matchMedia: serve a usePWAInstall, che AspettoCard usa.
window.matchMedia = window.matchMedia || ((query) => ({
  matches: false,
  media: query,
  addEventListener: () => {},
  removeEventListener: () => {},
}));

import axios from 'axios';
import AspettoCard from '../AspettoCard';
import NotificheCard from '../NotificheCard';
import AccountCard from '../AccountCard';

const baseSettings = {
  notifications_enabled: true,
  sound_enabled: true,
  giorni_pazienti_fermi: '45',
  notifiche_eventi: { delivery: true, shift: true },
};

const propsNotifiche = {
  handleDisableRealPush: vi.fn(),
  handleEnableRealPush: vi.fn(),
  handleRequestPermission: vi.fn(),
  notificationPermissionInfo: { label: 'Consentito', className: '' },
  pushConfigured: true,
  pushLoading: false,
  pushSubscribed: true,
  pushSupported: true,
};

describe('Aspetto: tre modi, non due', () => {
  afterEach(() => { cleanup(); vi.clearAllMocks(); });

  it('offre anche "Come il sistema", che mancava', () => {
    render(<AspettoCard isInstallable={false} isInstalled={false} pwaSupported setTheme={vi.fn()} theme="light" />);
    expect(screen.getByText('Come il sistema')).toBeTruthy();
    expect(screen.getByText('Chiaro')).toBeTruthy();
    expect(screen.getByText('Scuro')).toBeTruthy();
  });

  it('cliccando il modo sistema lo passa al genitore', () => {
    const setTheme = vi.fn();
    render(<AspettoCard isInstallable={false} isInstalled={false} pwaSupported setTheme={setTheme} theme="light" />);
    fireEvent.click(screen.getByTestId('theme-system'));
    expect(setTheme).toHaveBeenCalledWith('system');
  });
});

describe('Notifiche per famiglia di evento', () => {
  afterEach(() => { cleanup(); vi.clearAllMocks(); });

  it('mostra consegne e turni', () => {
    render(<NotificheCard {...propsNotifiche} setSettings={vi.fn()} settings={baseSettings} />);
    expect(screen.getByText('Consegne')).toBeTruthy();
    expect(screen.getByText('Turni')).toBeTruthy();
  });

  it('spegnere i turni aggiorna solo quella preferenza', () => {
    const setSettings = vi.fn();
    render(<NotificheCard {...propsNotifiche} setSettings={setSettings} settings={baseSettings} />);
    fireEvent.click(screen.getByTestId('evento-shift'));
    const aggiorna = setSettings.mock.calls[0][0];
    const nuovo = aggiorna(baseSettings);
    expect(nuovo.notifiche_eventi).toEqual({ delivery: true, shift: false });
    expect(nuovo.sound_enabled).toBe(true);
  });
});

describe('Account: nome, password e dispositivi', () => {
  afterEach(() => { cleanup(); vi.clearAllMocks(); });

  it("mostra l'email senza lasciarla toccare, e dice perché", () => {
    render(
      <MemoryRouter>
        <AccountCard onSaveName={vi.fn()} salvandoNome={false} user={{ name: 'Maria', email: 'maria@farmacia.it' }} />
      </MemoryRouter>,
    );
    expect(screen.getByTestId('account-email').textContent).toBe('maria@farmacia.it');
    expect(screen.getByText("Per cambiarla scrivi all'assistenza")).toBeTruthy();
  });

  it('rifiuta due password nuove diverse senza chiamare il server', () => {
    render(
      <MemoryRouter>
        <AccountCard onSaveName={vi.fn()} salvandoNome={false} user={{ name: 'Maria', email: 'maria@farmacia.it' }} />
      </MemoryRouter>,
    );
    fireEvent.change(document.getElementById('password-attuale'), { target: { value: 'vecchia123' } });
    fireEvent.change(document.getElementById('password-nuova'), { target: { value: 'nuova1234' } });
    fireEvent.change(document.getElementById('password-conferma'), { target: { value: 'altra1234' } });
    fireEvent.submit(document.getElementById('password-conferma').closest('form'));
    expect(axios.post).not.toHaveBeenCalled();
  });

  it('con password corta si ferma prima di chiamare il server', () => {
    render(
      <MemoryRouter>
        <AccountCard onSaveName={vi.fn()} salvandoNome={false} user={{ name: 'Maria', email: 'maria@farmacia.it' }} />
      </MemoryRouter>,
    );
    fireEvent.change(document.getElementById('password-attuale'), { target: { value: 'vecchia123' } });
    fireEvent.change(document.getElementById('password-nuova'), { target: { value: 'corta' } });
    fireEvent.change(document.getElementById('password-conferma'), { target: { value: 'corta' } });
    fireEvent.submit(document.getElementById('password-conferma').closest('form'));
    expect(axios.post).not.toHaveBeenCalled();
  });
});
