// Lets the app open with no signal (on a phone, in a lift, in the car park). The page is always fetched
// from the network first, so a new version published on GitHub lands straight away. The cache is only
// the fallback. Anything under /api/ (the baby's entries, settings, calendar, photos) is never cached
// here: the app keeps its own copy of the entries and sends anything new when the signal is back.
const CACHE = 'nursery-shell-v1';

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE)
    .then((c) => c.addAll(['./', './manifest.json', './icon-192.png', './icon-180.png']))
    .catch(() => {})
    .then(() => self.skipWaiting()));
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
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/') || url.pathname.startsWith('/.netlify/')) return;
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res && res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {}); }
        return res;
      })
      .catch(() => caches.match(req).then((hit) => hit || caches.match('./')))
  );
});
