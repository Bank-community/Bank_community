// Cache ka naya version (V18) taaki changes turant apply hon
const CACHE_NAME = 'bank-community-cache-v18-fixed';

// Zaroori files jinko install ke time cache karna hai
const APP_SHELL_URLS = [
  '/',
  '/index.html',
  '/login.html',
  '/admin.html',
  '/manifest-user.json',
  '/manifest-admin.json',
  '/favicon.ico'
];

// 1. Install Event
self.addEventListener('install', event => {
  console.log('[Service Worker] Install');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[Service Worker] Caching App Shell');
        return cache.addAll(APP_SHELL_URLS);
      })
      .then(() => self.skipWaiting())
  );
});

// 2. Activate Event (Purana cache saaf karna)
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
      return self.clients.claim();
    })
  );
});

// 3. Fetch Event
self.addEventListener('fetch', event => {
  const { request } = event;

  // API calls network se hi lein
  if (request.url.includes('/api/') || new URL(request.url).origin !== self.location.origin) {
    event.respondWith(fetch(request));
    return;
  }

  // HTML pages (Navigation) -> Network First
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match(request))
    );
    return;
  }

  // Other assets -> Stale-While-Revalidate
  event.respondWith(
    caches.open(CACHE_NAME).then(cache => {
      return cache.match(request).then(response => {
        const fetchPromise = fetch(request).then(networkResponse => {
          cache.put(request, networkResponse.clone());
          return networkResponse;
        });
        return response || fetchPromise;
      });
    })
  );
});

// === NOTIFICATION LOGIC UPDATED ===

// 4. Push Event (Firebase & Custom Server Support)
self.addEventListener('push', event => {
  console.log('[Service Worker] Push Received.');

  let title = 'TCF Update';
  let options = {
    body: 'Aapke liye naya sandesh hai.',
    icon: 'https://ik.imagekit.io/kdtvm0r78/20251213_220656.png', // High Quality Icon
    badge: 'https://ik.imagekit.io/kdtvm0r78/20251213_220656.png',
    vibrate: [200, 100, 200],
    data: { url: '/' } // Default URL
  };

  if (event.data) {
    try {
      const payload = event.data.json();
      console.log('Push Data:', payload);

      // Scenario A: Firebase Console se aaya message (notification object hota hai)
      if (payload.notification) {
        title = payload.notification.title || title;
        options.body = payload.notification.body || options.body;
        // Firebase aksar click_action URL bhejta hai
        if (payload.fcmOptions && payload.fcmOptions.link) {
            options.data.url = payload.fcmOptions.link;
        }
      } 
      // Scenario B: Custom Backend se aaya message (direct data object)
      else {
        title = payload.title || title;
        options.body = payload.body || options.body;
        if (payload.url) options.data.url = payload.url;
      }
      
    } catch (e) {
      console.error('Push parsing error:', e);
      // Fallback text agar JSON parse na ho paye
      options.body = event.data.text(); 
    }
  }

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

// 5. Notification Click Event (Smart Navigation)
self.addEventListener('notificationclick', event => {
  console.log('[Service Worker] Notification Clicked.');
  event.notification.close();

  const targetUrl = event.notification.data.url || '/';

  event.waitUntil(
    clients.matchAll({
      type: "window",
      includeUncontrolled: true
    }).then(clientList => {
      // 1. Check karo agar app pehle se khula hai (Admin ya User)
      for (const client of clientList) {
        const clientUrl = new URL(client.url);
        // Agar same origin par hai (yani app khula hai), toh focus karo
        if (clientUrl.origin === self.location.origin && 'focus' in client) {
          // Agar user chahe toh hum URL navigate bhi kar sakte hain, par focus safest hai
          return client.focus();
        }
      }
      // 2. Agar app band hai, toh naya window kholo
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
