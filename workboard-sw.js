// WorkBoard Service Worker — v5
// Handles: caching, background notifications, notification taps

const CACHE = 'workboard-v5';
const NS_CACHE = 'wb-notif-state'; // stores logged-in user + seen-task IDs
const FB = 'https://bangle-tracker-default-rtdb.firebaseio.com';

const PRECACHE = [
  '/bangle-tracker/workboard.html',
  '/bangle-tracker/workboard-icon-192.png',
  '/bangle-tracker/workboard-icon-512.png',
  '/bangle-tracker/workboard-manifest.json',
];

const CDN_HOSTS = [
  'fonts.googleapis.com',
  'fonts.gstatic.com',
  'cdn.jsdelivr.net',
  'www.gstatic.com',  // Firebase JS SDK
];

// ── Install ──
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c =>
      Promise.all(PRECACHE.map(url =>
        fetch(url, { cache: 'reload' })
          .then(r => c.put(url, r))
          .catch(() => {})
      ))
    ).then(() => self.skipWaiting())
  );
});

// ── Activate: wipe old caches (keep NS_CACHE), then tell ALL open tabs to reload ──
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE && k !== NS_CACHE).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// ── Fetch ──
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Always bypass cache for Firebase
  if (url.hostname.includes('firebaseio.com') || url.hostname.includes('firebase')) return;

  // Network-first for HTML
  if (url.pathname.endsWith('.html') && url.origin === self.location.origin) {
    e.respondWith(
      fetch(e.request, { cache: 'no-cache' })
        .then(r => {
          if (r.ok) caches.open(CACHE).then(c => c.put(e.request, r.clone()));
          return r;
        })
        .catch(() => caches.match(e.request) || caches.match('/bangle-tracker/workboard.html'))
    );
    return;
  }

  // Cache-first for CDN
  if (CDN_HOSTS.includes(url.hostname)) {
    e.respondWith(
      caches.match(e.request).then(cached => cached || fetch(e.request).then(r => {
        if (r.ok) caches.open(CACHE).then(c => c.put(e.request, r.clone()));
        return r;
      }))
    );
    return;
  }

  // Default: network with cache fallback
  e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
});

// ── Periodic Background Sync (Chrome/Android) ──
self.addEventListener('periodicsync', e => {
  if (e.tag === 'wb-notif-check') {
    e.waitUntil(runBackgroundCheck());
  }
});

// ── Notification click → open / focus the app ──
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const c of list) {
        if (c.url.includes('workboard') && 'focus' in c) return c.focus();
      }
      return self.clients.openWindow('/bangle-tracker/workboard.html');
    })
  );
});

// ════════════════════════════════════════════════
//  BACKGROUND CHECK — runs even when app is closed
// ════════════════════════════════════════════════
async function runBackgroundCheck() {
  try {
    // Load stored login state
    const nsCache = await caches.open(NS_CACHE);
    const stateResp = await nsCache.match('user-state');
    if (!stateResp) return; // nobody logged in on this device
    const state = await stateResp.json();
    if (!state || !state.userId) return;

    // Fetch fresh data from Firebase
    const fbResp = await fetch(`${FB}/wb.json`, { cache: 'no-store' });
    if (!fbResp.ok) return;
    const data = await fbResp.json();
    if (!data || !data.tasks) return;

    const seenTasks = new Set(state.seenTasks || []);
    const notified  = new Set(state.notified  || []);
    const now = Date.now();

    const myTasks = Object.values(data.tasks).filter(t => t.assignedTo === state.userId);

    for (const task of myTasks) {
      // 1️⃣ New task assigned
      const newKey = `new_${task.id}`;
      if (!seenTasks.has(task.id) && !notified.has(newKey)) {
        await showNotif('📋 New Task Assigned',
          `"${task.title}" has been assigned to you`, newKey);
        notified.add(newKey);
      }
      seenTasks.add(task.id); // mark as seen regardless

      if (!task.deadline || task.status === 'completed') continue;
      const left = task.deadline - now;

      // 2️⃣ 30-min warning
      const w30Key = `w30_${task.id}`;
      if (!notified.has(w30Key) && left > 0 && left <= 30 * 60 * 1000) {
        await showNotif('⏰ Deadline in 30 Minutes',
          `"${task.title}" — wrap it up, due very soon!`, w30Key);
        notified.add(w30Key);
      }

      // 3️⃣ Overdue
      const ovKey = `ov_${task.id}`;
      if (!notified.has(ovKey) && left < 0) {
        await showNotif('🚨 Task Overdue',
          `"${task.title}" deadline has passed — open WorkBoard to justify.`, ovKey);
        notified.add(ovKey);
      }
    }

    // Update app-icon badge with overdue task count
    const overdueCount = myTasks.filter(t =>
      t.deadline && t.deadline < now && t.status !== 'completed'
    ).length;
    try {
      if ('setAppBadge' in self.navigator) {
        overdueCount > 0
          ? await self.navigator.setAppBadge(overdueCount)
          : await self.navigator.clearAppBadge();
      }
    } catch (_) {}

    // Persist updated state
    await nsCache.put('user-state', new Response(JSON.stringify({
      userId:    state.userId,
      seenTasks: [...seenTasks].slice(-500),
      notified:  [...notified].slice(-500),
    })));

  } catch (_) { /* fail silently */ }
}

async function showNotif(title, body, tag) {
  return self.registration.showNotification(title, {
    body,
    icon:    '/bangle-tracker/workboard-icon-192.png',
    badge:   '/bangle-tracker/workboard-icon-192.png',
    tag,
    renotify: false,
    data: { url: '/bangle-tracker/workboard.html' },
  });
}
