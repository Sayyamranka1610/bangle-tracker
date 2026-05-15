// WorkBoard Service Worker — v2
const CACHE = 'workboard-v2';

// Files to pre-cache on install
const PRECACHE = [
  '/bangle-tracker/workboard.html',
  '/bangle-tracker/workboard-icon-192.png',
  '/bangle-tracker/workboard-icon-512.png',
  '/bangle-tracker/workboard-manifest.json',
];

// CDN assets cached on first use
const CDN_HOSTS = [
  'fonts.googleapis.com',
  'fonts.gstatic.com',
  'cdn.jsdelivr.net',
];

// ── Install: pre-cache shell ──
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c =>
      Promise.all(PRECACHE.map(url =>
        fetch(url, { cache: 'reload' })
          .then(r => c.put(url, r))
          .catch(() => {}) // don't fail install if one asset is missing
      ))
    ).then(() => self.skipWaiting())
  );
});

// ── Activate: clear old caches ──
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// ── Fetch: network-first for Firebase, cache-first for everything else ──
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Always network for Firebase (real-time data must be fresh)
  if (url.hostname.includes('firebaseio.com') || url.hostname.includes('firebase')) {
    return; // fall through to browser default
  }

  // Network-first for same-origin HTML (get updates when online)
  if (url.pathname.endsWith('.html') && url.origin === self.location.origin) {
    e.respondWith(
      fetch(e.request)
        .then(r => {
          if (r.ok) {
            const clone = r.clone();
            caches.open(CACHE).then(c => c.put(e.request, clone));
          }
          return r;
        })
        .catch(() => caches.match(e.request) || caches.match('/bangle-tracker/workboard.html'))
    );
    return;
  }

  // Cache-first for CDN fonts/scripts (stable, large, rarely change)
  if (CDN_HOSTS.includes(url.hostname)) {
    e.respondWith(
      caches.match(e.request).then(cached => {
        if (cached) return cached;
        return fetch(e.request).then(r => {
          if (r.ok) {
            const clone = r.clone();
            caches.open(CACHE).then(c => c.put(e.request, clone));
          }
          return r;
        });
      })
    );
    return;
  }

  // Default: network with cache fallback
  e.respondWith(
    fetch(e.request).catch(() => caches.match(e.request))
  );
});
