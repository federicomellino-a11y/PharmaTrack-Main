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
    render(<ConfrontoPeriodo confronto={confronto} etichettaPeriodo="Mese" />);
    expect(document.body.textContent).toContain('+20%');
    expect(screen.getByText('Fatturato')).toBeTruthy();
    expect(screen.getByText('Confronto con il mese prima')).toBeTruthy();
    expect(document.body.textContent).toContain('era 800,00');
  });

  it('senza periodo prima non inventa percentuali', () => {
    render(
      <ConfrontoPeriodo
        confronto={{ previous: { total_revenue: 0, delivered_count: 0, avg_order_value: 0 }, delta: { revenue_pct: null, count_pct: null, avg_order_pct: null } }}
        etichettaPeriodo="Settimana"
      />,
    );
    expect(screen.getAllByText('niente da confrontare')).toHaveLength(3);
  });
});
