// tabs/payment/payment.js
import { initUI, setupUIListeners } from './paymentUI.js';

export let currentApp = null;
export let allMembers = [];

export function init(app) {
    currentApp = app;
    const state = app.state;
    const myMemberId = state.member.membershipId;

    // 🚀 FIX: "No Members Found" Error
    // यह कोड डेटाबेस के किसी भी ऑब्जेक्ट से मेंबर्स को सही तरीके से निकाल लेगा
    const rawMembers = state.membersData || state.members || state.allMembers || {};

    // Convert object to array and filter out the current user and unapproved members
    allMembers = Object.values(rawMembers).filter(m => 
        m && m.status === 'Approved' && m.membershipId !== myMemberId
    );

    // 1. Initialize UI (Design & Grid)
    initUI(state.member, allMembers);

    // 2. Setup Button Clicks
    setupUIListeners();
}
