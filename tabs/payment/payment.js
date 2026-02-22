// tabs/payment/payment.js
import { initUI, setupUIListeners } from './paymentUI.js';
import { ref, get } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-database.js";

export let currentApp = null;
export let allMembers = [];

export async function init(app) {
    currentApp = app;
    const state = app.state;
    const myMemberId = state.member.membershipId;

    // 🚀 MASTER FIX: Fetch live data directly from Firebase to avoid "No Members Found" bug
    try {
        const membersSnap = await get(ref(app.db, 'members'));
        if (membersSnap.exists()) {
            const rawMembersObj = membersSnap.val();
            // Filter all approved members except self
            allMembers = Object.values(rawMembersObj).filter(m => 
                m && m.status === 'Approved' && m.membershipId !== myMemberId
            );
        } else {
            allMembers = [];
        }
    } catch (error) {
        console.error("Direct fetch failed, falling back to state:", error);
        const fallbackObj = state.allMembers || state.membersData || {};
        allMembers = Object.values(fallbackObj).filter(m => 
            m && m.status === 'Approved' && m.membershipId !== myMemberId
        );
    }

    // 1. Initialize UI with the fully loaded live member list
    initUI(state.member, allMembers);

    // 2. Setup Listeners
    setupUIListeners();
}
