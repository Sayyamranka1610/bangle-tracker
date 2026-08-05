const CACHE_NAME = 'siddhi-inv-v1';
const APP_SHELL = [
  './index.html',
  './siddhi-inv-manifest.json',
  './siddhi-inv-icon-192.png',
  './siddhi-inv-icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Firebase reads/writes must always hit the network — never cache live data.
  if (url.hostname.indexOf('firebaseio.com') !== -1) return;

  // App shell (this app's own files): network-first, so a fresh deploy is
  // picked up immediately when online, falling back to cache when offline.
  if (url.origin === self.location.origin) {
    event.respondWith(
      fetch(event.request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          return res;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Everything else (Bangle Tracker's images, fonts, etc.): network with cache fallback.
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});
