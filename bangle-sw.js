// Siddhi Bangle Tracker — Service Worker
// Provides offline support + faster repeat loads by caching the app shell.
// Firebase data is fetched live (not cached) so cross-device sync still works.

const CACHE_NAME = 'bangle-tracker-v91';
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
// - R2 image URLs → cache-first (images never change once uploaded)
// - bangle_v19.html → NETWORK-FIRST: always fetch latest code; fall back to cache only if offline
// - CDN assets (fonts, xlsx) → cache-first (they never change)
// - Everything else → network with cache fallback
self.addEventListener('fetch', (event) => {
  const url = event.request.url;
  if (url.includes('firebaseio.com')) return;  // Firebase: always live
  if (url.includes('r2.dev')) return;           // R2 images: handled by browser cache
  if (event.request.method !== 'GET') return;

  // Main HTML file — always fetch fresh so users never see stale code
  const isMainHtml = url.includes('bangle_v19.html') || url.endsWith('/') || url.endsWith('/index.html');
  if (isMainHtml) {
    event.respondWith(
      fetch(event.request).then(response => {
        if (response.ok) {
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, response.clone()));
        }
        return response;
      }).catch(() => caches.match(event.request)) // offline fallback
    );
    return;
  }

  // CDN assets (fonts, xlsx lib) — cache-first, they never change
  const isCDN = url.includes('cdnjs.cloudflare.com')
    || url.includes('fonts.googleapis.com')
    || url.includes('fonts.gstatic.com');
  if (isCDN) {
    event.respondWith(
      caches.match(event.request).then(cached => cached || fetch(event.request).then(response => {
        if (response.ok) caches.open(CACHE_NAME).then(c => c.put(event.request, response.clone()));
        return response;
      }))
    );
    return;
  }

  // Other same-origin assets (icons, manifest, logo) — network with cache fallback
  if (url.startsWith(self.location.origin)) {
    event.respondWith(
      fetch(event.request).then(response => {
        if (response.ok) caches.open(CACHE_NAME).then(c => c.put(event.request, response.clone()));
        return response;
      }).catch(() => caches.match(event.request))
    );
  }
});
