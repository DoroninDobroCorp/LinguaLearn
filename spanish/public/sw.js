const CACHE_VERSION = "spanish-pwa-v8-offline-pack-20260905";
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const DATA_CACHE = `${CACHE_VERSION}-data`;

const PRECACHE_ASSETS = [
  "/spanish/",
  "/spanish/index.html",
  "/spanish/exercises",
  "/spanish/vocabulary",
  "/spanish/manifest.json",
  "/spanish/manifest.webmanifest",
  "/spanish/pwa-icon.svg",
  "/spanish/apple-touch-icon.png",
  "/spanish/pwa-192.png",
  "/spanish/pwa-512.png",
  "/spanish/a1_first_18_offline_pack_100.json"
];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(STATIC_CACHE).then(async (cache) => {
      for (const asset of PRECACHE_ASSETS) {
        try {
          await cache.add(asset);
        } catch (err) {
          console.warn("[SW] Precache skipped for:", asset, err.message);
        }
      }
    })
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter((key) => key !== STATIC_CACHE && key !== DATA_CACHE)
          .map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only intercept GET requests
  if (request.method !== "GET") {
    return;
  }

  // 1. Navigation requests (HTML SPA routes)
  if (request.mode === "navigate" || request.headers.get("accept")?.includes("text/html")) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(STATIC_CACHE).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(request);
          if (cached) return cached;
          const fallback = (await caches.match("/spanish/index.html")) || (await caches.match("/spanish/"));
          if (fallback) return fallback;
          return new Response("<h1>LinguaLearn Spanish (Офлайн)</h1><p>Откройте приложение с интернетом для первоначальной загрузки.</p>", {
            headers: { "Content-Type": "text/html; charset=utf-8" }
          });
        })
    );
    return;
  }

  // 2. Vocabulary & Data API requests (/spanish/api/)
  if (url.pathname.startsWith("/spanish/api/") || url.pathname.startsWith("/api/")) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(DATA_CACHE).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(request);
          if (cached) return cached;
          return new Response(JSON.stringify({ offline: true, error: "Offline network mode" }), {
            headers: { "Content-Type": "application/json" },
            status: 503
          });
        })
    );
    return;
  }

  // 3. Static assets: JS, CSS, Images, Fonts (Stale-While-Revalidate)
  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      const fetchPromise = fetch(request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const clone = networkResponse.clone();
            caches.open(STATIC_CACHE).then((cache) => cache.put(request, clone));
          }
          return networkResponse;
        })
        .catch(() => null);

      return cachedResponse || fetchPromise;
    })
  );
});
