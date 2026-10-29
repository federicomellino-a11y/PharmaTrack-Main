const STORAGE_KEY = 'pt_offline_queue_v1';

const readQueue = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const writeQueue = (items) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    // storage pieno o disabilitato: la coda semplicemente non persiste
  }
};

export const getPendingCount = () => readQueue().length;

export const isNetworkError = (error) => !error?.response;

export function enqueueRequest({ method, url, data, label }) {
  const items = readQueue();
  const item = {
    id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    method: (method || 'post').toLowerCase(),
    url,
    data: data ?? null,
    label: label || 'Operazione',
    created_at: new Date().toISOString(),
  };
  items.push(item);
  writeQueue(items);
  return item;
}

/**
 * Esegue la richiesta; se la rete manca la mette in coda e la riprova dopo.
 * Gli errori "veri" (400/403/500) vengono rilanciati: non ha senso ritentarli.
 */
export async function requestWithOfflineQueue(axiosInstance, { method, url, data, label }) {
  try {
    const response = await axiosInstance.request({ method, url, data, withCredentials: true });
    return { data: response.data, queued: false };
  } catch (error) {
    if (!isNetworkError(error)) throw error;
    enqueueRequest({ method, url, data, label });
    return { data: null, queued: true };
  }
}

export async function flushOfflineQueue(axiosInstance) {
  const items = readQueue();
  if (!items.length) return { synced: 0, dropped: 0, remaining: 0 };

  const remaining = [];
  let synced = 0;
  let dropped = 0;

  for (const item of items) {
    try {
      await axiosInstance.request({
        method: item.method,
        url: item.url,
        data: item.data,
        withCredentials: true,
      });
      synced += 1;
    } catch (error) {
      if (isNetworkError(error)) {
        remaining.push(item);
      } else {
        dropped += 1;
      }
    }
  }

  writeQueue(remaining);
  return { synced, dropped, remaining: remaining.length };
}
