// user-main.js (FINAL FIXED VERSION WITH VAPID KEY)
import { fetchAndProcessData } from './user-data.js';
import { initUI, renderPage, promptForDeviceVerification, requestNotificationPermission } from './user-ui.js';

// 🔥 AAPKI DI HUI MESSAGE KEY (VAPID KEY)
const VAPID_KEY = "BE1NgqUcrYaBxWxd0hRrtW7wES0PJ-orGaxlGVj-oT1UZyJwLaaAk7z6KczQ2ZrSy_XjSwkL6WjpX_gHMpXPp3M";

let swRegistration = null;

// UI Initialization (Taki cache data turant dikhe)
initUI(null);

// 1. App Initialization
async function checkAuthAndInitialize() {
    try {
        // Firebase Check: Agar initialize nahi hai to config load karo
        if (!firebase.apps.length) {
            try {
                const response = await fetch('/api/firebase-config');
                if (response.ok) {
                    const config = await response.json();
                    firebase.initializeApp(config);
                } else {
                    console.error("Firebase Config fetch failed");
                }
            } catch (err) {
                console.error("Config Loading Error:", err);
            }
        }
        
        // Service Worker Register (Background me)
        registerServiceWorker().then(reg => {
            swRegistration = reg;
        });
        
        const auth = firebase.auth();
        const db = firebase.database();

        // AUTH LISTENER: Ye "Authenticating..." ko hatayega
        auth.onAuthStateChanged(user => {
            if (user) {
                console.log("User Logged In:", user.uid);
                // Main App Start karo
                runAppLogic(db);
            } else {
                console.log("User Not Logged In");
                window.location.href = 'login.html';
            }
        });

    } catch (error) {
        console.error("CRITICAL INIT ERROR:", error);
        // Agar koi bada error aaye to user ko login page par bhej do
        setTimeout(() => window.location.href = 'login.html', 3000);
    }
}

async function runAppLogic(database) {
    const handleDataUpdate = (data) => {
        if (!data) return;
        renderPage(data);
        
        // Notification Setup Trigger (Isse App load hone me deri nahi hogi)
        if (data.processedMembers) {
            verifyDeviceAndSetupNotifications(database, data.processedMembers);
        }
    };
    await fetchAndProcessData(database, handleDataUpdate);
}

// 2. Service Worker Registration
async function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
        try {
            const reg = await navigator.serviceWorker.register('/sw.js');
            console.log('SW Registered Scope:', reg.scope);
            return reg;
        } catch (e) {
            console.error('SW Registration Failed:', e);
            return null;
        }
    }
}

// 3. Notification & Token Setup
async function verifyDeviceAndSetupNotifications(database, allMembers) {
    try {
        let memberId = localStorage.getItem('verifiedMemberId');

        if (!memberId) {
            // Agar ID nahi hai to user se poochein (Background me)
            memberId = await promptForDeviceVerification(allMembers);
            if (memberId) localStorage.setItem('verifiedMemberId', memberId);
            else return;
        }
        
        // Permission Ask
        const permission = await requestNotificationPermission();
        
        if (permission) {
            await registerForPushNotifications(database, memberId);
        }
    } catch (e) {
        console.log("Notification setup warning:", e);
    }
}

// 4. Token Logic (Database me Save Karna)
async function registerForPushNotifications(database, memberId) {
    if (!VAPID_KEY || !swRegistration) {
        console.warn("VAPID Key or SW missing. Skipping token generation.");
        return;
    }

    try {
        const messaging = firebase.messaging();
        
        const token = await messaging.getToken({ 
            vapidKey: VAPID_KEY,
            serviceWorkerRegistration: swRegistration 
        });

        if (token) {
            console.log("🔥 FCM Token Generated:", token);
            // Database me token save karein
            await database.ref(`members/${memberId}/notificationTokens/${token}`).set(true);
            
            // Token Refresh Handle
            messaging.onTokenRefresh(() => {
                messaging.getToken().then((refreshedToken) => {
                    database.ref(`members/${memberId}/notificationTokens/${refreshedToken}`).set(true);
                });
            });
        } else {
            console.log("No registration token available.");
        }
    } catch (err) {
        console.log('Token generation failed: ', err);
    }
}

// Install Button Logic
window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    window.deferredInstallPrompt = e;
    const installContainer = document.getElementById('install-button-container');
    if (installContainer) {
        installContainer.innerHTML = `<div class="dynamic-buttons-wrapper" style="padding-top:0;"><button id="installAppBtn" class="civil-button btn-glossy" style="background:#28a745;color:white;border-radius:12px;"><i data-feather="download-cloud"></i> Install App</button></div>`;
        if(typeof feather !== 'undefined') feather.replace();
        
        document.getElementById('installAppBtn').addEventListener('click', async () => {
            if(window.deferredInstallPrompt) {
                window.deferredInstallPrompt.prompt();
                await window.deferredInstallPrompt.userChoice;
                window.deferredInstallPrompt = null;
                installContainer.innerHTML = '';
            }
        });
    }
});

document.addEventListener('DOMContentLoaded', checkAuthAndInitialize);
