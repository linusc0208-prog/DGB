// ParkRadar Service Worker: App-Shell-Cache, Web-Push, Klick auf Benachrichtigungen
const VERSION = 'pr-v2.1.0';
const SHELL = [
  '/',
  '/css/app.css',
  '/js/main.js', '/js/sb.js', '/js/ui.js', '/js/store.js', '/js/geo.js', '/js/geocode.js', '/js/map.js', '/js/actions.js',
  '/js/theme.js', '/js/push.js', '/js/realtime.js',
  '/js/views/auth.js', '/js/views/report.js', '/js/views/car.js', '/js/views/profile.js',
  '/js/views/onboarding.js', '/js/views/alerts.js', '/js/views/legal.js',
  '/vendor/leaflet/leaflet.css', '/vendor/leaflet/leaflet.js', '/vendor/supabase.js',
  '/vendor/maplibre/maplibre-gl.css', '/vendor/maplibre/maplibre-gl.js', '/vendor/maplibre/maplibre-gl-worker.js', '/vendor/maplibre/leaflet-maplibre-gl.js',
  '/icons/logo.svg', '/icons/icon-192.png', '/manifest.webmanifest',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  // Zugangsdaten (config.js) immer frisch laden, fremde Server (Supabase, Karte) nicht anfassen
  if (req.method !== 'GET' || url.origin !== location.origin || url.pathname === '/config.js') return;

  // Seitenaufrufe: Netzwerk zuerst, offline die gecachte Shell
  if (req.mode === 'navigate') {
    event.respondWith(fetch(req).catch(() => caches.match('/')));
    return;
  }
  // Statische Dateien: stale-while-revalidate
  event.respondWith(
    caches.open(VERSION).then(async (cache) => {
      const cached = await cache.match(req);
      const network = fetch(req).then((res) => {
        if (res.ok) cache.put(req, res.clone());
        return res;
      }).catch(() => cached);
      return cached || network;
    }),
  );
});

self.addEventListener('push', (event) => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; } catch { payload = { title: 'ParkRadar', body: event.data?.text() }; }
  event.waitUntil((async () => {
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const visible = clients.find((c) => c.visibilityState === 'visible' && c.focused);
    if (visible) {
      // App ist offen: dort anzeigen statt System-Benachrichtigung
      visible.postMessage({ type: 'push', payload });
      return;
    }
    await self.registration.showNotification(payload.title || 'ParkRadar', {
      body: payload.body || '',
      tag: payload.tag,
      renotify: true,
      icon: '/icons/icon-192.png',
      badge: '/icons/badge-72.png',
      vibrate: [250, 120, 250],
      data: { url: payload.url || '/' },
    });
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  let url = event.notification.data?.url || '/';
  event.waitUntil((async () => {
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of clients) {
      if ('focus' in c) {
        await c.navigate(url).catch(() => {});
        return c.focus();
      }
    }
    return self.clients.openWindow(url);
  })());
});
