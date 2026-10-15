// Service worker: lets Yalla open offline after the first visit.
// Same-origin files go network-first (so updates show up), with the cache as the offline fallback.
// Map tiles, fonts and other sites are never cached here.
const CACHE = 'yalla-shell-v2';
const SHELL = [
  './', 'index.html', 'styles.css', 'app.js', 'cloud.js', 'config.js', 'logo.svg', 'manifest.webmanifest', 'privacy.html', 'terms.html',
  'vendor/leaflet.js', 'vendor/leaflet.css', 'vendor/maplibre-gl.js', 'vendor/maplibre-gl.css', 'vendor/leaflet-maplibre-gl.js', 'vendor/supabase.js',
  'icons/icon-192.png', 'icons/apple-touch-icon.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const r = e.request;
  if (r.method !== 'GET' || new URL(r.url).origin !== self.location.origin) return;
  e.respondWith(
    fetch(r)
      .then(res => { const copy = res.clone(); caches.open(CACHE).then(c => c.put(r, copy)); return res; })
      .catch(() => caches.match(r).then(hit => hit || caches.match('index.html'))),
  );
});
