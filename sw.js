// Cache ka naya naam aur version
const CACHE_NAME = 'bank-community-cache-v12-appshel​​l';

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
        return cache.addAll(APP_SHELL_URLS);
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
    })
  );
  return self.clients.claim();
});

// 3. Fetch Event: Page ko kaise load karna hai, yeh batata hai
self.addEventListener('fetch', event => {
  const requestUrl = new URL(event.request.url);

  // Firebase ya doosre server ke data ko hamesha internet se lao
  if (requestUrl.hostname !== self.location.hostname || requestUrl.pathname.startsWith('/api/')) {
    event.respondWith(fetch(event.request));
    return;
  }

  // App ki zaroori files ko pehle cache se, fir internet se lao
  event.respondWith(
    caches.match(event.request).then(cachedResponse => {
      return cachedResponse || fetch(event.request);
    })
  );
});

