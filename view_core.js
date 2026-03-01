// view_core.js - THE MASTER ENGINE & ROUTER

import { initializeApp } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signInAnonymously } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-auth.js";
import { getDatabase, ref, get } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-database.js";

// Global App Object - यह डेटा सभी टैब्स इस्तेमाल करेंगे
window.tcfApp = {
    db: null,
    state: { member: {}, memberMap: new Map(), allData: [], activeLoans: {}, balanceHistory: [], score: null },
    currentTab: null
};

document.addEventListener("DOMContentLoaded", async () => {
    try {
        const res = await fetch('/api/firebase-config');
        const config = await res.json();
        const app = initializeApp(config);
        window.tcfApp.db = getDatabase(app);
        const auth = getAuth(app);

        onAuthStateChanged(auth, user => {
            if (user) fetchFirebaseData();
            else signInAnonymously(auth).catch(e => console.error("Auth Error", e));
        });
    } catch (e) { 
        showError("App Init Failed");
    }
});

async function fetchFirebaseData() {
    const id = new URLSearchParams(window.location.search).get('memberId');
    if (!id) return showError("Member ID Missing");

    try {
        const [mSnap, tSnap, lSnap] = await Promise.all([
            get(ref(window.tcfApp.db, 'members')),
            get(ref(window.tcfApp.db, 'transactions')),
            get(ref(window.tcfApp.db, 'activeLoans'))
        ]);

        if (!mSnap.exists() || !mSnap.val()[id]) throw new Error("Data not found");

        processCoreData(id, mSnap.val(), tSnap.exists() ? tSnap.val() : {}, lSnap.exists() ? lSnap.val() : {});

        // Hide Loader
        const loader = document.getElementById('loader-container');
        if(loader) { loader.style.opacity = '0'; setTimeout(() => loader.style.display = 'none', 500); }

        // Start App by loading Profile Tab first
        window.loadTab('profile');

    } catch (e) { 
        showError(e.message);
    }
}

// --- CORE LOGIC (100% Synced mathematical logic) ---
function processCoreData(memberId, members, transactions, activeLoans) {
    const state = window.tcfApp.state;
    state.member = members[memberId];
    state.member.membershipId = memberId;
    state.activeLoans = activeLoans;
    state.allData = [];
    state.memberMap.clear();

    for (const id in members) {
        if (members[id].status === 'Approved') {
            state.memberMap.set(id, { name: members[id].fullName, guarantor: members[id].guarantorName });
        }
    }

    let idCounter = 0;
    for (const txId in transactions) {
        const tx = transactions[txId];
        const mInfo = state.memberMap.get(tx.memberId);
        if (!mInfo) continue;

        let record = {
            id: idCounter++, date: new Date(tx.date), name: mInfo.name, memberId: tx.memberId,
            loan: 0, payment: 0, sipPayment: 0, returnAmount: 0, extraBalance: 0, extraWithdraw: 0, loanType: null
        };

        switch (tx.type) {
            case 'SIP': record.sipPayment = tx.amount || 0; break;
            case 'Loan Taken': record.loan = tx.amount || 0; record.loanType = 'Loan'; break;
            case 'Loan Payment': record.payment = (tx.principalPaid || 0) + (tx.interestPaid || 0); record.returnAmount = tx.interestPaid || 0; break;
            case 'Extra Payment': record.extraBalance = tx.amount || 0; break;
            case 'Extra Withdraw': record.extraWithdraw = tx.amount || 0; break;
            default: continue;
        }
        state.allData.push(record);
    }
    state.allData.sort((a, b) => a.date - b.date || a.id - b.id);

    const walletData = calculateTotalExtraBalance(memberId, state.member.fullName);
    state.balanceHistory = walletData.history;
    state.member.extraBalance = walletData.total;

    const memberTxs = state.allData.filter(t => t.memberId === memberId);
    state.member.totalSip = memberTxs.reduce((s, t) => s + t.sipPayment, 0);
    state.member.lifetimeProfit = calculateTotalProfitForMember(state.member.fullName);

    if (typeof calculatePerformanceScore === 'function') {
        state.score = calculatePerformanceScore(state.member.fullName, new Date(), state.allData, state.activeLoans);
    }
}

function calculateTotalExtraBalance(memberId, memberFullName) {
    const state = window.tcfApp.state;
    const history = [];
    const profitEvents = state.allData.filter(r => r.returnAmount > 0);

    profitEvents.forEach(paymentRecord => {
        const result = calculateProfitDistribution(paymentRecord);
        const share = result?.distribution.find(d => d.name === memberFullName);
        if(share && share.share > 0) {
            history.push({ type: share.type || 'profit', date: paymentRecord.date, amount: share.share, desc: share.type });
        }
    });

    const manualAdjustments = state.allData.filter(tx => tx.memberId === memberId && (tx.extraBalance > 0 || tx.extraWithdraw > 0));
    manualAdjustments.forEach(tx => {
        if (tx.extraBalance > 0) history.push({ type: 'manual_credit', date: tx.date, amount: tx.extraBalance });
        if (tx.extraWithdraw > 0) history.push({ type: 'withdrawal', date: tx.date, amount: -tx.extraWithdraw });
    });

    history.sort((a,b) => a.date - b.date);
    const total = history.reduce((acc, item) => acc + item.amount, 0);
    return { total, history };
}

function calculateProfitDistribution(paymentRecord) { 
    const state = window.tcfApp.state;
    const totalInterest = paymentRecord.returnAmount; 
    if (totalInterest <= 0) return null; 

    const distribution = [];
    distribution.push({ name: paymentRecord.name, share: totalInterest * 0.10, type: 'Self Return (10%)' });

    const payerMemberInfo = state.memberMap.get(paymentRecord.memberId);
    if (payerMemberInfo && payerMemberInfo.guarantor && payerMemberInfo.guarantor !== 'Xxxxx') {
        distribution.push({ name: payerMemberInfo.guarantor, share: totalInterest * 0.10, type: 'Guarantor Commission (10%)' });
    }

    const communityPool = totalInterest * 0.70; 
    const userLoansBefore = state.allData.filter(r => r.name === paymentRecord.name && r.loan > 0 && r.date < paymentRecord.date && r.loanType === 'Loan'); 

    if (userLoansBefore.length === 0) return { distribution };

    const loanDate = userLoansBefore.pop().date; 
    const snapshotScores = {}; 
    let totalScore = 0; 

    [...new Set(state.allData.filter(r => r.date <= loanDate).map(r => r.name))].forEach(name => { 
        if (name === paymentRecord.name) return; 
        const scoreObj = (typeof calculatePerformanceScore === 'function') ? calculatePerformanceScore(name, loanDate, state.allData, state.activeLoans) : { totalScore: 0 };
        if (scoreObj.totalScore > 0) { 
            snapshotScores[name] = scoreObj; 
            totalScore += scoreObj.totalScore; 
        } 
    }); 

    if (totalScore > 0) {
        for (const name in snapshotScores) { 
            let share = (snapshotScores[name].totalScore / totalScore) * communityPool; 
            const lastLoan = state.allData.filter(r => r.name === name && r.loan > 0 && r.date <= loanDate).pop()?.date;
            const days = lastLoan ? (loanDate - lastLoan) / 86400000 : Infinity; 

            let multiplier = 1.0;
            if (days > 365) multiplier = 0.75; 
            else if (days > 180) multiplier = 0.90; 

            share *= multiplier; 
            if (share > 0) distribution.push({ name, share, type: 'Community Profit' }); 
        } 
    }
    return { distribution }; 
}

function calculateTotalProfitForMember(memberName) { 
    return window.tcfApp.state.allData.reduce((acc, tx) => { 
        if (tx.returnAmount > 0) { 
            const res = calculateProfitDistribution(tx); 
            const myShare = res?.distribution.find(d => d.name === memberName); 
            if (myShare) acc += myShare.share; 
        } 
        return acc; 
    }, 0); 
}

// --- TAB ROUTING SYSTEM (The Magic) ---
window.loadTab = async function(tabName) {
    if(window.tcfApp.currentTab === tabName) return;
    window.tcfApp.currentTab = tabName;

    // Update Bottom Nav Styling
    document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('nav-active'));
    const activeBtn = document.querySelector(`.nav-btn[data-target="${tabName}"]`);
    if(activeBtn) activeBtn.classList.add('nav-active');

    const contentDiv = document.getElementById('app-content');
    contentDiv.innerHTML = '<div class="text-center mt-32 text-gray-400"><i class="fas fa-spinner fa-spin text-3xl"></i></div>';

    try {
        // 1. Fetch Tab HTML
        const response = await fetch(`tabs/${tabName}/${tabName}.html`);
        if(!response.ok) throw new Error("Page not found");
        const html = await response.text();
        contentDiv.innerHTML = html;

        // 2. Load Tab Specific JS Dynamically
        import(`./tabs/${tabName}/${tabName}.js`).then(module => {
            if(module.init) module.init(window.tcfApp); // Pass the global app context
        }).catch(err => console.log(`No JS file found for ${tabName} or error in JS:`, err));

        window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch(e) {
        contentDiv.innerHTML = `<div class="text-center mt-32 text-red-500 font-bold"><i class="fas fa-exclamation-triangle"></i> Failed to load ${tabName}</div>`;
    }
};

function showError(msg) {
    const err = document.getElementById('error-message');
    if(err) { err.textContent = msg; err.classList.remove('hidden'); }
}
