// Cache version V22 (Version badha diya taki turant update ho)
const CACHE_NAME = 'bank-community-cache-v22-push-fixed';

const APP_SHELL_URLS = [
  '/',
  '/index.html',
  '/login.html',
  '/admin.html',
  '/manifest-user.json',
  '/favicon.ico',
  '/user-style.css',
  '/user-main.js',
  '/notifications.html'
];

// 1. Install Event
self.addEventListener('install', event => {
  self.skipWaiting(); // Turant naya SW active karein
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL_URLS))
  );
});

// 2. Activate Event
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.map(key => key !== CACHE_NAME ? caches.delete(key) : null)
    )).then(() => self.clients.claim())
  );
});

// 3. Fetch Event
self.addEventListener('fetch', event => {
  if (event.request.url.includes('/api/') || new URL(event.request.url).origin !== self.location.origin) {
    return; 
  }
  event.respondWith(
    caches.match(event.request).then(res => res || fetch(event.request))
  );
});

// ==========================================
// 🚀 BACKGROUND NOTIFICATION LOGIC (MAIN)
// ==========================================

self.addEventListener('push', function(event) {
  console.log('[Service Worker] Push Received.');

  let data = {};
  
  if (event.data) {
    try {
      // Firebase JSON data parse karein
      data = event.data.json();
    } catch (e) {
      console.log('Push data text:', event.data.text());
      data = { notification: { title: 'New Message', body: event.data.text() } };
    }
  }

  // Title aur Body set karein (Priority: Notification Payload > Data Payload)
  const title = (data.notification && data.notification.title) || (data.data && data.data.title) || 'Trust Community Fund';
  const body = (data.notification && data.notification.body) || (data.data && data.data.body) || 'New update available.';
  const image = (data.notification && data.notification.image) || (data.data && data.data.image) || null;
  
  // URL logic: Agar Firebase Console se "click_action" aaye ya data me "url" ho
  const targetUrl = (data.data && data.data.click_action) || (data.data && data.data.url) || '/notifications.html';

  const options = {
    body: body,
    icon: 'https://ik.imagekit.io/kdtvm0r78/1000123791_3ZT7JNENn.jpg', // App Icon
    badge: 'https://ik.imagekit.io/kdtvm0r78/IMG-20251202-WA0000.jpg', // Small Notification Bar Icon
    vibrate: [200, 100, 200],
    image: image, // Agar koi badi image bheji gayi ho
    data: {
      url: targetUrl
    },
    actions: [
      {action: 'open_url', title: 'View Details'}
    ]
  };

  // Browser ko notification dikhane ke liye force karein
  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

// ==========================================
// 👆 NOTIFICATION CLICK LOGIC (App Open Karna)
// ==========================================

self.addEventListener('notificationclick', function(event) {
  console.log('[Service Worker] Notification click received.');

  event.notification.close(); // Notification band karein

  // Kahan jana hai?
  const targetUrl = (event.notification.data && event.notification.data.url) || '/notifications.html';

  // Check karein agar App pehle se khula hai?
  event.waitUntil(
    clients.matchAll({type: 'window', includeUncontrolled: true}).then(function(clientList) {
      // 1. Agar tab khula hai, to use focus karein
      for (let i = 0; i < clientList.length; i++) {
        const client = clientList[i];
        if (client.url.includes(targetUrl) && 'focus' in client) {
          return client.focus();
        }
      }
      // 2. Agar tab nahi khula, to naya window kholein
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
