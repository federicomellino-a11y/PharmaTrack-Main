import { describe, expect, it } from 'vitest';
import { cercaOvunque, corrisponde, AZIONI_RAPIDE } from '../ricercaUniversale';

const pagine = [
  { path: '/dashboard', label: 'Home' },
  { path: '/deliveries', label: 'Consegne' },
  { path: '/customers', label: 'Clienti' },
  { path: '/mappa', label: 'Mappa clienti' },
];

const clienti = [
  {
    customer_id: 'cl1',
    name: 'Maria Rossi',
    address: 'Via Roma 12, Napoli',
    phone: '+39 333 123 4567',
  },
  {
    customer_id: 'cl2',
    name: 'Giuseppe Esposito',
    address: 'Corso Umberto 4, Napoli',
    phone: '0815551234',
  },
];

const consegne = [
  {
    delivery_id: 'c1',
    customer_name: 'Maria Rossi',
    customer_address: 'Via Roma 12, Napoli',
    customer_phone: '+39 333 123 4567',
    status: 'assigned',
    nre: 'NRE-991',
  },
  {
    delivery_id: 'c2',
    customer_name: 'Anna Bianchi',
    customer_address: 'Via Toledo 3, Napoli',
    status: 'pending',
    nre: 'NRE-220',
  },
];

const fattorini = [
  { driver_id: 'd1', name: 'Marco Verdi', email: 'marco@farmacia.it', phone: '3401112223', is_active: true },
  { driver_id: 'd2', name: 'Luca Neri', email: 'luca@farmacia.it', phone: '3409998887', is_active: false },
];

const cerca = (termine) => cercaOvunque({ termine, pagine, clienti, consegne, fattorini });

const risultatiDi = (gruppi, chiave) => (gruppi.find((g) => g.chiave === chiave)?.risultati || []);

describe('corrispondenze', () => {
  it('ignora maiuscole e accenti', () => {
    expect(corrisponde('Giuseppe Esposito', 'esposito')).toBe(true);
    expect(corrisponde('Città', 'citta')).toBe(true);
    expect(corrisponde('Maria Rossi', '  maria ')).toBe(true);
    expect(corrisponde('Maria Rossi', 'bianchi')).toBe(false);
  });
});

describe('casella vuota', () => {
  it('mostra le azioni rapide e tutte le pagine', () => {
    const gruppi = cerca('');
    expect(gruppi.map((g) => g.chiave)).toEqual(['azioni', 'pagine']);
    expect(risultatiDi(gruppi, 'azioni')).toHaveLength(AZIONI_RAPIDE.length);
    expect(risultatiDi(gruppi, 'pagine')).toHaveLength(pagine.length);
  });
});

describe('ricerca universale', () => {
  it('trova un cliente per cognome e apre la sua scheda', () => {
    const gruppi = cerca('esposito');
    const clientiTrovati = risultatiDi(gruppi, 'clienti');
    expect(clientiTrovati).toHaveLength(1);
    expect(clientiTrovati[0].to).toBe('/customers?customer=cl2');
  });

  it('trova un cliente per le ultime cifre del telefono anche con gli spazi', () => {
    const gruppi = cerca('4567');
    expect(risultatiDi(gruppi, 'clienti')[0].id).toBe('cliente-cl1');
  });

  it('un numero di due cifre non fa partire una ricerca di telefoni', () => {
    const gruppi = cerca('33');
    expect(risultatiDi(gruppi, 'clienti')).toHaveLength(0);
  });

  it('trova una consegna per numero NRE e la apre', () => {
    const gruppi = cerca('NRE-220');
    expect(risultatiDi(gruppi, 'consegne')[0].to).toBe('/deliveries?delivery=c2');
  });

  it('trova un fattorino e apre il suo profilo', () => {
    const gruppi = cerca('luca');
    expect(risultatiDi(gruppi, 'fattorini')[0].to).toBe('/drivers?driver=d2');
    expect(risultatiDi(gruppi, 'fattorini')[0].dettaglio).toBe('Fattorino non attivo');
  });

  it('un indirizzo porta al cliente che ci abita, una volta sola', () => {
    const gruppi = cerca('via roma');
    const indirizzi = risultatiDi(gruppi, 'indirizzi');
    expect(indirizzi).toHaveLength(1);
    expect(indirizzi[0].titolo).toBe('Via Roma 12, Napoli');
    expect(indirizzi[0].to).toBe('/customers?customer=cl1');
  });

  it('cerca anche nelle pagine e nelle azioni', () => {
    expect(risultatiDi(cerca('mappa'), 'pagine')[0].to).toBe('/mappa');
    expect(risultatiDi(cerca('incassi'), 'azioni').length).toBeGreaterThan(0);
  });

  it('con un termine senza riscontri non torna nessun gruppo', () => {
    expect(cerca('zzzz')).toEqual([]);
  });

  it('dentro un gruppo la stessa scheda non compare due volte', () => {
    const gruppi = cerca('napoli');
    for (const gruppo of gruppi) {
      const destinazioni = gruppo.risultati.map((r) => r.to);
      expect(new Set(destinazioni).size, gruppo.chiave).toBe(destinazioni.length);
    }
    // "chi e' Rossi" e "via Roma 12" sono due domande diverse: portano alla
    // stessa scheda, ma in due gruppi distinti, e va bene cosi'.
    expect(risultatiDi(gruppi, 'clienti').length).toBeGreaterThan(0);
    expect(risultatiDi(gruppi, 'indirizzi').length).toBeGreaterThan(0);
  });
});
