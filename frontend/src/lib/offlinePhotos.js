const DB_NAME = 'pt_offline_media';
const STORE = 'photos';

function openDb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('IndexedDB non disponibile')); return; }
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function reqToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function readAll() {
  try {
    const db = await openDb();
    try {
      const tx = db.transaction(STORE, 'readonly');
      return (await reqToPromise(tx.objectStore(STORE).getAll())) || [];
    } finally {
      db.close();
    }
  } catch {
    return [];
  }
}

async function removeById(id) {
  const db = await openDb();
  try {
    const tx = db.transaction(STORE, 'readwrite');
    await reqToPromise(tx.objectStore(STORE).delete(id));
  } finally {
    db.close();
  }
}

/** Salva la foto sul telefono quando la rete non c'e'. */
export async function queuePhoto(file, deliveryId) {
  const id = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const db = await openDb();
  try {
    const tx = db.transaction(STORE, 'readwrite');
    await reqToPromise(tx.objectStore(STORE).put({
      id,
      deliveryId,
      blob: file,
      name: file?.name || `consegna-${id}.jpg`,
      type: file?.type || 'image/jpeg',
      created_at: new Date().toISOString(),
    }));
    return id;
  } finally {
    db.close();
  }
}

export async function countQueuedPhotos() {
  return (await readAll()).length;
}

export const listQueuedPhotos = readAll;

/**
 * Carica le foto rimaste in coda. Si ferma al primo problema di rete per non
 * consumare la batteria; gli errori 4xx (file rifiutato) vengono scartati.
 */
export async function flushQueuedPhotos(apiBase) {
  const items = await readAll();
  if (!items.length) return { uploaded: 0, remaining: 0 };

  let uploaded = 0;
  for (const item of items) {
    try {
      const body = new FormData();
      body.append('delivery_id', item.deliveryId);
      body.append('file', item.blob, item.name);
      const response = await fetch(`${apiBase}/photos/upload`, {
        method: 'POST',
        credentials: 'include',
        body,
      });
      if (response.ok) {
        await removeById(item.id);
        uploaded += 1;
      } else if (response.status >= 400 && response.status < 500) {
        await removeById(item.id);
      } else {
        break;
      }
    } catch {
      break;
    }
  }

  const remaining = (await readAll()).length;
  return { uploaded, remaining };
}
