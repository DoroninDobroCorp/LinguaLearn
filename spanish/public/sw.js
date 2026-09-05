const CACHE_VERSION = "spanish-pwa-v11-offline-everything-1788580286249";
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const DATA_CACHE = `${CACHE_VERSION}-data`;

const PRECACHE_ASSETS = [
  "/spanish/",
  "/spanish/index.html",
  "/spanish/exercises",
  "/spanish/vocabulary",
  "/spanish/curriculum",
  "/spanish/manifest.json",
  "/spanish/manifest.webmanifest",
  "/spanish/pwa-icon.svg",
  "/spanish/apple-touch-icon.png",
  "/spanish/pwa-192.png",
  "/spanish/pwa-512.png",
  "/spanish/a1_first_18_offline_pack_100.json",
  "/spanish/assets/index-CCGtkbnt.css",
  "/spanish/assets/index-DEordbWS.js"
];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(STATIC_CACHE).then(async (cache) => {
      // 1. Precache static assets
      for (const asset of PRECACHE_ASSETS) {
        try {
          await cache.add(asset);
        } catch (err) {
          console.warn("[SW] Precache skipped for:", asset, err.message);
        }
      }

      // 2. Precache core API payloads if network is reachable during install
      try {
        const dataCache = await caches.open(DATA_CACHE);
        const endpoints = [
          "/spanish/api/curriculum/topics?level=A1",
          "/spanish/api/curriculum/topics",
          "/spanish/api/exercises/word-tiles",
          "/spanish/api/exercises/error-detective",
          "/spanish/api/exercises/speed-match",
          "/spanish/api/profiles"
        ];
        await Promise.all(
          endpoints.map(async (url) => {
            try {
              const res = await fetch(url);
              if (res && res.status === 200) {
                await dataCache.put(url, res);
              }
            } catch {}
          })
        );
      } catch (err) {
        console.warn("[SW] API precache warning:", err);
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

  // Only handle GET requests
  if (request.method !== "GET") {
    return;
  }

  // 1. Navigation requests (HTML SPA routes: /spanish/, /spanish/exercises, etc.)
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
          return new Response(
            "<!doctype html><html lang='ru'><head><meta charset='utf-8'/><title>LinguaLearn Spanish</title></head><body><h1>LinguaLearn Spanish (Офлайн)</h1><p>Откройте приложение с интернетом для первоначальной синхронизации.</p></body></html>",
            { headers: { "Content-Type": "text/html; charset=utf-8" } }
          );
        })
    );
    return;
  }

  // 2. Vocabulary & Data API requests (/spanish/api/ or /api/)
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
          return new Response(
            JSON.stringify({ offline: true, error: "Offline network mode" }),
            { headers: { "Content-Type": "application/json" }, status: 503 }
          );
        })
    );
    return;
  }

  // 3. Static assets: JS, CSS, Images, Fonts (Cache-First, never return null!)
  event.respondWith(
    caches.match(request).then(async (cachedResponse) => {
      if (cachedResponse) {
        // Revalidate in background when online
        fetch(request)
          .then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              caches.open(STATIC_CACHE).then((cache) => cache.put(request, networkResponse));
            }
          })
          .catch(() => {});
        return cachedResponse;
      }

      try {
        const networkResponse = await fetch(request);
        if (networkResponse && networkResponse.status === 200) {
          const clone = networkResponse.clone();
          caches.open(STATIC_CACHE).then((cache) => cache.put(request, clone));
        }
        return networkResponse;
      } catch (fetchErr) {
        // Try any cache ignoring search parameters
        const fallback = await caches.match(request, { ignoreSearch: true });
        if (fallback) return fallback;

        // Fallbacks for script or stylesheet so browser never throws fatal TypeError
        if (request.destination === "script" || url.pathname.endsWith(".js")) {
          return new Response("/* offline script placeholder */", {
            headers: { "Content-Type": "application/javascript; charset=utf-8" }
          });
        }
        if (request.destination === "style" || url.pathname.endsWith(".css")) {
          return new Response("/* offline style placeholder */", {
            headers: { "Content-Type": "text/css; charset=utf-8" }
          });
        }

        return new Response("Offline asset unavailable", { status: 503 });
      }
    })
  );
});
