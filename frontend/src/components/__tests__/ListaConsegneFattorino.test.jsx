// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ListaConsegneFattorino from '../driver/ListaConsegneFattorino';

const consegna = (over = {}) => ({
  delivery_id: 'd1',
  customer_name: 'Anna Verdi',
  customer_address: 'Via Roma 12, Milano',
  customer_phone: '3331112222',
  status: 'assigned',
  notes: '',
  ...over,
});

const renderLista = (consegne) => render(
  <MemoryRouter>
    <ListaConsegneFattorino consegne={consegne} />
  </MemoryRouter>
);

afterEach(cleanup);

describe('ListaConsegneFattorino', () => {
  it('mostra una card per consegna', () => {
    renderLista([consegna(), consegna({ delivery_id: 'd2', customer_name: 'Bruno Neri' })]);
    expect(screen.getByText('Anna Verdi')).toBeTruthy();
    expect(screen.getByText('Bruno Neri')).toBeTruthy();
  });

  it('con vie diverse mette l intestazione di zona', () => {
    renderLista([
      consegna(),
      consegna({ delivery_id: 'd2', customer_address: 'Via Verdi 3, Milano' }),
    ]);
    expect(screen.getByTestId('zona-via roma')).toBeTruthy();
    expect(screen.getByTestId('zona-via verdi')).toBeTruthy();
  });

  it('con una via sola non aggiunge intestazioni inutili', () => {
    renderLista([
      consegna(),
      consegna({ delivery_id: 'd2', customer_address: 'Via Roma 40, Milano', customer_name: 'Bruno Neri' }),
    ]);
    expect(screen.queryAllByTestId(/^zona-/)).toHaveLength(0);
    expect(screen.getByText('Bruno Neri')).toBeTruthy();
  });

  it('mostra la fascia e il ritardo quando ci sono', () => {
    renderLista([consegna({ slot: '15:00–18:00', slot_late: true })]);
    const badge = screen.getByTestId('slot-d1');
    expect(badge.textContent).toContain('in ritardo');
    expect(badge.textContent).toContain('15:00–18:00');
  });

  it('il link mappa porta all indirizzo giusto', () => {
    renderLista([consegna()]);
    const link = document.querySelector('a[href^="https://www.google.com/maps/dir/"]');
    expect(link.getAttribute('href')).toContain('Via%20Roma%2012');
  });

  it('elenco vuoto non disegna niente e non esplode', () => {
    renderLista([]);
    expect(screen.getByTestId('lista-consegne-fattorino').children).toHaveLength(0);
  });
});
