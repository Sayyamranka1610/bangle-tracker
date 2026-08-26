// Siddhi Bangle Tracker — Service Worker
// Provides offline support + faster repeat loads by caching the app shell.
// Firebase data is fetched live (not cached) so cross-device sync still works.

const CACHE_NAME = 'bangle-tracker-v195';
const APP_SHELL = [
  './bangle_v19',     // the REAL URL the browser actually requests — Cloudflare
                       // redirects "bangle_v19.html" here, so caching that literal
                       // name (as this used to) never matched a real navigation
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

// Lets the page ask which build this worker is, so it can tell whether the
// copy it is running is already out of date and reload itself.
self.addEventListener('message', (event) => {
  // A freshly installed worker can sit in 'waiting' even with skipWaiting()
  // in install. The page asks for it explicitly so an update is never stuck.
  if (event.data === 'BT_SKIP_WAITING') { self.skipWaiting(); return; }
  if (event.data === 'BT_WHICH_VERSION' && event.source) {
    event.source.postMessage({ btVersion: CACHE_NAME });
  }
});

// Fetch strategy:
// - Firebase RTDB calls → network only (live data, never cache)
// - R2 image URLs → cache-first (images never change once uploaded)
// - bangle_v19.html → STALE-WHILE-REVALIDATE: serve the cached copy instantly
//   (this used to be network-first, meaning every single open re-downloaded the
//   whole ~1MB app file before anything else could even start — a big chunk of
//   the "slow loading" complaints). A fresh copy is still fetched in the
//   background on every load and cached for NEXT time, so updates still reach
//   everyone automatically within one open/close cycle — just never blocking
//   the one you're doing right now.
// - CDN assets (fonts, xlsx) → cache-first (they never change)
// - Everything else → network with cache fallback
self.addEventListener('fetch', (event) => {
  const url = event.request.url;
  if (url.includes('firebaseio.com')) return;  // Firebase: always live
  if (url.includes('r2.dev')) return;           // R2 images: handled by browser cache
  if (event.request.method !== 'GET') return;

  // Main HTML file — serve cache instantly if we have it, refresh in the background.
  // Matches "bangle_v19" with or without ".html" — Cloudflare redirects the .html
  // URL to the extensionless one, so the real navigation request never contains
  // ".html" at all. This substring check was the actual bug in the previous fix.
  const isMainHtml = url.includes('bangle_v19') || url.endsWith('/') || url.endsWith('/index.html');
  if (isMainHtml) {
    // Start the network revalidation IMMEDIATELY and hand it to waitUntil().
    //
    // This used to kick off the background fetch inside respondWith's own
    // promise chain and never call waitUntil() on it. The moment respondWith
    // resolved with the cached copy, the browser was free to shut this service
    // worker down — killing the in-flight ~1 MB fetch and/or the cache.put
    // before the fresh copy was ever stored. Net effect: the "background
    // update" frequently never happened at all, so a device could keep serving
    // a months-old build of the app forever and the only way out was manually
    // clearing site data. Every deploy silently failing to reach devices is a
    // far worse bug than the slow loads this cache was added to fix.
    //
    // waitUntil() keeps the worker alive until the new copy is actually
    // written, so the next open genuinely gets the new version.
    const network = fetch(event.request).then(response => {
      if (!response.ok) return response;
      const copy = response.clone();
      return caches.open(CACHE_NAME)
        .then(cache => cache.put(event.request, copy))
        .then(() => response);
    });
    event.waitUntil(network.catch(() => {})); // never let a failed refresh reject the event
    event.respondWith(
      caches.match(event.request).then(cached =>
        cached || network // instant if cached; first-ever load still waits on network
      ).catch(() => network)
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
