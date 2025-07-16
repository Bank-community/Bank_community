// --- NEW AND IMPROVED SERVICE WORKER ---

// Step 1: Define a new, unique cache name. Every time you make a big change, change this name (e.g., v3, v4).
const CACHE_NAME = 'bank-community-cache-v3';

const urlsToCache = [
  '/',
  '/index.html',
  '/login.html',
  '/manifest.json',
  'https://unpkg.com/feather-icons',
  'https://cdn.jsdelivr.net/npm/chart.js'
];

// Step 2: Install the new service worker and cache new assets.
self.addEventListener('install', event => {
  console.log('Service Worker: Installing...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Service Worker: Caching app shell');
        return cache.addAll(urlsToCache);
      })
      .then(() => {
        // Force the new service worker to become active immediately.
        return self.skipWaiting();
      })
  );
});

// Step 3: Activate the new service worker and delete all old caches.
// This is the most important part for solving your problem.
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
    }).then(() => {
        // Take control of all open pages.
        return self.clients.claim();
    })
  );
});

// Step 4: Serve assets from cache first, then network.
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Return cached response if found, otherwise fetch from network.
        return response || fetch(event.request);
      })
  );
});

