// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import NumeriClienti from '../NumeriClienti';

describe('NumeriClienti', () => {
  afterEach(cleanup);

  it('dice quanti pazienti sono nuovi e quanti di ritorno', () => {
    render(<NumeriClienti clienti={{ totali: 10, nuovi: 3, di_ritorno: 7, spesa_media: 96 }} />);
    expect(screen.getByText('3')).toBeTruthy();
    expect(screen.getByText('7')).toBeTruthy();
    expect(document.body.textContent).toContain('30% del totale');
    expect(document.body.textContent).toContain('96,00');
  });

  it('senza pazienti non divide per zero', () => {
    render(<NumeriClienti clienti={{ totali: 0, nuovi: 0, di_ritorno: 0, spesa_media: 0 }} />);
    expect(document.body.textContent).toContain('0% del totale');
    expect(document.body.textContent).not.toContain('NaN');
  });
});
