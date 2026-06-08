// Siddhi Bangle Tracker — Service Worker
// Provides offline support + faster repeat loads by caching the app shell.
// Firebase data is fetched live (not cached) so cross-device sync still works.

const CACHE_NAME = 'bangle-tracker-v70';
const APP_SHELL = [
  './bangle_v19.html',
  './',               // cache index.html (the entry redirect page)
  './bangle-logo.jpg',
  './icon-192.png',
  './icon-512.png',
  './manifest.json',
  'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap'
];

// Install: pre-cache the app shell so it works offline
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL).catch(() => {/* tolerate failures */}))
      .then(() => self.skipWaiting())
  );
});

// Activate: clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// Fetch strategy:
// - Firebase RTDB calls → network only (live data, never cache)
// - App shell (HTML, JS libs, fonts, icons) → stale-while-revalidate:
//     serve from cache immediately for instant loads, update cache in background
// - R2 image URLs → cache-first (images never change once uploaded)
self.addEventListener('fetch', (event) => {
  const url = event.request.url;
  if (url.includes('firebaseio.com')) return;  // Firebase: always live
  if (url.includes('r2.dev')) return;           // R2 images: handled by browser cache
  if (event.request.method !== 'GET') return;

  const isAppShell = url.startsWith(self.location.origin)
    || url.includes('cdnjs.cloudflare.com')
    || url.includes('fonts.googleapis.com')
    || url.includes('fonts.gstatic.com');

  if (isAppShell) {
    // Stale-while-revalidate: serve cache instantly, fetch fresh in background
    event.respondWith(
      caches.open(CACHE_NAME).then(cache =>
        cache.match(event.request).then(cached => {
          const networkFetch = fetch(event.request).then(response => {
            if (response.ok) cache.put(event.request, response.clone());
            return response;
          }).catch(() => cached);
          // Serve cached version immediately if available; otherwise wait for network
          return cached || networkFetch;
        })
      )
    );
  }
});
