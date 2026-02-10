// user-main.js (FIXED VERSION)
import { fetchAndProcessData } from './user-data.js';
import { initUI, renderPage, promptForDeviceVerification, requestNotificationPermission } from './user-ui.js';

// 🔥 YAHAN APNI KEY PASTE KAREIN (Jo 'B' se shuru hoti hai)
const VAPID_KEY = "BE1NgqUcrYaBxWxd0hRrtW7wES0PJ-orGaxlGVj-oT1UZyJwLaaAk7z6KczQ2ZrSy_XjSwkL6WjpX_gHMpXPp3M"; 

let swRegistration = null;

// UI Initialization
initUI(null);

// 1. App Initialization
async function checkAuthAndInitialize() {
    try {
        // Firebase Config (Hardcoded for stability)
        const firebaseConfig = {
            // Yahan apni wahi config daalein jo login.html mein thi
            // Agar pehle se initialized hai to ye step skip ho jayega
        };

        // Check if firebase is loaded
        if (!firebase.apps.length) {
             const response = await fetch('/api/firebase-config'); // Fallback
             const config = await response.json();
             firebase.initializeApp(config);
        }
        
        // Service Worker Register
        swRegistration = await registerServiceWorker();
        
        const auth = firebase.auth();
        const db = firebase.database();

        auth.onAuthStateChanged(user => {
            if (user) {
                console.log("User Logged In:", user.uid);
                runAppLogic(db);
            } else {
                console.log("User Not Logged In");
                // window.location.href = 'login.html'; // Testing ke liye comment kiya hai
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
            console.log('SW Registered:', reg);
            return reg;
        } catch (e) {
            console.error('SW Fail:', e);
            return null;
        }
    }
}

// 3. Notification & Token Setup
async function verifyDeviceAndSetupNotifications(database, allMembers) {
    let memberId = localStorage.getItem('verifiedMemberId');
    console.log("Checking Device Verification for:", memberId);

    if (!memberId) {
        memberId = await promptForDeviceVerification(allMembers);
        if (memberId) localStorage.setItem('verifiedMemberId', memberId);
        else return;
    }
    
    // Permission Ask
    const permission = await requestNotificationPermission();
    console.log("Notification Permission:", permission);
    
    if (permission) {
        await registerForPushNotifications(database, memberId);
    } else {
        alert("Please allow notifications properly.");
    }
}

// 4. Token Logic (CRITICAL FIX)
async function registerForPushNotifications(database, memberId) {
    if (!VAPID_KEY || !swRegistration) {
        console.error("Missing VAPID Key or SW Registration");
        return;
    }

    try {
        const messaging = firebase.messaging();
        
        console.log("Getting Token...");
        const token = await messaging.getToken({ 
            vapidKey: VAPID_KEY,
            serviceWorkerRegistration: swRegistration 
        });

        if (token) {
            console.log("🔥 TOKEN GENERATED:", token);
            // Save to DB
            await database.ref(`members/${memberId}/notificationTokens/${token}`).set(true);
            console.log("Token saved to Database!");
            
            messaging.onTokenRefresh(() => {
                messaging.getToken().then((refreshedToken) => {
                    database.ref(`members/${memberId}/notificationTokens/${refreshedToken}`).set(true);
                });
            });
        } else {
            console.log("No Instance ID token available. Request permission to generate one.");
        }
    } catch (err) {
        console.log('An error occurred while retrieving token. ', err);
    }
}

// ... baaki ka code same rahega (Install button wala) ...

document.addEventListener('DOMContentLoaded', checkAuthAndInitialize);
