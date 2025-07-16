// --- FINAL AND ROBUST SERVICE WORKER ---

const CACHE_NAME = 'bank-community-cache-v4'; // Changed to v4 to force update
const STATIC_ASSETS = [
  // We will cache static assets that don't change often
  '/login.html',
  '/manifest.json',
  'https://unpkg.com/feather-icons',
  'https://cdn.jsdelivr.net/npm/chart.js'
];

// INSTALL: Cache the static assets
self.addEventListener('install', event => {
  console.log('Service Worker: Installing...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Service Worker: Caching static assets');
        return cache.addAll(STATIC_ASSETS);
      })
      .then(() => self.skipWaiting()) // Activate immediately
  );
});

// ACTIVATE: Clean up old caches
self.addEventListener('activate', event => {
  console.log('Service Worker: Activating...');
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('Service Worker: Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim()) // Take control of open pages
  );
});

// FETCH: Handle requests
self.addEventListener('fetch', event => {
  const { request } = event;

  // For HTML pages (like index.html), use Network First strategy.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(response => {
          // If network is available, use it.
          return response;
        })
        .catch(() => {
          // If network fails, serve the cached index.html.
          return caches.match('/index.html');
        })
    );
    return;
  }

  // For other static assets (CSS, JS, images), use Cache First strategy.
  event.respondWith(
    caches.match(request)
      .then(response => {
        return response || fetch(request).then(fetchResponse => {
          // Optionally, cache new static assets as they are requested
          return caches.open(CACHE_NAME).then(cache => {
            cache.put(request, fetchResponse.clone());
            return fetchResponse;
          });
        });
      })
  );
});

