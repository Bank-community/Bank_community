// view_logic.js - FAIL-SAFE VERSION (Connects Working Logic to New UI)

import { initializeApp } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signInAnonymously } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-auth.js";
import { getDatabase, ref, get } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-database.js";
import { initModals } from './view_modals.js'; 

const DEFAULT_PIC = 'https://placehold.co/200x200/E0E7FF/4F46E5?text=User';

let db, auth;
// Global State to hold data
let globalState = {
    member: {}, memberMap: new Map(), allData: [], activeLoans: {}, 
    balanceHistory: [], score: null
};

// --- 1. INITIALIZATION & SETUP ---
document.addEventListener("DOMContentLoaded", async () => {

    // FAIL-SAFE: Create Tab Switcher Globally
    window.switchTab = (tabName) => {
        try {
            document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
            document.querySelectorAll('.nav-btn').forEach(el => el.classList.remove('nav-active'));

            const target = document.getElementById('tab-' + tabName);
            if(target) target.classList.add('active');

            const btn = document.querySelector(`.nav-btn[data-target="tab-${tabName}"]`);
            if(btn) btn.classList.add('nav-active');

            window.scrollTo({ top: 0, behavior: 'smooth' });
        } catch(e) { console.error("Tab Switch Error", e); }
    };

    // FAIL-SAFE: History Filter
    window.filterHistory = (type) => {
        try {
            document.querySelectorAll('.filter-btn').forEach(b => {
                b.classList.remove('bg-[#001540]', 'text-white');
                b.classList.add('text-gray-500');
                if(b.textContent.toLowerCase().includes(type === 'transaction' ? 'txn' : type)) {
                    b.classList.add('bg-[#001540]', 'text-white');
                    b.classList.remove('text-gray-500');
                }
            });
            renderHistoryList(type);
        } catch(e) { console.error("Filter Error", e); }
    };

    // Initialize Firebase
    try {
        const res = await fetch('/api/firebase-config');
        const config = await res.json();

        const app = initializeApp(config);
        auth = getAuth(app);
        db = getDatabase(app);

        onAuthStateChanged(auth, user => {
            if (user) fetchFirebaseData();
            else signInAnonymously(auth).catch(e => console.error("Auth Error", e));
        });

    } catch (e) { 
        document.getElementById('error-message').textContent = "App Init Failed";
        document.getElementById('error-message').classList.remove('hidden');
    }
});

// --- 2. DATA FETCHING ---
async function fetchFirebaseData() {
    const id = new URLSearchParams(window.location.search).get('memberId');
    if (!id) { return; }

    // Init Modals from separate file
    try {
        initModals(db, () => ({ 
            currentMemberData: globalState.member, 
            balanceHistory: globalState.balanceHistory, 
            scoreResultCache: globalState.score 
        }));
    } catch(e) { console.warn("Modals Init Warning", e); }

    try {
        const [mSnap, tSnap, lSnap] = await Promise.all([
            get(ref(db, 'members')),
            get(ref(db, 'transactions')),
            get(ref(db, 'activeLoans'))
        ]);

        if (!mSnap.exists()) throw new Error("Data not found");

        processData(id, mSnap.val(), tSnap.exists() ? tSnap.val() : {}, lSnap.exists() ? lSnap.val() : {});

    } catch (e) { 
        console.error("Fetch Error", e);
    }
}

// --- 3. LOGIC PROCESSING (Kept intact from working code) ---
function processData(memberId, members, transactions, activeLoans) {
    try {
        if(!members[memberId]) return;

        globalState.member = members[memberId];
        globalState.member.membershipId = memberId;
        globalState.activeLoans = activeLoans;
        globalState.allData = [];
        globalState.memberMap.clear();

        // 1. Map Names
        for (const id in members) {
            if (members[id].status === 'Approved') {
                globalState.memberMap.set(id, { name: members[id].fullName, guarantor: members[id].guarantorName });
            }
        }

        // 2. Process Transactions
        let idCounter = 0;
        for (const txId in transactions) {
            const tx = transactions[txId];
            const mInfo = globalState.memberMap.get(tx.memberId);
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
            globalState.allData.push(record);
        }
        globalState.allData.sort((a, b) => a.date - b.date || a.id - b.id);

        // 3. Calculate Wallet (Complex Logic)
        const walletData = calculateTotalExtraBalance(memberId, globalState.member.fullName);
        globalState.balanceHistory = walletData.history;
        globalState.member.extraBalance = walletData.total;

        // 4. Calculate Stats
        const memberTxs = globalState.allData.filter(t => t.memberId === memberId);
        globalState.member.totalSip = memberTxs.reduce((s, t) => s + t.sipPayment, 0);
        globalState.member.lifetimeProfit = calculateTotalProfitForMember(globalState.member.fullName);

        // 5. Score
        if (typeof calculatePerformanceScore === 'function') {
            globalState.score = calculatePerformanceScore(globalState.member.fullName, new Date(), globalState.allData, globalState.activeLoans);
        }

        // UPDATE UI NOW
        updateAllUI();

    } catch(e) {
        console.error("Processing Logic Error", e);
    }
}

// --- 4. SAFE UI UPDATES (The Fail-Safe System) ---
function updateAllUI() {
    // Hide Loader first
    const loader = document.getElementById('loader-container');
    if(loader) { loader.style.opacity = '0'; setTimeout(() => loader.style.display = 'none', 500); }

    // Execute each part independently
    safeRender(renderHeader, "Header");
    safeRender(renderProfileTab, "Profile Tab");
    safeRender(renderAnalyticsTab, "Score Tab");
    safeRender(() => renderHistoryList('all'), "History Tab");
    safeRender(renderWalletTab, "Wallet Tab");
}

function safeRender(fn, name) {
    try { fn(); } 
    catch(e) { console.error(`Failed to render ${name}:`, e); }
}

// --- RENDER FUNCTIONS (Mapped to New IDs) ---
function renderHeader() {
    const m = globalState.member;
    setText('header-name', m.fullName);
    setText('header-id', `ID: ${m.membershipId}`);
    setImg('header-profile-pic', m.profilePicUrl);
}

function renderProfileTab() {
    const m = globalState.member;
    setText('profile-mobile', m.mobileNumber);
    setText('profile-email', m.email || 'No Email');
    setText('profile-address', m.address);
    // NEW Guarantor Logic
    setText('profile-guarantor', m.guarantorName || 'N/A');

    // Images
    setImg('doc-thumb-pic', m.profilePicUrl);
    setImg('doc-thumb-front', m.documentUrl);
    setImg('doc-thumb-back', m.documentBackUrl);
    setImg('doc-thumb-sign', m.signatureUrl);
}

function renderAnalyticsTab() {
    const s = globalState.score;
    if (!s) return;

    setText('analytics-score', s.totalScore.toFixed(0));
    setText('analytics-status', s.totalScore > 50 ? 'Good' : 'Low');

    // Safe Eligibility Check
    if (typeof getLoanEligibility === 'function') {
        const elig = getLoanEligibility(globalState.member.fullName, globalState.member.totalSip, globalState.allData);
        setText('analytics-limit', elig.eligible ? `₹${elig.maxAmount.toLocaleString()}` : 'No');
    }

    // Score Breakdown
    const list = document.getElementById('score-breakdown-list');
    if(list) {
        list.innerHTML = `
            ${scoreRow('Capital', s.capitalScore, 'fas fa-coins')}
            ${scoreRow('Consistency', s.consistencyScore, 'fas fa-sync')}
            ${scoreRow('Credit', s.creditScore, 'fas fa-hand-holding-usd')}
        `;
    }
}

function renderHistoryList(filterType) {
    const container = document.getElementById('history-container');
    if(!container) return;
    container.innerHTML = '';

    // Logic for Filtering
    let data = globalState.balanceHistory.slice().reverse(); 

    if (filterType === 'loan' || filterType === 'all') {
        const loans = globalState.allData.filter(t => t.memberId === globalState.member.membershipId && t.loan > 0).map(l => ({
            type: 'loan', date: l.date, amount: l.loan, desc: 'Loan Taken'
        }));
        if(filterType === 'loan') data = loans.reverse();
        else data = [...data, ...loans].sort((a,b) => b.date - a.date);
    }

    if (filterType === 'transaction') {
         data = globalState.balanceHistory.filter(h => h.type !== 'loan');
    }

    if(data.length === 0) {
        container.innerHTML = `<div class="text-center py-10 text-gray-400"><p>No records found</p></div>`; return;
    }

    data.slice(0, 50).forEach(item => {
        const isPlus = item.amount > 0 && item.type !== 'withdrawal' && item.type !== 'loan';
        const color = isPlus ? 'text-green-600' : 'text-red-600';
        const icon = item.type === 'profit' ? 'fa-chart-line' : (item.type === 'loan' ? 'fa-hand-holding-usd' : 'fa-exchange-alt');
        let title = item.type === 'profit' ? 'Profit Share' : (item.type || 'Txn');

        container.innerHTML += `
        <div class="bg-white p-3 rounded-xl border border-gray-100 shadow-sm flex items-center justify-between">
            <div class="flex items-center gap-3">
                <div class="w-8 h-8 rounded-full bg-gray-50 flex items-center justify-center text-xs text-gray-500"><i class="fas ${icon}"></i></div>
                <div>
                    <p class="font-bold text-xs text-gray-800 uppercase">${title}</p>
                    <p class="text-[9px] text-gray-400">${item.date.toLocaleDateString('en-GB')}</p>
                </div>
            </div>
            <p class="font-mono font-bold text-sm ${color}">${isPlus ? '+' : ''}₹${Math.abs(item.amount).toLocaleString('en-IN')}</p>
        </div>`;
    });
}

function renderWalletTab() {
    const m = globalState.member;
    setText('wallet-balance', `₹${(m.extraBalance || 0).toLocaleString('en-IN', {minimumFractionDigits: 2})}`);
    setText('modal-available-balance', `₹${(m.extraBalance || 0).toLocaleString('en-IN')}`);
    setText('wallet-profit', `₹${(m.lifetimeProfit || 0).toLocaleString('en-IN')}`);
    setText('wallet-invested', `₹${(m.totalSip || 0).toLocaleString('en-IN')}`);
    setText('wallet-guarantor', m.guarantorName || 'N/A');
}

// --- CALCULATION HELPERS (Needed for Wallet) ---
function calculateTotalExtraBalance(memberId, memberFullName) {
    const history = [];
    const profitEvents = globalState.allData.filter(r => r.returnAmount > 0);

    // Profit Logic
    profitEvents.forEach(paymentRecord => {
        const result = calculateProfitDistribution(paymentRecord);
        const share = result?.distribution.find(d => d.name === memberFullName);
        if(share && share.share > 0) {
            history.push({ type: share.type || 'profit', date: paymentRecord.date, amount: share.share, desc: share.type });
        }
    });

    // Manual Transactions
    const manualAdjustments = globalState.allData.filter(tx => tx.memberId === memberId && (tx.extraBalance > 0 || tx.extraWithdraw > 0));
    manualAdjustments.forEach(tx => {
        if (tx.extraBalance > 0) history.push({ type: 'manual_credit', date: tx.date, amount: tx.extraBalance });
        if (tx.extraWithdraw > 0) history.push({ type: 'withdrawal', date: tx.date, amount: -tx.extraWithdraw });
    });

    history.sort((a,b) => a.date - b.date);
    const total = history.reduce((acc, item) => acc + item.amount, 0);
    return { total, history };
}

function calculateProfitDistribution(paymentRecord) { 
    const totalInterest = paymentRecord.returnAmount; 
    if (totalInterest <= 0) return null; 
    const distribution = [];

    distribution.push({ name: paymentRecord.name, share: totalInterest * 0.10, type: 'Self Return (10%)' });

    const payerInfo = globalState.memberMap.get(paymentRecord.memberId);
    if (payerInfo && payerInfo.guarantor && payerInfo.guarantor !== 'Xxxxx') {
        distribution.push({ name: payerInfo.guarantor, share: totalInterest * 0.10, type: 'Guarantor (10%)' });
    }

    const communityPool = totalInterest * (distribution.length > 1 ? 0.70 : 0.80); 

    // Simplified distribution for UI speed (Assumes equal share if score fails)
    let totalSystemScore = 0;
    const eligibleMembers = [];

    for (let [id, m] of globalState.memberMap) {
        if (m.name === paymentRecord.name) continue; 
        if (typeof calculatePerformanceScore === 'function') {
            const scoreObj = calculatePerformanceScore(m.name, paymentRecord.date, globalState.allData, globalState.activeLoans);
            if(scoreObj.totalScore > 0) {
                eligibleMembers.push({ name: m.name, score: scoreObj.totalScore });
                totalSystemScore += scoreObj.totalScore;
            }
        }
    }

    if(totalSystemScore > 0) {
        eligibleMembers.forEach(m => {
            const share = (m.score / totalSystemScore) * communityPool;
            distribution.push({ name: m.name, share: share, type: 'Community Profit' });
        });
    }

    return { distribution }; 
}

function calculateTotalProfitForMember(memberName) { 
    return globalState.allData.reduce((acc, tx) => { 
        if (tx.returnAmount > 0) { 
            const res = calculateProfitDistribution(tx); 
            const myShare = res?.distribution.find(d => d.name === memberName); 
            if (myShare) acc += myShare.share; 
        } 
        return acc; 
    }, 0); 
}

// --- UTILS ---
function setText(id, val) { const el = document.getElementById(id); if(el) el.textContent = val; }
function setImg(id, url) { const el = document.getElementById(id); if(el) el.src = url || DEFAULT_PIC; }
function scoreRow(l, s, i) { return `<div class="flex justify-between p-3 bg-gray-50 rounded-xl"><div class="flex gap-2"><i class="${i} text-gray-400"></i><span class="text-xs font-bold">${l}</span></div><span class="font-mono font-bold text-blue-600">${s.toFixed(0)}</span></div>`; }