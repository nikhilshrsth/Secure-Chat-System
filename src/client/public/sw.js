/* Shadow Link service worker
 * - Network-first for /api/* (never cache encrypted API responses)
 * - Cache-first for static assets in /assets/*
 * - Offline fallback to cached index.html for navigations
 *
 * Future: an IndexedDB-backed outbox would let us queue outgoing
 * encrypted messages while offline and flush via a 'sync' event.
 */
const CACHE_VERSION = 'shadowlink-v1';
const PRECACHE_URLS = ['/', '/index.html', '/manifest.webmanifest', '/scslogo.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(PRECACHE_URLS)).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))),
    ).then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Never cache API, socket, or auth traffic — would leak ciphertext.
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/socket.io/')) return;

  // Cache-first for hashed Vite assets.
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.match(request).then((cached) => {
        return (
          cached ||
          fetch(request).then((response) => {
            const copy = response.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy));
            return response;
          })
        );
      }),
    );
    return;
  }

  // Navigation requests: network with offline fallback.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match('/index.html')),
    );
    return;
  }
});
