// user-main.js
// BADLAV: PWA install prompt ko global banaya gaya hai taki dusre page bhi istemal kar sakein.

import { fetchAndProcessData } from './user-data.js';
import { initUI, renderPage, showLoadingError, promptForDeviceVerification, requestNotificationPermission } from './user-ui.js';

let VAPID_KEY = null;

/**
 * App ko shuru karne ka mukhya function.
 */
async function checkAuthAndInitialize() {
    try {
        const response = await fetch('/api/firebase-config');
        if (!response.ok) throw new Error('Configuration failed to load.');
        const firebaseConfig = await response.json();
        if (!firebaseConfig.apiKey) throw new Error('Invalid config received');
        
        VAPID_KEY = firebaseConfig.vapidKey;

        if (!firebase.apps.length) {
          firebase.initializeApp(firebaseConfig);
        }
        
        registerServiceWorker();
        
        const auth = firebase.auth();
        const database = firebase.database();

        auth.onAuthStateChanged(user => {
            // Hum maan rahe hain ki user hamesha logged in hai.
            runAppLogic(database);
        });

    } catch (error) {
        console.error("FATAL: Could not initialize application.", error);
        showLoadingError(`Application failed to initialize: ${error.message}`);
    }
}

/**
 * Mukhya application logic.
 */
async function runAppLogic(database) {
    try {
        const processedData = await fetchAndProcessData(database);

        if (processedData) {
            initUI(database);
            renderPage(processedData);
            
            verifyDeviceAndSetupNotifications(database, processedData.processedMembers);
        }
    } catch (error) {
        console.error("Failed to run main app logic:", error);
        showLoadingError(error.message);
    }
}

/**
 * Service Worker ko register karta hai.
 */
function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js')
      .then(registration => console.log('Service Worker registered with scope:', registration.scope))
      .catch(error => console.error('Service Worker registration failed:', error));
  }
}

/**
 * Device ko verify aur notifications ke liye setup karta hai.
 */
async function verifyDeviceAndSetupNotifications(database, allMembers) {
    try {
        let memberId = localStorage.getItem('verifiedMemberId');

        if (!memberId) {
            memberId = await promptForDeviceVerification(allMembers);
            if (memberId) {
                localStorage.setItem('verifiedMemberId', memberId);
            } else {
                console.warn('Device verification cancelled by user.');
                return; 
            }
        }
        
        console.log(`Device verified for member: ${memberId}`);

        const permissionGranted = await requestNotificationPermission();
        if (permissionGranted) {
            try {
                await registerForPushNotifications(database, memberId);
            } catch (regError) {
                console.error("Push Notification Registration Failed:", regError);
            }
        }
    } catch (error) {
        console.error('Device verification or notification setup failed:', error);
    }
}

/**
 * Push notifications ke liye register karta hai aur token save karta hai.
 */
async function registerForPushNotifications(database, memberId) {
    if (!VAPID_KEY) {
        console.error("VAPID Key is not available from config. Push notifications will not work.");
        return;
    }

    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        console.warn('Push messaging is not supported');
        return;
    }

    const registration = await navigator.serviceWorker.ready;
    let subscription = await registration.pushManager.getSubscription();

    if (subscription === null) {
        subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: VAPID_KEY,
        });
    }

    const token = subscription.toJSON().keys.p256dh;
    if (token) {
        const tokenRef = database.ref(`members/${memberId}/notificationTokens/${token}`);
        await tokenRef.set(true);
        console.log('Push notification token saved to Firebase.');
    }
}

// === YAHAN BADLAV KIYA GAYA HAI ===
// PWA install event ko global window object par save karna
window.deferredInstallPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
    // Mini-infobar ko aane se rokein
    e.preventDefault();
    // Event ko global variable me store karein
    window.deferredInstallPrompt = e;
    
    // Main page par install button ko dikhayein (agar maujood hai)
    const installBtn = document.getElementById('installAppBtn');
    if (installBtn) {
       installBtn.style.display = 'inline-flex';
    }
});
// === BADLAV SAMAPT ===


// App ko shuru karein
document.addEventListener('DOMContentLoaded', checkAuthAndInitialize);


