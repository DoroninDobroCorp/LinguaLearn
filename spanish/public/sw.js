const CACHE_VERSION = 'spanish-pwa-v4-illustrations-live-20260822';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(keys.map((k) => caches.delete(k)));
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  // Always fetch latest network assets
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});
