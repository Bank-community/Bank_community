// user-main.js (DEBUG MODE 🛠️)
import { fetchAndProcessData } from './user-data.js';
import { initUI, renderPage, promptForDeviceVerification, requestNotificationPermission } from './user-ui.js';

const VAPID_KEY = "BE1NgqUcrYaBxWxd0hRrtW7wES0PJ-orGaxlGVj-oT1UZyJwLaaAk7z6KczQ2ZrSy_XjSwkL6WjpX_gHMpXPp3M";

let swRegistration = null;

initUI(null);

// 1. App Initialization
async function checkAuthAndInitialize() {
    try {
        // Step 1 check
        // alert("DEBUG: App Start. Checking Firebase Config..."); 

        if (!firebase.apps.length) {
            const response = await fetch('/api/firebase-config');
            if (response.ok) {
                const config = await response.json();
                firebase.initializeApp(config);
            } else {
                alert("Error: Config API Failed!");
            }
        }
        
        // Step 2 check
        registerServiceWorker();
        
        const auth = firebase.auth();
        const db = firebase.database();

        auth.onAuthStateChanged(user => {
            if (user) {
                // alert("DEBUG: User Logged In: " + user.uid);
                runAppLogic(db);
            } else {
                window.location.href = 'login.html';
            }
        });

    } catch (error) {
        alert("CRITICAL INIT ERROR: " + error.message);
    }
}

async function runAppLogic(database) {
    const handleDataUpdate = (data) => {
        if (!data) return;
        renderPage(data);
        
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
            // alert("DEBUG: SW Registered!"); 
            return reg;
        } catch (e) {
            alert("DEBUG: SW Registration Failed: " + e.message);
            return null;
        }
    } else {
        alert("DEBUG: Browser does not support Service Worker!");
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
            // alert("DEBUG: Permission Granted. Starting Token Logic...");
            await registerForPushNotifications(database, memberId);
        } else {
            alert("DEBUG: Notification Permission DENIED.");
        }
    } catch (e) {
        alert("Setup Error: " + e.message);
    }
}

// 4. Token Logic (Strict Debugging)
async function registerForPushNotifications(database, memberId) {
    if (!VAPID_KEY) {
        alert("Error: VAPID Key Missing!");
        return;
    }

    try {
        // alert("DEBUG: Waiting for SW Ready...");
        
        // Yahan Code Atak Sakta Hai - Isliye Check Lagaya Hai
        if (!('serviceWorker' in navigator)) {
            throw new Error("No Service Worker Support");
        }

        const registration = await navigator.serviceWorker.ready;
        // alert("DEBUG: SW is Ready! Getting Token...");

        const messaging = firebase.messaging();
        
        const token = await messaging.getToken({ 
            vapidKey: VAPID_KEY,
            serviceWorkerRegistration: registration 
        });

        if (token) {
            // alert("DEBUG: Token Generated! Saving to DB...");
            
            // Database Write Try
            await database.ref(`members/${memberId}/notificationTokens/${token}`).set(true);
            
            // ✅ SUCCESS MESSAGE
            alert("✅ SUCCESS: Notification Connected! Token Saved."); 

        } else {
            alert("DEBUG: Token null mila. Browser error?");
        }
        
    } catch (err) {
        // 🔴 ASLI ERROR YAHAN DIKHEGA
        alert("🔴 TOKEN ERROR: " + err.message + " | Name: " + err.name);
        console.error(err);
    }
}

// Install Button
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
