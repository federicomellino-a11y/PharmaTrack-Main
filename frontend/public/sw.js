self.addEventListener('install', () => self.skipWaiting());
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
