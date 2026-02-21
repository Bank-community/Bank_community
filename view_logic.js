// view_logic.js - Native App Logic v2.0 (Tabbed Architecture)

// --- IMPORTS ---
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signInAnonymously } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-auth.js";
import { getDatabase, ref, get } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-database.js";
import { initModals } from './view_modals.js'; 

// --- CONFIG & STATE ---
const DEFAULT_PIC = 'https://placehold.co/200x200/E0E7FF/4F46E5?text=User';
let db, auth;
let globalState = {
    member: {},      // Current Member Data
    transactions: [], // All Transactions
    loans: {},       // Active Loans Map
    history: [],     // Processed History for Wallet/Logs
    score: null      // Calculated Score
};

// --- 1. INITIALIZATION ---
document.addEventListener("DOMContentLoaded", async () => {
    // A. Setup Tabs
    setupTabNavigation();

    // B. Instant Cache Load (Offline First)
    loadFromCache();

    // C. Initialize Firebase
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

        // Scroll Listener for Header Effect
        window.addEventListener('scroll', () => {
            const header = document.getElementById('app-header');
            if(window.scrollY > 10) header.classList.add('scrolled', 'shadow-sm');
            else header.classList.remove('scrolled', 'shadow-sm');
        });

    } catch (e) {
        showError("App Init Failed: " + e.message);
    }
});

// --- 2. TAB NAVIGATION LOGIC ---
function setupTabNavigation() {
    window.switchTab = (tabName) => {
        // Hide all tabs
        document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
        document.querySelectorAll('.nav-btn').forEach(el => el.classList.remove('nav-active'));

        // Show Target
        const target = document.getElementById('tab-' + tabName);
        if(target) target.classList.add('active');

        // Update Nav Icon
        const btn = document.querySelector(`.nav-btn[data-target="tab-${tabName}"]`);
        if(btn) btn.classList.add('nav-active');

        // Smooth Scroll to top
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };
}

// --- 3. DATA HANDLING (CACHE & FETCH) ---
function getMemberId() {
    return new URLSearchParams(window.location.search).get('memberId');
}

function loadFromCache() {
    const id = getMemberId();
    if (!id) return;
    const cached = localStorage.getItem(`tcf_app_cache_${id}`);
    if (cached) {
        console.log("⚡ Loaded from Cache");
        const data = JSON.parse(cached);
        processData(data.member, data.txs, data.loans);
    }
}

async function fetchFirebaseData() {
    const id = getMemberId();
    if (!id) { showError("No Membership ID Found"); return; }

    initModals(db, () => ({ currentMemberData: globalState.member, balanceHistory: globalState.history }));

    try {
        const [mSnap, tSnap, lSnap] = await Promise.all([
            get(ref(db, `members/${id}`)),
            get(ref(db, 'transactions')),
            get(ref(db, 'activeLoans'))
        ]);

        if (!mSnap.exists()) throw new Error("Member not found");

        const member = mSnap.val();
        member.membershipId = id; // Ensure ID is attached
        const txs = tSnap.exists() ? tSnap.val() : {};
        const loans = lSnap.exists() ? lSnap.val() : {};

        // Save Cache
        localStorage.setItem(`tcf_app_cache_${id}`, JSON.stringify({ member, txs, loans }));

        processData(member, txs, loans);

    } catch (e) {
        showError(e.message);
    }
}

// --- 4. DATA PROCESSING ---
function processData(member, txMap, loansMap) {
    globalState.member = member;
    globalState.loans = loansMap;

    // Convert Transactions Map to Array
    let rawTxs = [];
    Object.entries(txMap).forEach(([key, val]) => {
        if(val.memberId === member.membershipId) {
            rawTxs.push({ ...val, id: key, dateObj: new Date(val.date) });
        }
    });
    rawTxs.sort((a, b) => b.dateObj - a.dateObj); // Newest first

    // Calculate Wallet Balance (Logic from previous code)
    const walletHistory = [];
    let extraBalance = 0;

    // Profit Entries (Mock logic based on existing transaction types)
    // Note: In a real scenario, this matches the complex profit logic from view_logic.js
    // Here we simplify for the native view to ensure it renders first.
    rawTxs.forEach(tx => {
        if (tx.type === 'Extra Payment') {
            walletHistory.push({ type: 'credit', amount: tx.amount, date: tx.date, desc: 'Deposit' });
            extraBalance += tx.amount;
        } else if (tx.type === 'Extra Withdraw') {
            walletHistory.push({ type: 'debit', amount: tx.amount, date: tx.date, desc: 'Withdrawal' });
            extraBalance -= tx.amount;
        }
    });

    // Score Calculation (Using score_engine.js if available)
    if (typeof calculatePerformanceScore === 'function') {
        // Need full transaction list for score engine, mapping mock data for now
        // ensuring compatibility with engine's expected format
        const engineData = rawTxs.map(t => ({
            name: member.fullName,
            date: t.dateObj,
            loan: t.type === 'Loan Taken' ? t.amount : 0,
            payment: t.type === 'Loan Payment' ? (t.principalPaid || 0) : 0,
            sipPayment: t.type === 'SIP' ? t.amount : 0,
            loanType: t.type === 'Loan Taken' ? 'Loan' : null
        }));

        globalState.score = calculatePerformanceScore(member.fullName, new Date(), engineData, loansMap);
    }

    globalState.member.extraBalance = extraBalance;
    globalState.history = rawTxs;

    updateUI();
}

// --- 5. UI RENDERING (SPLIT BY TABS) ---
function updateUI() {
    renderHeader();
    renderProfileTab();
    renderAnalyticsTab();
    renderHistoryTab();
    renderWalletTab();

    document.getElementById('loader-container').style.display = 'none';
}

function renderHeader() {
    const m = globalState.member;
    setText('header-name', m.fullName);
    setImg('header-profile-pic', m.profilePicUrl);
}

function renderProfileTab() {
    const m = globalState.member;
    setText('profile-id', m.membershipId);
    setText('profile-join-date', `Joined: ${formatDate(m.joiningDate)}`);
    setText('profile-mobile', m.mobileNumber);
    setText('profile-email', m.email || 'No Email Linked');
    setText('profile-address', m.address);

    setImg('doc-thumb-pic', m.profilePicUrl);
    setImg('doc-thumb-front', m.documentUrl);
    setImg('doc-thumb-back', m.documentBackUrl);
    setImg('doc-thumb-sign', m.signatureUrl);
}

function renderAnalyticsTab() {
    const s = globalState.score;
    if (!s) return;

    setText('analytics-score', s.totalScore.toFixed(0));
    setText('analytics-status', s.totalScore > 50 ? 'Excellent' : 'Needs Improvement');

    // Eligibility (Mock)
    const limit = s.totalScore > 70 ? '₹50,000' : '₹20,000';
    setText('analytics-limit', limit);

    // Render Breakdown
    const list = document.getElementById('score-breakdown-list');
    if(list) {
        list.innerHTML = `
            ${scoreRow('Capital', s.capitalScore, 'fas fa-coins')}
            ${scoreRow('Consistency', s.consistencyScore, 'fas fa-sync')}
            ${scoreRow('Credit Behavior', s.creditScore, 'fas fa-hand-holding-usd')}
        `;
    }
}

function renderHistoryTab() {
    const container = document.getElementById('history-container');
    if(!container) return;

    container.innerHTML = '';

    if(globalState.history.length === 0) {
        container.innerHTML = `<div class="text-center py-10 text-gray-400"><i class="fas fa-history text-4xl mb-2 opacity-30"></i><p>No transactions yet</p></div>`;
        return;
    }

    globalState.history.slice(0, 50).forEach(tx => {
        const isCredit = ['SIP', 'Loan Payment', 'Extra Payment'].includes(tx.type);
        const icon = getTxIcon(tx.type);

        const html = `
        <div class="bg-white p-3 rounded-xl border border-gray-100 shadow-sm flex items-center justify-between">
            <div class="flex items-center gap-3">
                <div class="w-10 h-10 rounded-full ${isCredit ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600'} flex items-center justify-center text-lg">
                    <i class="fas ${icon}"></i>
                </div>
                <div>
                    <p class="font-bold text-sm text-gray-800">${tx.type}</p>
                    <p class="text-[10px] text-gray-400">${formatDate(tx.date)}</p>
                </div>
            </div>
            <p class="font-mono font-bold ${isCredit ? 'text-green-600' : 'text-red-600'}">
                ${isCredit ? '+' : '-'} ₹${(tx.amount || (tx.principalPaid + tx.interestPaid) || 0).toLocaleString()}
            </p>
        </div>`;
        container.innerHTML += html;
    });
}

function renderWalletTab() {
    const m = globalState.member;
    setText('wallet-balance', `₹${(m.extraBalance || 0).toLocaleString('en-IN', {minimumFractionDigits: 2})}`);
    setText('modal-available-balance', `₹${(m.extraBalance || 0).toLocaleString('en-IN')}`);

    // Mock Totals (In real app, calculate from history)
    setText('wallet-guarantor', m.guarantorName || 'N/A');
}

// --- 6. UTILITIES ---
function setText(id, val) { const el = document.getElementById(id); if(el) el.textContent = val; }
function setImg(id, url) { const el = document.getElementById(id); if(el) el.src = url || DEFAULT_PIC; }
function formatDate(d) { return d ? new Date(d).toLocaleDateString('en-GB') : '-'; }

function getTxIcon(type) {
    if(type === 'SIP') return 'fa-piggy-bank';
    if(type === 'Loan Taken') return 'fa-hand-holding-usd';
    if(type === 'Loan Payment') return 'fa-check-circle';
    return 'fa-exchange-alt';
}

function scoreRow(label, score, icon) {
    const val = score.toFixed(0);
    const color = val > 70 ? 'text-green-500' : (val > 40 ? 'text-yellow-500' : 'text-red-500');
    return `
    <div class="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
        <div class="flex items-center gap-3">
            <i class="${icon} text-gray-400"></i>
            <span class="text-xs font-bold text-gray-600">${label}</span>
        </div>
        <span class="font-mono font-bold ${color}">${val}/100</span>
    </div>`;
}

function showError(msg) {
    const el = document.getElementById('error-message');
    if(el) { el.querySelector('p').innerHTML = `<i class="fas fa-exclamation-circle"></i> ${msg}`; el.classList.remove('hidden'); }
    console.error(msg);
}
