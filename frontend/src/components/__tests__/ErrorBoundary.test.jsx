// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

vi.mock('@/lib/errorReporter', () => ({ reportClientError: vi.fn() }));
vi.mock('@/lib/hardReload', () => ({ hardReload: vi.fn() }));

import ErrorBoundary from '../ErrorBoundary';
import { reportClientError } from '@/lib/errorReporter';

const Bomb = () => {
  throw new TypeError('boom');
};

describe('ErrorBoundary', () => {
  beforeEach(() => {
    // React scrive l'errore in console: silenziamo il rumore nei test.
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('non mostra nulla quando i figli sono sani', () => {
    render(
      <ErrorBoundary>
        <p>contenuto ok</p>
      </ErrorBoundary>,
    );
    expect(screen.getByText('contenuto ok')).toBeTruthy();
  });

  it('invece di una pagina bianca mostra un messaggio quando un figlio va in errore', () => {
    render(
      <ErrorBoundary>
        <Bomb />
      </ErrorBoundary>,
    );
    expect(screen.getByText(/La schermata bianca è stata intercettata/i)).toBeTruthy();
    expect(screen.getByText('Ricarica')).toBeTruthy();
    expect(screen.getByText('Vai alla home')).toBeTruthy();
  });

  it('segnala l\'errore al reporter con lo scope del boundary', () => {
    render(
      <ErrorBoundary>
        <Bomb />
      </ErrorBoundary>,
    );
    expect(reportClientError).toHaveBeenCalled();
    const [, context] = reportClientError.mock.calls[0];
    expect(context.scope).toBe('error-boundary');
  });
});
