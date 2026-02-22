// view_logic.js - FIXED LOGIC (Restored Calculations)

import { initializeApp } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signInAnonymously } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-auth.js";
import { getDatabase, ref, get } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-database.js";
import { initModals } from './view_modals.js'; 

const DEFAULT_PIC = 'https://placehold.co/200x200/E0E7FF/4F46E5?text=User';
const CONFIG = { INACTIVE_DAYS_LEVEL_1: 180, INACTIVE_PROFIT_MULTIPLIER_LEVEL_1: 0.90, INACTIVE_DAYS_LEVEL_2: 365, INACTIVE_PROFIT_MULTIPLIER_LEVEL_2: 0.75 };

let db, auth;
let globalState = {
    member: {}, memberMap: new Map(), allData: [], activeLoans: {}, 
    balanceHistory: [], score: null
};

document.addEventListener("DOMContentLoaded", async () => {
    setupTabNavigation();
    
    // History Filter Logic
    window.filterHistory = (type) => {
        document.querySelectorAll('.filter-btn').forEach(b => {
            b.classList.remove('bg-royal-blue', 'text-white', 'shadow-sm');
            b.classList.add('text-gray-500');
            if(b.textContent.toLowerCase().includes(type === 'transaction' ? 'txn' : type)) {
                b.classList.add('bg-royal-blue', 'text-white', 'shadow-sm');
                b.classList.remove('text-gray-500');
            }
        });
        renderHistoryList(type);
    };

    try {
        const res = await fetch('/api/firebase-config');
        if (!res.ok) throw new Error('Config load failed');
        const config = await res.json();
        
        const app = initializeApp(config);
        auth = getAuth(app);
        db = getDatabase(app);

        onAuthStateChanged(auth, user => {
            if (user) fetchFirebaseData();
            else signInAnonymously(auth).catch(e => console.error(e));
        });
        
        window.addEventListener('scroll', () => {
            const header = document.getElementById('app-header');
            if(window.scrollY > 10) header.classList.add('scrolled', 'shadow-sm');
            else header.classList.remove('scrolled', 'shadow-sm');
        });

    } catch (e) { showError("App Init Failed: " + e.message); }
});

function setupTabNavigation() {
    window.switchTab = (tabName) => {
        document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
        document.querySelectorAll('.nav-btn').forEach(el => el.classList.remove('nav-active'));
        
        const target = document.getElementById('tab-' + tabName);
        if(target) target.classList.add('active');
        
        const btn = document.querySelector(`.nav-btn[data-target="tab-${tabName}"]`);
        if(btn) btn.classList.add('nav-active');
        
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };
}

async function fetchFirebaseData() {
    const id = new URLSearchParams(window.location.search).get('memberId');
    if (!id) { showError("No Membership ID Found"); return; }

    initModals(db, () => ({ currentMemberData: globalState.member, balanceHistory: globalState.balanceHistory }));

    try {
        const [mSnap, tSnap, lSnap] = await Promise.all([
            get(ref(db, 'members')),
            get(ref(db, 'transactions')),
            get(ref(db, 'activeLoans'))
        ]);

        if (!mSnap.exists()) throw new Error("Data not found");

        const members = mSnap.val();
        const txs = tSnap.exists() ? tSnap.val() : {};
        const loans = lSnap.exists() ? lSnap.val() : {};

        processData(id, members, txs, loans);

    } catch (e) { showError(e.message); }
}

// --- CORE LOGIC (Restored from Original) ---
function processData(memberId, members, transactions, activeLoans) {
    globalState.member = members[memberId];
    globalState.member.membershipId = memberId;
    globalState.activeLoans = activeLoans;
    globalState.allData = [];
    globalState.memberMap.clear();

    // Map Member Names
    for (const id in members) {
        if (members[id].status === 'Approved') {
            globalState.memberMap.set(id, { name: members[id].fullName, guarantor: members[id].guarantorName });
        }
    }

    // Process Transactions (Normalize Types)
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

    // 1. Calculate Wallet (Complex Profit Logic)
    const walletData = calculateTotalExtraBalance(memberId, globalState.member.fullName);
    globalState.balanceHistory = walletData.history;
    globalState.member.extraBalance = walletData.total;

    // 2. Calculate Total SIP & Profit
    const memberTxs = globalState.allData.filter(t => t.memberId === memberId);
    globalState.member.totalSip = memberTxs.reduce((s, t) => s + t.sipPayment, 0);
    globalState.member.lifetimeProfit = calculateTotalProfitForMember(globalState.member.fullName);

    // 3. Score Calculation
    if (typeof calculatePerformanceScore === 'function') {
        globalState.score = calculatePerformanceScore(globalState.member.fullName, new Date(), globalState.allData, globalState.activeLoans);
    }

    updateUI();
}

function updateUI() {
    renderHeader();
    renderProfileTab();
    renderAnalyticsTab();
    renderHistoryList('all'); // Default Filter
    renderWalletTab();
    document.getElementById('loader-container').style.display = 'none';
}

// --- RENDER FUNCTIONS ---
// view_logic.js - FIXED IDs

function renderHeader() {
    const m = globalState.member;
    // Updated IDs to match HTML
    setText('header-name', m.fullName);
    setImg('header-profile-pic', m.profilePicUrl);
    setText('profile-id-badge', `ID: ${m.membershipId}`);
    setText('join-date-badge', `Member since ${new Date(m.joiningDate).getFullYear()}`);
}

function renderProfileTab() {
    const m = globalState.member;
    
    // Personal Details
    setText('profile-mobile', m.mobileNumber);
    setText('profile-email', m.email || 'No Email Linked');
    setText('profile-address', m.address);
    setText('profile-aadhaar', m.aadhaar || 'N/A');
    setText('profile-guarantor', m.guarantorName || 'N/A');

    // Docs
    setImg('doc-thumb-pic', m.profilePicUrl);
    setImg('doc-thumb-front', m.documentUrl);
    setImg('doc-thumb-back', m.documentBackUrl);
    setImg('doc-thumb-sign', m.signatureUrl);
}

// REST OF THE FILE REMAINS SAME...



function renderAnalyticsTab() {
    const s = globalState.score;
    if (!s) return;
    setText('analytics-score', s.totalScore.toFixed(0));
    setText('analytics-status', s.totalScore > 50 ? 'Active' : 'Low Score');
    
    // Eligibility Check using Engine Logic
    if (typeof getLoanEligibility === 'function') {
        const elig = getLoanEligibility(globalState.member.fullName, globalState.member.totalSip, globalState.allData);
        setText('analytics-limit', elig.eligible ? `₹${elig.maxAmount.toLocaleString()}` : 'Not Eligible');
    }

    const list = document.getElementById('score-breakdown-list');
    if(list) {
        list.innerHTML = `
            ${scoreRow('Capital', s.capitalScore, 'fas fa-coins')}
            ${scoreRow('Consistency', s.consistencyScore, 'fas fa-sync')}
            ${scoreRow('Credit Behavior', s.creditScore, 'fas fa-hand-holding-usd')}
        `;
    }
}

function renderHistoryList(filterType) {
    const container = document.getElementById('history-container');
    if(!container) return;
    container.innerHTML = '';

    // Filter Logic
    let data = globalState.balanceHistory.slice().reverse(); // Use Processed History first (Wallet)
    
    // If filter is 'loan' or 'all', also mix in Loans
    if (filterType === 'loan' || filterType === 'all') {
        const loans = globalState.allData.filter(t => t.memberId === globalState.member.membershipId && t.loan > 0).map(l => ({
            type: 'loan', date: l.date, amount: l.loan, desc: 'Loan Taken'
        }));
        // Merge if 'all', or replace if 'loan'
        if(filterType === 'loan') data = loans;
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
        const bg = isPlus ? 'bg-green-50' : 'bg-red-50';
        const icon = item.type === 'profit' ? 'fa-chart-line' : (item.type === 'loan' ? 'fa-hand-holding-usd' : 'fa-exchange-alt');
        
        // Formatting Titles
        let title = item.type.toUpperCase();
        if(item.type === 'manual_credit') title = "ADMIN CREDIT";
        if(item.type === 'profit') title = "PROFIT SHARE";

        container.innerHTML += `
        <div class="bg-white p-3 rounded-xl border border-gray-100 shadow-sm flex items-center justify-between">
            <div class="flex items-center gap-3">
                <div class="w-10 h-10 rounded-full ${bg} ${color} flex items-center justify-center text-sm">
                    <i class="fas ${icon}"></i>
                </div>
                <div>
                    <p class="font-bold text-xs text-gray-800">${title}</p>
                    <p class="text-[10px] text-gray-400">${formatDate(item.date)}</p>
                </div>
            </div>
            <p class="font-mono font-bold text-sm ${color}">
                ${isPlus ? '+' : '-'} ₹${Math.abs(item.amount).toLocaleString('en-IN')}
            </p>
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

// --- CALCULATION LOGIC (Restored) ---
function calculateTotalExtraBalance(memberId, memberFullName) {
    const history = [];
    // 1. Profit Shares
    const profitEvents = globalState.allData.filter(r => r.returnAmount > 0);
    profitEvents.forEach(paymentRecord => {
        const result = calculateProfitDistribution(paymentRecord);
        const share = result?.distribution.find(d => d.name === memberFullName);
        if(share && share.share > 0) {
            history.push({ type: 'profit', date: paymentRecord.date, amount: share.share, desc: share.type });
        }
    });
    // 2. Manual Transactions
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
    
    // Self Share (10%)
    distribution.push({ name: paymentRecord.name, share: totalInterest * 0.10, type: 'Self Return (10%)' });
    
    // Guarantor Share (10%)
    const payerInfo = globalState.memberMap.get(paymentRecord.memberId);
    if (payerInfo && payerInfo.guarantor && payerInfo.guarantor !== 'Xxxxx') {
        distribution.push({ name: payerInfo.guarantor, share: totalInterest * 0.10, type: 'Guarantor (10%)' });
    }

    // Community Pool (80% or 70%)
    const communityPool = totalInterest * (distribution.length > 1 ? 0.70 : 0.80); // Adjust based on guarantor presence
    
    // Distribution Logic based on Score Snapshot
    const loanDate = paymentRecord.date; // Approximation
    const eligibleMembers = [];
    let totalSystemScore = 0;

    // Snapshot of members at that time
    for (let [id, m] of globalState.memberMap) {
        if (m.name === paymentRecord.name) continue; // Payer doesn't get community share
        if (typeof calculatePerformanceScore === 'function') {
            const scoreObj = calculatePerformanceScore(m.name, loanDate, globalState.allData, globalState.activeLoans);
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
function formatDate(d) { return d ? new Date(d).toLocaleDateString('en-GB') : '-'; }
function scoreRow(l, s, i) { 
    const c = s > 70 ? 'text-green-500' : (s > 40 ? 'text-yellow-500' : 'text-red-500');
    return `<div class="flex justify-between p-3 bg-gray-50 rounded-xl"><div class="flex gap-2"><i class="${i} text-gray-400"></i><span class="text-xs font-bold">${l}</span></div><span class="font-mono font-bold ${c}">${s.toFixed(0)}</span></div>`; 
}
function showError(msg) { console.error(msg); }
