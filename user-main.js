// user-main.js - UPDATED FIX
import { fetchAndProcessData } from './user-data.js';
import { initUI, renderPage, promptForDeviceVerification, requestNotificationPermission } from './user-ui.js';
import { Analytics } from './ui-helpers.js'; // Import Analytics directly

const VAPID_KEY = "BE1NgqUcrYaBxWxd0hRrtW7wES0PJ-orGaxlGVj-oT1UZyJwLaaAk7z6KczQ2ZrSy_XjSwkL6WjpX_gHMpXPp3M";

// 1. UI Start
initUI(null);

// 2. Cache Load
function loadFromLocalCache() {
    try {
        const cachedData = localStorage.getItem('tcf_app_data_cache');
        if (cachedData) {
            renderPage(JSON.parse(cachedData));
        }
    } catch (e) { console.error(e); }
}

// 3. Main Init
async function checkAuthAndInitialize() {
    try {
        if (!firebase.apps.length) {
            const response = await fetch('/api/firebase-config');
            if (response.ok) firebase.initializeApp(await response.json());
        }
        
        if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js');
        
        const db = firebase.database();
        
        // 🔥 ANALYTICS INIT (Important: Database pass karo)
        Analytics.init(db);

        // 🔥 CHECK EXISTING USER
        const savedId = localStorage.getItem('verifiedMemberId');
        if (savedId) {
            Analytics.identifyUser(savedId); // Purana user hai to bata do
        }

        firebase.auth().onAuthStateChanged(user => {
            if (user) runAppLogic(db);
            else window.location.href = 'login.html';
        });

    } catch (error) { console.error("Init Error:", error); }
}

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

async function verifyDeviceAndSetupNotifications(database, allMembers) {
    try {
        let memberId = localStorage.getItem('verifiedMemberId');
        
        // Agar ID nahi hai, to poocho
        if (!memberId) {
            memberId = await promptForDeviceVerification(allMembers);
            if (memberId) {
                localStorage.setItem('verifiedMemberId', memberId);
                Analytics.identifyUser(memberId); // 🔥 Naya user select hua, Analytics update karo!
            } else {
                return;
            }
        } else {
            // Confirm ID again just in case
            Analytics.identifyUser(memberId);
        }
        
        const permission = await requestNotificationPermission();
        if (permission) await registerForPushNotifications(database, memberId);
        
    } catch (e) { console.log(e); }
}

// ... (Baaki functions registerForPushNotifications, InstallBtn same rahenge) ...
async function registerForPushNotifications(database, memberId) {
    if (!VAPID_KEY) return;
    try {
        const registration = await navigator.serviceWorker.ready;
        const messaging = firebase.messaging();
        const token = await messaging.getToken({ vapidKey: VAPID_KEY, serviceWorkerRegistration: registration });
        if (token) await database.ref(`members/${memberId}/notificationTokens/${token}`).set(true);
    } catch (err) { console.error(err); }
}

// Install Logic
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
