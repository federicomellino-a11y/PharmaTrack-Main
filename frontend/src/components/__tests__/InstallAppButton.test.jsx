// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';

// Il pulsante dipende solo dall'hook di installazione: qui si simulano i tre
// stati che il browser può dare (prompt disponibile, prompt negato, app già
// installata) perché sono quelli che decidono se l'utente riesce a installare.
vi.mock('@/hooks/usePWAInstall', () => ({ usePWAInstall: vi.fn() }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), message: vi.fn(), error: vi.fn() } }));

import { InstallAppButton } from '../InstallAppButton';
import { usePWAInstall } from '@/hooks/usePWAInstall';
import { toast } from 'sonner';

const stato = (override = {}) => ({
  isSupported: true,
  isInstalled: false,
  isInstallable: false,
  install: vi.fn(async () => ({ outcome: 'accepted' })),
  ...override,
});

const impostaUserAgent = (ua) => {
  Object.defineProperty(window.navigator, 'userAgent', { value: ua, configurable: true });
};

beforeEach(() => {
  usePWAInstall.mockReturnValue(stato());
  impostaUserAgent('Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 Chrome/126 Mobile Safari/537.36');
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('InstallAppButton', () => {
  it('con il prompt disponibile installa al primo tocco', async () => {
    const install = vi.fn(async () => ({ outcome: 'accepted' }));
    usePWAInstall.mockReturnValue(stato({ isInstallable: true, install }));

    render(<InstallAppButton />);
    fireEvent.click(screen.getByTestId('install-app-button'));

    await waitFor(() => expect(install).toHaveBeenCalledTimes(1));
    expect(toast.message).not.toHaveBeenCalled();
  });

  it('su Android senza prompt indica il menu del browser, senza dialogo', async () => {
    render(<InstallAppButton />);
    fireEvent.click(screen.getByTestId('install-app-button'));

    await waitFor(() => expect(toast.message).toHaveBeenCalled());
    expect(String(toast.message.mock.calls[0][0])).toMatch(/menu/i);
    expect(screen.queryByText(/Installare PharmaTrack/i)).toBeNull();
  });

  it('su iOS senza prompt apre le istruzioni, perché lì il prompt non esiste', async () => {
    impostaUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1');

    render(<InstallAppButton />);
    fireEvent.click(screen.getByTestId('install-app-button'));

    await waitFor(() => expect(screen.getByText(/Installare PharmaTrack/i)).toBeTruthy());
    expect(screen.getByText(/Aggiungi a Home/i)).toBeTruthy();
  });

  it('se l app è già installata non mostra niente', () => {
    usePWAInstall.mockReturnValue(stato({ isInstalled: true }));

    render(<InstallAppButton />);

    expect(screen.queryByTestId('install-app-button')).toBeNull();
    expect(screen.queryByText(/installata/i)).toBeNull();
  });

  it('un prompt rifiutato non lascia il pulsante in caricamento', async () => {
    const install = vi.fn(async () => ({ outcome: 'dismissed' }));
    usePWAInstall.mockReturnValue(stato({ isInstallable: true, install }));

    render(<InstallAppButton />);
    const button = screen.getByTestId('install-app-button');
    fireEvent.click(button);

    await waitFor(() => expect(button.disabled).toBe(false));
    expect(install).toHaveBeenCalledTimes(1);
    expect(toast.message).toHaveBeenCalled();
  });
});
