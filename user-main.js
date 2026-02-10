// user-main.js (VERCEL API COMPATIBLE + SW READY FIX)
import { fetchAndProcessData } from './user-data.js';
import { initUI, renderPage, promptForDeviceVerification, requestNotificationPermission } from './user-ui.js';

// 🔥 AAPKI VAPID KEY (Jo aapne chat me di thi)
const VAPID_KEY = "BE1NgqUcrYaBxWxd0hRrtW7wES0PJ-orGaxlGVj-oT1UZyJwLaaAk7z6KczQ2ZrSy_XjSwkL6WjpX_gHMpXPp3M";

// Global variable
let swRegistration = null;

// UI Initialization
initUI(null);

// 1. App Initialization
async function checkAuthAndInitialize() {
    try {
        // Step 1: Vercel API se Config Load karein (WAIT karein)
        if (!firebase.apps.length) {
            console.log("Fetching config from Vercel API...");
            const response = await fetch('/api/firebase-config');
            
            if (!response.ok) throw new Error("Failed to fetch firebase config");
            
            const config = await response.json();
            firebase.initializeApp(config);
            console.log("Firebase Initialized via API");
        }
        
        // Step 2: Service Worker Register (Background me start kar dein)
        registerServiceWorker();
        
        const auth = firebase.auth();
        const db = firebase.database();

        // Step 3: Auth State Change
        auth.onAuthStateChanged(user => {
            if (user) {
                console.log("User Logged In:", user.uid);
                runAppLogic(db);
            } else {
                console.log("User Not Logged In");
                window.location.href = 'login.html';
            }
        });

    } catch (error) {
        console.error("CRITICAL INIT ERROR:", error);
        // Agar API fail ho jaye, to user ko bata dein
        alert("System Error: Could not connect to server. Please refresh.");
    }
}

async function runAppLogic(database) {
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
            return reg;
        } catch (e) {
            console.error('SW Registration Failed:', e);
            return null;
        }
    }
}

// 3. Setup Logic
async function verifyDeviceAndSetupNotifications(database, allMembers) {
    try {
        let memberId = localStorage.getItem('verifiedMemberId');

        if (!memberId) {
            memberId = await promptForDeviceVerification(allMembers);
            if (memberId) localStorage.setItem('verifiedMemberId', memberId);
            else return;
        }
        
        const permission = await requestNotificationPermission();
        
        if (permission) {
            await registerForPushNotifications(database, memberId);
        }
    } catch (e) {
        console.log("Setup warning:", e);
    }
}

// 4. Token Logic (MAIN FIX FOR "NO ACTIVE SERVICE WORKER")
async function registerForPushNotifications(database, memberId) {
    if (!VAPID_KEY) return;

    try {
        // 👇👇 YAHI HAI WO FIX 👇👇
        // Ye line browser ko rok kar rakhegi jab tak Service Worker "Active" na ho jaye.
        console.log("Waiting for Service Worker to be ready...");
        const registration = await navigator.serviceWorker.ready;
        console.log("Service Worker is READY!", registration);

        const messaging = firebase.messaging();
        
        // Ab Token maangne me error nahi aayega
        const token = await messaging.getToken({ 
            vapidKey: VAPID_KEY,
            serviceWorkerRegistration: registration 
        });

        if (token) {
            // Token mil gaya, ab Database me save karein
            await database.ref(`members/${memberId}/notificationTokens/${token}`).set(true);
            
            console.log("✅ Token Generated & Saved:", token);
            // Aap chahein to confirm karne ke liye ek baar alert laga sakte hain:
            // alert("Notification Connected Successfully!");

            // Token refresh logic
            messaging.onTokenRefresh(async () => {
                const refreshedToken = await messaging.getToken({ 
                    vapidKey: VAPID_KEY, 
                    serviceWorkerRegistration: registration 
                });
                await database.ref(`members/${memberId}/notificationTokens/${refreshedToken}`).set(true);
            });

        } else {
            console.log("No registration token available.");
        }
        
    } catch (err) {
        console.error('Token Error:', err);
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
