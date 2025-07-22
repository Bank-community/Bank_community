// Admin Panel ka alag Service Worker
const CACHE_NAME = 'bank-admin-cache-v1';
const APP_SHELL_URLS = [
  '/admin/',
  '/admin/index.html',
  '/admin/manifest.json'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE_NAME).then(cache => {
    return cache.addAll(APP_SHELL_URLS);
  }));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => {
    return Promise.all(keys.map(key => {
      if (key !== CACHE_NAME) {
        return caches.delete(key);
      }
    }));
  }).then(() => {
    return self.clients.claim();
  }));
});

self.addEventListener('fetch', e => {
  if (e.request.mode === 'navigate') {
    e.respondWith(fetch(e.request).catch(() => caches.match('/admin/index.html')));
  } else {
    e.respondWith(caches.match(e.request).then(response => {
      return response || fetch(e.request);
    }));
  }
});
