// user-main.js
// ULTIMATE INSTANT LOAD UPDATE: Shows Cached Data IMMEDIATELY (0ms Latency).
// Then syncs with Firebase in background.

import { fetchAndProcessData } from './user-data.js';
import { initUI, renderPage, showLoadingError, promptForDeviceVerification, requestNotificationPermission } from './user-ui.js';

let VAPID_KEY = null;
let swRegistration = null; // Store Service Worker Registration

// --- STEP 1: IMMEDIATE CACHE RENDER (The Magic Trick) ---
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
        if (!firebaseConfig.apiKey) throw new Error('Invalid config received');
        
        VAPID_KEY = firebaseConfig.vapidKey;

        if (!firebase.apps.length) {
          firebase.initializeApp(firebaseConfig);
        }
        
        // 1. Service Worker Register karein aur reference save karein
        swRegistration = await registerServiceWorker();
        
        const auth = firebase.auth();
        const database = firebase.database();

        // --- STEP 2: BACKGROUND SYNC ---
        auth.onAuthStateChanged(user => {
            runAppLogic(database);
        });

    } catch (error) {
        console.error("FATAL: Could not initialize application.", error);
        const hasContent = document.getElementById('memberContainer').children.length > 1;
        if (!hasContent) {
            showLoadingError(`Application failed to initialize: ${error.message}`);
        }
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
            
            // Device verification check
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
 * Service Worker ko register karta hai aur Registration object return karta hai
 */
async function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    try {
        const registration = await navigator.serviceWorker.register('/sw.js');
        console.log('Service Worker registered with scope:', registration.scope);
        return registration;
    } catch (error) {
        console.error('Service Worker registration failed:', error);
        return null;
    }
  }
  return null;
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
                return; 
            }
        }
        
        const permissionGranted = await requestNotificationPermission();
        if (permissionGranted) {
            try {
                // Pass Service Worker Registration explicitly
                await registerForPushNotifications(database, memberId, swRegistration);
            } catch (regError) {
                console.error("Push Notification Registration Failed:", regError);
            }
        }
    } catch (error) {
        console.error('Device verification or notification setup failed:', error);
    }
}

// === MAJOR UPDATE: USES FIREBASE MESSAGING FOR CONSOLE SUPPORT ===
async function registerForPushNotifications(database, memberId, registration) {
    if (!VAPID_KEY || !registration) return;

    try {
        const messaging = firebase.messaging();
        
        // Firebase ko hamara custom Service Worker use karne ko bolein
        messaging.useServiceWorker(registration);

        // Get FCM Token (Console Compatible)
        const token = await messaging.getToken({ vapidKey: VAPID_KEY });

        if (token) {
            console.log("FCM Token Generated:", token);
            // Save token to DB
            const tokenRef = database.ref(`members/${memberId}/notificationTokens/${token}`);
            await tokenRef.set(true);
        } else {
            console.log('No registration token available. Request permission to generate one.');
        }
    } catch (err) {
        console.log('An error occurred while retrieving token. ', err);
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

document.addEventListener('DOMContentLoaded', checkAuthAndInitialize);
