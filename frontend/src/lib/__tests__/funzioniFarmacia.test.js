import { describe, expect, it } from 'vitest';

import { FUNZIONI_FARMACIA, funzioneAttiva, funzioneDelPercorso, funzioniDellaFarmacia } from '../funzioniFarmacia';

describe('funzioni della farmacia', () => {
  it('senza scelte sono tutte accese', () => {
    const accese = funzioniDellaFarmacia({});
    for (const funzione of FUNZIONI_FARMACIA) {
      expect(accese[funzione.chiave]).toBe(true);
    }
  });

  it('solo un false esplicito spegne', () => {
    expect(funzioneAttiva({ settings: { funzioni: { chat: false } } }, 'chat')).toBe(false);
    expect(funzioneAttiva({ settings: { funzioni: { chat: 'no' } } }, 'chat')).toBe(true);
    expect(funzioneAttiva({ settings: { funzioni: null } }, 'chat')).toBe(true);
    expect(funzioneAttiva(null, 'chat')).toBe(true);
  });

  it('riconosce la pagina governata da un interruttore', () => {
    expect(funzioneDelPercorso('/chat')?.chiave).toBe('chat');
    expect(funzioneDelPercorso('/notes')?.chiave).toBe('block_notes');
    expect(funzioneDelPercorso('/dashboard')).toBeNull();
    expect(funzioneDelPercorso('/driver/chat')).toBeNull();
  });
});
