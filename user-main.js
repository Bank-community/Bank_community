// user-main.js - FULL UPDATED CODE
import { fetchAndProcessData } from './user-data.js';
import { initUI, renderPage, promptForDeviceVerification, requestNotificationPermission } from './user-ui.js';

let VAPID_KEY = null;
let swRegistration = null;

// UI Initialization
initUI(null);

// 1. App Initialization
async function checkAuthAndInitialize() {
    try {
        // Config load karein
        const response = await fetch('/api/firebase-config');
        if (!response.ok) throw new Error('Config failed');
        const firebaseConfig = await response.json();
        
        VAPID_KEY = firebaseConfig.vapidKey; // VAPID Key zaroori hai

        if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
        
        // Service Worker Register karein
        swRegistration = await registerServiceWorker();
        
        const auth = firebase.auth();
        const db = firebase.database();

        auth.onAuthStateChanged(user => {
            if (user) {
                runAppLogic(db);
            } else {
                window.location.href = 'login.html';
            }
        });

    } catch (error) {
        console.error("Init Error:", error);
    }
}

async function runAppLogic(database) {
    // Data fetch logic wahi rahegi
    const handleDataUpdate = (data) => {
        if (!data) return;
        renderPage(data);
        
        // Notification Setup Trigger
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
            console.log('SW Registered:', reg.scope);
            return reg;
        } catch (e) {
            console.error('SW Fail:', e);
            return null;
        }
    }
}

// 3. Notification & Token Setup
async function verifyDeviceAndSetupNotifications(database, allMembers) {
    let memberId = localStorage.getItem('verifiedMemberId');

    // Agar ID nahi hai to user se poochein
    if (!memberId) {
        memberId = await promptForDeviceVerification(allMembers);
        if (memberId) localStorage.setItem('verifiedMemberId', memberId);
        else return;
    }
    
    // Permission maangein
    const permission = await requestNotificationPermission();
    
    if (permission) {
        // Token generate aur save karein
        await registerForPushNotifications(database, memberId);
    }
}

// 4. Token Logic (DATABASE MEIN SAVE KARNA)
async function registerForPushNotifications(database, memberId) {
    if (!VAPID_KEY || !swRegistration) return;

    try {
        const messaging = firebase.messaging();
        
        // Service worker ka use karein token lene ke liye
        const token = await messaging.getToken({ 
            vapidKey: VAPID_KEY,
            serviceWorkerRegistration: swRegistration 
        });

        if (token) {
            console.log("Device Token:", token);
            // Database mein token save karein
            await database.ref(`members/${memberId}/notificationTokens/${token}`).set(true);
            
            // Token refresh listener
            messaging.onTokenRefresh(() => {
                messaging.getToken().then((refreshedToken) => {
                    database.ref(`members/${memberId}/notificationTokens/${refreshedToken}`).set(true);
                });
            });
        }
    } catch (err) {
        console.log('Token error:', err);
    }
}

// Install Button Logic (Same as before)
window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    window.deferredInstallPrompt = e;
    const installContainer = document.getElementById('install-button-container');
    if (installContainer) {
        installContainer.innerHTML = `<div class="dynamic-buttons-wrapper" style="padding-top:0;"><button id="installAppBtn" class="civil-button btn-glossy" style="background:#28a745;color:white;border-radius:12px;"><i data-feather="download-cloud"></i> Install App</button></div>`;
        feather.replace();
        document.getElementById('installAppBtn').addEventListener('click', async () => {
            window.deferredInstallPrompt.prompt();
            window.deferredInstallPrompt = null;
            installContainer.innerHTML = '';
        });
    }
});

document.addEventListener('DOMContentLoaded', checkAuthAndInitialize);
