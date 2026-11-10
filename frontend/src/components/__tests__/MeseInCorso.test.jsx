// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import MeseInCorso from '../dashboard/MeseInCorso';

const testo = (testId) => screen.getByTestId(testId).textContent;
const soloCifre = (testo) => testo.replace(/[^\d]/g, '');

// Il formato della valuta lo decide Intl: qui interessa che il numero giusto
// arrivi a schermo, non se i separatori sono punti o virgole.
afterEach(cleanup);

describe('MeseInCorso', () => {
  it('mostra consegne, incassato e tempo medio', () => {
    render(<MeseInCorso mese={{ deliveries: 312, revenue: 4210.5, avg_minutes: 14 }} />);
    expect(testo('mese-consegne')).toBe('312');
    expect(soloCifre(testo('mese-incassato'))).toBe('421050');
    expect(testo('mese-tempo')).toBe('14 min');
    expect(screen.getByText('consegne incassate')).toBeTruthy();
  });

  it('al singolare non dice "1 consegne"', () => {
    render(<MeseInCorso mese={{ deliveries: 1, revenue: 9, avg_minutes: null }} />);
    expect(screen.getByText('consegna incassata')).toBeTruthy();
    expect(testo('mese-tempo')).toBe('—');
  });

  it('senza consegne non mostra numeri inventati', () => {
    render(<MeseInCorso mese={{ deliveries: 0, revenue: 0 }} />);
    expect(screen.getByTestId('mese-in-corso').getAttribute('data-vuoto')).toBe('true');
    expect(screen.getByText(/nessuna consegna incassata/i)).toBeTruthy();
  });

  it('regge statistiche non ancora arrivate', () => {
    render(<MeseInCorso mese={undefined} />);
    expect(screen.getByTestId('mese-in-corso')).toBeTruthy();
  });
});
