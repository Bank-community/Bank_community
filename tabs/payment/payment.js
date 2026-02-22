// tabs/payment/payment.js
import { initUI, setupUIListeners } from './paymentUI.js';
import { ref, get } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-database.js";

export let currentApp = null;
export let allMembers = [];
export let allTransactions = []; 

// 🚨 NEW: Full KYC Check Function (Receiver ke liye)
// Ye check karega ki member ke paas Photo, Aadhaar aur Signature hai ya nahi
function hasFullKyc(member) {
    return member.profilePicUrl && member.documentUrl && member.signatureUrl; 
}

export async function init(app) {
    currentApp = app;
    const state = app.state;
    const myMemberId = state.member.membershipId;

    // 1. Fetch Live Members (With Full KYC Filter)
    try {
        const membersSnap = await get(ref(app.db, 'members'));
        if (membersSnap.exists()) {
            const rawMembersObj = membersSnap.val();
            // 🔒 SECURITY UPDATE: Sirf wahi member list mein aayenge jinka KYC pura hai
            allMembers = Object.values(rawMembersObj).filter(m => 
                m && m.status === 'Approved' && m.membershipId !== myMemberId && hasFullKyc(m)
            );
        } else {
            allMembers = [];
        }
    } catch (error) {
        console.error("Members fetch failed:", error);
        const fallbackObj = state.allMembers || state.membersData || {};
        allMembers = Object.values(fallbackObj).filter(m => 
            m && m.status === 'Approved' && m.membershipId !== myMemberId && hasFullKyc(m)
        );
    }

    // 2. Fetch Live Transactions 
    try {
        const txSnap = await get(ref(app.db, 'transactions'));
        if (txSnap.exists()) {
            allTransactions = Object.values(txSnap.val());
        } else {
            allTransactions = [];
        }
    } catch (error) {
        console.error("Transactions fetch failed:", error);
        const fallbackTx = state.allData || {};
        allTransactions = Array.isArray(fallbackTx) ? fallbackTx : Object.values(fallbackTx);
    }

    // Initialize UI
    initUI(state.member, allMembers);

    // Setup Listeners
    setupUIListeners();
}
