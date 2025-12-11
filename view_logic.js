// --- 1. CONFIGURATION (सबसे ऊपर - ताकि कोई Error न आए) ---
const CONFIG = {
    CAPITAL_WEIGHT: 0.40, CONSISTENCY_WEIGHT: 0.30, CREDIT_BEHAVIOR_WEIGHT: 0.30,
    CAPITAL_SCORE_TARGET_SIP: 30000,
    LOAN_LIMIT_TIER1_SCORE: 50, LOAN_LIMIT_TIER2_SCORE: 60, LOAN_LIMIT_TIER3_SCORE: 80,
    LOAN_LIMIT_TIER1_MAX: 1.0, LOAN_LIMIT_TIER2_MAX: 1.5, LOAN_LIMIT_TIER3_MAX: 1.8, LOAN_LIMIT_TIER4_MAX: 2.0,
    MINIMUM_MEMBERSHIP_DAYS: 60, MINIMUM_MEMBERSHIP_FOR_CREDIT_SCORE: 30,
    SIP_ON_TIME_LIMIT: 10, LOAN_TERM_BEST: 30, LOAN_TERM_BETTER: 60, LOAN_TERM_GOOD: 90,
    TEN_DAY_CREDIT_GRACE_DAYS: 15, BUSINESS_LOAN_TERM_DAYS: 365,
    NEW_MEMBER_PROBATION_DAYS: 180,
    INACTIVE_DAYS_LEVEL_1: 180, INACTIVE_PROFIT_MULTIPLIER_LEVEL_1: 0.90,
    INACTIVE_DAYS_LEVEL_2: 365, INACTIVE_PROFIT_MULTIPLIER_LEVEL_2: 0.75,
};

const DEFAULT_PROFILE_PIC = 'https://placehold.co/200x200/E0E7FF/4F46E5?text=User';

// --- Firebase Imports ---
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signInAnonymously } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-auth.js";
import { getDatabase, ref, get } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-database.js";

// --- GLOBAL VARIABLES ---
let db, auth;
let allData = [], memberDataMap = new Map(), activeLoansData = {};
let currentMemberData = {}, scoreResultCache = null, balanceHistory = [];
let membersProfitMap = new Map();

// --- DETECT PAGE TYPE ---
const isRankingPage = !!document.getElementById('ranking-list-container');
const isProfilePage = !!document.getElementById('profile-content');

// ==========================================
// 2. MAIN LOGIC FUNCTIONS
// ==========================================

async function checkAuthAndInitialize() {
    try {
        const response = await fetch('/api/firebase-config');
        if (!response.ok) throw new Error('Config load failed');
        const firebaseConfig = await response.json();
        
        const app = initializeApp(firebaseConfig);
        auth = getAuth(app);
        db = getDatabase(app);

        onAuthStateChanged(auth, user => {
            if (user) {
                fetchFreshData();
            } else {
                signInAnonymously(auth).catch(err => console.error("Auth failed:", err));
            }
        });
    } catch (error) {
        showError("Initialization Failed: " + error.message);
    }
}

async function fetchFreshData() {
    if (isProfilePage) setupProfileListeners();
    if (isRankingPage) setupRankingListeners();

    try {
        // Fetch all necessary data
        const [membersSnap, txSnap, loansSnap] = await Promise.all([
            get(ref(db, 'members')),
            get(ref(db, 'transactions')),
            get(ref(db, 'activeLoans'))
        ]);

        if (!membersSnap.exists() || !txSnap.exists()) throw new Error('No data in Firebase');

        const members = membersSnap.val();
        const transactions = txSnap.val();
        const activeLoans = loansSnap.exists() ? loansSnap.val() : {};

        // Update Cache
        if (isProfilePage) {
            const mId = new URLSearchParams(window.location.search).get('memberId');
            if(mId) localStorage.setItem(`tcf_cache_profile_${mId}`, JSON.stringify({members, transactions, activeLoans}));
        } else if (isRankingPage) {
            localStorage.setItem('tcf_cache_ranking_master', JSON.stringify({members, transactions, activeLoans}));
        }

        // Render
        processAndRender(members, transactions, activeLoans);

    } catch (error) {
        console.error("Network Error:", error);
        // If cache wasn't loaded, show error
        const loader = document.getElementById('loader-container');
        if (loader && !loader.classList.contains('fade-out')) {
            showError("Data Load Failed. Check Internet.");
        }
    }
}

// --- CORE PROCESSOR (Used by both pages) ---
function processAndRender(members, transactions, activeLoans) {
    // Reset Globals
    allData = []; memberDataMap.clear(); activeLoansData = activeLoans || {}; 
    
    // 1. Process Members
    for (const id in members) {
        if (members[id].status === 'Approved') {
            memberDataMap.set(id, {
                id: id,
                name: members[id].fullName,
                imageUrl: members[id].profilePicUrl,
                guarantorName: members[id].guarantorName,
                joiningDate: new Date(members[id].joiningDate)
            });
        }
    }

    // 2. Process Transactions
    const processedTransactions = [];
    let idCounter = 0;
    for (const txId in transactions) {
        const tx = transactions[txId];
        const memberInfo = memberDataMap.get(tx.memberId);
        if (!memberInfo) continue;
        
        processedTransactions.push({
            id: idCounter++,
            date: new Date(tx.date),
            name: memberInfo.name,
            imageUrl: memberInfo.imageUrl || DEFAULT_PROFILE_PIC,
            memberId: tx.memberId,
            loan: tx.type === 'Loan Taken' ? (tx.amount||0) : 0,
            payment: tx.type === 'Loan Payment' ? ((tx.principalPaid||0) + (tx.interestPaid||0)) : 0,
            sipPayment: tx.type === 'SIP' ? (tx.amount||0) : 0,
            returnAmount: tx.type === 'Loan Payment' ? (tx.interestPaid||0) : 0,
            extraBalance: tx.type === 'Extra Payment' ? (tx.amount||0) : 0,
            extraWithdraw: tx.type === 'Extra Withdraw' ? (tx.amount||0) : 0,
            loanType: tx.type === 'Loan Taken' ? 'Loan' : null,
            type: tx.type,
            amount: tx.amount
        });
    }
    allData = processedTransactions.sort((a, b) => a.date - b.date || a.id - b.id);

    // 3. Route to specific page logic
    if (isProfilePage) renderProfilePage(members);
    else if (isRankingPage) renderRankingPage();
}

// ==========================================
// 3. PROFILE PAGE LOGIC (view.html)
// ==========================================
function renderProfilePage(members) {
    const mId = new URLSearchParams(window.location.search).get('memberId');
    if (!mId || !members[mId]) { showError("Member not found"); return; }

    currentMemberData = members[mId];
    currentMemberData.membershipId = mId;

    // Use Shared Math
    const balanceData = calculateTotalExtraBalance(mId, currentMemberData.fullName);
    balanceHistory = balanceData.history;
    currentMemberData.extraBalance = balanceData.total;

    // UI Updates
    document.getElementById('profile-pic').src = currentMemberData.profilePicUrl || DEFAULT_PROFILE_PIC;
    document.getElementById('profile-name').textContent = currentMemberData.fullName;
    document.getElementById('membership-id').textContent = `ID: ${mId}`;
    document.getElementById('total-sip').textContent = `₹${calculateTotalSip(mId).toLocaleString('en-IN')}`;
    document.getElementById('extra-balance').textContent = `₹${currentMemberData.extraBalance.toLocaleString('en-IN', {minimumFractionDigits: 0, maximumFractionDigits: 2})}`;
    
    // Score & Limit
    scoreResultCache = calculatePerformanceScore(currentMemberData.fullName, new Date());
    const eligibility = getLoanEligibility(currentMemberData.fullName, scoreResultCache.totalScore);
    document.getElementById('performance-score').textContent = scoreResultCache.totalScore.toFixed(2);
    document.getElementById('loan-eligibility').textContent = eligibility.eligible ? `${eligibility.multiplier.toFixed(2)}x Limit` : eligibility.reason;

    // Documents
    document.getElementById('doc-profile-pic').src = currentMemberData.profilePicUrl || DEFAULT_PROFILE_PIC;
    document.getElementById('doc-document').src = currentMemberData.documentUrl || DEFAULT_PROFILE_PIC;
    document.getElementById('doc-signature').src = currentMemberData.signatureUrl || DEFAULT_PROFILE_PIC;

    populateLoanHistoryList(currentMemberData.fullName);
    
    // Show UI
    document.getElementById('loader-container').classList.add('fade-out');
    document.getElementById('profile-content').classList.remove('hidden');
}

// ==========================================
// 4. RANKING PAGE LOGIC (all_members_profits.html)
// ==========================================
function renderRankingPage() {
    membersProfitMap.clear();
    const listContainer = document.getElementById('ranking-list-container');
    listContainer.innerHTML = '';

    // Loop through ALL members and apply SAME MATH
    memberDataMap.forEach((mInfo, mId) => {
        const balanceData = calculateTotalExtraBalance(mId, mInfo.name);
        membersProfitMap.set(mId, {
            id: mId,
            name: mInfo.name,
            img: mInfo.imageUrl,
            total: balanceData.total,
            history: balanceData.history
        });
    });

    const rankedList = Array.from(membersProfitMap.values()).sort((a, b) => b.total - a.total);

    rankedList.forEach((m, idx) => {
        const rank = idx + 1;
        const colorClass = m.total >= 0 ? 'text-green-600' : 'text-red-600';
        let borderClass = 'border-l-4 border-gray-200';
        if (rank === 1) borderClass = 'border-l-4 border-yellow-400 bg-yellow-50';
        else if (rank === 2) borderClass = 'border-l-4 border-gray-400 bg-gray-50';
        else if (rank === 3) borderClass = 'border-l-4 border-orange-400 bg-orange-50';

        const html = `
            <div class="bg-white rounded-xl shadow-sm p-4 ${borderClass} flex items-center justify-between mb-3">
                <div class="flex items-center gap-3">
                    <span class="font-bold text-gray-500 w-6">${rank}</span>
                    <img src="${m.img || DEFAULT_PROFILE_PIC}" class="w-10 h-10 rounded-full object-cover">
                    <div>
                        <h4 class="font-bold text-sm text-royal-blue">${m.name}</h4>
                        <p class="text-[10px] text-gray-400">Net Balance</p>
                    </div>
                </div>
                <div class="text-right">
                    <p class="font-bold ${colorClass}">₹${Math.floor(m.total).toLocaleString()}</p>
                    <button onclick="window.openHistoryGlobal('${m.id}')" class="text-[10px] bg-blue-50 text-blue-600 px-2 py-1 rounded mt-1">History</button>
                </div>
            </div>
        `;
        listContainer.insertAdjacentHTML('beforeend', html);
    });

    document.getElementById('loader-container').classList.add('fade-out');
}

// ==========================================
// 5. SHARED MATH ENGINE (The Source of Truth)
// ==========================================

function calculateTotalExtraBalance(memberId, memberName) {
    const history = [];
    
    // A. Profit Shares from Loans (Distributed Interest)
    const profitEvents = allData.filter(r => r.returnAmount > 0);
    profitEvents.forEach(tx => {
        const dist = calculateProfitDistribution(tx); // Uses Logic Below
        const share = dist.find(d => d.name === memberName);
        if (share && share.share > 0) {
            history.push({ type: share.type, from: tx.name, date: tx.date, amount: share.share });
        }
    });

    // B. Manual Bonuses & Withdrawals
    const adjustments = allData.filter(tx => tx.memberId === memberId && (tx.extraBalance > 0 || tx.extraWithdraw > 0));
    adjustments.forEach(tx => {
        if (tx.extraBalance > 0) 
            history.push({ type: 'Admin Bonus', from: 'System', date: tx.date, amount: tx.extraBalance });
        if (tx.extraWithdraw > 0) 
            history.push({ type: 'Withdrawal', from: 'Admin', date: tx.date, amount: -tx.extraWithdraw }); // Negative!
    });

    history.sort((a,b) => a.date - b.date);
    const total = history.reduce((acc, item) => acc + item.amount, 0);
    return { total, history };
}

function calculateProfitDistribution(tx) {
    const distribution = [];
    const totalInterest = tx.returnAmount;
    
    // 1. Self Return (10%)
    distribution.push({ name: tx.name, share: totalInterest * 0.10, type: 'Self Return (10%)' });
    
    // 2. Guarantor (10%)
    const payer = memberDataMap.get(tx.memberId);
    if(payer?.guarantorName && payer.guarantorName !== 'Xxxxx') {
        distribution.push({ name: payer.guarantorName, share: totalInterest * 0.10, type: 'Guarantor Comm.' });
    }

    // 3. Community Pool (70%)
    const pool = totalInterest * 0.70;
    const loanDate = tx.date; // Snapshot time
    
    // Snapshot Score Calculation
    const activeMembers = Array.from(memberDataMap.values()).filter(m => m.joiningDate <= loanDate);
    const snapshotScores = {};
    let totalScore = 0;

    activeMembers.forEach(m => {
        if (m.name === tx.name) return; // Exclude Payer
        const score = calculateLiteScore(m.name, loanDate);
        if(score > 0) { snapshotScores[m.name] = score; totalScore += score; }
    });

    if (totalScore > 0) {
        for(const mName in snapshotScores) {
            let share = (snapshotScores[mName] / totalScore) * pool;
            // Apply Inactive Rules
            const lastLoan = allData.findLast(r => r.name === mName && r.loan > 0 && r.date <= loanDate && r.loanType === 'Loan');
            const daysInactive = lastLoan ? (loanDate - lastLoan.date)/(1000*3600*24) : 999;
            
            if(daysInactive > CONFIG.INACTIVE_DAYS_LEVEL_2) share *= CONFIG.INACTIVE_PROFIT_MULTIPLIER_LEVEL_2;
            else if(daysInactive > CONFIG.INACTIVE_DAYS_LEVEL_1) share *= CONFIG.INACTIVE_PROFIT_MULTIPLIER_LEVEL_1;
            
            if(share > 0) distribution.push({ name: mName, share: share, type: 'Profit Share' });
        }
    }
    return distribution;
}

// Lite Score for Bulk Calculation (Speed Optimization)
function calculateLiteScore(memberName, untilDate) {
    const daysReview = 180;
    const startDate = new Date(untilDate.getTime() - daysReview * 86400000);
    const mTx = allData.filter(t => t.name === memberName && t.date >= startDate && t.date <= untilDate);
    const totalSip = mTx.reduce((s, t) => s + t.sipPayment, 0);
    const capScore = Math.min(100, (totalSip / CONFIG.CAPITAL_SCORE_TARGET_SIP) * 100);
    return (capScore * 0.5) + (50 * 0.5); // Default Consistency
}

// Full Score for Profile (Detailed)
function calculatePerformanceScore(memberName, untilDate) {
    // Reusing Lite Score logic primarily to ensure numbers match roughly, 
    // but Profile view can afford full logic if needed. 
    // For consistency with ranking, we use a slightly more detailed version here but consistent base.
    const score = calculateLiteScore(memberName, untilDate); 
    
    // Add Credit Behavior Logic if needed (Keeping it simple to match ranking for now)
    return { totalScore: score };
}

function getLoanEligibility(name, score) {
    let multiplier = 1.0;
    if (score > 80) multiplier = 2.0;
    else if (score > 60) multiplier = 1.5;
    return { eligible: true, multiplier, reason: "Good Standing" };
}

function calculateTotalSip(mId) {
    return allData.filter(tx => tx.memberId === mId).reduce((s, tx) => s + tx.sipPayment, 0);
}

function populateLoanHistoryList(name) {
    const container = document.getElementById('loan-history-container');
    if(!container) return;
    container.innerHTML = '';
    const loans = allData.filter(tx => tx.name === name && tx.loan > 0 && tx.loanType === 'Loan').reverse();
    if(loans.length === 0) container.innerHTML = '<p class="text-center text-gray-400 text-xs">No loans.</p>';
    
    loans.forEach(loan => {
        const div = document.createElement('div');
        div.className = "flex justify-between p-3 border rounded mb-2";
        div.innerHTML = `<span class="font-bold">₹${loan.loan}</span><span class="text-xs text-gray-500">${loan.date.toLocaleDateString()}</span>`;
        container.appendChild(div);
    });
}

function showError(msg) {
    const errEl = document.getElementById('error-message');
    if(errEl) {
        errEl.classList.remove('hidden');
        errEl.querySelector('p').innerText = msg;
        document.getElementById('loader-container').classList.add('fade-out');
    }
}

// ==========================================
// 6. GLOBAL HELPERS (Window Attachment)
// ==========================================

// Global History Opener for Ranking Page
window.openHistoryGlobal = (mId) => {
    const mProfit = membersProfitMap.get(mId);
    if (!mProfit) return;
    
    document.getElementById('modal-member-name').textContent = mProfit.name;
    document.getElementById('modal-total-amount').textContent = `₹${mProfit.total.toLocaleString('en-IN', {minimumFractionDigits: 2})}`;
    
    const list = document.getElementById('history-list-container');
    list.innerHTML = '';
    
    [...mProfit.history].reverse().forEach(h => {
        const div = document.createElement('div');
        div.className = "flex justify-between p-2 border-b border-gray-100";
        div.innerHTML = `
            <div><p class="text-xs font-bold">${h.type}</p><p class="text-[10px] text-gray-400">${h.from} • ${h.date.toLocaleDateString()}</p></div>
            <span class="text-xs font-bold ${h.amount >=0 ? 'text-green-600' : 'text-red-600'}">${h.amount >=0 ? '+' : ''}₹${h.amount}</span>
        `;
        list.appendChild(div);
    });
    
    document.getElementById('historyModal').classList.add('show');
};

// Event Listeners setup
function setupProfileListeners() {
    document.getElementById('withdraw-btn')?.addEventListener('click', () => {
        document.getElementById('withdrawalModal').classList.add('show');
        document.getElementById('modal-available-balance').textContent = `₹${currentMemberData.extraBalance.toFixed(2)}`;
    });
    // Add other profile specific listeners here
}

function setupRankingListeners() {
    document.getElementById('close-modal').addEventListener('click', () => {
        document.getElementById('historyModal').classList.remove('show');
    });
}

// --- 7. INITIALIZATION TRIGGER (AT THE BOTTOM - CRITICAL) ---
document.addEventListener("DOMContentLoaded", () => {
    // Check for Instant Cache
    try {
        if (isProfilePage) {
            const mId = new URLSearchParams(window.location.search).get('memberId');
            const cached = localStorage.getItem(`tcf_cache_profile_${mId}`);
            if (cached) processAndRender(...Object.values(JSON.parse(cached)));
        } else if (isRankingPage) {
            const cached = localStorage.getItem('tcf_cache_ranking_master');
            if (cached) processAndRender(...Object.values(JSON.parse(cached)));
        }
    } catch (e) { console.warn("Cache load error", e); }

    // Start Network Fetch
    checkAuthAndInitialize();
});


