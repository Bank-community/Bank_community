// user-main.js - FIXED AUTHENTICATION & INTEGRATION
import { fetchAndProcessData } from './user-data.js';
import { initUI, renderPage } from './user-ui.js'; 
import { 
    Analytics, 
    promptForDeviceVerification, 
    requestNotificationPermission 
} from './ui-helpers.js';

// Aapki VAPID Key
const VAPID_KEY = "BE1NgqUcrYaBxWxd0hRrtW7wES0PJ-orGaxlGVj-oT1UZyJwLaaAk7z6KczQ2ZrSy_XjSwkL6WjpX_gHMpXPp3M";

// 1. UI Listeners Start (Bina database ke events activate rahenge)
initUI(null);

// 2. Cache Load (Taki screen turant dikhe)
function loadFromLocalCache() {
    try {
        const cachedData = localStorage.getItem('tcf_app_data_cache');
        if (cachedData) {
            renderPage(JSON.parse(cachedData));
        }
    } catch (e) { console.error("Cache Error:", e); }
}

// 3. App Entry Point
async function checkAuthAndInitialize() {
    try {
        // Step A: Firebase Config Load
        if (!firebase.apps.length) {
            const response = await fetch('/api/firebase-config');
            if (response.ok) {
                firebase.initializeApp(await response.json());
            }
        }
        
        const db = firebase.database();
        const auth = firebase.auth();

        // Step B: Service Worker
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('/sw.js');
        }

        // Step C: Auth State Listener
        auth.onAuthStateChanged(user => {
            if (user) {
                // 🔥 FIX: Database ready hone ke baad hi Analytics chalao
                Analytics.init(db);
                
                // Existing user check
                const savedId = localStorage.getItem('verifiedMemberId');
                if (savedId) Analytics.identifyUser(savedId);

                runAppLogic(db);
            } else {
                window.location.href = 'login.html';
            }
        });

    } catch (error) {
        console.error("Critical Init Error:", error);
    }
}

// 4. Main Logic
async function runAppLogic(database) {
    loadFromLocalCache();

    const handleDataUpdate = (data) => {
        if (!data) return;
        localStorage.setItem('tcf_app_data_cache', JSON.stringify(data));
        renderPage(data);
        
        if (data.processedMembers) {
            verifyDeviceAndSetupNotifications(database, data.processedMembers);
        }
    };
    
    await fetchAndProcessData(database, handleDataUpdate);
}

// 5. Device Verification
async function verifyDeviceAndSetupNotifications(database, allMembers) {
    try {
        let memberId = localStorage.getItem('verifiedMemberId');
        
        if (!memberId) {
            memberId = await promptForDeviceVerification(allMembers);
            if (memberId) {
                localStorage.setItem('verifiedMemberId', memberId);
                Analytics.identifyUser(memberId);
            } else return;
        } else {
            Analytics.identifyUser(memberId);
        }
        
        const permission = await requestNotificationPermission();
        if (permission) await registerForPushNotifications(database, memberId);
    } catch (e) { console.log(e); }
}

// 6. Push Notifications
async function registerForPushNotifications(database, memberId) {
    if (!VAPID_KEY) return;
    try {
        const registration = await navigator.serviceWorker.ready;
        const messaging = firebase.messaging();
        const token = await messaging.getToken({ vapidKey: VAPID_KEY, serviceWorkerRegistration: registration });
        if (token) await database.ref(`members/${memberId}/notificationTokens/${token}`).set(true);
    } catch (err) { console.error('Token Error:', err); }
}

// Global PWA Install Logic
window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    window.deferredInstallPrompt = e;
    const container = document.getElementById('install-button-container');
    if (container) {
        container.innerHTML = `<div class="dynamic-buttons-wrapper"><button id="installAppBtn" class="civil-button btn-glossy" style="background:#28a745;color:white;"><i data-feather="download-cloud"></i> Install App</button></div>`;
        feather.replace();
        document.getElementById('installAppBtn').onclick = async () => {
            if(window.deferredInstallPrompt) {
                window.deferredInstallPrompt.prompt();
                await window.deferredInstallPrompt.userChoice;
                window.deferredInstallPrompt = null;
                container.innerHTML = '';
            }
        };
    }
});

document.addEventListener('DOMContentLoaded', checkAuthAndInitialize);
