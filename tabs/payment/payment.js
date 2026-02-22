// tabs/payment/payment.js
import { initUI, setupUIListeners } from './paymentUI.js';

export let currentApp = null;
export let allMembers = [];

export function init(app) {
    currentApp = app;
    const state = app.state;
    const myMemberId = state.member.membershipId;

    // 🚀 CRITICAL FIX: Robust Data Fetching
    // डेटाबेस का स्ट्रक्चर कभी-कभी बदल सकता है, इसलिए हम हर संभव जगह चेक करेंगे
    let rawMembersObj = state.allMembers || state.membersData || (state.dbData ? state.dbData.members : {}) || {};

    if (Object.keys(rawMembersObj).length === 0) {
        console.warn("Payment Tab: Member data not found in commonly known state locations.");
    }

    // खुद को हटाकर और सिर्फ Approved मेंबर्स को फिल्टर करें
    allMembers = Object.values(rawMembersObj).filter(m => 
        m && m.status === 'Approved' && m.membershipId !== myMemberId
    );

    console.log("Payment Tab Initialized with Members:", allMembers.length);

    // 1. Initialize UI (पूरा मेंबर ऑब्जेक्ट पास करें ताकि फोटो भी दिखे)
    initUI(state.member, allMembers);

    // 2. Setup Listeners
    setupUIListeners();
}
