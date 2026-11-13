// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, fireEvent, screen, cleanup } from '@testing-library/react';

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() } }));
vi.mock('@/lib/printLabel', () => ({ printDeliveryLabel: vi.fn() }));

import DeliveryRow from '../DeliveryRow';

const consegna = {
  delivery_id: 'd1',
  status: 'da_preparare',
  priority: 'normal',
  customer_name: 'ROSSI MARIO',
  customer_address: 'Via Roma 1',
  customer_phone: '3331234567',
  amount: 12.5,
  payment_method: 'cash',
  created_at: '2026-11-13T09:00:00Z',
  external_ref: 'A-89/13/11/2026',
  notes: 'Sacchetto: CARDIOASPIRIN*30CPR; 2x TACHIPIRINA*20CPR',
};

const gestori = {
  handleConfirmPayment: vi.fn(),
  handleDisputePayment: vi.fn(),
  handleAdvanceStatus: vi.fn(),
  handleCancel: vi.fn(),
  handleRestore: vi.fn(),
  shareDelivery: vi.fn(),
  onPrintSlip: vi.fn(),
  apriModifica: vi.fn(),
  apriPronta: vi.fn(),
  apriAssegna: vi.fn(),
};

const disegna = () => render(
  <DeliveryRow d={consegna} drivers={[]} inRitardo={() => false} handlers={gestori} />
);

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('riga della consegna', () => {
  it('i dettagli restano chiusi finche non si tocca la riga', () => {
    disegna();
    expect(screen.queryByTestId('dettagli-d1')).toBeNull();
    fireEvent.click(screen.getByTestId('riga-consegna-d1'));
    expect(screen.getByTestId('dettagli-d1').textContent).toContain('CARDIOASPIRIN*30CPR');
    fireEvent.click(screen.getByTestId('riga-consegna-d1'));
    expect(screen.queryByTestId('dettagli-d1')).toBeNull();
  });

  it('un pulsante della riga non apre i dettagli', () => {
    disegna();
    fireEvent.click(screen.getByTitle('Stampa bolla'));
    expect(screen.queryByTestId('dettagli-d1')).toBeNull();
    expect(gestori.onPrintSlip).toHaveBeenCalledTimes(1);
  });

  it('una consegna senza note non ha niente da aprire', () => {
    render(<DeliveryRow d={{ ...consegna, notes: '' }} drivers={[]} inRitardo={() => false} handlers={gestori} />);
    expect(screen.queryByTestId('apri-dettagli-d1')).toBeNull();
  });
});
