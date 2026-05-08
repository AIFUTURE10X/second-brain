// Service worker for Second Brain — read-only offline support.
// Strategy:
//   GET /api/items (and /api/categories) → stale-while-revalidate
//   Navigation (HTML)                    → network-first, cache fallback
//   Static assets (icons, manifest)      → cache-first
//   Everything else                      → pass through (no caching)

const CACHE_VERSION = "sb-v3";
const DATA_CACHE = `${CACHE_VERSION}-data`;
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const PAGE_CACHE = `${CACHE_VERSION}-pages`;

const STATIC_ASSETS = ["/manifest.json", "/icon-192.png", "/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(STATIC_ASSETS)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => !k.startsWith(CACHE_VERSION))
          .map((k) => caches.delete(k))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type !== "CLEAR_RUNTIME_CACHES") return;
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys
        .filter((key) => key.startsWith("sb-"))
        .map((key) => caches.delete(key))
    ))
  );
});

function isCacheableApi(url) {
  if (url.origin !== self.location.origin) return false;
  return (
    url.pathname === "/api/items" ||
    url.pathname === "/api/categories"
  );
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return; // pass through — writes always hit network

  const url = new URL(req.url);

  if (req.cache === "reload" || req.cache === "no-store") return;

  // Stale-while-revalidate for read-only API data
  if (isCacheableApi(url)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(DATA_CACHE);
        const cached = await cache.match(req);
        const networkPromise = fetch(req)
          .then((res) => {
            if (res && res.ok) cache.put(req, res.clone()).catch(() => {});
            return res;
          })
          .catch(() => null);
        if (cached) return cached;
        const fresh = await networkPromise;
        return fresh || new Response("[]", { status: 200, headers: { "Content-Type": "application/json" } });
      })()
    );
    return;
  }

  // Network-first for HTML navigation
  if (req.mode === "navigate" || req.headers.get("accept")?.includes("text/html")) {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(req);
          const cache = await caches.open(PAGE_CACHE);
          cache.put(req, fresh.clone()).catch(() => {});
          return fresh;
        } catch {
          const cache = await caches.open(PAGE_CACHE);
          const cached = await cache.match(req);
          if (cached) return cached;
          // Last resort: return the cached root
          return (await cache.match("/")) || Response.error();
        }
      })()
    );
    return;
  }

  // Cache-first for static assets in the manifest
  if (STATIC_ASSETS.includes(url.pathname)) {
    event.respondWith(
      caches.match(req).then((cached) => cached || fetch(req))
    );
    return;
  }

  // Default: pass through
});
