// loan/js/loan_core.js

import { initializeApp } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signInAnonymously } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-auth.js";
import { getDatabase, ref, get } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-database.js";

// 1. GLOBAL STATE (Shared across modules)
export const loanState = {
    members: {},          // All members data
    selectedMember: null, // Currently selected member object
    appMode: 'loan',      // 'loan' or 'withdrawal'
    config: {
        maxLoanLimit: 50000,
        withdrawalLimitPercent: 0.5
    }
};

// 2. DOM Elements
const nameSelect = document.getElementById('nameSelect');

// 3. Initialize App
export async function initLoanApp() {
    try {
        console.log("🔄 Connecting to API...");

        // A. Fetch Config from Vercel API
        const response = await fetch('/api/firebase-config');
        if (!response.ok) throw new Error('Config load failed');
        const config = await response.json();

        // B. Init Firebase
        const app = initializeApp(config);
        const auth = getAuth(app);
        const db = getDatabase(app);

        // C. Check Auth & Load Data
        onAuthStateChanged(auth, user => {
            if (user) {
                console.log("✅ Authenticated. Fetching Members...");
                fetchMembers(db);
            } else {
                console.log("⚠️ Not Logged In. Attempting Anonymous Login...");
                signInAnonymously(auth).catch(e => {
                    console.error("Auth Failed:", e);
                    alert("Authentication Failed. Please refresh.");
                });
            }
        });

    } catch (error) {
        console.error("Init Error:", error);
        nameSelect.innerHTML = '<option>Error loading system</option>';
    }
}

// 4. Fetch Members & Populate Dropdown
async function fetchMembers(db) {
    try {
        const snapshot = await get(ref(db, 'members'));
        if (snapshot.exists()) {
            loanState.members = snapshot.val();
            populateDropdown();
        } else {
            console.warn("No members found in DB.");
            nameSelect.innerHTML = '<option>No members found</option>';
        }
    } catch (err) {
        console.error("Data Load Error:", err);
    }
}

// 5. Populate Dropdown
function populateDropdown() {
    nameSelect.innerHTML = '<option value="" disabled selected>Select Member</option>';

    // Convert Object to Array, Filter & Sort
    const sortedMembers = Object.entries(loanState.members)
        .map(([id, data]) => ({ id, ...data }))
        .filter(m => m.status === 'Approved' && !m.isDisabled) // Only Active Members
        .sort((a, b) => a.fullName.localeCompare(b.fullName));

    sortedMembers.forEach(m => {
        const opt = document.createElement('option');
        opt.value = m.id;
        opt.text = m.fullName;
        nameSelect.appendChild(opt);
    });

    console.log(`✅ Loaded ${sortedMembers.length} members.`);

    // Dispatch Event so UI knows data is ready (Optional but good practice)
    document.dispatchEvent(new CustomEvent('loanDataReady'));
}

// Start the engine
initLoanApp();
