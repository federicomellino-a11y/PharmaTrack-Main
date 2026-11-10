// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';

import { ThemeProvider, useTheme } from '../ThemeContext';

/* Il tema "come il sistema": prima esistevano solo chiaro e scuro, scritti a
   mano, e chi lavora di sera doveva cambiarlo ogni volta. */
// Componente vero, non una funzione chiamata a mano: gli hook valgono solo
// durante un render di React.
const Mostra = () => {
  const { theme, isDark, setTheme } = useTheme();
  return (
    <div>
      <p data-testid="modo">{theme}</p>
      <p data-testid="scuro">{isDark ? 'scuro' : 'chiaro'}</p>
      <button type="button" onClick={() => setTheme('system')} data-testid="scegli-sistema">sistema</button>
    </div>
  );
};

const conSistema = (scuro) => {
  window.matchMedia = (query) => ({
    matches: query === '(prefers-color-scheme: dark)' ? scuro : false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  });
};

describe('Tema: chiaro, scuro e come il sistema', () => {
  afterEach(() => {
    cleanup();
    window.localStorage.clear();
    document.documentElement.className = '';
  });

  it('con il sistema scuro, la pagina diventa scura da sola', () => {
    conSistema(true);
    window.localStorage.setItem('pharmatrack-theme', 'system');
    render(<ThemeProvider>{<Mostra />}</ThemeProvider>);
    expect(screen.getByTestId('scuro').textContent).toBe('scuro');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('con il sistema chiaro, resta chiara', () => {
    conSistema(false);
    window.localStorage.setItem('pharmatrack-theme', 'system');
    render(<ThemeProvider>{<Mostra />}</ThemeProvider>);
    expect(screen.getByTestId('scuro').textContent).toBe('chiaro');
  });

  it('una preferenza scritta a mano vince sul sistema', () => {
    conSistema(true);
    window.localStorage.setItem('pharmatrack-theme', 'light');
    render(<ThemeProvider>{<Mostra />}</ThemeProvider>);
    expect(screen.getByTestId('scuro').textContent).toBe('chiaro');
  });

  it('un valore storto non lascia la pagina senza tema', () => {
    conSistema(false);
    window.localStorage.setItem('pharmatrack-theme', 'viola');
    render(<ThemeProvider>{<Mostra />}</ThemeProvider>);
    expect(screen.getByTestId('modo').textContent).toBe('light');
  });

  it('scegliendo sistema la scelta viene salvata', () => {
    conSistema(false);
    render(<ThemeProvider>{<Mostra />}</ThemeProvider>);
    fireEvent.click(screen.getByTestId('scegli-sistema'));
    expect(window.localStorage.getItem('pharmatrack-theme')).toBe('system');
  });
});
