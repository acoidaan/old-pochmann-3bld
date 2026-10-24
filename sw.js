// Offline support. build.js fills in the versioned asset list and cache name.
/* global __ASSETS__ */
const CACHE = 'op3bld-__BUILD__';
const SHELL = ['./', 'fridrich', 'principiante', 'manifest.webmanifest', 'fridrich.webmanifest', 'principiante.webmanifest', 'icon-192.png', 'icon-512.png', 'cubejs/cube.js', 'cubejs/solve.js', __ASSETS__];
const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === self.location.origin && url.pathname.startsWith('/api/')) return;
  if (url.origin !== self.location.origin && !FONT_HOSTS.includes(url.hostname)) return;
  if (req.mode === 'navigate') {
    // Only the three pages are kept for offline use; others (the stream overlay) go to the network.
    const page = url.origin !== self.location.origin ? null
      : /\/(index\.html)?$/.test(url.pathname) ? './' : /\/fridrich(\.html)?$/.test(url.pathname) ? 'fridrich'
        : /\/principiante(\.html)?$/.test(url.pathname) ? 'principiante' : null;
    if (!page) return;
    e.respondWith(fetch(req).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(page, copy));
      return res;
    }).catch(() => caches.match(page)));
    return;
  }
  e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => {
    if (res.ok || res.type === 'opaque') {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(req, copy));
    }
    return res;
  })));
});
