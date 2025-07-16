// A simple, basic service worker for caching assets.

const CACHE_NAME = 'bank-community-cache-v1';
const urlsToCache = [
  '/',
  '/index.html',
  '/login.html',
  'https://unpkg.com/feather-icons',
  'https://cdn.jsdelivr.net/npm/chart.js'
  // Add other important assets here if needed
];

self.addEventListener('install', event => {
  // Perform install steps
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Opened cache');
        return cache.addAll(urlsToCache);
      })
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Cache hit - return response
        if (response) {
          return response;
        }
        return fetch(event.request);
      }
    )
  );
});

