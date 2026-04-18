// Minimal service worker to satisfy PWA install requirements.
// Uses network-first strategy — no caching to avoid stale content
// since the app is always-online (syncs with Neon DB).

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  // Pass through to the network — no caching.
  // This is the minimum needed for Chrome to register the PWA as installable.
  event.respondWith(fetch(event.request));
});
