// Service Worker for Bank Community App

// Cache ka naam aur version. Jab bhi aap app mein bade badlav karein,
// version badal dein (e.g., 'v2', 'v3'), taaki purana cache delete ho jaye.
const CACHE_NAME = 'bank-community-cache-v1';

// Vo files jo app install hote hi cache ho jayengi.
// Apne project ke sabhi zaroori pages aur assets yahan daalein.
const urlsToCache = [
  '/',
  '/index.html',
  '/loan_form.html',
  '/joining_later.html',
  '/view.html',
  '/loan_dashbord.html',
  '/manifest.json',
  'https://i.ibb.co/0Vnz4qPn/20250714-183208.png' // Favicon
  // Aap yahan aur zaroori CSS, JS, ya image files daal sakte hain.
];

// 1. Install event: Jab service worker install hota hai
self.addEventListener('install', event => {
  console.log('Service Worker: Installing...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Service Worker: Caching app shell');
        return cache.addAll(urlsToCache);
      })
      .then(() => self.skipWaiting()) // Naye service worker ko turant activate karein
  );
});

// 2. Activate event: Jab service worker activate hota hai
self.addEventListener('activate', event => {
  console.log('Service Worker: Activating...');
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cache => {
          // Agar cache ka naam purana hai, to use delete kar dein
          if (cache !== CACHE_NAME) {
            console.log('Service Worker: Clearing old cache', cache);
            return caches.delete(cache);
          }
        })
      );
    }).then(() => self.clients.claim()) // Sabhi open tabs ko control karein
  );
});

// 3. Fetch event: Jab app koi file request karta hai (Stale-While-Revalidate strategy)
self.addEventListener('fetch', event => {
  // HTML pages ke liye Network-First strategy, taaki hamesha latest content mile
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() => caches.match(event.request))
    );
    return;
  }

  // Baaki sabhi requests (CSS, JS, images) ke liye Stale-While-Revalidate
  event.respondWith(
    caches.match(event.request)
      .then(cachedResponse => {
        // Agar file cache mein hai, to use turant dikhayein
        if (cachedResponse) {
          // Background mein network se fresh file fetch karein
          fetch(event.request).then(networkResponse => {
            caches.open(CACHE_NAME).then(cache => {
              cache.put(event.request, networkResponse);
            });
          });
          return cachedResponse;
        }
        // Agar file cache mein nahi hai, to network se fetch karein
        return fetch(event.request).then(networkResponse => {
          return caches.open(CACHE_NAME).then(cache => {
            // Aur future ke liye cache mein save kar lein
            cache.put(event.request, networkResponse.clone());
            return networkResponse;
          });
        });
      })
  );
});

