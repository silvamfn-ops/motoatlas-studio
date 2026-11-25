const STUDIO_CACHE = 'motoatlas-studio-v6.1-cache';
const STUDIO_ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './kmz-importer.js',
  './manifest.json'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(STUDIO_CACHE).then(cache => cache.addAll(STUDIO_ASSETS)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== STUDIO_CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    fetch(event.request)
      .then(resp => {
        const clone = resp.clone();
        caches.open(STUDIO_CACHE).then(cache => cache.put(event.request, clone));
        return resp;
      })
      .catch(() => caches.match(event.request))
  );
});
