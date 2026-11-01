/**
 * Dati finti per gli smoke test. Servono a far montare le pagine senza backend:
 * ogni risposta deve avere la forma che il componente si aspetta, altrimenti
 * il test fallisce per un fixture sbagliato e non per un bug vero.
 */

export const pharmacyUser = {
  user_id: 'u-test-1',
  email: 'test@farmaciaprova.it',
  name: 'Farmacia Test',
  pharmacy_name: 'Farmacia Prova',
  pharmacy_address: 'Via Roma 12, Volla',
  pharmacy_phone: '0811234567',
  user_type: 'pharmacy',
  email_verified: true,
  settings: {},
};

export const delivery = {
  delivery_id: 'c0a80101-1111-2222-3333-444455556666',
  customer_name: 'Anna Verdi',
  customer_phone: '3331112222',
  customer_address: 'Via Napoli 5, Volla',
  customer_lat: 40.8765,
  customer_lng: 14.3406,
  status: 'assigned',
  amount: 12.5,
  payment_method: 'cash',
  priority: 'normal',
  notes: 'Citofono 3',
  created_date: '2026-11-01T09:00:00Z',
  driver_id: 'd-test-1',
  driver_name: 'Luca Bianchi',
};

export const driver = {
  driver_id: 'd-test-1',
  name: 'Luca Bianchi',
  phone: '3339998888',
  is_active: true,
  current_lat: 40.85,
  current_lng: 14.30,
  vehicle_type: 'scooter',
};

export const customer = {
  customer_id: 'cu-test-1',
  name: 'Anna Verdi',
  phone: '3331112222',
  customer_address: 'Via Napoli 5, Volla',
  customer_lat: 40.8765,
  customer_lng: 14.3406,
  deliveries_count: 3,
};

export const statistics = {
  deliveries: { today: 4, active: 1, pending: 1, completed_today: 3, total: 8 },
  drivers: { active: 1, total: 1 },
  revenue: { today: 25, week: 120, month: 480 },
  priority: { low: 0, normal: 1, high: 0, urgent: 0 },
};

export const shift = {
  shift_id: 's-test-1',
  driver_id: 'd-test-1',
  driver_name: 'Luca Bianchi',
  status: 'open',
  started_at: '2026-11-01T08:00:00Z',
  totals: { cash_total: 25, pos_total: 0, deliveries: 3 },
};

const asArray = (value) => (Array.isArray(value) ? value : []);

/** Risposta in base al percorso richiesto. */
export function mockApiResponse(pathname) {
  const path = pathname.replace(/^\/api/, '');

  if (path === '/auth/me') return pharmacyUser;
  if (path === '/auth/google/config') return { client_id: '' };
  if (path === '/health') return { status: 'ok' };
  if (path === '/monitoring/config') return { sentry_dsn: null };
  if (path === '/photos/config') return { enabled: true };
  if (path === '/statistics') return statistics;
  if (path.startsWith('/deliveries')) return [delivery];
  if (path.startsWith('/drivers')) return [driver];
  if (path.startsWith('/customers')) return [customer];
  if (path.startsWith('/shifts')) return path === '/shifts/current' ? { shift } : [shift];
  if (path.startsWith('/archive')) return { deliveries: [delivery], pages: 1, total: 1 };
  if (path.startsWith('/analytics') || path.startsWith('/reports')) {
    return { totals: { delivered: 3, revenue: 120 }, series: [], by_day: [], by_status: [] };
  }
  if (path.startsWith('/messages') || path.startsWith('/driver/messages')) return [];
  if (path.startsWith('/notifications')) return [];
  if (path.startsWith('/integrations/winfarm/status')) {
    return { connected: false, last_sync: null, bridge_version: null };
  }
  if (path.startsWith('/doctors')) return asArray([]);
  if (path.startsWith('/useful-numbers')) return asArray([]);
  if (path.startsWith('/notes')) return asArray([]);
  if (path.startsWith('/users') || path.startsWith('/admin')) return [];
  return {};
}
