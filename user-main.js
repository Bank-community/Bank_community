// user-main.js
// FINAL UPDATE: Connects Notification Logic & Device Verification
// 1. Checks Cache first for instant load.
// 2. Verifies User Identity (Critical for Notification System).
// 3. Requests Notification Permission on load.

import { fetchAndProcessData } from './user-data.js';
import { initUI, renderPage, showLoadingError, promptForDeviceVerification, requestNotificationPermission } from './user-ui.js';

let VAPID_KEY = null;

// --- STEP 1: IMMEDIATE CACHE RENDER (The Magic Trick) ---
// Firebase initialize hone ka wait MAT karo. Turant purana data dikhao.
initUI(null);
try {
    // Database 'null' pass kar rahe hain taaki sirf cache load ho.
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
        
        registerServiceWorker();
        
        const auth = firebase.auth();
        const database = firebase.database();

        // --- STEP 2: BACKGROUND SYNC ---
        // Jab user login confirm ho jaye, tab naya data lao.
        auth.onAuthStateChanged(user => {
            runAppLogic(database);
        });

    } catch (error) {
        console.error("FATAL: Could not initialize application.", error);
        // Error tabhi dikhao agar cache bhi load nahi hua ho
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
            // UI Update karo (Fresh Data se)
            // Note: renderPage hi ab notification check trigger karega
            renderPage(data);
            
            // Device verification check (Notification ke liye zaroori)
            if (data.processedMembers) {
                verifyDeviceAndSetupNotifications(database, data.processedMembers);
            }
        };

        // Ab Fresh Data fetch karo
        await fetchAndProcessData(database, handleDataUpdate);

    } catch (error) {
        console.error("Failed to run main app logic:", error);
        // Silent fail if cache is already visible
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
 * Yahi function LocalStorage mein 'verifiedMemberId' save karega.
 */
async function verifyDeviceAndSetupNotifications(database, allMembers) {
    try {
        let memberId = localStorage.getItem('verifiedMemberId');
        let isNewVerification = false;

        // Agar ID nahi hai, to user se pucho "Aap kaun ho?"
        if (!memberId) {
            memberId = await promptForDeviceVerification(allMembers);
            if (memberId) {
                localStorage.setItem('verifiedMemberId', memberId);
                isNewVerification = true; // Flag ki abhi verify hua hai
            } else {
                return; // User ne cancel kar diya
            }
        }
        
        // Browser Notification Permission maango
        const permissionGranted = await requestNotificationPermission();
        
        if (permissionGranted) {
            try {
                // Optional: Server pe token bhejo (agar future mein push chahiye)
                await registerForPushNotifications(database, memberId);
            } catch (regError) {
                console.warn("Push reg skipped (Local Mode active):", regError);
            }
        }

        // Agar abhi naya verify hua hai, to reload karo taaki Notifications turant dikhein
        if (isNewVerification) {
            window.location.reload();
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

// PWA Install Prompt Handler
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

