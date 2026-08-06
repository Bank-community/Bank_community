importScripts('https://www.gstatic.com/firebasejs/8.10.1/firebase-app.js');
importScripts('https://www.gstatic.com/firebasejs/8.10.1/firebase-messaging.js');

// 1. Vercel API se secure config fetch karein
fetch('/api/firebase-config')
    .then(response => response.json())
    .then(config => {
        // API se config milne ke baad Firebase Initialize karein
        firebase.initializeApp(config);
        const messaging = firebase.messaging();

        // 2. Background mein message aane par notification show karein
        messaging.onBackgroundMessage(function(payload) {
            console.log('[firebase-messaging-sw.js] Received background message ', payload);

            const notificationTitle = payload.notification.title;
            const notificationOptions = {
                body: payload.notification.body,
                icon: 'https://ik.imagekit.io/kdtvm0r78/1000123791_3ZT7JNENn.jpg', // TCF Bank Logo
                data: {
                    // Click karne par konsa URL khulega
                    url: payload.data?.url || payload.fcmOptions?.link || 'https://www.trustcf.sbs/notifications.html'
                }
            };

            // Screen par notification show karein
            self.registration.showNotification(notificationTitle, notificationOptions);
        });
    })
    .catch(error => {
        console.error('Failed to load Firebase config in Service Worker:', error);
    });

// 3. Jab koi notification par click kare, toh app open ho
self.addEventListener('notificationclick', function(event) {
    event.notification.close();
    const urlToOpen = event.notification.data?.url || 'https://www.trustcf.sbs/notifications.html';

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
            // Agar pehle se koi tab open hai, toh us par focus karo
            for (let i = 0; i < windowClients.length; i++) {
                const client = windowClients[i];
                if (client.url === urlToOpen && 'focus' in client) {
                    return client.focus();
                }
            }
            // Agar koi tab open nahi hai, toh naya window/tab kholo
            if (clients.openWindow) {
                return clients.openWindow(urlToOpen);
            }
        })
    );
});