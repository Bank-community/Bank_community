// user-main.js
// FINAL CORRECTED UPDATE: Page blank hone ki galti ko theek kar diya gaya hai.
// PWA install button ab dynamically create hoga aur header me inject kiya jayega.

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
            runAppLogic(database);
        });

    } catch (error) { // Yahan galti thi, bracket galat jagah tha
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

// Global variable jisme install prompt save hoga
window.deferredInstallPrompt = null;

// 'beforeinstallprompt' event ko sunein
window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    window.deferredInstallPrompt = e;
    
    const installContainer = document.getElementById('install-button-container');
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches;

    if (installContainer && !isStandalone) {
        installContainer.innerHTML = `
    <div class="dynamic-buttons-wrapper" style="padding-top: 0;">
        <button id="installAppBtn" class="civil-button btn-glossy" style="background-color: var(--success-color); border: none; border-radius: 12px; width: auto;">
            <i data-feather="download-cloud"></i>
            <b>Install App</b>
        </button>
    </div>
`;

        feather.replace();

        const installBtn = document.getElementById('installAppBtn');
        if (installBtn) {
            installBtn.addEventListener('click', async () => {
                const promptEvent = window.deferredInstallPrompt;
                if (!promptEvent) return;
                promptEvent.prompt();
                await promptEvent.userChoice;
                window.deferredInstallPrompt = null;
                installContainer.innerHTML = '';
            });
        }
    }
});

// App ko shuru karein
document.addEventListener('DOMContentLoaded', checkAuthAndInitialize);


