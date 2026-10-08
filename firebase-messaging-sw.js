importScripts('https://www.gstatic.com/firebasejs/8.10.1/firebase-app.js');
importScripts('https://www.gstatic.com/firebasejs/8.10.1/firebase-messaging.js');

// 1. Vercel API से सुरक्षित Firebase Config मंगाना
fetch('/api/firebase-config')
    .then(response => response.json())
    .then(config => {
        // Config मिलने के बाद Firebase को चालू (Initialize) करना
        firebase.initializeApp(config);
        const messaging = firebase.messaging();

        // 2. जब ऐप बंद हो (Background), तब मैसेज आने पर यह चलेगा
        messaging.onBackgroundMessage(function(payload) {
            console.log('[firebase-messaging-sw.js] Background message received: ', payload);

            const notificationTitle = payload.notification?.title || 'Trust Community Fund';
            const notificationOptions = {
                body: payload.notification?.body || 'आपके लिए एक नया अपडेट है।',
                icon: 'https://ik.imagekit.io/kdtvm0r78/1000123791_3ZT7JNENn.jpg', // TCF Logo
                data: {
                    // क्लिक करने पर यह लिंक खुलेगा
                    url: payload.data?.url || payload.fcmOptions?.link || '/notifications.html'
                }
            };

            // स्क्रीन पर नोटिफिकेशन दिखाना
            self.registration.showNotification(notificationTitle, notificationOptions);
        });
    })
    .catch(error => {
        console.error('Service Worker में Firebase config लोड नहीं हो पाया:', error);
    });

// 3. जब यूज़र नोटिफिकेशन पर क्लिक करे, तो क्या होगा?
self.addEventListener('notificationclick', function(event) {
    event.notification.close(); // नोटिफिकेशन को स्क्रीन से हटा दो
    
    // वह लिंक निकालो जहाँ यूज़र को भेजना है
    const urlToOpen = event.notification.data?.url || '/notifications.html';

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
            // अगर पहले से कोई TCF का टैब खुला है, तो उसी को फोकस (सामने) लाओ
            for (let i = 0; i < windowClients.length; i++) {
                const client = windowClients[i];
                if (client.url.includes(urlToOpen) && 'focus' in client) {
                    return client.focus();
                }
            }
            // अगर कोई टैब खुला नहीं है, तो नया टैब/विंडो खोलो
            if (clients.openWindow) {
                return clients.openWindow(urlToOpen);
            }
        })
    );
});
