/* global clients */
self.addEventListener('install', () => self.skipWaiting());

// Handler fetch volutamente pass-through: non cachea niente (l'app deve sempre
// vedere l'ultimo deploy), ma la sua presenza serve a Chrome per considerare il
// sito installabile e far scattare beforeinstallprompt.
//
// Deve pero' fare davvero qualcosa: un handler che non chiama mai respondWith
// viene segnalato da Chrome come "Fetch event handler is recognized as no-op",
// perche' ogni navigazione pagherebbe il passaggio nel service worker senza
// alcun vantaggio. Qui gestiamo solo le navigazioni, lasciando tutto il resto
// al browser senza intercettarlo.
self.addEventListener('fetch', (evento) => {
  if (evento.request.mode === 'navigate') {
    evento.respondWith(fetch(evento.request));
  }
});
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

self.addEventListener('push', function(e) {
  if (!e.data) return;
  let data = {};
  try { data = e.data.json(); } catch { data = { title: 'PharmaTrack', body: e.data.text() }; }

  const options = {
    body: data.body || '',
    icon: '/icons/icon-192.png',
    badge: '/favicon.svg',
    vibrate: [200, 100, 200],
    tag: data.tag || 'pharmatrack-notification',
    renotify: true,
    data: {
      url: data.url || '/',
      ...(data.data || {}),
    },
  };

  e.waitUntil(self.registration.showNotification(data.title || 'PharmaTrack', options));
});

self.addEventListener('notificationclick', function(e) {
  e.notification.close();
  const targetUrl = e.notification.data?.url || '/';
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
      for (const client of clientList) {
        if (client.url.includes(self.registration.scope) && 'focus' in client) {
          client.postMessage({ type: 'NAVIGATE', url: targetUrl });
          return client.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(targetUrl);
    })
  );
});
