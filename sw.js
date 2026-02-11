// sw.js (FAIL-SAFE VERSION v30)
const CACHE_NAME = 'bank-community-cache-v30-failsafe';

// Hum sirf wohi files cache karenge jo 100% hoti hain
const APP_SHELL_URLS = [
  '/',
  '/index.html',
  '/user-main.js',
  '/user-style.css',
  '/manifest-user.json'
];

// 1. Install Event (CRASH PROOF)
self.addEventListener('install', event => {
  // Turant active ho jao, wait mat karo
  self.skipWaiting();
  
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      // Agar cache fail bhi ho jaye, to bhi SW install ho jayega (Error catch kar liya)
      return cache.addAll(APP_SHELL_URLS).catch(err => {
        console.warn("Cache warning (Ignored):", err);
      });
    })
  );
});

// 2. Activate Event (Claim Clients Immediately)
self.addEventListener('activate', event => {
  event.waitUntil(
    Promise.all([
      self.clients.claim(), // Turant control le lo
      caches.keys().then(keys => Promise.all(
        keys.map(key => key !== CACHE_NAME ? caches.delete(key) : null)
      ))
    ])
  );
});

// 3. Fetch Event
self.addEventListener('fetch', event => {
  if (event.request.url.includes('/api/') || new URL(event.request.url).origin !== self.location.origin) {
    return;
  }
  
  event.respondWith(
    fetch(event.request)
      .then(res => {
        const resClone = res.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, resClone));
        return res;
      })
      .catch(() => caches.match(event.request))
  );
});

// 4. PUSH NOTIFICATION (MAIN LOGIC)
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

// 5. CLICK LOGIC
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
