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

const stato = (override = {}) => ({
  isSupported: true,
  isInstalled: false,
  isInstallable: false,
  install: vi.fn(async () => ({ outcome: 'accepted' })),
  ...override,
});

beforeEach(() => {
  usePWAInstall.mockReturnValue(stato());
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
  });

  it('senza prompt apre le istruzioni invece di restare inerte', async () => {
    render(<InstallAppButton />);

    expect(screen.getByText(/Come installare/i)).toBeTruthy();
    fireEvent.click(screen.getByTestId('install-app-button'));

    await waitFor(() => expect(screen.getByText(/Installare PharmaTrack/i)).toBeTruthy());
  });

  it('se l app è già installata non mostra il pulsante', () => {
    usePWAInstall.mockReturnValue(stato({ isInstalled: true }));
    const onDone = vi.fn();

    render(<InstallAppButton onDone={onDone} />);

    expect(screen.queryByTestId('install-app-button')).toBeNull();
    expect(onDone).toHaveBeenCalled();
  });

  it('un prompt rifiutato non lascia il pulsante in caricamento', async () => {
    const install = vi.fn(async () => ({ outcome: 'dismissed' }));
    usePWAInstall.mockReturnValue(stato({ isInstallable: true, install }));

    render(<InstallAppButton />);
    const button = screen.getByTestId('install-app-button');
    fireEvent.click(button);

    await waitFor(() => expect(button.disabled).toBe(false));
    expect(install).toHaveBeenCalledTimes(1);
  });
});
