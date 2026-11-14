import { describe, expect, it } from 'vitest';
import {
  consegneInRitardo, consegneDaAssegnare, incassiDaConfermare,
  fattoriniSenzaPosizione, turniDaControllare, costruisciDaGestire, totaleDaGestire,
} from '../homeUrgenti';

const OGGI = new Date('2026-11-14T12:00:00');

const consegna = (dati) => ({
  delivery_id: 'c1',
  customer_name: 'Rossi',
  customer_address: 'Via Roma 1',
  status: 'assigned',
  scheduled_date: '2026-11-14',
  scheduled_time: '10:00',
  slot_to: '11:00',
  driver_id: 'd1',
  ...dati,
});

const fattorino = (dati) => ({
  driver_id: 'd1',
  name: 'Marco',
  is_active: true,
  current_lat: 40.8,
  current_lng: 14.4,
  last_location_update: new Date('2026-11-14T11:58:00').toISOString(),
  ...dati,
});

describe('consegne in ritardo', () => {
  it('conta solo le fasce finite e ancora aperte', () => {
    const elenco = [
      consegna({ delivery_id: 'a', slot_to: '11:00' }),          // finita
      consegna({ delivery_id: 'b', slot_to: '13:00' }),          // ancora in tempo
      consegna({ delivery_id: 'c', status: 'delivered' }),       // chiusa
      consegna({ delivery_id: 'd', scheduled_date: '2026-11-13' }), // ieri
      consegna({ delivery_id: 'e', scheduled_time: null }),      // senza orario
    ];
    expect(consegneInRitardo(elenco, OGGI).map((c) => c.delivery_id)).toEqual(['a', 'd']);
  });
});

describe('ordini da assegnare', () => {
  it('sono quelli senza fattorino e non ancora partiti', () => {
    const elenco = [
      consegna({ delivery_id: 'a', driver_id: null, status: 'pending' }),
      consegna({ delivery_id: 'b', driver_id: null, status: 'pronta' }),
      consegna({ delivery_id: 'c', driver_id: null, status: 'assigned' }),
      consegna({ delivery_id: 'd', driver_id: 'd1', status: 'pending' }),
    ];
    expect(consegneDaAssegnare(elenco).map((c) => c.delivery_id)).toEqual(['a', 'b']);
  });
});

describe('incassi da confermare', () => {
  it('guarda lo stato, non l importo', () => {
    const elenco = [
      consegna({ delivery_id: 'a', status: 'delivered_pending_confirmation', amount: 12 }),
      consegna({ delivery_id: 'b', status: 'delivered' }),
    ];
    expect(incassiDaConfermare(elenco).map((c) => c.delivery_id)).toEqual(['a']);
  });
});

describe('fattorini senza posizione aggiornata', () => {
  it('tiene gli attivi con posizione vecchia o mai arrivata, non chi e spento', () => {
    const adesso = new Date('2026-11-14T12:00:00');
    const elenco = [
      fattorino({ driver_id: 'live' }),
      fattorino({ driver_id: 'fermo', last_location_update: '2026-11-14T11:30:00' }),
      fattorino({ driver_id: 'spento', is_active: false }),
      fattorino({ driver_id: 'mai', current_lat: null, current_lng: null }),
    ];
    expect(fattoriniSenzaPosizione(elenco, adesso).map((f) => f.driver_id)).toEqual(['fermo', 'mai']);
  });
});

describe('turni da controllare', () => {
  it('un turno quadrato non e piu una cosa da fare', () => {
    const elenco = [
      { shift_id: 'a', status: 'open' },
      { shift_id: 'b', status: 'closed' },
      { shift_id: 'c', status: 'settled' },
    ];
    expect(turniDaControllare(elenco).map((t) => t.shift_id)).toEqual(['a', 'b']);
  });

  it('senza piano Professional la voce sparisce invece di dire zero', () => {
    const voci = costruisciDaGestire({ turniDisponibili: false });
    expect(voci.map((voce) => voce.chiave)).not.toContain('turni');
  });
});

describe('sezione "Da gestire ora"', () => {
  it('ordina per urgenza e porta ai punti giusti', () => {
    const voci = costruisciDaGestire({
      consegne: [
        consegna({ delivery_id: 'tardi', slot_to: '11:00' }),
        consegna({ delivery_id: 'nuova', driver_id: null, status: 'pending', slot_to: '13:00' }),
        consegna({ delivery_id: 'soldi', status: 'delivered_pending_confirmation', slot_to: '13:00' }),
      ],
      adesso: OGGI,
    });

    expect(voci.map((voce) => voce.chiave)).toEqual(
      ['ritardo', 'da_assegnare', 'incassi', 'fattorini', 'turni']
    );
    // una sola consegna in ritardo: si apre quella, senza passare dall'elenco
    expect(voci[0].to).toBe('/deliveries?delivery=tardi');
    expect(voci[1].to).toBe('/deliveries?vista=da_assegnare');
    expect(voci[2].to).toBe('/deliveries?tab=pending_confirmation');
    expect(voci[0].righe[0].to).toBe('/deliveries?delivery=tardi');
    expect(totaleDaGestire(voci)).toBe(3);
  });

  it('con piu consegne in ritardo manda all elenco filtrato', () => {
    const voci = costruisciDaGestire({
      consegne: [
        consegna({ delivery_id: 'a', slot_to: '09:00' }),
        consegna({ delivery_id: 'b', slot_to: '10:00' }),
      ],
      adesso: OGGI,
    });
    expect(voci[0].to).toBe('/deliveries?vista=ritardo');
    expect(voci[0].conteggio).toBe(2);
    expect(voci[0].righe).toHaveLength(2);
  });

  it('quando e tutto a posto tutti i numeri sono zero', () => {
    const voci = costruisciDaGestire({ adesso: OGGI });
    expect(totaleDaGestire(voci)).toBe(0);
    expect(voci.every((voce) => voce.conteggio === 0)).toBe(true);
  });
});
