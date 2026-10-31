import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { API } from '@/lib/config';
import { ensureArray } from '@/lib/collections';

const getList = (url) => async () => ensureArray((await axios.get(`${API}${url}`, { withCredentials: true })).data);
const getObj = (url) => async () => (await axios.get(`${API}${url}`, { withCredentials: true })).data;

export const useCustomersQuery = (options = {}) =>
  useQuery({ queryKey: ['customers'], queryFn: getList('/customers'), ...options });

export const useDriversQuery = (options = {}) =>
  useQuery({ queryKey: ['drivers'], queryFn: getList('/drivers'), ...options });

export const useDeliveriesQuery = (status, options = {}) =>
  useQuery({
    queryKey: ['deliveries', status || 'all'],
    queryFn: getList(status ? `/deliveries?status=${status}` : '/deliveries'),
    ...options,
  });

export const useStatisticsQuery = (options = {}) =>
  useQuery({ queryKey: ['statistics'], queryFn: getObj('/statistics'), ...options });

export const useAnalyticsQuery = (period = 'month', options = {}) =>
  useQuery({ queryKey: ['analytics', period], queryFn: getObj(`/analytics?period=${period}`), ...options });

export const useNotesQuery = (options = {}) =>
  useQuery({ queryKey: ['notes'], queryFn: getList('/notes'), ...options });

export const useDoctorsQuery = (options = {}) =>
  useQuery({ queryKey: ['doctors'], queryFn: getList('/doctors'), ...options });

export const useUsefulNumbersQuery = (options = {}) =>
  useQuery({ queryKey: ['useful-numbers'], queryFn: getList('/useful-numbers'), ...options });

export const useShiftsQuery = (options = {}) =>
  useQuery({ queryKey: ['shifts'], queryFn: getList('/shifts'), ...options });

export const useArchiveQuery = (page = 1, limit = 20, options = {}) =>
  useQuery({
    queryKey: ['archive', page, limit],
    queryFn: getObj(`/archive?page=${page}&limit=${limit}`),
    ...options,
  });

export const useConversationsQuery = (options = {}) =>
  useQuery({ queryKey: ['conversations'], queryFn: getList('/messages/conversations'), ...options });

export const useWinfarmStatusQuery = (options = {}) =>
  useQuery({ queryKey: ['winfarm-status'], queryFn: getObj('/integrations/winfarm/status'), ...options });
