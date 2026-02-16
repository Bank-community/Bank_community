// sw.js (DATA-ONLY FIX v33)
const CACHE_NAME = 'bank-community-cache-v33-fixed';

const APP_SHELL_URLS = [
  '/',
  '/index.html',
  '/user-main.js',
  '/user-style.css',
  '/manifest-user.json'
];

// 1. Install
self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(APP_SHELL_URLS).catch(err => console.warn(err));
    })
  );
});

// 2. Activate
self.addEventListener('activate', event => {
  event.waitUntil(
    Promise.all([
      self.clients.claim(),
      caches.keys().then(keys => Promise.all(
        keys.map(key => key !== CACHE_NAME ? caches.delete(key) : null)
      ))
    ])
  );
});

// 3. Fetch
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

// 4. PUSH NOTIFICATION (UPDATED LOGIC)
self.addEventListener('push', function(event) {
  console.log('[Service Worker] Push Received.');

  let payload = {};
  if (event.data) {
    try { 
      payload = event.data.json(); 
    } catch (e) { 
      // Agar JSON nahi hai to text maan lo
      payload = { data: { body: event.data.text() } }; 
    }
  }

  // 🔥 IMPORTANT FIX: Data ab seedha 'data' object me hoga
  // API se humne bhej 'data: { title: ... }'
  const data = payload.data || payload; // Fallback

  const title = data.title || 'Trust Community Fund';
  const options = {
    body: data.body || 'New Notification',
    icon: data.icon || 'https://ik.imagekit.io/kdtvm0r78/1000123791_3ZT7JNENn.jpg',
    vibrate: [200, 100, 200],
    data: { url: data.url || '/notifications.html' },
    // Actions button bhi add kar sakte hain
    actions: [
      { action: 'open', title: 'Check Now' }
    ]
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// 5. CLICK LOGIC
self.addEventListener('notificationclick', function(event) {
  event.notification.close();

  const targetUrl = (event.notification.data && event.notification.data.url) || '/notifications.html';

  event.waitUntil(
    clients.matchAll({type: 'window', includeUncontrolled: true}).then(function(clientList) {
      // Agar app khula hai to wahan focus karo
      for (let i = 0; i < clientList.length; i++) {
        const client = clientList[i];
        if (client.url.includes(targetUrl) && 'focus' in client) return client.focus();
      }
      // Agar app band hai to kholo
      if (clients.openWindow) return clients.openWindow(targetUrl);
    })
  );
});
