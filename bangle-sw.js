// Siddhi Bangle Tracker — Service Worker
// Provides offline support + faster repeat loads by caching the app shell.
// Firebase data is fetched live (not cached) so cross-device sync still works.

const CACHE_NAME = 'bangle-tracker-v27';
const APP_SHELL = [
  './bangle_v19.html',
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
// - Firebase RTDB calls (live data) → network only (never cache)
// - Everything else → network-first, falling back to cache when offline
self.addEventListener('fetch', (event) => {
  const url = event.request.url;
  // Never intercept Firebase realtime DB requests — they MUST go live
  if (url.includes('firebaseio.com')) return;
  // Skip non-GET requests
  if (event.request.method !== 'GET') return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Cache successful responses for next time
        if (response.ok && (url.startsWith(self.location.origin) || url.includes('cdnjs') || url.includes('fonts.googleapis'))) {
          const respClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, respClone));
        }
        return response;
      })
      .catch(() => caches.match(event.request).then((cached) => cached || caches.match('./bangle_v19.html')))
  );
});
