// Cache का नाम और वर्ज़न
const CACHE_NAME = 'bank-community-cache-v9'; // वर्ज़न बदल दिया गया है

// वे जरूरी फाइलें जिन्हें ऐप के पहली बार लोड होने पर कैश करना है
const APP_SHELL_URLS = [
  '/',
  '/index.html',
  '/login.html',
  '/manifest.json',
  'https://i.ibb.co/HTNrbJxD/20250716-222246.png' // Main App Icon
];

// 1. Install Event: सर्विस वर्कर को इनस्टॉल करना और ऐप शेल को कैश करना
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Service Worker installing: Caching App Shell');
        return cache.addAll(APP_SHELL_URLS);
      })
  );
});

// 2. Activate Event: पुराने कैश को हटाना
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          // अगर कैश का नाम वर्तमान नाम से मेल नहीं खाता है, तो उसे हटा दें
          if (cacheName !== CACHE_NAME) {
            console.log('Service Worker activating: Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  return self.clients.claim();
});

// 3. Fetch Event: नेटवर्क-फर्स्ट रणनीति लागू करना
self.addEventListener('fetch', event => {
  // हम केवल GET अनुरोधों को संभालेंगे
  if (event.request.method !== 'GET') {
    return;
  }

  event.respondWith(
    // सबसे पहले नेटवर्क से लाने की कोशिश करें
    fetch(event.request)
      .then(networkResponse => {
        // अगर नेटवर्क से जवाब मिलता है
        return caches.open(CACHE_NAME).then(cache => {
          // नेटवर्क से मिले जवाब को कैश में डालें
          cache.put(event.request, networkResponse.clone());
          // और नेटवर्क से मिले जवाब को पेज पर दिखाएं
          return networkResponse;
        });
      })
      .catch(() => {
        // अगर नेटवर्क फेल हो जाता है (ऑफलाइन), तो कैश से जवाब खोजने की कोशिश करें
        return caches.match(event.request);
      })
  );
});
