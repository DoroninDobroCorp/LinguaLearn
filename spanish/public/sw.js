const CACHE_VERSION = 'spanish-pwa-v2-exam-theory-20260820';

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
  // Always fetch network first so user always sees latest version
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});
