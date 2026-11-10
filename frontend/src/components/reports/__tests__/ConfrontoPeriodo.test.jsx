// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import ConfrontoPeriodo from '../ConfrontoPeriodo';

const confronto = {
  previous: { total_revenue: 800, delivered_count: 40, avg_order_value: 20 },
  current: { total_revenue: 960, delivered_count: 48, avg_order_value: 20 },
  delta: { revenue_pct: 20, count_pct: 20, avg_order_pct: 0 },
};

describe('ConfrontoPeriodo', () => {
  afterEach(cleanup);

  it('mostra le percentuali del periodo prima', () => {
    render(<ConfrontoPeriodo confronto={confronto} clienti={{ totali: 10, nuovi: 2, di_ritorno: 8, spesa_media: 96 }} etichettaPeriodo="Mese" />);
    expect(document.body.textContent).toContain('+20%');
    expect(screen.getAllByText('Fatturato').length).toBeGreaterThan(0);
    expect(screen.getByText('Confronto con il mese prima')).toBeTruthy();
    expect(document.body.textContent).toContain('era 800,00');
  });

  it('senza periodo prima non inventa percentuali', () => {
    render(
      <ConfrontoPeriodo
        confronto={{ previous: { total_revenue: 0, delivered_count: 0, avg_order_value: 0 }, delta: { revenue_pct: null, count_pct: null, avg_order_pct: null } }}
        clienti={{ totali: 0, nuovi: 0, di_ritorno: 0, spesa_media: 0 }}
        etichettaPeriodo="Settimana"
      />,
    );
    expect(screen.getAllByText('niente da confrontare')).toHaveLength(3);
  });

  it('dice quanti pazienti sono nuovi', () => {
    render(<ConfrontoPeriodo confronto={confronto} clienti={{ totali: 10, nuovi: 3, di_ritorno: 7, spesa_media: 96 }} etichettaPeriodo="Mese" />);
    expect(screen.getByText('3')).toBeTruthy();
    expect(screen.getByText('7')).toBeTruthy();
    expect(document.body.textContent).toContain('30% del totale');
  });
});
