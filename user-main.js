// user-main.js - FIXED ENGINE
// Connects Data to the new UI Logic

import { fetchAndProcessData } from './user-data.js';
import { initUI, renderPage } from './user-ui.js'; 
import { Analytics } from './ui-helpers.js';

// 1. UI Listeners Start (Immediate)
// This sets up the bottom nav clicks even before data loads
initUI(null);

// 2. Cache Load (Offline First)
function loadFromLocalCache() {
    try {
        // Updated cache key to force refresh for new structure
        const cachedData = localStorage.getItem('tcf_royal_cache_v5'); 
        if (cachedData) {
            const data = JSON.parse(cachedData);
            // Verify data integrity before rendering
            if(data && data.members) {
                renderPage(data); // Show cached data immediately
            }
        }
    } catch (e) { console.error("Cache Error:", e); }
}

// 3. App Entry Point
async function checkAuthAndInitialize() {
    try {
        // Try Cache First
        loadFromLocalCache();

        // Firebase Setup
        if (!firebase.apps.length) {
            const response = await fetch('/api/firebase-config');
            if (response.ok) {
                firebase.initializeApp(await response.json());
            }
        }

        const db = firebase.database();
        const auth = firebase.auth();

        // Auth Listener
        auth.onAuthStateChanged(user => {
            if (user) {
                Analytics.init(db);
                // Start the main data fetch loop
                runAppLogic(db);
            } else {
                window.location.href = 'login.html';
            }
        });

    } catch (error) {
        console.error("Critical Init Error:", error);
        // If critical fail, try to render cache anyway
        loadFromLocalCache();
    }
}

// 4. Main Data Logic
async function runAppLogic(database) {

    const handleDataUpdate = (data) => {
        if (!data) return;

        // Save to cache
        try {
            localStorage.setItem('tcf_royal_cache_v5', JSON.stringify(data));
        } catch(e) { console.warn("Cache write failed (quota?)"); }

        // 🔥 Render the new UI
        renderPage(data);
    };

    // Fetch fresh data
    await fetchAndProcessData(database, handleDataUpdate);
}

// PWA Install Logic
window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    window.deferredInstallPrompt = e;
    const container = document.getElementById('install-button-container');
    if (container) {
        container.innerHTML = `<div class="dynamic-buttons-wrapper"><button id="installAppBtn" class="civil-button btn-glossy" style="background:#28a745;color:white;"><i data-feather="download-cloud"></i> Install App</button></div>`;
        if(typeof feather !== 'undefined') feather.replace();

        const btn = document.getElementById('installAppBtn');
        if(btn) {
            btn.onclick = async () => {
                if(window.deferredInstallPrompt) {
                    window.deferredInstallPrompt.prompt();
                    await window.deferredInstallPrompt.userChoice;
                    window.deferredInstallPrompt = null;
                    container.innerHTML = '';
                }
            };
        }
    }
});

// Start the engine
document.addEventListener('DOMContentLoaded', checkAuthAndInitialize);
