// user-main.js
// ULTIMATE INSTANT LOAD UPDATE: Shows Cached Data IMMEDIATELY (0ms Latency).
// Then syncs with Firebase in background.

import { fetchAndProcessData } from './user-data.js';
import { initUI, renderPage, showLoadingError, promptForDeviceVerification, requestNotificationPermission } from './user-ui.js';

let VAPID_KEY = null;
let swRegistration = null;

// --- STEP 1: IMMEDIATE CACHE RENDER ---
initUI(null);
try {
    fetchAndProcessData(null, renderPage);
} catch (e) {
    console.log("Initial cache load skipped:", e);
}

/**
 * App ko shuru karne ka mukhya function.
 */
async function checkAuthAndInitialize() {
    try {
        const response = await fetch('/api/firebase-config');
        if (!response.ok) throw new Error('Configuration failed to load.');
        const firebaseConfig = await response.json();
        
        VAPID_KEY = firebaseConfig.vapidKey;

        if (!firebase.apps.length) {
          firebase.initializeApp(firebaseConfig);
        }
        
        // Service Worker Register
        swRegistration = await registerServiceWorker();
        
        const auth = firebase.auth();
        const database = firebase.database();

        // --- STEP 2: BACKGROUND SYNC & AUTH CHECK ---
        auth.onAuthStateChanged(user => {
            if (user) {
                // CASE 1: User Login Hai -> Data Load karo
                console.log("User authorized:", user.uid);
                runAppLogic(database);
            } else {
                // CASE 2: User Login NAHI Hai -> Login Page par bhejo
                console.log("User not logged in. Redirecting...");
                window.location.href = 'login.html';
            }
        });

    } catch (error) {
        console.error("FATAL: Could not initialize application.", error);
        // Agar error aaye aur user login na ho, to bhi login page par bhejo
        setTimeout(() => {
             window.location.href = 'login.html';
        }, 2000);
    }
}

/**
 * Mukhya application logic (Network Fetch).
 */
async function runAppLogic(database) {
    try {
        const handleDataUpdate = (data) => {
            if (!data) return;
            renderPage(data);
            
            if (data.processedMembers) {
                verifyDeviceAndSetupNotifications(database, data.processedMembers);
            }
        };

        await fetchAndProcessData(database, handleDataUpdate);

    } catch (error) {
        console.error("Failed to run main app logic:", error);
    }
}

/**
 * Service Worker Registration
 */
async function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    try {
        const registration = await navigator.serviceWorker.register('/sw.js');
        return registration;
    } catch (error) {
        console.error('Service Worker registration failed:', error);
        return null;
    }
  }
  return null;
}

/**
 * Device Verification & Notification Logic
 */
async function verifyDeviceAndSetupNotifications(database, allMembers) {
    try {
        let memberId = localStorage.getItem('verifiedMemberId');

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
                await registerForPushNotifications(database, memberId, swRegistration);
            } catch (regError) {
                console.error("Push Notification Registration Failed:", regError);
            }
        }
    } catch (error) {
        console.error('Device verification failed:', error);
    }
}

async function registerForPushNotifications(database, memberId, registration) {
    if (!VAPID_KEY || !registration) return;

    try {
        const messaging = firebase.messaging();
        messaging.useServiceWorker(registration);

        const token = await messaging.getToken({ vapidKey: VAPID_KEY });

        if (token) {
            console.log("FCM Token Generated:", token);
            const tokenRef = database.ref(`members/${memberId}/notificationTokens/${token}`);
            await tokenRef.set(true);
        }
    } catch (err) {
        console.log('Token error:', err);
    }
}

window.deferredInstallPrompt = null;

window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    window.deferredInstallPrompt = e;
    const installContainer = document.getElementById('install-button-container');
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches;

    if (installContainer && !isStandalone) {
        installContainer.innerHTML = `
        <div class="dynamic-buttons-wrapper" style="padding-top: 0;">
            <button id="installAppBtn" class="civil-button btn-glossy" style="background-image: linear-gradient(to top, #218838, #28a745); color: white; border: none; border-radius: 12px; width: auto; box-shadow: 0 4px 15px rgba(33, 136, 56, 0.4);">
                <i data-feather="download-cloud"></i> <b>Install App</b>
            </button>
        </div>`;
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

document.addEventListener('DOMContentLoaded', checkAuthAndInitialize);
