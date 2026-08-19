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
