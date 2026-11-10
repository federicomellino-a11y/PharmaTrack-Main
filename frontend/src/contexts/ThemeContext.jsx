import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';

const ThemeContext = createContext(null);

/* Tre modi, non due. "Sistema" segue il telefono o il PC, che di sera si
   scurisce da solo: e' quello che la maggior parte delle persone sceglie
   davvero, e senza di lui il tema resta una preferenza scritta a mano. */
const MODI = ['light', 'dark', 'system'];
const CHIAVE = 'pharmatrack-theme';

const modoSalvato = () => {
  if (typeof window === 'undefined') return 'light';
  const salvato = window.localStorage?.getItem(CHIAVE);
  return MODI.includes(salvato) ? salvato : 'light';
};

const sistemaScuro = () => {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};

export const ThemeProvider = ({ children }) => {
  const [theme, setThemeState] = useState(modoSalvato);
  const [scuroDiSistema, setScuroDiSistema] = useState(sistemaScuro);

  // Con "sistema" scelto, il tema cambia da solo quando il dispositivo passa
  // alla modalita' notte: nessun refresh, nessuna preferenza da rifare.
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return undefined;
    const query = window.matchMedia('(prefers-color-scheme: dark)');
    const ascolta = (evento) => setScuroDiSistema(evento.matches);
    query.addEventListener?.('change', ascolta);
    return () => query.removeEventListener?.('change', ascolta);
  }, []);

  const temaEffettivo = theme === 'system' ? (scuroDiSistema ? 'dark' : 'light') : theme;

  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove('light', 'dark');
    root.classList.add(temaEffettivo);
    window.localStorage?.setItem(CHIAVE, theme);
  }, [temaEffettivo, theme]);

  const setTheme = useCallback((modo) => {
    setThemeState(MODI.includes(modo) ? modo : 'light');
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState((precedente) => {
      const effettivo = precedente === 'system' ? (sistemaScuro() ? 'dark' : 'light') : precedente;
      return effettivo === 'dark' ? 'light' : 'dark';
    });
  }, []);

  const valore = useMemo(
    () => ({ theme, temaEffettivo, isDark: temaEffettivo === 'dark', setTheme, toggleTheme }),
    [theme, temaEffettivo, setTheme, toggleTheme],
  );

  return (
    <ThemeContext.Provider value={valore}>
      {children}
    </ThemeContext.Provider>
  );
};
