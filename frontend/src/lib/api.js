import axios from 'axios';
import { API } from './config';
import { ensureArray } from './collections';
import { queryArchivio } from './archivioFiltri';

/**
 * Unico punto in cui le pagine leggono dal server.
 *
 * Le letture stanno tutte qui perche' passino dalla cache di react-query:
 * chiave + funzione di lettura nello stesso posto, cosi' due schermate che
 * chiedono lo stesso dato non lo chiedono due volte e chi scrive sa cosa
 * invalidare. Le pagine non chiamano piu' axios per leggere: il test di
 * contratto in src/pages/__tests__/migrazione-api.test.js lo impone.
 */
const get = async (url) => (await axios.get(`${API}${url}`, { withCredentials: true })).data;
const getLista = async (url) => ensureArray(await get(url));

export const chiavi = {
  customers: ['customers'],
  drivers: ['drivers'],
  deliveries: (status) => ['deliveries', status ?? 'all'],
  statistics: ['statistics'],
  analytics: (period) => ['analytics', period],
  plan: ['plan'],
  notes: ['notes'],
  doctors: ['doctors'],
  numeriUtili: ['useful-numbers'],
  shifts: ['shifts'],
  turno: (shiftId) => ['shift', shiftId],
  // I filtri entrano nella chiave: cambiando periodo o fattorino la pagina
  // chiede al server un'altra fetta di archivio invece di riusare la prima.
  archivio: (page, limit, filtri) => ['archive', page, limit, filtri ?? {}],
  conversazioni: ['conversations'],
  conversazione: (driverId) => ['messages', driverId],
  winfarm: ['winfarm-status'],
  adminOverview: ['admin', 'overview'],
  adminUsers: ['admin', 'users'],
  adminUtente: (userId) => ['admin', 'user', userId],
  adminDbStats: ['admin', 'database-stats'],
  adminDbHealth: ['admin', 'database-health'],
  consegneFattorino: ['driver-deliveries'],
  turnoFattorino: ['driver-shift'],
  messaggiFattorino: ['driver-messages'],
  notifiche: (tipo) => ['notifiche', tipo],
  pushConfig: (tipo) => ['push-config', tipo],
  ricorrenze: ['ricorrenze'],
  sessioni: ['sessioni'],
  statsCliente: (customerId) => ['customer-stats', customerId],
  statsFattorino: (driverId) => ['driver-stats', driverId],
};

export const letture = {
  customers: () => getLista('/customers'),
  drivers: () => getLista('/drivers'),
  deliveries: (status) => () => getLista(`/deliveries${status ? `?status=${status}` : ''}`),
  statistics: () => get('/statistics'),
  analytics: (period) => () => get(`/analytics?period=${period}`),
  plan: () => get('/plan'),
  ricorrenze: () => get('/ricorrenze'),
  sessioni: () => get('/auth/sessions'),
  notes: () => getLista('/notes'),
  doctors: () => getLista('/doctors'),
  numeriUtili: () => getLista('/useful-numbers'),
  shifts: () => getLista('/shifts'),
  turno: (shiftId) => () => get(`/shifts/${shiftId}`),
  archivio: (page, limit, filtri) => () => get(`/archive?${queryArchivio({ page, limit, filtri })}`),
  conversazioni: () => getLista('/messages/conversations'),
  conversazione: (driverId) => () => getLista(`/messages/${driverId}`),
  winfarm: () => get('/integrations/winfarm/status'),
  adminOverview: () => get('/admin/overview'),
  adminUsers: () => getLista('/admin/users'),
  adminUtente: (userId) => () => get(`/admin/users/${userId}/details`),
  adminDbStats: () => get('/admin/database/stats'),
  adminDbHealth: () => get('/admin/database/health'),
  consegneFattorino: () => getLista('/driver/deliveries'),
  turnoFattorino: () => get('/driver/shifts/current'),
  messaggiFattorino: () => getLista('/driver/messages'),
  notifiche: (tipo) => () => getLista(tipo === 'driver' ? '/driver/notifications' : '/notifications'),
  pushConfig: () => get('/push/config'),
  statsCliente: (customerId) => () => get(`/customers/${customerId}/stats`),
  statsFattorino: (driverId) => () => get(`/drivers/${driverId}/stats`),
};
