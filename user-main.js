// user-main.js (MERGED & FIXED VERSION)

// 1. IMPORTS
import { fetchAndProcessData } from './user-data.js';
import { initUI, renderPage, promptForDeviceVerification } from './user-ui.js';

// 2. CONFIGURATION (Hardcoded is safer & faster here)
const firebaseConfig = {
    apiKey: "AIzaSyBVCDW0Q8YaTPz_MO9FTve1FaPu42jtO2c",
    authDomain: "bank-master-data.firebaseapp.com",
    databaseURL: "https://bank-master-data-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "bank-master-data",
    storageBucket: "bank-master-data.firebasestorage.app",
    messagingSenderId: "778113641069",
    appId: "1:778113641069:web:f2d584555dee89b8ca2d64"
};

// 3. INITIALIZE FIREBASE (Only Once)
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}

const auth = firebase.auth();
const db = firebase.database();
const messaging = firebase.messaging();

// UI Init
initUI(null);

// 4. MAIN ENTRY POINT (App Start)
async function startApp() {
    console.log("App Starting...");
    
    // Auth Check Listener
    auth.onAuthStateChanged(async (user) => {
        if (user) {
            console.log("User Logged In:", user.uid);
            
            // A. Load Data & UI
            await runAppLogic(db);
            
            // B. Setup Notifications (Background)
            requestNotificationPermission();
            
        } else {
            console.log("No User, Redirecting...");
            // Agar login page alag hai to redirect karo, nahi to yahin login dikhao
             window.location.href = 'login.html'; // Yahan apna login page check kar lena
        }
    });
}

// 5. DATA LOADING LOGIC
async function runAppLogic(database) {
    const handleDataUpdate = (data) => {
        if (!data) return;
        renderPage(data); // UI Render karo
    };
    
    // Data fetch karo ('user-data.js' se)
    await fetchAndProcessData(database, handleDataUpdate);
}

// 6. NOTIFICATION PERMISSION & TOKEN
async function requestNotificationPermission() {
    try {
        const permission = await Notification.requestPermission();
        if (permission === 'granted') {
            console.log('Notification Permission Granted.');
            
            // Token Generate
            const token = await messaging.getToken();
            if (token) {
                saveTokenToDatabase(token);
            } else {
                console.log("No Instance ID token available.");
            }
        } else {
            console.log('Notification Permission Denied.');
        }
    } catch (err) {
        console.error('Notification Error:', err);
    }
}

// 7. SAVE TOKEN TO DB
function saveTokenToDatabase(token) {
    const user = auth.currentUser;
    if (user) {
        const updates = {};
        updates[`/members/${user.uid}/notificationTokens/${token}`] = true;
        
        db.ref().update(updates)
            .then(() => console.log("Token Saved to DB"))
            .catch(err => console.error("Token Save Error:", err));
    }
}

// 8. INSTALL BUTTON LOGIC
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

// START EVERYTHING
document.addEventListener('DOMContentLoaded', startApp);
