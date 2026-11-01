// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { enqueueRequest, getPendingCount, isNetworkError, flushOfflineQueue } from '../offlineQueue';

describe('offlineQueue', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('parte vuota', () => {
    expect(getPendingCount()).toBe(0);
  });

  it('accoda una modifica di stato quando la rete manca', () => {
    const item = enqueueRequest({ method: 'PUT', url: '/driver/deliveries/abc/status', data: { status: 'delivered' }, label: 'Consegna consegnata' });
    expect(item.method).toBe('put');
    expect(item.label).toBe('Consegna consegnata');
    expect(getPendingCount()).toBe(1);
  });

  it('conserva l ordine di arrivo', () => {
    enqueueRequest({ method: 'put', url: '/a' });
    enqueueRequest({ method: 'put', url: '/b' });
    const raw = JSON.parse(localStorage.getItem('pt_offline_queue_v1'));
    expect(raw.map((x) => x.url)).toEqual(['/a', '/b']);
  });

  it('distingue un errore di rete da un errore del server', () => {
    expect(isNetworkError(new Error('offline'))).toBe(true);
    expect(isNetworkError({ response: { status: 403 } })).toBe(false);
  });

  it('riprova e svuota la coda quando la rete torna', async () => {
    enqueueRequest({ method: 'put', url: '/a', data: { x: 1 } });
    enqueueRequest({ method: 'put', url: '/b', data: { x: 2 } });
    const axiosInstance = { request: vi.fn().mockResolvedValue({ status: 200 }) };
    const result = await flushOfflineQueue(axiosInstance);
    expect(axiosInstance.request).toHaveBeenCalledTimes(2);
    expect(getPendingCount()).toBe(0);
    expect(result).toHaveProperty('remaining', 0);
  });

  it('tiene in coda le richieste che falliscono ancora per la rete', async () => {
    enqueueRequest({ method: 'put', url: '/a' });
    const axiosInstance = { request: vi.fn().mockRejectedValue(new Error('timeout')) };
    const result = await flushOfflineQueue(axiosInstance);
    expect(result.remaining).toBe(1);
    expect(getPendingCount()).toBe(1);
  });
});
