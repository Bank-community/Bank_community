// user-main.js (API CONFIG VERSION - FIXED)
import { fetchAndProcessData } from './user-data.js';
import { initUI, renderPage, promptForDeviceVerification } from './user-ui.js';

// Global Variables
let auth, db, messaging;
let VAPID_KEY = null;

// 1. UI LOAD IMMEDIATELY (Taaki screen safed na dikhe)
initUI(null);

// 2. MAIN START FUNCTION
async function initializeApp() {
    try {
        console.log("Fetching config from API...");
        
        // Step A: API se Config lo
        const response = await fetch('/api/config');
        if (!response.ok) throw new Error("Config API Failed");
        
        const firebaseConfig = await response.json();
        VAPID_KEY = firebaseConfig.vapidKey; // Notification ke liye key

        // Step B: Firebase Start karo
        if (!firebase.apps.length) {
            firebase.initializeApp(firebaseConfig);
        }

        auth = firebase.auth();
        db = firebase.database();
        messaging = firebase.messaging();

        // Step C: Service Worker Register karo
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('/sw.js')
                .then(reg => console.log("SW Registered", reg))
                .catch(err => console.log("SW Fail", err));
        }

        // Step D: Login Check & Data Load
        auth.onAuthStateChanged(user => {
            if (user) {
                console.log("User Logged In:", user.uid);
                // Data Load karo
                runAppLogic(db);
                // Notification Permission mango
                setupNotifications(user.uid);
            } else {
                console.log("User Not Logged In -> Login Page");
                window.location.href = 'login.html';
            }
        });

    } catch (error) {
        console.error("Critical Init Error:", error);
        // Agar API fail ho jaye, tab bhi login page par bhejo
        setTimeout(() => window.location.href = 'login.html', 3000);
    }
}

// 3. DATA LOGIC
async function runAppLogic(database) {
    const handleDataUpdate = (data) => {
        if (!data) return;
        renderPage(data);
    };
    await fetchAndProcessData(database, handleDataUpdate);
}

// 4. NOTIFICATION LOGIC (API Key use karega)
async function setupNotifications(uid) {
    try {
        const permission = await Notification.requestPermission();
        if (permission === 'granted') {
            console.log("Notification Permission Granted");
            
            // Token Generate karo
            const token = await messaging.getToken({ vapidKey: VAPID_KEY });
            
            if (token) {
                console.log("FCM Token Generated");
                // Database mein Token save karo
                const updates = {};
                updates[`/members/${uid}/notificationTokens/${token}`] = true;
                db.ref().update(updates);
            }
        }
    } catch (err) {
        console.error("Notification Setup Error:", err);
    }
}

// 5. INSTALL BUTTON
window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    window.deferredInstallPrompt = e;
    const container = document.getElementById('install-button-container');
    if (container) {
        container.innerHTML = `<div style="padding-top:0;"><button id="installAppBtn" class="civil-button btn-glossy" style="background:#28a745;color:white;border-radius:12px;">Install App</button></div>`;
        document.getElementById('installAppBtn').addEventListener('click', async () => {
            if(window.deferredInstallPrompt) {
                window.deferredInstallPrompt.prompt();
                window.deferredInstallPrompt = null;
                container.innerHTML = '';
            }
        });
    }
});

// Start Everything
document.addEventListener('DOMContentLoaded', initializeApp);
