// user-main.js - FINAL INTEGRATION (Auth, Data, & Analytics)
// CONNECTS: user-data.js <-> user-ui.js <-> ui-helpers.js

import { fetchAndProcessData } from './user-data.js';
import { initUI, renderPage, elements } from './user-ui.js'; 
import { 
    Analytics, 
    promptForDeviceVerification, 
    requestNotificationPermission 
} from './ui-helpers.js';

// Aapki VAPID Key (Notifications ke liye)
const VAPID_KEY = "BE1NgqUcrYaBxWxd0hRrtW7wES0PJ-orGaxlGVj-oT1UZyJwLaaAk7z6KczQ2ZrSy_XjSwkL6WjpX_gHMpXPp3M";

// 1. UI Listeners Start Karein (Bina Data ke bhi events active rahenge)
initUI(null);

// 2. Cache Load (Instant Display)
function loadFromLocalCache() {
    try {
        const cachedData = localStorage.getItem('tcf_app_data_cache');
        if (cachedData) {
            const parsedData = JSON.parse(cachedData);
            // console.log("⚡ Loaded from Cache");
            renderPage(parsedData);
        }
    } catch (e) {
        console.warn("Cache Error:", e);
    }
}

// 3. App Entry Point
async function checkAuthAndInitialize() {
    try {
        // A. Firebase Config Load
        if (!firebase.apps.length) {
            const response = await fetch('/api/firebase-config');
            if (response.ok) {
                const config = await response.json();
                firebase.initializeApp(config);
            }
        }
        
        // B. Service Worker Register
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('/sw.js');
        }
        
        const auth = firebase.auth();
        const db = firebase.database();

        // C. Auth State Listener
        auth.onAuthStateChanged(user => {
            if (user) {
                // User login hai -> App Run karo
                runAppLogic(db);
            } else {
                // User login nahi hai -> Login page par bhejo
                window.location.href = 'login.html';
            }
        });

    } catch (error) {
        console.error("Critical Init Error:", error);
        if(elements.memberContainer) {
            elements.memberContainer.innerHTML = `<p style="color:red; text-align:center;">Connection Failed. Please refresh.</p>`;
        }
    }
}

// 4. Main Logic Runner
async function runAppLogic(database) {
    // --- Step 1: Cache Dikhao (0 Sec Wait) ---
    loadFromLocalCache();

    // --- Step 2: Analytics Session Start ---
    Analytics.sessionStart = Date.now();
    
    // --- Step 3: Analytics Save on Exit (Jab user app band kare) ---
    // Mobile aur Desktop dono ke liye 'visibilitychange' best hai
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') {
            const memberId = localStorage.getItem('verifiedMemberId');
            if (memberId) {
                Analytics.saveSession(database, memberId);
            }
        }
    });

    // --- Step 4: Fresh Data Fetch ---
    const handleDataUpdate = (data) => {
        if (!data) return;

        // Cache update
        localStorage.setItem('tcf_app_data_cache', JSON.stringify(data));
        
        // UI Render (New Data)
        renderPage(data);
        
        // Notifications & Verification Check
        if (data.processedMembers) {
            verifyDeviceAndSetupNotifications(database, data.processedMembers);
        }
    };
    
    // Data fetch call
    await fetchAndProcessData(database, handleDataUpdate);
}

// 5. Verification & Notification Setup
async function verifyDeviceAndSetupNotifications(database, allMembers) {
    try {
        let memberId = localStorage.getItem('verifiedMemberId');
        
        // Agar ID nahi hai, to poocho (One Time)
        if (!memberId) {
            memberId = await promptForDeviceVerification(allMembers);
            if (memberId) {
                localStorage.setItem('verifiedMemberId', memberId);
                // First time verification log
                Analytics.logAction(`Device Verified as: ${memberId}`);
            } else {
                return; // User ne cancel kar diya
            }
        }
        
        // Push Notification Permission
        const permission = await requestNotificationPermission();
        if (permission) {
            await registerForPushNotifications(database, memberId);
        }
    } catch (e) {
        console.log("Notif Setup Error:", e);
    }
}

// 6. Token Generation
async function registerForPushNotifications(database, memberId) {
    if (!VAPID_KEY) return;

    try {
        const registration = await navigator.serviceWorker.ready;
        const messaging = firebase.messaging();
        
        const token = await messaging.getToken({ 
            vapidKey: VAPID_KEY,
            serviceWorkerRegistration: registration 
        });

        if (token) {
            // DB mein Token Save
            await database.ref(`members/${memberId}/notificationTokens/${token}`).set(true);
            // console.log("Token Secured");
        }
    } catch (err) {
        console.error('Token Failed:', err);
    }
}

// Start Application
document.addEventListener('DOMContentLoaded', checkAuthAndInitialize);
