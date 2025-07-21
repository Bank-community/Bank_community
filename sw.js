// Cache ka naya naam aur version
const CACHE_NAME = 'bank-community-cache-v13-appshell';

// Sirf zaroori "App Shell" files jinko cache karna hai
const APP_SHELL_URLS = [
  '/',
  '/index.html',
  '/login.html',
  '/manifest.json',
  '/favicon.ico',
  'https://i.ibb.co/TMQ4X1Tc/1752977035851.jpg', // Padded Main App Icon
  'https://i.imgur.com/TEHsZ32.png',             // Balance Icon
  'https://i.ibb.co/pjB1bQ7J/1752978674430.jpg'  // Naya link yahan set kar diya hai
];

// 1. Install Event: Naya cache banata hai
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Service Worker: Caching App Shell');
        // Network failures ko ignore karein, taki install fail na ho
        return cache.addAll(APP_SHELL_URLS).catch(error => {
          console.warn('Service Worker: Failed to cache some app shell URLs, but continuing.', error);
        });
      })
  );
});

// 2. Activate Event: Purana cache delete karta hai
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          // Agar cache ka naam naye CACHE_NAME se alag hai, to use delete kar do
          if (cacheName !== CACHE_NAME) {
            console.log('Service Worker: Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// 3. Fetch Event: Page ko kaise load karna hai, yeh batata hai
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Firebase ya doosre server ke data ko hamesha internet se lao
  if (url.hostname !== self.location.hostname || url.pathname.startsWith('/api/')) {
    event.respondWith(fetch(request));
    return;
  }
  
  // HTML pages ke liye: Network-First strategy
  // Pehle network se fetch karo, agar fail ho to cache se do.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => {
        return caches.match(request);
      })
    );
    return;
  }

  // Baaki sab files (CSS, JS, Images) ke liye: Cache-First strategy
  // Pehle cache me dekho, agar nahi hai to network se lao.
  event.respondWith(
    caches.match(request).then(cachedResponse => {
      return cachedResponse || fetch(request).then(networkResponse => {
        // Response ko cache me bhi daal do future ke liye
        return caches.open(CACHE_NAME).then(cache => {
          cache.put(request, networkResponse.clone());
          return networkResponse;
        });
      });
    })
  );
});

