const CACHE_VERSION = "english-pwa-v1-offline";
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const DATA_CACHE = `${CACHE_VERSION}-data`;

const PRECACHE_ASSETS = [
  "/english",
  "/english/",
  "/english/index.html",
  "/english/vocabulary",
  "/english/exercises",
  "/english/curriculum",
  "/english/today"
];

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
          console.warn("[English SW] Precache skipped for:", asset, err.message);
        }
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

  // 1. Navigation requests (HTML SPA routes)
  if (request.mode === "navigate" || request.headers.get("accept")?.includes("text/html")) {
    event.respondWith((async () => {
      const cached = (await caches.match(request)) ||
                     (await caches.match("/english/index.html")) ||
                     (await caches.match("/english/")) ||
                     (await caches.match("/english")) ||
                     (await caches.match("/english/vocabulary"));
      if (cached) {
        if (typeof self.navigator === "undefined" || self.navigator.onLine !== false) {
          fetch(request).then(async (networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              const cache = await caches.open(STATIC_CACHE);
              await putSanitizedResponse(cache, request, networkResponse);
              await putSanitizedResponse(cache, "/english/index.html", networkResponse.clone());
            }
          }).catch(() => {});
        }
        return cached;
      }

      try {
        const networkResponse = await Promise.race([
          fetch(request),
          timeoutPromise(2500)
        ]);
        if (networkResponse && networkResponse.status === 200) {
          const cache = await caches.open(STATIC_CACHE);
          putSanitizedResponse(cache, request, networkResponse.clone()).catch(() => {});
          putSanitizedResponse(cache, "/english/index.html", networkResponse.clone()).catch(() => {});
          return networkResponse;
        }
      } catch (err) {}

      const anyCached = (await caches.match("/english/index.html")) ||
                        (await caches.match("/english/")) ||
                        (await caches.match("/english"));
      if (anyCached) return anyCached;

      return new Response(
        "<!doctype html><html lang='ru'><head><meta charset='utf-8'/><meta name='viewport' content='width=device-width,initial-scale=1'/><title>LinguaLearn English (Офлайн)</title></head><body style='font-family:system-ui;padding:24px;text-align:center;background:#fef3c7;'><h1 style='color:#ca8a04'>LinguaLearn English 🇬🇧</h1><p style='color:#4b5563;'>Для первой загрузки требуется подключение к интернету.</p><button onclick='location.reload()' style='margin-top:16px;padding:10px 20px;border-radius:12px;background:#ca8a04;color:#fff;font-weight:bold;border:none;cursor:pointer;'>Перезагрузить 🔄</button></body></html>",
        { headers: { "Content-Type": "text/html; charset=utf-8" } }
      );
    })());
    return;
  }

  // 2. Data API requests
  if (url.pathname.startsWith("/english/api/") || url.pathname.startsWith("/api/")) {
    event.respondWith((async () => {
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

  // 3. Static assets: JS, CSS, Images, Fonts
  event.respondWith((async () => {
    const cached = await caches.match(request);
    if (cached) return cached;

    const fuzzy = await caches.match(request, { ignoreSearch: true });
    if (fuzzy) return fuzzy;

    // Fuzzy match for Vite bundle hashes
    if (url.pathname.includes("/assets/index-") && url.pathname.endsWith(".js")) {
      const staticCache = await caches.open(STATIC_CACHE);
      const keys = await staticCache.keys();
      const jsKey = keys.find((k) => k.url.includes("/assets/index-") && k.url.endsWith(".js"));
      if (jsKey) {
        const bundle = await staticCache.match(jsKey);
        if (bundle) return bundle;
      }
    }

    if (url.pathname.includes("/assets/index-") && url.pathname.endsWith(".css")) {
      const staticCache = await caches.open(STATIC_CACHE);
      const keys = await staticCache.keys();
      const cssKey = keys.find((k) => k.url.includes("/assets/index-") && k.url.endsWith(".css"));
      if (cssKey) {
        const bundle = await staticCache.match(cssKey);
        if (bundle) return bundle;
      }
    }

    try {
      const networkResponse = await Promise.race([
        fetch(request),
        timeoutPromise(3000)
      ]);
      if (networkResponse && networkResponse.status === 200) {
        const cache = await caches.open(STATIC_CACHE);
        putSanitizedResponse(cache, request, networkResponse.clone()).catch(() => {});
      }
      return networkResponse;
    } catch (err) {
      const anyCached = await caches.match(request, { ignoreSearch: true });
      if (anyCached) return anyCached;
      return new Response("Offline asset unavailable", { status: 503 });
    }
  })());
});
