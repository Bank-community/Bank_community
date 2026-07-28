// tabs/payment/payment.js
import { initUI, setupUIListeners, renderMembersGrid } from './paymentUI.js';
import { ref, onValue } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-database.js";

export let currentApp = null;
export let allMembers = [];
export let allTransactions = []; 

// Check KYC
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

    // --- STEP 1: LOAD FROM CACHE FIRST (Instant Load) ---
    const cachedMembers = localStorage.getItem('tcf_pay_members');
    const cachedTxs = localStorage.getItem('tcf_pay_txs');

    if (cachedMembers && cachedTxs) {
        try {
            allMembers = JSON.parse(cachedMembers);
            allTransactions = JSON.parse(cachedTxs);
            // Render Cache immediately
            initUI(state.member, allMembers); 
        } catch (e) { console.warn("Cache parse error", e); }
    } else {
        // First time load fallback
        initUI(state.member, []);
    }

    // --- STEP 2: REAL-TIME LISTENERS (Background Update) ---

    const membersRef = ref(app.db, 'members');
    onValue(membersRef, (snapshot) => {
        if (snapshot.exists()) {
            const rawMembersObj = snapshot.val();
            allMembers = Object.values(rawMembersObj).filter(m => 
                m && m.status === 'Approved' && m.membershipId !== myMemberId && hasFullKyc(m)
            );
            // Save to Cache
            localStorage.setItem('tcf_pay_members', JSON.stringify(allMembers));

            // Render Updated List
            renderMembersGrid(allMembers);
        }
    });

    const txRef = ref(app.db, 'transactions');
    onValue(txRef, (snapshot) => {
        if (snapshot.exists()) {
            allTransactions = Object.values(snapshot.val());
            // Save to Cache
            localStorage.setItem('tcf_pay_txs', JSON.stringify(allTransactions));

            // Render Updated List (Green dots update honge)
            renderMembersGrid(allMembers);
        }
    });

    setupUIListeners();
}