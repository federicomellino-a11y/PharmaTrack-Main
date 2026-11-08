import { useQuery } from '@tanstack/react-query';
import { chiavi, letture } from '@/lib/api';

// Ogni lettura passa da qua: chiave e funzione stanno in src/lib/api.js, quindi
// chi scrive sa esattamente cosa invalidare e due schermate non duplicano la
// stessa chiamata. Le pagine non usano piu' axios per leggere.

export const useCustomersQuery = (options = {}) =>
  useQuery({ queryKey: chiavi.customers, queryFn: letture.customers, ...options });

export const useDriversQuery = (options = {}) =>
  useQuery({ queryKey: chiavi.drivers, queryFn: letture.drivers, ...options });

export const useDeliveriesQuery = (status, options = {}) =>
  useQuery({ queryKey: chiavi.deliveries(status), queryFn: letture.deliveries(status), ...options });

export const useStatisticsQuery = (options = {}) =>
  useQuery({ queryKey: chiavi.statistics, queryFn: letture.statistics, ...options });

export const useAnalyticsQuery = (period = 'month', options = {}) =>
  useQuery({ queryKey: chiavi.analytics(period), queryFn: letture.analytics(period), ...options });

export const usePlanQuery = (options = {}) =>
  useQuery({ queryKey: chiavi.plan, queryFn: letture.plan, ...options });

export const useNotesQuery = (options = {}) =>
  useQuery({ queryKey: chiavi.notes, queryFn: letture.notes, ...options });

export const useDoctorsQuery = (options = {}) =>
  useQuery({ queryKey: chiavi.doctors, queryFn: letture.doctors, ...options });

export const useUsefulNumbersQuery = (options = {}) =>
  useQuery({ queryKey: chiavi.numeriUtili, queryFn: letture.numeriUtili, ...options });

export const useShiftsQuery = (options = {}) =>
  useQuery({ queryKey: chiavi.shifts, queryFn: letture.shifts, ...options });

// Dettaglio del turno: si apre dal dialogo, quindi parte solo con l'id
// (enabled) e riusa la cache se lo riapri.
export const useShiftDetailQuery = (shiftId, options = {}) =>
  useQuery({
    queryKey: chiavi.turno(shiftId),
    queryFn: letture.turno(shiftId),
    enabled: Boolean(shiftId),
    ...options,
  });

export const useArchiveQuery = (page = 1, limit = 20, options = {}) =>
  useQuery({
    queryKey: chiavi.archivio(page, limit),
    queryFn: letture.archivio(page, limit),
    ...options,
  });

export const useConversationsQuery = (options = {}) =>
  useQuery({ queryKey: chiavi.conversazioni, queryFn: letture.conversazioni, ...options });

export const useConversationMessagesQuery = (driverId, options = {}) =>
  useQuery({
    queryKey: chiavi.conversazione(driverId),
    queryFn: letture.conversazione(driverId),
    enabled: Boolean(driverId),
    ...options,
  });

export const useWinfarmStatusQuery = (options = {}) =>
  useQuery({ queryKey: chiavi.winfarm, queryFn: letture.winfarm, ...options });

export const useAdminOverviewQuery = (options = {}) =>
  useQuery({ queryKey: chiavi.adminOverview, queryFn: letture.adminOverview, ...options });

export const useAdminUsersQuery = (options = {}) =>
  useQuery({ queryKey: chiavi.adminUsers, queryFn: letture.adminUsers, ...options });

export const useAdminUserDetailQuery = (userId, options = {}) =>
  useQuery({
    queryKey: chiavi.adminUtente(userId),
    queryFn: letture.adminUtente(userId),
    enabled: Boolean(userId),
    ...options,
  });

export const useAdminDatabaseStatsQuery = (options = {}) =>
  useQuery({ queryKey: chiavi.adminDbStats, queryFn: letture.adminDbStats, ...options });

export const useAdminDatabaseHealthQuery = (options = {}) =>
  useQuery({ queryKey: chiavi.adminDbHealth, queryFn: letture.adminDbHealth, ...options });

export const useCustomerStatsQuery = (customerId, options = {}) =>
  useQuery({
    queryKey: chiavi.statsCliente(customerId),
    queryFn: letture.statsCliente(customerId),
    enabled: Boolean(customerId),
    ...options,
  });

export const useDriverStatsQuery = (driverId, options = {}) =>
  useQuery({
    queryKey: chiavi.statsFattorino(driverId),
    queryFn: letture.statsFattorino(driverId),
    enabled: Boolean(driverId),
    ...options,
  });

// App fattorino: stessi pattern della farmacia. Posizione e stato restano
// locali (websocket), la cache serve agli elenchi e alle riletture.
export const useDriverDeliveriesQuery = (options = {}) =>
  useQuery({ queryKey: chiavi.consegneFattorino, queryFn: letture.consegneFattorino, ...options });

export const useDriverShiftQuery = (options = {}) =>
  useQuery({ queryKey: chiavi.turnoFattorino, queryFn: letture.turnoFattorino, ...options });

export const useDriverMessagesQuery = (options = {}) =>
  useQuery({ queryKey: chiavi.messaggiFattorino, queryFn: letture.messaggiFattorino, ...options });
