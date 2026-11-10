// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const stato = vi.hoisted(() => ({ piano: undefined }));
vi.mock('@/hooks/queries', () => ({ usePlanQuery: () => ({ data: stato.piano }) }));

import ProGate from '../ProGate';

const CHIUSO = {
  pro: false,
  funzioni: [
    { chiave: 'report_avanzati', nome: 'Report avanzati', descrizione: 'Fatturato e top clienti', dove: 'Pagina Report', sbloccata: false },
    { chiave: 'ricorrenze', nome: 'Ricorrenze e richiami', descrizione: 'Chi torna ogni mese', dove: 'Pagina Richiami', sbloccata: false },
  ],
};

const mostra = (props = {}) =>
  render(
    <MemoryRouter>
      <ProGate funzione="report_avanzati" {...props}>
        <p>contenuto della pagina</p>
      </ProGate>
    </MemoryRouter>,
  );

afterEach(cleanup);
beforeEach(() => {
  stato.piano = undefined;
});

describe('ProGate', () => {
  it('senza il piano caricato non chiude niente', () => {
    mostra();
    expect(screen.getByText('contenuto della pagina')).toBeTruthy();
    expect(screen.queryByTestId('pro-gate')).toBeNull();
  });

  it('con le funzioni Pro aperte mostra la pagina', () => {
    stato.piano = { ...CHIUSO, pro: true };
    mostra();
    expect(screen.getByText('contenuto della pagina')).toBeTruthy();
  });

  it('a funzioni chiuse spiega cosa manca e non mostra il contenuto', () => {
    stato.piano = CHIUSO;
    mostra();
    expect(screen.queryByText('contenuto della pagina')).toBeNull();
    const lucchetto = screen.getByTestId('pro-gate');
    expect(lucchetto.textContent).toContain('Report avanzati');
    expect(lucchetto.textContent).toContain('Professional');
    expect(lucchetto.textContent).toContain('Vedi i piani');
  });

  it('nella forma compatta resta una scheda sola, con il nome giusto', () => {
    stato.piano = CHIUSO;
    mostra({ compatto: true, funzione: 'ricorrenze' });
    const scheda = screen.getByTestId('pro-gate');
    expect(scheda.textContent).toContain('Ricorrenze e richiami');
    expect(scheda.textContent).toContain('I dati già salvati restano');
  });
});
