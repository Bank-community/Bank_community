// user-main.js
// SUPER FAST UPDATE: Local Storage Integration & Royal Theme Support
// FINAL COLOR UPDATE: Install App button ka color Green set kiya gaya hai.

import { fetchAndProcessData } from './user-data.js';
import { initUI, renderPage, showLoadingError, promptForDeviceVerification, requestNotificationPermission } from './user-ui.js';

let VAPID_KEY = null;

// IMMEDIATE INIT: Jaise hi script load ho, UI ko ready karo.
// Yeh blank page issue ko khatam karega.
initUI(null);

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
        // Data aane par kya karna hai, uska logic yahan hai
        const handleDataUpdate = (data) => {
            if (!data) return;

            // UI Render karo (Chahe Cache ho ya Fresh)
            renderPage(data);
            
            // Device verification check karo
            if (data.processedMembers) {
                verifyDeviceAndSetupNotifications(database, data.processedMembers);
            }
        };

        // Data fetch process start karo (Yeh Cache aur Network dono handle karega)
        await fetchAndProcessData(database, handleDataUpdate);

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

        // Agar user verify nahi hai, to prompt dikhao
        if (!memberId) {
            memberId = await promptForDeviceVerification(allMembers);
            if (memberId) {
                localStorage.setItem('verifiedMemberId', memberId);
            } else {
                return; 
            }
        }
        
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

async function registerForPushNotifications(database, memberId) {
    if (!VAPID_KEY) return;

    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
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
        <button id="installAppBtn" class="civil-button btn-glossy" style="background-image: linear-gradient(to top, #218838, #28a745); color: white; border: none; border-radius: 12px; width: auto; box-shadow: 0 4px 15px rgba(33, 136, 56, 0.4);">
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

