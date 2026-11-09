import { describe, expect, it } from 'vitest';
import { costruisciCorrezioneStato, pulisciMotivo } from '../deliveryCorrection';

const consegna = { status: 'pronta' };

describe('costruisciCorrezioneStato', () => {
  it('non tocca niente se lo stato non cambia', () => {
    expect(costruisciCorrezioneStato(consegna, 'pronta', '')).toEqual({});
    expect(costruisciCorrezioneStato(consegna, null, 'motivo')).toEqual({});
  });

  it('manda il solo stato quando non c è motivo', () => {
    expect(costruisciCorrezioneStato(consegna, 'assigned')).toEqual({ status: 'assigned' });
  });

  it('con il motivo chiede esplicitamente la correzione', () => {
    expect(costruisciCorrezioneStato(consegna, 'delivered', '  segnata per errore  '))
      .toEqual({ status: 'delivered', force: true, force_reason: 'segnata per errore' });
  });

  it('regge una consegna senza stato', () => {
    expect(costruisciCorrezioneStato(null, 'pronta')).toEqual({ status: 'pronta' });
  });
});

describe('pulisciMotivo', () => {
  it('taglia spazi e lunghezza', () => {
    expect(pulisciMotivo('  ciao  ')).toBe('ciao');
    expect(pulisciMotivo(null)).toBe('');
    expect(pulisciMotivo('x'.repeat(300))).toHaveLength(200);
  });
});
