const CACHE_NAME = 'dtt-v2';
const SHELL_ASSETS = [
  // NOTE: We deliberately do NOT cache index.html or '/' — those are network-only
  // so users always get the latest HTML on every visit. Add static assets here as needed.
];

// Install — pre-cache static shell (currently empty; HTML is network-only)
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_ASSETS))
  );
  self.skipWaiting();
});

// Activate — clean up old caches (this also evicts dtt-v1 from yesterday's bug)
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch strategy:
//   - HTML navigations / index.html: network-only (no cache, always fresh)
//   - Other same-origin GETs: network-first, fall back to cache, populate cache on success
self.addEventListener('fetch', (event) => {
  // Skip non-GET and cross-origin requests
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== location.origin) return;

  // Network-only for HTML documents and the root path
  const isHTML = event.request.mode === 'navigate' ||
                 event.request.destination === 'document' ||
                 url.pathname === '/' ||
                 url.pathname.endsWith('.html');
  if (isHTML) {
    event.respondWith(fetch(event.request));
    return;
  }

  // Network-first for everything else (CSS, JS, images, manifest, etc.)
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response && response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
