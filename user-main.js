// user-main.js (DEBUG VERSION: Alerts + SW Wait Fix)
import { fetchAndProcessData } from './user-data.js';
import { initUI, renderPage, promptForDeviceVerification, requestNotificationPermission } from './user-ui.js';

// 🔥 AAPKI VAPID KEY
const VAPID_KEY = "BE1NgqUcrYaBxWxd0hRrtW7wES0PJ-orGaxlGVj-oT1UZyJwLaaAk7z6KczQ2ZrSy_XjSwkL6WjpX_gHMpXPp3M";

// Global variable
let swRegistration = null;

initUI(null);

// 1. App Initialization
async function checkAuthAndInitialize() {
    try {
        // Config load karna (Aapka purana tarika jo kaam kar raha hai)
        if (!firebase.apps.length) {
            const response = await fetch('/api/firebase-config');
            if (response.ok) {
                const config = await response.json();
                firebase.initializeApp(config);
            }
        }
        
        // Service Worker Register
        registerServiceWorker().then(reg => {
            swRegistration = reg;
        });
        
        const auth = firebase.auth();
        const db = firebase.database();

        auth.onAuthStateChanged(user => {
            if (user) {
                // Login Success
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
    const handleDataUpdate = (data) => {
        if (!data) return;
        renderPage(data);
        
        // Notification Setup
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
            console.error('SW Fail:', e);
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
        
        // Permission maangein
        const permission = await requestNotificationPermission();
        
        if (permission) {
            // Token generate karein
            await registerForPushNotifications(database, memberId);
        } else {
            // Agar user ne mana kar diya ho
            console.log("Permission denied");
        }
    } catch (e) {
        console.log(e);
    }
}

// 4. Token Logic (FIXED & WITH ALERTS)
async function registerForPushNotifications(database, memberId) {
    if (!VAPID_KEY) return;

    try {
        // 🔥 FIX: Wait karein jab tak Service Worker poori tarah ready na ho
        const registration = swRegistration || await navigator.serviceWorker.ready;

        const messaging = firebase.messaging();
        
        // Token lein
        const token = await messaging.getToken({ 
            vapidKey: VAPID_KEY,
            serviceWorkerRegistration: registration 
        });

        if (token) {
            // Database me save karein
            await database.ref(`members/${memberId}/notificationTokens/${token}`).set(true);
            
            // ✅ SUCCESS ALERT (Isse pata chalega ki kaam ho gaya)
            // alert("Notification Setup Successful! Token Saved."); 
            // (Testing ke baad upar wali line hata dena)
            console.log("Token Saved:", token);

        } else {
            alert("Error: Token nahi mila. Permission check karein.");
        }
        
    } catch (err) {
        // Agar koi error aaye to screen par dikhayein
        alert("Token Error: " + err.message);
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
