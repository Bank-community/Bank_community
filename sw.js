// Cache ka naya version jo dono apps ko support karega
const CACHE_NAME = 'bank-community-cache-v17-multiapp'; 

// Zaroori files jinko install ke time cache karna hai
const APP_SHELL_URLS = [
  '/',
  '/index.html',
  '/login.html',
  '/admin.html', // Admin file ko yahan add karein
  '/manifest-user.json', // User manifest
  '/manifest-admin.json', // Admin manifest
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
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .catch(() => {
          return caches.match(request);
        })
    );
    return;
  }

  // Baaki sab files ke liye: Stale-While-Revalidate strategy
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

// === YAHAN BADLAV KIYA GAYA HAI ===

// 4. Push Event: Jab server se notification aata hai
self.addEventListener('push', event => {
  console.log('[Service Worker] Push Received.');
  // Default data agar push message mein data na ho
  let data = { title: 'Naya Sandesh', body: 'Aapke liye ek update hai.' };
  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      console.error('Push event data parsing error:', e);
    }
  }

  const options = {
    body: data.body,
    icon: 'https://i.ibb.co/pjB1bQ7J/1752978674430.jpg', // App icon
    badge: 'https://i.ibb.co/pjB1bQ7J/1752978674430.jpg', // Chhota icon jo notification bar mein dikhta hai
    vibrate: [200, 100, 200], // Vibration pattern
    data: {
      url: self.location.origin, // Click karne par kaun sa URL khulega
    },
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// 5. Notification Click Event: Jab user notification par click karta hai
self.addEventListener('notificationclick', event => {
  console.log('[Service Worker] Notification click Received.');

  event.notification.close(); // Notification ko band kar do

  event.waitUntil(
    clients.matchAll({
      type: "window",
      includeUncontrolled: true
    }).then(clientList => {
      // Check karo ki app ka koi tab pehle se khula hai ya nahi
      for (const client of clientList) {
        if (new URL(client.url).pathname === '/index.html' && 'focus' in client)
          return client.focus();
      }
      // Agar koi tab khula nahi hai, to naya kholo
      if (clients.openWindow)
        return clients.openWindow(event.notification.data.url || '/');
    })
  );
});
