// Offline support. build.js fills in the versioned asset list and cache name.
const CACHE = 'op3bld-__BUILD__';
const SHELL = ['./', 'fridrich', 'cfop', 'principiante', 'plan', '2x2', '4x4', 'pyraminx', 'square-1', 'manifest.webmanifest', 'fridrich.webmanifest', 'cfop.webmanifest', 'principiante.webmanifest', 'plan.webmanifest', '2x2.webmanifest', '4x4.webmanifest', 'pyraminx.webmanifest', 'square-1.webmanifest', 'icon-192.png', 'icon-512.png', 'cubejs/cube.js', 'cubejs/solve.js', 'vendor/gan-web-bluetooth-3.0.2.js', __ASSETS__];
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
    // Only the app's pages are kept for offline use; others (the stream overlay) go to the network.
    const named = url.pathname.match(/\/(fridrich|cfop|principiante|plan|2x2|4x4|pyraminx|square-1)(\.html)?$/);
    const page = url.origin !== self.location.origin ? null
      : /\/(index\.html)?$/.test(url.pathname) ? './' : named ? named[1] : null;
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
