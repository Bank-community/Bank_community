// firebase-messaging-sw.js
importScripts('https://www.gstatic.com/firebasejs/9.15.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.15.0/firebase-messaging-compat.js');

// 1. Apna Firebase Config Yahan Dalein
const firebaseConfig = {
  apiKey: "AIzaSy...", // Yahan apni asli API Key dalein
  authDomain: "bank-master-data.firebaseapp.com",
  projectId: "bank-master-data",
  storageBucket: "bank-master-data.appspot.com",
  messagingSenderId: "111932878263", // Ye aapke JSON me 'client_id' nahi, balki Sender ID hota hai (Settings me milega)
  appId: "1:111932878263:web:..."
};

// 2. Initialize Firebase
firebase.initializeApp(firebaseConfig);

// 3. Background Message Handler
const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Received background message ', payload);
  
  // Notification ka Design
  const notificationTitle = payload.notification.title;
  const notificationOptions = {
    body: payload.notification.body,
    icon: payload.notification.icon || '/icon.png', // Apna icon path dalein
    image: payload.notification.image,
    data: {
        url: payload.data.url // Link click karne par kahan jana hai
    }
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});

// 4. Click Listener (Notification par click karne par kya hoga)
self.addEventListener('notificationclick', function(event) {
    event.notification.close();
    // Jo URL notification me aaya tha wahan le jao
    const urlToOpen = event.notification.data.url || '/';
    
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windowClients => {
            // Agar tab khula hai to focus karo
            for (let client of windowClients) {
                if (client.url === urlToOpen && 'focus' in client) return client.focus();
            }
            // Nahi to naya kholo
            if (clients.openWindow) return clients.openWindow(urlToOpen);
        })
    );
});
