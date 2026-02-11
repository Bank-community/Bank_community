// user-main.js (FINAL PRODUCTION VERSION)
import { fetchAndProcessData } from './user-data.js';
import { initUI, renderPage, promptForDeviceVerification, requestNotificationPermission } from './user-ui.js';

// Aapki VAPID Key
const VAPID_KEY = "BE1NgqUcrYaBxWxd0hRrtW7wES0PJ-orGaxlGVj-oT1UZyJwLaaAk7z6KczQ2ZrSy_XjSwkL6WjpX_gHMpXPp3M";

initUI(null);

// 1. App Start
async function checkAuthAndInitialize() {
    try {
        // Step 1: Config Fetch
        if (!firebase.apps.length) {
            const response = await fetch('/api/firebase-config');
            if (response.ok) {
                const config = await response.json();
                firebase.initializeApp(config);
            }
        }
        
        // Step 2: Register SW (Background)
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('/sw.js');
        }
        
        const auth = firebase.auth();
        const db = firebase.database();

        auth.onAuthStateChanged(user => {
            if (user) {
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

// 2. Setup Notification
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
        console.log(e);
    }
}

// 3. Token Generation (Tested & Verified Logic)
async function registerForPushNotifications(database, memberId) {
    if (!VAPID_KEY) return;

    try {
        // 🔥 WAHI FIX JO KAAM KAR GAYA: Wait for Ready
        const registration = await navigator.serviceWorker.ready;
        const messaging = firebase.messaging();
        
        const token = await messaging.getToken({ 
            vapidKey: VAPID_KEY,
            serviceWorkerRegistration: registration 
        });

        if (token) {
            // Database me save karein
            await database.ref(`members/${memberId}/notificationTokens/${token}`).set(true);
            console.log("Token Updated in DB");
        }
    } catch (err) {
        console.error('Token Error:', err);
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




// === NOTIFICATION SYSTEM FIX (Add this to bottom of user-main.js) ===

const firebaseConfig = {
    apiKey: "AIzaSyBVCDW0Q8YaTPz_MO9FTve1FaPu42jtO2c",
    authDomain: "bank-master-data.firebaseapp.com",
    databaseURL: "https://bank-master-data-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "bank-master-data",
    storageBucket: "bank-master-data.firebasestorage.app",
    messagingSenderId: "778113641069",
    appId: "1:778113641069:web:f2d584555dee89b8ca2d64"
};

// Initialize Firebase only if not already done
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}

const messaging = firebase.messaging();
const db = firebase.database();
const auth = firebase.auth();

// 1. Permission Mango aur Token Save Karo
async function requestNotificationPermission() {
    try {
        const permission = await Notification.requestPermission();
        if (permission === 'granted') {
            console.log('Permission mil gayi!');
            
            // Token generate karo
            const token = await messaging.getToken();
            if (token) {
                console.log('Token:', token);
                saveTokenToDatabase(token);
            }
        } else {
            console.log('Permission nahi mili.');
        }
    } catch (err) {
        console.log('Token error:', err);
    }
}

// 2. Token ko Database mein Save Karo (Member ID ke neeche)
function saveTokenToDatabase(token) {
    auth.onAuthStateChanged(user => {
        if (user) {
            // Ye wahi rasta hai jahan Admin Panel dhundhta hai
            const updates = {};
            updates[`/members/${user.uid}/notificationTokens/${token}`] = true;
            db.ref().update(updates);
            console.log("Token Saved for User:", user.uid);
        }
    });
}

// 3. Page Load hone par Permission mango
document.addEventListener('DOMContentLoaded', () => {
    // Thoda wait karke permission mango taaki user ghabra na jaye
    setTimeout(() => {
        requestNotificationPermission();
    }, 2000);
});

