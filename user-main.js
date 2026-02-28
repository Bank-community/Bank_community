// user-main.js - FINAL ENGINE (Fixed Data Flow)
// RESPONSIBILITY: Auth, Data Fetching & UI Connection

import { fetchAndProcessData } from './user-data.js';
import { initUI, renderPage } from './user-ui.js'; 
import { Analytics, promptForDeviceVerification, requestNotificationPermission } from './ui-helpers.js';

// VAPID Key for Notifications (Keep existing)
const VAPID_KEY = "BE1NgqUcrYaBxWxd0hRrtW7wES0PJ-orGaxlGVj-oT1UZyJwLaaAk7z6KczQ2ZrSy_XjSwkL6WjpX_gHMpXPp3M";
const CACHE_KEY = 'tcf_royal_cache_v7'; // 🔥 Match key with user-data.js

// 1. UI Listeners Start (IMMEDIATE)
// This makes the Bottom Nav clickable instantly
initUI(null);

// 2. Cache Load (INSTANT DISPLAY)
function loadFromLocalCache() {
    try {
        const cachedRaw = localStorage.getItem(CACHE_KEY);
        if (cachedRaw) {
            const data = JSON.parse(cachedRaw);
            // Basic validation to ensure cache isn't corrupt
            if (data && data.processedMembers) {
                // console.log("⚡ Loaded from Cache");
                renderPage(data);
            }
        }
    } catch (e) { console.warn("Cache Load Error:", e); }
}

// 3. App Entry Point
async function checkAuthAndInitialize() {
    try {
        // A. Load Cache First (To remove "Authenticating..." loading text)
        loadFromLocalCache();

        // B. Firebase Config
        if (!firebase.apps.length) {
            const response = await fetch('/api/firebase-config');
            if (response.ok) {
                firebase.initializeApp(await response.json());
            } else {
                console.error("Firebase Config Failed");
                return;
            }
        }

        const db = firebase.database();
        const auth = firebase.auth();

        // C. Service Worker for PWA
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('/sw.js')
                .then(() => console.log("SW Registered"))
                .catch(err => console.log("SW Fail:", err));
        }

        // D. Auth Listener
        auth.onAuthStateChanged(user => {
            if (user) {
                // Initialize Analytics
                Analytics.init(db);

                // Identify User if already saved
                const savedId = localStorage.getItem('verifiedMemberId');
                if (savedId) Analytics.identifyUser(savedId);

                // Start Data Fetching
                runAppLogic(db);
            } else {
                // Redirect to Login if not authenticated
                window.location.href = 'login.html';
            }
        });

    } catch (error) {
        console.error("Critical Init Error:", error);
    }
}

// 4. Main Logic Loop
async function runAppLogic(database) {

    // Callback: When data comes from Firebase
    const handleDataUpdate = (data) => {
        if (!data) return;

        // Save to Cache
        try {
            localStorage.setItem(CACHE_KEY, JSON.stringify(data));
        } catch(e) { console.warn("Cache Quota Exceeded"); }

        // Render UI
        renderPage(data);

        // Post-Render Tasks (Verification & Notifs)
        if (data.processedMembers) {
            verifyDeviceAndSetupNotifications(database, data.processedMembers);
        }
    };

    // Fetch Data
    await fetchAndProcessData(database, handleDataUpdate);
}

// 5. Device Verification & Push Notifs
async function verifyDeviceAndSetupNotifications(database, allMembers) {
    try {
        let memberId = localStorage.getItem('verifiedMemberId');

        // Only prompt if not verified AND user interacts (handled in UI clicks now)
        // We strictly don't force prompt on load anymore to keep UI clean
        // But we do register notifications if ID exists

        if (memberId) {
            const permission = await requestNotificationPermission();
            if (permission) await registerForPushNotifications(database, memberId);
        }
    } catch (e) { console.log(e); }
}

// 6. Push Registration Logic
async function registerForPushNotifications(database, memberId) {
    if (!VAPID_KEY) return;
    try {
        const registration = await navigator.serviceWorker.ready;
        const messaging = firebase.messaging();
        const token = await messaging.getToken({ vapidKey: VAPID_KEY, serviceWorkerRegistration: registration });

        if (token) {
            await database.ref(`members/${memberId}/notificationTokens/${token}`).set(true);
        }
    } catch (err) { console.error('Token Error:', err); }
}

// 7. Global PWA Install Logic
window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    window.deferredInstallPrompt = e;
    const container = document.getElementById('install-button-container');
    if (container) {
        container.innerHTML = `<div class="dynamic-buttons-wrapper"><button id="installAppBtn" class="civil-button btn-glossy" style="background:#28a745;color:white;"><i data-feather="download-cloud"></i> Install App</button></div>`;
        if(typeof feather !== 'undefined') feather.replace();

        const btn = document.getElementById('installAppBtn');
        if(btn) {
            btn.onclick = async () => {
                if(window.deferredInstallPrompt) {
                    window.deferredInstallPrompt.prompt();
                    await window.deferredInstallPrompt.userChoice;
                    window.deferredInstallPrompt = null;
                    container.innerHTML = '';
                }
            };
        }
    }
});

// Start Everything
document.addEventListener('DOMContentLoaded', checkAuthAndInitialize);