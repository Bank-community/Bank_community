// loan/js/loan_core.js

// 1. GLOBAL STATE (Shared across modules)
export const loanState = {
    members: {},       // All members data from Firebase
    selectedMember: null, // Currently selected member object
    appMode: 'loan',   // 'loan' or 'withdrawal'
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
        // A. Fetch Config
        const response = await fetch('/api/firebase-config');
        if (!response.ok) throw new Error('Config load failed');
        const config = await response.json();

        // B. Init Firebase (if not already)
        if (!firebase.apps.length) {
            firebase.initializeApp(config);
        }

        // C. Check Auth
        firebase.auth().onAuthStateChanged(user => {
            if (user) {
                console.log("✅ Auth Verified. Loading Members...");
                fetchMembers();
            } else {
                window.location.href = `/login.html?redirect=${window.location.pathname}`;
            }
        });

    } catch (error) {
        console.error("Init Error:", error);
        alert("System Error: " + error.message);
    }
}

// 4. Fetch Members & Populate Dropdown
function fetchMembers() {
    firebase.database().ref('members').once('value')
        .then(snap => {
            loanState.members = snap.val() || {};
            populateDropdown();
        })
        .catch(err => console.error("Data Load Error:", err));
}

// 5. Populate Dropdown
function populateDropdown() {
    nameSelect.innerHTML = '<option value="" disabled selected>Select Member</option>';

    // Sort & Filter
    Object.entries(loanState.members)
        .filter(([_, m]) => m.status === 'Approved')
        .sort((a, b) => a[1].fullName.localeCompare(b[1].fullName))
        .forEach(([id, m]) => {
            const opt = document.createElement('option');
            opt.value = id;
            opt.text = m.fullName;
            nameSelect.appendChild(opt);
        });

    // Notify that data is ready
    console.log(`✅ Loaded ${nameSelect.options.length - 1} members.`);
}

// Start the engine
initLoanApp();
