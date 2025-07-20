// Cache ka naya naam aur version
const CACHE_NAME = 'bank-community-cache-v11-appshel​​l';

// Sirf zaroori "App Shell" files jinko cache karna hai
// Inka size bahut kam hota hai
const APP_SHELL_URLS = [
  '/',
  '/index.html',
  '/login.html',
  '/manifest.json',
  '/favicon.ico',
  'https://i.ibb.co/pjB1bQ7J/1752978674430.jpg', // Naya Padded Main App Icon
  'https://i.imgur.com/TEHsZ32.png' // Balance Icon
];

// 1. Install Event: Service Worker ko install karna aur App Shell ko cache karna
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Service Worker: Caching App Shell');
        // Network errors ko handle karne ke liye individual requests
        const promises = APP_SHELL_URLS.map(url => {
            return fetch(url, { mode: 'no-cors' }).then(response => {
                if (response.ok) {
                    return cache.put(url, response);
                }
                console.warn('Failed to cache:', url);
                return Promise.resolve();
            }).catch(err => {
                console.error('Failed to fetch and cache:', url, err);
            });
        });
        return Promise.all(promises);
      })
  );
});

// 2. Activate Event: Purane cache ko hatana
self.addEventListener('activate', event => {
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
    })
  );
  return self.clients.claim();
});

// 3. Fetch Event: Smartly handle karna
self.addEventListener('fetch', event => {
  const requestUrl = new URL(event.request.url);

  // Agar request Firebase ya dusre external domains ke liye hai,
  // to hamesha network se fetch karo aur cache mat karo.
  if (requestUrl.hostname !== self.location.hostname || requestUrl.pathname.startsWith('/api/')) {
    event.respondWith(fetch(event.request));
    return;
  }

  // Agar request App Shell ki file ke liye hai,
  // to pehle cache mein dekho, fir network par jao.
  event.respondWith(
    caches.match(event.request).then(cachedResponse => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(event.request);
    })
  );
});

