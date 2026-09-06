const CACHE_VERSION = "spanish-pwa-v12-offline-transit-1788703990994";
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
  "/spanish/assets/index-qK9Pdbgm.js",
  "/spanish/assets/index-qbb0Z-ga.css"
];

// Helper to sanitize responses before storing into cache so WebKit on iOS never discards them
async function putSanitizedResponse(cache, requestOrUrl, response) {
  try {
    const headers = new Headers(response.headers);
    headers.set("Cache-Control", "public, max-age=31536000, immutable");
    headers.delete("Pragma");
    headers.delete("Expires");
    const blob = await response.blob();
    const cleanResponse = new Response(blob, {
      status: response.status,
      statusText: response.statusText,
      headers
    });
    await cache.put(requestOrUrl, cleanResponse);
  } catch (err) {
    try {
      await cache.put(requestOrUrl, response.clone());
    } catch {}
  }
}

function timeoutPromise(ms) {
  return new Promise((_, reject) => setTimeout(() => reject(new Error("Network timeout")), ms));
}

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    (async () => {
      const cache = await caches.open(STATIC_CACHE);
      for (const asset of PRECACHE_ASSETS) {
        try {
          const res = await fetch(asset, { cache: "reload" });
          if (res && res.ok) {
            await putSanitizedResponse(cache, asset, res);
          }
        } catch (err) {
          console.warn("[SW] Precache skipped for:", asset, err.message);
        }
      }

      // Precache core API payloads if network is reachable during install
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
              if (res && res.ok) {
                await putSanitizedResponse(dataCache, url, res);
              }
            } catch {}
          })
        );
      } catch (err) {
        console.warn("[SW] API precache warning:", err);
      }
    })()
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

  if (request.method !== "GET") {
    return;
  }

  // 1. Navigation requests (HTML SPA routes: /spanish/, /spanish/exercises, /spanish/vocabulary, etc.)
  if (request.mode === "navigate" || request.headers.get("accept")?.includes("text/html")) {
    event.respondWith((async () => {
      // If client is explicitly offline, immediately serve cached HTML (fastest)
      if (typeof self.navigator !== "undefined" && self.navigator.onLine === false) {
        const cached = (await caches.match(request)) ||
                       (await caches.match("/spanish/index.html")) ||
                       (await caches.match("/spanish/"));
        if (cached) return cached;
      }

      // If online/transit, race network against a 1200ms timeout to avoid hanging on weak cell signal!
      try {
        const networkResponse = await Promise.race([
          fetch(request),
          timeoutPromise(1200)
        ]);
        if (networkResponse && networkResponse.status === 200) {
          const cache = await caches.open(STATIC_CACHE);
          putSanitizedResponse(cache, request, networkResponse.clone()).catch(() => {});
          return networkResponse;
        }
      } catch {
        // Network failed or timed out (e.g. in transit / bus / tunnel)
      }

      // Fast fallback to cached index.html
      const cached = (await caches.match(request)) ||
                     (await caches.match("/spanish/index.html")) ||
                     (await caches.match("/spanish/")) ||
                     (await caches.match("/spanish/exercises"));
      if (cached) return cached;

      // Ultimate fallback: inline branded HTML (never a blank white screen!)
      return new Response(
        "<!doctype html><html lang='ru'><head><meta charset='utf-8'/><meta name='viewport' content='width=device-width,initial-scale=1'/><title>LinguaLearn Spanish (Офлайн)</title></head><body style='font-family:system-ui;padding:24px;text-align:center;background:#fdf2f8;'><h1 style='color:#9333ea'>LinguaLearn Spanish 🇪🇸</h1><p style='color:#6b7280;'>Для первой загрузки требуется подключение к интернету.</p><button onclick='location.reload()' style='margin-top:16px;padding:10px 20px;border-radius:12px;background:#9333ea;color:#fff;font-weight:bold;border:none;cursor:pointer;'>Перезагрузить 🔄</button></body></html>",
        { headers: { "Content-Type": "text/html; charset=utf-8" } }
      );
    })());
    return;
  }

  // 2. Vocabulary & Data API requests (/spanish/api/ or /api/)
  if (url.pathname.startsWith("/spanish/api/") || url.pathname.startsWith("/api/")) {
    event.respondWith((async () => {
      // If offline, check data cache first
      if (typeof self.navigator !== "undefined" && self.navigator.onLine === false) {
        const cached = await caches.match(request);
        if (cached) return cached;
      }

      try {
        const networkResponse = await Promise.race([
          fetch(request),
          timeoutPromise(1500)
        ]);
        if (networkResponse && networkResponse.status === 200) {
          const cache = await caches.open(DATA_CACHE);
          putSanitizedResponse(cache, request, networkResponse.clone()).catch(() => {});
          return networkResponse;
        }
      } catch {}

      const cached = await caches.match(request);
      if (cached) return cached;

      return new Response(
        JSON.stringify({ offline: true, error: "Offline network mode" }),
        { headers: { "Content-Type": "application/json" }, status: 503 }
      );
    })());
    return;
  }

  // 3. Static assets: JS, CSS, Images, Fonts (Cache-First with fuzzy fallback)
  event.respondWith((async () => {
    // A. Direct exact match in caches
    const cached = await caches.match(request);
    if (cached) {
      return cached;
    }

    // B. Match with ignoreSearch
    const fuzzy = await caches.match(request, { ignoreSearch: true });
    if (fuzzy) {
      return fuzzy;
    }

    // C. FUZZY MATCH FOR MAIN JS / CSS BUNDLES:
    // If request is for /assets/index-*.js, find ANY cached JS bundle in STATIC_CACHE!
    if (url.pathname.includes("/assets/index-") && url.pathname.endsWith(".js")) {
      const staticCache = await caches.open(STATIC_CACHE);
      const keys = await staticCache.keys();
      const jsKey = keys.find(k => k.url.includes("/assets/index-") && k.url.endsWith(".js"));
      if (jsKey) {
        const bundle = await staticCache.match(jsKey);
        if (bundle) {
          console.warn("[SW] Found and served alternate cached JS bundle:", jsKey.url);
          return bundle;
        }
      }
    }

    if (url.pathname.includes("/assets/index-") && url.pathname.endsWith(".css")) {
      const staticCache = await caches.open(STATIC_CACHE);
      const keys = await staticCache.keys();
      const cssKey = keys.find(k => k.url.includes("/assets/index-") && k.url.endsWith(".css"));
      if (cssKey) {
        const bundle = await staticCache.match(cssKey);
        if (bundle) {
          return bundle;
        }
      }
    }

    // D. Fetch from network
    try {
      const networkResponse = await fetch(request);
      if (networkResponse && networkResponse.status === 200) {
        const cache = await caches.open(STATIC_CACHE);
        putSanitizedResponse(cache, request, networkResponse.clone()).catch(() => {});
      }
      return networkResponse;
    } catch (err) {
      // Check again across all caches ignoring search
      const anyCached = await caches.match(request, { ignoreSearch: true });
      if (anyCached) return anyCached;

      // Never return silent empty scripts!
      return new Response("Offline asset unavailable", { status: 503 });
    }
  })());
});
