// Cache ka naya version (V25) - FORCE UPDATE
const CACHE_NAME = 'bank-community-cache-v25-force-update';

const APP_SHELL_URLS = [
  '/',
  '/index.html',
  '/login.html',
  '/admin.html',
  '/manifest-user.json',
  '/user-style.css',
  '/user-main.js', // Isko naya load karega
  '/user-ui.js',
  '/notifications.html'
];

// 1. Install Event
self.addEventListener('install', event => {
  self.skipWaiting(); // Turant naya SW active karein
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL_URLS))
  );
});

// 2. Activate Event (Purana cache saaf karna)
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.map(key => key !== CACHE_NAME ? caches.delete(key) : null)
    )).then(() => self.clients.claim())
  );
});

// 3. Fetch Event
self.addEventListener('fetch', event => {
  // API calls humesha network se lein
  if (event.request.url.includes('/api/') || new URL(event.request.url).origin !== self.location.origin) {
    return; 
  }
  
  // HTML aur JS files ke liye Network First try karein
  if (event.request.headers.get('accept').includes('text/html') || event.request.url.includes('.js')) {
      event.respondWith(
        fetch(event.request)
          .then(res => {
            // Naya version cache me daalo
            const resClone = res.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, resClone));
            return res;
          })
          .catch(() => caches.match(event.request)) // Network fail ho to purana dikhao
      );
      return;
  }

  // Baaki images/css ke liye Cache First
  event.respondWith(
    caches.match(event.request).then(res => res || fetch(event.request))
  );
});

// 4. Push Notification Event
self.addEventListener('push', function(event) {
  console.log('[Service Worker] Push Received.');
  let data = {};
  if (event.data) {
    try { data = event.data.json(); } catch (e) { data = { notification: { body: event.data.text() } }; }
  }

  const title = (data.notification && data.notification.title) || 'Trust Community Fund';
  const options = {
    body: (data.notification && data.notification.body) || 'New Notification',
    icon: 'https://ik.imagekit.io/kdtvm0r78/1000123791_3ZT7JNENn.jpg',
    vibrate: [200, 100, 200],
    data: { url: '/notifications.html' }
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// 5. Click Event
self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || '/notifications.html';
  event.waitUntil(
    clients.matchAll({type: 'window', includeUncontrolled: true}).then(function(clientList) {
      for (let i = 0; i < clientList.length; i++) {
        const client = clientList[i];
        if (client.url.includes(targetUrl) && 'focus' in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow(targetUrl);
    })
  );
});
