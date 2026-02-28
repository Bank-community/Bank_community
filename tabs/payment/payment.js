// tabs/payment/payment.js

// 1. Import 'renderMembersGrid' taaki naya data aate hi list refresh ho jaye
import { initUI, setupUIListeners, renderMembersGrid } from './paymentUI.js';
// 2. 'get' ki jagah 'onValue' import karein real-time ke liye
import { ref, onValue } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-database.js";

export let currentApp = null;
export let allMembers = [];
export let allTransactions = []; 

// 🚨 FIX: 100% Correct Full KYC Check (According to profile.js)
export function hasFullKyc(member) {
    return member && 
           member.profilePicUrl && 
           member.documentFrontUrl && 
           member.documentBackUrl && 
           member.signatureUrl;
}

export async function init(app) {
    currentApp = app;
    const state = app.state;
    const myMemberId = state.member.membershipId;

    // --- 1. REAL-TIME MEMBERS LISTENER ---
    // Jaise hi koi naya member judega ya KYC karega, list update ho jayegi
    const membersRef = ref(app.db, 'members');
    onValue(membersRef, (snapshot) => {
        if (snapshot.exists()) {
            const rawMembersObj = snapshot.val();
            allMembers = Object.values(rawMembersObj).filter(m => 
                m && m.status === 'Approved' && m.membershipId !== myMemberId && hasFullKyc(m)
            );
        } else {
            allMembers = [];
        }
        // Naya data aate hi Grid refresh karein
        renderMembersGrid(allMembers);
    });

    // --- 2. REAL-TIME TRANSACTIONS LISTENER ---
    // Jaise hi paisa aayega/jayega, yeh chalega aur Green Dot update karega
    const txRef = ref(app.db, 'transactions');
    onValue(txRef, (snapshot) => {
        if (snapshot.exists()) {
            allTransactions = Object.values(snapshot.val());
        } else {
            allTransactions = [];
        }
        // Transactions update hone par bhi grid refresh karein (Green Dot ke liye)
        renderMembersGrid(allMembers);
    });

    // Initialize UI (First time setup)
    initUI(state.member, allMembers);

    // Setup Listeners (Buttons etc)
    setupUIListeners();
}
