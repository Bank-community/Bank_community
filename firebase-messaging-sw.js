importScripts('https://www.gstatic.com/firebasejs/8.10.1/firebase-app.js');
importScripts('https://www.gstatic.com/firebasejs/8.10.1/firebase-messaging.js');

// 1. Firebase Messaging को बिना देरी के सीधे (Synchronously) चालू करें
firebase.initializeApp({
    messagingSenderId: "778113641069"
});

const messaging = firebase.messaging();

// 2. जब ऐप बैकग्राउंड में हो, तब नोटिफिकेशन हैंडल करें
messaging.onBackgroundMessage(function(payload) {
    console.log('[firebase-messaging-sw.js] Background message received: ', payload);

    const notificationTitle = payload.notification?.title || payload.data?.title || 'Trust Community Fund';
    const notificationOptions = {
        body: payload.notification?.body || payload.data?.body || 'आपके लिए एक नया अपडेट है।',
        icon: payload.notification?.icon || payload.data?.icon || 'https://ik.imagekit.io/kdtvm0r78/1000123791_3ZT7JNENn.jpg',
        data: {
            url: payload.data?.url || payload.fcmOptions?.link || '/notifications.html'
        }
    };

    self.registration.showNotification(notificationTitle, notificationOptions);
});

// 3. नोटिफिकेशन पर क्लिक करने पर ऐप खोलें
self.addEventListener('notificationclick', function(event) {
    event.notification.close();
    const urlToOpen = event.notification.data?.url || '/notifications.html';

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
            for (let i = 0; i < windowClients.length; i++) {
                const client = windowClients[i];
                if (client.url.includes(urlToOpen) && 'focus' in client) {
                    return client.focus();
                }
            }
            if (clients.openWindow) {
                return clients.openWindow(urlToOpen);
            }
        })
    );
});
