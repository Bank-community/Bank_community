// Cache ka naya version (V19 - Background Color Fix)
const CACHE_NAME = 'bank-community-cache-v20-bg-fix'; 

// Zaroori files jinko install ke time cache karna hai
const APP_SHELL_URLS = [
  '/',
  '/index.html',
  '/login.html',
  '/notifications.html', // Important for notifications
  '/user-ui.js',
  '/user-main.js',
  '/user-data.js',
  '/user-style.css',
  '/manifest-user.json',
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

// 2. Activate Event (Clean old cache)
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

  // API calls network se
  if (request.url.includes('/api/') || new URL(request.url).origin !== self.location.origin) {
    event.respondWith(fetch(request));
    return;
  }

  // HTML Navigation - Network First
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match(request))
    );
    return;
  }

  // Assets - Stale While Revalidate
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

// 4. Push Event (Server se agar kabhi future mein bheja jaye)
self.addEventListener('push', event => {
  let data = { title: 'TCF Alert', body: 'New Update Available', url: '/notifications.html' };
  
  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      console.error('Push parse error:', e);
    }
  }

  const options = {
    body: data.body,
    icon: 'https://ik.imagekit.io/kdtvm0r78/IMG-20251202-WA0000.jpg',
    badge: 'https://ik.imagekit.io/kdtvm0r78/IMG-20251202-WA0000.jpg',
    vibrate: [200, 100, 200],
    data: {
      url: data.url || '/notifications.html', // Default to notifications page
    },
    tag: data.tag || 'general-notification'
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// 5. Notification Click Handling (SMART REDIRECT)
self.addEventListener('notificationclick', event => {
  console.log('[Service Worker] Notification click:', event.notification.tag);
  
  event.notification.close();

  // Determine target URL based on Notification Tag
  let targetUrl = '/index.html'; // Default
  const tag = event.notification.tag || '';

  // Agar SIP, Loan ya Transaction ka alert hai to Notifications page khulega
  if (tag.includes('sip') || tag.includes('loan') || tag.includes('tx')) {
      targetUrl = '/notifications.html';
  }

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then(clientList => {
      // 1. Agar tab pehle se khula hai, to use focus karo
      for (const client of clientList) {
        const clientUrl = new URL(client.url);
        if (clientUrl.pathname === targetUrl && 'focus' in client) {
            return client.focus();
        }
      }
      // 2. Agar nahi khula, to naya kholo
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});

