// Service worker for Second Brain — read-only offline support.
// Strategy:
//   GET /api/items (and /api/categories) → stale-while-revalidate
//   Navigation (HTML)                    → network-first, cache fallback
//   Static assets (icons, manifest)      → cache-first
//   Everything else                      → pass through (no caching)

const CACHE_VERSION = "sb-v5";
const DATA_CACHE = `${CACHE_VERSION}-data`;
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const PAGE_CACHE = `${CACHE_VERSION}-pages`;
const SHARE_TARGET_CACHE = "sb-share-target";
const SHARE_TARGET_METADATA_URL = "/__share-target/metadata.json";

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
          .filter((k) => !k.startsWith(CACHE_VERSION) && k !== SHARE_TARGET_CACHE)
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

function shareFormValue(form, name) {
  const value = form.get(name);
  return typeof value === "string" ? value : "";
}

function isShareFile(value) {
  return typeof File !== "undefined" && value instanceof File && value.size > 0;
}

async function clearShareTargetCache(cache) {
  const keys = await cache.keys();
  await Promise.all(keys.map((key) => cache.delete(key)));
}

async function handleShareTargetPost(req) {
  try {
    const form = await req.formData();
    const cache = await caches.open(SHARE_TARGET_CACHE);
    const shareId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const files = form.getAll("files").filter(isShareFile);
    const storedFiles = [];

    await clearShareTargetCache(cache);

    for (const [index, file] of files.entries()) {
      const cachePath = `/__share-target/${shareId}/${index}`;
      const cacheUrl = new URL(cachePath, self.location.origin).toString();
      const contentType = file.type || "application/octet-stream";

      await cache.put(cacheUrl, new Response(file, {
        headers: { "Content-Type": contentType },
      }));
      storedFiles.push({
        cacheUrl,
        name: file.name || `shared-image-${index + 1}`,
        contentType,
        size: file.size,
      });
    }

    const metadataUrl = new URL(SHARE_TARGET_METADATA_URL, self.location.origin).toString();
    await cache.put(metadataUrl, new Response(JSON.stringify({
      title: shareFormValue(form, "title"),
      text: shareFormValue(form, "text"),
      url: shareFormValue(form, "url"),
      files: storedFiles,
      createdAt: new Date().toISOString(),
    }), {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      },
    }));

    return Response.redirect(new URL("/share?source=android-share", self.location.origin).toString(), 303);
  } catch {
    return Response.redirect(new URL("/share?source=android-share&error=1", self.location.origin).toString(), 303);
  }
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  if (req.method === "POST" && url.origin === self.location.origin && url.pathname === "/share") {
    event.respondWith(handleShareTargetPost(req));
    return;
  }

  if (req.method !== "GET") return; // pass through — writes always hit network

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
