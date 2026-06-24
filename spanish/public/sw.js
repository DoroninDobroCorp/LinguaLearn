const CACHE_VERSION = 'spanish-pwa-v1';
const APP_SHELL_CACHE = `${CACHE_VERSION}:shell`;
const RUNTIME_CACHE = `${CACHE_VERSION}:runtime`;
const API_CACHE = `${CACHE_VERSION}:api`;

const APP_SHELL_URLS = [
  '/spanish/',
  '/spanish/exercises',
  '/spanish/vocabulary',
  '/spanish/manifest.json',
  '/spanish/pwa-icon.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(APP_SHELL_CACHE)
      .then((cache) => cache.addAll(APP_SHELL_URLS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => ![APP_SHELL_CACHE, RUNTIME_CACHE, API_CACHE].includes(key))
          .map((key) => caches.delete(key)),
      ))
      .then(() => self.clients.claim()),
  );
});

function isSpanishNavigation(request, url) {
  return request.mode === 'navigate' && url.pathname.startsWith('/spanish');
}

function isSpanishStaticAsset(url) {
  return url.pathname.startsWith('/spanish/assets/')
    || url.pathname === '/spanish/manifest.json'
    || url.pathname === '/spanish/manifest.webmanifest'
    || url.pathname === '/spanish/pwa-icon.svg';
}

function isCacheableSpanishApi(request, url) {
  if (request.method !== 'GET') {
    return false;
  }

  return url.pathname.startsWith('/spanish/api/vocabulary')
    || url.pathname.startsWith('/spanish/api/profiles')
    || url.pathname === '/spanish/api/health';
}

async function networkFirst(request, cacheName, fallbackUrl = null) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response && response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await cache.match(request);
    if (cached) {
      return cached;
    }
    if (fallbackUrl) {
      const fallback = await cache.match(fallbackUrl) || await caches.match(fallbackUrl);
      if (fallback) {
        return fallback;
      }
    }
    throw new Error('Offline and no cached response available.');
  }
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then((response) => {
      if (response && response.ok) {
        cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => null);

  return cached || network || Response.error();
}

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) {
    return;
  }

  if (isSpanishNavigation(event.request, url)) {
    event.respondWith(networkFirst(event.request, APP_SHELL_CACHE, '/spanish/'));
    return;
  }

  if (isSpanishStaticAsset(url)) {
    event.respondWith(staleWhileRevalidate(event.request, RUNTIME_CACHE));
    return;
  }

  if (isCacheableSpanishApi(event.request, url)) {
    event.respondWith(networkFirst(event.request, API_CACHE));
  }
});
