// tabs/payment/payment.js
import { initUI, setupUIListeners } from './paymentUI.js';
import { ref, get } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-database.js";

export let currentApp = null;
export let allMembers = [];
export let allTransactions = []; // 🚀 NEW: Live transactions store karne ke liye

export async function init(app) {
    currentApp = app;
    const state = app.state;
    const myMemberId = state.member.membershipId;

    // 1. Fetch Live Members (No members found error fix)
    try {
        const membersSnap = await get(ref(app.db, 'members'));
        if (membersSnap.exists()) {
            const rawMembersObj = membersSnap.val();
            allMembers = Object.values(rawMembersObj).filter(m => 
                m && m.status === 'Approved' && m.membershipId !== myMemberId
            );
        } else {
            allMembers = [];
        }
    } catch (error) {
        console.error("Members fetch failed:", error);
        const fallbackObj = state.allMembers || state.membersData || {};
        allMembers = Object.values(fallbackObj).filter(m => 
            m && m.status === 'Approved' && m.membershipId !== myMemberId
        );
    }

    // 2. 🚀 NEW: Fetch Live Transactions (Taki calculation mein crash na ho)
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
