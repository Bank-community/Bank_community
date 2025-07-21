 Cache ka naya, aur zyada robust version
const CACHE_NAME = 'bank-community-cache-v15-final'; // Version badha diya hai

// Zaroori files jinko install ke time cache karna hai
const APP_SHELL_URLS = [
  '/',
  '/index.html',
  '/login.html',
  '/manifest.json',
  '/favicon.ico'
];

// 1. Install Event: Naya cache banata hai aur app shell files add karta hai
self.addEventListener('install', event => {
  console.log('[Service Worker] Install');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[Service Worker] Caching App Shell');
        return cache.addAll(APP_SHELL_URLS);
      })
      .then(() => self.skipWaiting()) // Naye service worker ko turant activate karein
  );
});

// 2. Activate Event: Purane saare cache delete karta hai
self.addEventListener('activate', event => {
  console.log('[Service Worker] Activate');
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('[Service Worker] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      console.log('[Service Worker] Claiming clients');
      return self.clients.claim(); // Saare open tabs ko control karein
    })
  );
});

// 3. Fetch Event: Requests ko handle karta hai
self.addEventListener('fetch', event => {
  const { request } = event;

  // API calls ya doosre domains ki request ko hamesha network se fetch karein
  if (request.url.includes('/api/') || new URL(request.url).origin !== self.location.origin) {
    event.respondWith(fetch(request));
    return;
  }

  // HTML pages (Navigation) ke liye: Network-First strategy
  // Pehle network se fetch karo, agar fail ho to cache se do. Isse hamesha latest page milega.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .catch(() => {
          // Network fail hone par cache se fallback
          return caches.match(request);
        })
    );
    return;
  }

  // Baaki sab files (CSS, JS, Images) ke liye: Stale-While-Revalidate strategy
  // Pehle cache se response do (taaki app fast lage), fir background me network se update karo.
  event.respondWith(
    caches.open(CACHE_NAME).then(cache => {
      return cache.match(request).then(response => {
        const fetchPromise = fetch(request).then(networkResponse => {
          cache.put(request, networkResponse.clone());
          return networkResponse;
        });
        // Cache se return karo agar available hai, warna network ka wait karo
        return response || fetchPromise;
      });
    })
  );
});

