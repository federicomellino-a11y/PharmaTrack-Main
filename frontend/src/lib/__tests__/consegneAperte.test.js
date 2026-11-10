import { describe, it, expect } from 'vitest';
import {
  STATI_APERTI,
  avvisoConsegnaAperta,
  consegneAperteDelCliente,
} from '../consegneAperte';

const consegna = (over = {}) => ({
  delivery_id: 'd1',
  customer_id: 'c1',
  status: 'da_preparare',
  created_at: '2026-11-09T10:00:00+01:00',
  ...over,
});

describe('consegneAperteDelCliente', () => {
  it('trova solo le consegne di quel cliente ancora aperte', () => {
    const elenco = [
      consegna(),
      consegna({ delivery_id: 'd2', status: 'in_transit', created_at: '2026-11-09T12:00:00+01:00' }),
      consegna({ delivery_id: 'd3', status: 'delivered' }),
      consegna({ delivery_id: 'd4', status: 'cancelled' }),
      consegna({ delivery_id: 'd5', customer_id: 'c2' }),
    ];
    const aperte = consegneAperteDelCliente(elenco, 'c1');
    expect(aperte.map((c) => c.delivery_id)).toEqual(['d2', 'd1']);
  });

  it('conta come aperta anche quella consegnata ma non ancora incassata', () => {
    const aperte = consegneAperteDelCliente(
      [consegna({ status: 'delivered_pending_confirmation' })],
      'c1'
    );
    expect(aperte).toHaveLength(1);
  });

  it('senza cliente selezionato non restituisce niente', () => {
    expect(consegneAperteDelCliente([consegna()], null)).toEqual([]);
    expect(consegneAperteDelCliente([consegna()], '')).toEqual([]);
  });

  it('regge un elenco assente o con voci nulle', () => {
    expect(consegneAperteDelCliente(null, 'c1')).toEqual([]);
    expect(consegneAperteDelCliente([null, undefined, consegna()], 'c1')).toHaveLength(1);
  });

  it('gli stati aperti non includono quelli chiusi', () => {
    expect(STATI_APERTI).not.toContain('delivered');
    expect(STATI_APERTI).not.toContain('cancelled');
    expect(STATI_APERTI).not.toContain('not_delivered');
  });
});

describe('avvisoConsegnaAperta', () => {
  it('una sola consegna aperta: dice stato e fascia', () => {
    const testo = avvisoConsegnaAperta([
      consegna({ status: 'assigned', scheduled_time: '15:00', slot_to: '18:00' }),
    ]);
    expect(testo).toContain('già una consegna aperta');
    expect(testo).toContain('affidata');
    expect(testo).toContain('15:00–18:00');
  });

  it('più consegne aperte: dice quante sono', () => {
    const testo = avvisoConsegnaAperta([consegna(), consegna({ delivery_id: 'd2' })]);
    expect(testo).toContain('2 consegne aperte');
  });

  it('senza fascia resta leggibile', () => {
    const testo = avvisoConsegnaAperta([consegna({ status: 'pronta' })]);
    expect(testo).toContain('pronta');
    expect(testo).not.toContain('· )');
  });

  it('senza consegne aperte non c è avviso', () => {
    expect(avvisoConsegnaAperta([])).toBeNull();
    expect(avvisoConsegnaAperta(null)).toBeNull();
  });
});
