const CACHE_NAME = 'dsc-cache-v2';
const ASSETS_TO_CACHE = [
  '/',
  '/static/Game/Style.css',
  '/static/Game/game.js',
  '/static/Game/Achievements.js',
  '/static/Game/Challenges.js',
  '/static/Game/Prestige.js',
  '/static/Game/Comeback.js',
  '/static/Game/Multiplayer.js',
  '/static/manifest.json',
  '/static/icons/icon-192.png',
  '/static/icons/icon-512.png'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS_TO_CACHE)).catch(() => {})
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Network-first: always try to get the freshest file first (important while the game
// is under active development), falling back to cache only when offline.
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  if (!event.request.url.startsWith(self.location.origin)) return;

  event.respondWith(
    fetch(event.request)
      .then((networkResp) => {
        if (networkResp && networkResp.status === 200) {
          const respClone = networkResp.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, respClone));
        }
        return networkResp;
      })
      .catch(() => caches.match(event.request))
  );
});
