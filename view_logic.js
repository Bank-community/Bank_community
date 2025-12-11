// --- CONFIGURATION CONSTANTS (MOVED TO TOP) ---
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

// --- Firebase SDKs (Modular v9) ---
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signInAnonymously } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-auth.js";
import { getDatabase, ref, get } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-database.js";

// --- GLOBAL VARIABLES ---
let db, auth;
let allData = [], memberDataMap = new Map(), activeLoansData = {};
let currentMemberData = {}, scoreResultCache = null, balanceHistory = [];
// For Ranking Page
let membersProfitMap = new Map(); 

// --- DETECT PAGE TYPE ---
const isRankingPage = !!document.getElementById('ranking-list-container');
const isProfilePage = !!document.getElementById('profile-content');

// --- INSTANT LOAD (STEP 1) ---
function initInstantLoad() {
    try {
        if (isProfilePage) {
            const urlParams = new URLSearchParams(window.location.search);
            const memberId = urlParams.get('memberId');
            if (memberId) {
                const cachedRaw = localStorage.getItem(`tcf_royal_view_cache_${memberId}`);
                if (cachedRaw) {
                    const data = JSON.parse(cachedRaw);
                    console.log(`⚡ Instant Load (Profile) for ${memberId}...`);
                    processAndRender(data.members, data.transactions, data.activeLoans);
                }
            }
        } else if (isRankingPage) {
            const cachedRaw = localStorage.getItem('tcf_all_balance_cache_master');
            if (cachedRaw) {
                const data = JSON.parse(cachedRaw);
                console.log(`⚡ Instant Load (Ranking)...`);
                processAndRender(data.members, data.transactions, data.activeLoans);
            }
        }
    } catch(e) { console.warn("Cache load failed:", e); }
}
initInstantLoad();

// --- INITIALIZATION (STEP 2) ---
document.addEventListener("DOMContentLoaded", checkAuthAndInitialize);

async function checkAuthAndInitialize() {
    try {
        const response = await fetch('/api/firebase-config');
        if (!response.ok) throw new Error('Configuration failed to load.');
        const firebaseConfig = await response.json();
        
        const app = initializeApp(firebaseConfig);
        auth = getAuth(app);
        db = getDatabase(app);

        onAuthStateChanged(auth, user => {
            if (user) {
                fetchFreshData();
            } else {
                signInAnonymously(auth).catch(error => {
                    console.error("Anonymous auth failed:", error);
                    window.location.href = `/login.html?redirect=${encodeURIComponent(window.location.href)}`;
                });
            }
        });
    } catch (error) {
        if (isProfilePage && document.getElementById('profile-content').classList.contains('hidden')) {
            showError(error.message);
        }
    }
}

// --- DATA FETCHING (COMMON) ---
async function fetchFreshData() {
    if (isProfilePage) setupEventListeners();
    if (isRankingPage) setupRankingListeners();

    try {
        const [membersSnapshot, transactionsSnapshot, activeLoansSnapshot] = await Promise.all([
            get(ref(db, 'members')), get(ref(db, 'transactions')), get(ref(db, 'activeLoans'))
        ]);

        if (!membersSnapshot.exists() || !transactionsSnapshot.exists()) throw new Error('Data not found.');

        const members = membersSnapshot.val();
        const transactions = transactionsSnapshot.val();
        const activeLoans = activeLoansSnapshot.exists() ? activeLoansSnapshot.val() : {};

        // Save Cache based on Page Type
        if (isProfilePage) {
            const urlParams = new URLSearchParams(window.location.search);
            const memberId = urlParams.get('memberId');
            if (memberId) {
                localStorage.setItem(`tcf_royal_view_cache_${memberId}`, JSON.stringify({ members, transactions, activeLoans }));
            }
        } else if (isRankingPage) {
            localStorage.setItem('tcf_all_balance_cache_master', JSON.stringify({ members, transactions, activeLoans }));
        }

        processAndRender(members, transactions, activeLoans);
    } catch (error) {
        console.error("Network fetch failed:", error);
    }
}

// --- MASTER PROCESSING LOGIC ---
function processAndRender(members, transactions, activeLoans) {
    // Reset Common Data
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

    // 2. Process Transactions (Common Array)
    const processedTransactions = [];
    let idCounter = 0;
    for (const txId in transactions) {
        const tx = transactions[txId];
        const memberInfo = memberDataMap.get(tx.memberId);
        if (!memberInfo) continue;
        
        let record = {
            id: idCounter++,
            date: new Date(tx.date),
            name: memberInfo.name,
            imageUrl: memberInfo.imageUrl || DEFAULT_PROFILE_PIC,
            memberId: tx.memberId,
            loan: 0, payment: 0, sipPayment: 0, returnAmount: 0, extraBalance: 0, extraWithdraw: 0, loanType: null, 
            type: tx.type, // Explicitly keep type
            amount: tx.amount // Explicitly keep amount
        };
        
        switch (tx.type) {
            case 'SIP': record.sipPayment = tx.amount || 0; break;
            case 'Loan Taken': record.loan = tx.amount || 0; record.loanType = 'Loan'; break;
            case 'Loan Payment':
                record.payment = (tx.principalPaid || 0) + (tx.interestPaid || 0);
                record.returnAmount = tx.interestPaid || 0;
                break;
            case 'Extra Payment': record.extraBalance = tx.amount || 0; break;
            case 'Extra Withdraw': record.extraWithdraw = tx.amount || 0; break;
        }
        processedTransactions.push(record);
    }
    allData = processedTransactions.sort((a, b) => a.date - b.date || a.id - b.id);

    // --- BRANCH LOGIC ---
    if (isProfilePage) {
        renderProfilePage(members);
    } else if (isRankingPage) {
        renderRankingPage(members);
    }
}

// ==========================================
// LOGIC FOR SINGLE PROFILE (view.html)
// ==========================================
function renderProfilePage(members) {
    const urlParams = new URLSearchParams(window.location.search);
    const memberId = urlParams.get('memberId');
    if (!memberId) { showError("No member ID provided."); return; }

    try {
        currentMemberData = members[memberId];
        if (!currentMemberData) throw new Error(`Member ID not found.`);
        currentMemberData.membershipId = memberId;

        // SHARED MATH FUNCTION
        const balanceResult = calculateTotalExtraBalance(currentMemberData.membershipId, currentMemberData.fullName);
        balanceHistory = balanceResult.history;
        currentMemberData.extraBalance = balanceResult.total;

        // Populate UI
        populateProfileData(); // (Uses existing function below)
        const loader = document.getElementById('loader-container');
        if(loader) loader.classList.add('fade-out');

    } catch (error) { showError(error.message); }
}

// ==========================================
// LOGIC FOR RANKING PAGE (all_members_profits.html)
// ==========================================
function renderRankingPage(members) {
    membersProfitMap.clear();
    
    // Iterate ALL approved members
    memberDataMap.forEach((mInfo, mId) => {
        // CALL THE SAME SHARED MATH FUNCTION
        const balanceResult = calculateTotalExtraBalance(mId, mInfo.name);
        
        membersProfitMap.set(mId, {
            name: mInfo.name,
            img: mInfo.imageUrl,
            total: balanceResult.total,
            history: balanceResult.history,
            id: mId
        });
    });

    // Render List
    const listContainer = document.getElementById('ranking-list-container');
    listContainer.innerHTML = '';
    
    const rankedList = Array.from(membersProfitMap.values()).sort((a, b) => b.total - a.total);

    rankedList.forEach((member, index) => {
        const rank = index + 1;
        let rankClass = 'rank-normal';
        if(rank === 1) rankClass = 'rank-1';
        else if(rank === 2) rankClass = 'rank-2';
        else if(rank === 3) rankClass = 'rank-3';

        const amountColor = member.total >= 0 ? 'text-green-600' : 'text-red-600';
        const sign = member.total >= 0 ? '+' : '';

        const html = `
            <div class="rank-card ${rankClass} p-4 flex items-center justify-between gap-3 animate-fade-in">
                <div class="flex items-center gap-3 overflow-hidden flex-grow">
                    <div class="rank-badge flex-shrink-0">${rank}</div>
                    <img src="${member.img || DEFAULT_PROFILE_PIC}" class="w-10 h-10 rounded-full object-cover border border-gray-200" onerror="this.src='${DEFAULT_PROFILE_PIC}'">
                    <div class="min-w-0">
                        <h4 class="font-bold text-royal-blue text-sm truncate">${member.name}</h4>
                        <p class="text-[10px] text-gray-500 font-medium">Net Balance</p>
                    </div>
                </div>
                
                <div class="text-right flex-shrink-0 flex items-center gap-2">
                    <span class="font-bold ${amountColor} text-sm">${sign}₹${Math.floor(member.total).toLocaleString()}</span>
                    <button onclick="window.openRankingHistory('${member.id}')" 
                        class="bg-royal-blue text-white text-[10px] font-bold px-3 py-1.5 rounded-full hover:bg-royal-dark shadow-sm transition-colors">
                        History
                    </button>
                </div>
            </div>
        `;
        listContainer.insertAdjacentHTML('beforeend', html);
    });

    const loader = document.getElementById('loader-container');
    if(loader) loader.classList.add('fade-out');
}

// --- SHARED MATH FUNCTIONS (THE HEART) ---
function calculateTotalExtraBalance(memberId, memberFullName) {
    const history = [];
    
    // 1. Profit Shares (From Loans)
    const profitEvents = allData.filter(r => r.returnAmount > 0);
    profitEvents.forEach(paymentRecord => {
        const result = calculateProfitDistribution(paymentRecord);
        const memberShare = result?.distribution.find(d => d.name === memberFullName);
        if(memberShare && memberShare.share > 0) {
            history.push({ 
                type: memberShare.type || 'profit', 
                from: paymentRecord.name, 
                date: paymentRecord.date, 
                amount: memberShare.share 
            });
        }
    });

    // 2. Manual Adjustments (Bonus/Withdrawal)
    const manualAdjustments = allData.filter(tx => tx.memberId === memberId && (tx.extraBalance > 0 || tx.extraWithdraw > 0));
    manualAdjustments.forEach(tx => {
        if (tx.extraBalance > 0) {
            history.push({ 
                type: 'manual_credit', 
                from: 'Admin', 
                date: tx.date, 
                amount: tx.extraBalance 
            });
        }
        if (tx.extraWithdraw > 0) {
            history.push({ 
                type: 'withdrawal', 
                from: 'Admin', 
                date: tx.date, 
                amount: -tx.extraWithdraw // Negative for withdrawal
            });
        }
    });

    history.sort((a,b) => a.date - b.date);
    const total = history.reduce((acc, item) => acc + item.amount, 0);
    return { total, history };
}

function calculateProfitDistribution(paymentRecord) { 
    const totalInterest = paymentRecord.returnAmount; if (totalInterest <= 0) return null; 
    const distribution = [];
    
    // Self Return
    distribution.push({ name: paymentRecord.name, share: totalInterest * 0.10, type: 'Self Return (10%)' });
    
    // Guarantor
    const payerMemberInfo = memberDataMap.get(paymentRecord.memberId);
    if (payerMemberInfo && payerMemberInfo.guarantorName && payerMemberInfo.guarantorName !== 'Xxxxx') {
            distribution.push({ name: payerMemberInfo.guarantorName, share: totalInterest * 0.10, type: 'Guarantor Commission (10%)' });
    }
    
    // Community Pool
    const communityPool = totalInterest * 0.70; 
    const relevantLoanDate = paymentRecord.date; // Approximation using payment date logic
    
    // Calculate Score Snapshot
    const snapshotScores = {}; let totalScoreInSnapshot = 0; 
    const membersInSystem = Array.from(memberDataMap.values()).filter(m => m.joiningDate <= relevantLoanDate);
    
    membersInSystem.forEach(m => { 
        if (m.name === paymentRecord.name) return; // Exclude payer
        const scoreObject = calculatePerformanceScore(m.name, relevantLoanDate, allData, activeLoansData); 
        if (scoreObject.totalScore > 0) { snapshotScores[m.name] = scoreObject; totalScoreInSnapshot += scoreObject.totalScore; } 
    }); 
    
    if (totalScoreInSnapshot > 0) {
        for (const memberName in snapshotScores) { 
            let memberShare = (snapshotScores[memberName].totalScore / totalScoreInSnapshot) * communityPool; 
            
            // Inactive Penalty
            const lastLoanDate = allData.filter(r => r.name === memberName && r.loan > 0 && r.date <= relevantLoanDate && r.loanType === 'Loan').pop()?.date;
            const daysSinceLastLoan = lastLoanDate ? (relevantLoanDate - lastLoanDate) / (1000 * 3600 * 24) : Infinity; 
            let appliedMultiplier = 1.0; 
            if (daysSinceLastLoan > CONFIG.INACTIVE_DAYS_LEVEL_2) appliedMultiplier = CONFIG.INACTIVE_PROFIT_MULTIPLIER_LEVEL_2; 
            else if (daysSinceLastLoan > CONFIG.INACTIVE_DAYS_LEVEL_1) appliedMultiplier = CONFIG.INACTIVE_PROFIT_MULTIPLIER_LEVEL_1; 
            
            memberShare *= appliedMultiplier; 
            if (memberShare > 0) distribution.push({ name: memberName, share: memberShare, type: 'Community Profit' }); 
        } 
    }
    return { distribution }; 
}

// --- RANKING PAGE SPECIFIC LISTENERS (Global Scope) ---
window.openRankingHistory = (memberId) => {
    const memberProfit = membersProfitMap.get(memberId);
    if(!memberProfit) return;

    document.getElementById('modal-member-name').textContent = memberProfit.name;
    const totalEl = document.getElementById('modal-total-amount');
    totalEl.textContent = `₹${memberProfit.total.toLocaleString('en-IN', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
    totalEl.className = `text-2xl font-bold ${memberProfit.total >= 0 ? 'text-royal-gold' : 'text-red-400'}`;

    const list = document.getElementById('history-list-container');
    list.innerHTML = '';

    if(memberProfit.history.length === 0) {
        list.innerHTML = '<p class="text-center text-gray-400 text-xs py-4">No records found.</p>';
    } else {
        [...memberProfit.history].reverse().forEach(item => {
            const div = document.createElement('div');
            div.className = 'flex justify-between items-center p-3 border-b border-gray-100 last:border-0 hover:bg-gray-50';
            
            const isCredit = item.amount > 0;
            const amountColor = isCredit ? 'text-green-600' : 'text-red-600';
            const icon = isCredit ? 'fa-arrow-down' : 'fa-arrow-up';
            const iconBg = isCredit ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600';
            let title = '';
            
            switch(item.type) {
                case 'profit': title = 'Profit Share'; break;
                case 'manual_credit': title = 'Admin Bonus'; break;
                case 'withdrawal': title = 'Withdrawal'; break;
                case 'Self Return (10%)': title = 'Self Interest (10%)'; break;
                case 'Guarantor Commission (10%)': title = `Guarantor Comm.`; break;
                default: title = `Transaction`;
            }

            div.innerHTML = `
                <div class="flex items-center gap-3">
                    <div class="w-8 h-8 rounded-full ${iconBg} flex items-center justify-center text-xs">
                        <i class="fas ${icon}"></i>
                    </div>
                    <div>
                        <p class="text-xs font-bold text-gray-700">${title}</p>
                        <p class="text-[10px] text-gray-400">From: ${item.from || 'System'} • ${item.date.toLocaleDateString()}</p>
                    </div>
                </div>
                <span class="text-xs font-bold ${amountColor}">${isCredit ? '+' : ''}₹${item.amount.toLocaleString()}</span>
            `;
            list.appendChild(div);
        });
    }

    const modal = document.getElementById('historyModal');
    modal.classList.add('show');
    document.body.style.overflow = 'hidden';
};

function setupRankingListeners() {
    if(document.body.getAttribute('data-ranking-listeners')) return;
    document.body.setAttribute('data-ranking-listeners', 'true');
    
    document.getElementById('close-modal').onclick = () => {
        document.getElementById('historyModal').classList.remove('show');
        document.body.style.overflow = '';
    };
}

// --- PROFILE UI HELPERS (Keep existing) ---
function populateProfileData() {
    const totalSip = allData.filter(tx => tx.memberId === currentMemberData.membershipId).reduce((s, tx) => s + tx.sipPayment, 0);
    const lifetimeProfit = calculateTotalProfitForMember(currentMemberData.fullName, allData, activeLoansData);
    
    document.getElementById('profile-pic').src = currentMemberData.profilePicUrl || DEFAULT_PROFILE_PIC;
    document.getElementById('profile-name').textContent = currentMemberData.fullName || 'N/A';
    document.getElementById('membership-id').textContent = `ID: ${currentMemberData.membershipId || 'N/A'}`;
    document.getElementById('mobile-number').textContent = currentMemberData.mobileNumber || 'N/A';
    document.getElementById('dob').textContent = currentMemberData.dob ? new Date(currentMemberData.dob).toLocaleDateString('en-GB') : "N/A";
    document.getElementById('aadhaar').textContent = currentMemberData.aadhaar || 'N/A';
    document.getElementById('address').textContent = currentMemberData.address || 'N/A';
    document.getElementById('joining-date-header').textContent = `Member since ${new Date(currentMemberData.joiningDate).getFullYear()}`;
    document.getElementById('guarantor-name').textContent = currentMemberData.guarantorName || 'N/A';
    document.getElementById('total-sip').textContent = `₹${totalSip.toLocaleString('en-IN')}`;
    document.getElementById('lifetime-profit').textContent = `₹${lifetimeProfit.toLocaleString('en-IN', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
    document.getElementById('extra-balance').textContent = `₹${currentMemberData.extraBalance.toLocaleString('en-IN', {minimumFractionDigits: 0, maximumFractionDigits: 2})}`;
    
    const withdrawBtn = document.getElementById('withdraw-btn');
    if(withdrawBtn) withdrawBtn.disabled = currentMemberData.extraBalance < 10;
    
    document.getElementById('doc-profile-pic').src = currentMemberData.profilePicUrl || DEFAULT_PROFILE_PIC;
    document.getElementById('doc-document').src = currentMemberData.documentUrl || DEFAULT_PROFILE_PIC;
    document.getElementById('doc-signature').src = currentMemberData.signatureUrl || DEFAULT_PROFILE_PIC;
    
    scoreResultCache = calculatePerformanceScore(currentMemberData.fullName, new Date(), allData, activeLoansData);
    const eligibilityResult = getLoanEligibility(currentMemberData.fullName, scoreResultCache.totalScore, allData);
    document.getElementById('performance-score').textContent = scoreResultCache.totalScore.toFixed(2);
    document.getElementById('loan-eligibility').textContent = eligibilityResult.eligible ? `${eligibilityResult.multiplier.toFixed(2)}x Limit` : eligibilityResult.reason;
    
    populateLoanHistory(currentMemberData.fullName);
    document.getElementById('profile-content').classList.remove('hidden');
}

function calculateTotalProfitForMember(memberName, allData, activeLoansData) { 
    return allData.reduce((totalProfit, transaction) => { 
        if (transaction.returnAmount > 0) { 
            const result = calculateProfitDistribution(transaction, allData, activeLoansData); 
            const memberShare = result?.distribution.find(d => d.name === memberName); 
            if (memberShare) totalProfit += memberShare.share; 
        } 
        return totalProfit; 
    }, 0); 
}

// ... (Existing Loan History, Score Calcs, Event Listeners for Profile - NO CHANGES, JUST KEPT FOR COMPLETENESS) ...
// (Keeping existing setupEventListeners function above for Profile Page)
function populateLoanHistory(memberName) { /* Same as before */ 
    const container = document.getElementById('loan-history-container');
    const memberData = allData.filter(r => r.name === memberName);
    const loans = memberData.filter(r => r.loan > 0 && r.loanType === 'Loan'); 
    
    if (loans.length === 0) {
        container.innerHTML = '<p class="text-center text-gray-400 text-xs py-4 italic">No loan history records found.</p>';
        return;
    }
    container.innerHTML = '';
    [...loans].reverse().forEach(loan => {
        let amountRepaid = 0; let repaymentDate = null;
        memberData.filter(r => r.date > loan.date && (r.payment > 0 || r.sipPayment > 0)).forEach(p => { 
            if(!repaymentDate) { amountRepaid += p.payment + p.sipPayment; if(amountRepaid >= loan.loan) repaymentDate = p.date; }
        });
        const daysToRepay = repaymentDate ? Math.round((repaymentDate - loan.date) / (1000 * 3600 * 24)) : null;
        let status, colorClass, icon;
        if(daysToRepay === null) { status = "PENDING"; colorClass = "text-yellow-600 bg-yellow-50 border-yellow-200"; icon = "fa-clock"; }
        else if (daysToRepay <= 90) { status = "PAID ON TIME"; colorClass = "text-green-600 bg-green-50 border-green-200"; icon = "fa-check-circle"; }
        else { status = "LATE REPAYMENT"; colorClass = "text-red-600 bg-red-50 border-red-200"; icon = "fa-exclamation-circle"; }
        const div = document.createElement('div');
        div.className = `flex justify-between items-center p-3 rounded-lg border ${colorClass} mb-2`;
        div.innerHTML = `<div class="flex items-center gap-3"><div class="text-lg opacity-80"><i class="fas ${icon}"></i></div><div><p class="font-bold text-sm">₹${loan.loan.toLocaleString('en-IN')}</p><p class="text-[10px] uppercase tracking-wide opacity-70">${loan.date.toLocaleDateString('en-GB')}</p></div></div><div class="text-right"><p class="font-bold text-[10px] uppercase tracking-wider">${status}</p><p class="text-[10px] opacity-70">${daysToRepay !== null ? `${daysToRepay} days` : 'Active'}</p></div>`;
        container.appendChild(div);
    });
}

function submitWithdrawal() { /* Same as before */ const amountInput = document.getElementById('withdrawal-amount'); const errorMsg = document.getElementById('withdrawal-error'); const amount = parseFloat(amountInput.value); if (isNaN(amount) || amount < 10) { errorMsg.classList.remove('hidden'); return; } if (amount > currentMemberData.extraBalance) { errorMsg.textContent = "Insufficient Balance"; errorMsg.classList.remove('hidden'); return; } errorMsg.classList.add('hidden'); document.getElementById('withdrawalModal').classList.add('hidden'); document.getElementById('withdrawalModal').classList.remove('flex'); showWithdrawalCard(amount); }
function showError(message) { const loaderContainer = document.getElementById('loader-container'); const errorMessageEl = document.getElementById('error-message'); if(loaderContainer) loaderContainer.classList.add('fade-out'); if(errorMessageEl) { errorMessageEl.querySelector('p').textContent = message; errorMessageEl.classList.remove('hidden'); } }
function setupEventListeners() { /* Same as before */ if(document.body.getAttribute('data-listeners-added')) return; document.body.setAttribute('data-listeners-added', 'true'); const imageViewerModal = document.getElementById('imageViewerModal'); document.querySelectorAll('.document-thumbnail img').forEach(img => img.addEventListener('click', () => { document.getElementById('fullImageView').src = img.src; imageViewerModal.classList.remove('hidden'); imageViewerModal.classList.add('flex'); })); document.getElementById('closeImageViewer').addEventListener('click', () => { imageViewerModal.classList.add('hidden'); imageViewerModal.classList.remove('flex'); }); const withdrawalModal = document.getElementById('withdrawalModal'); document.getElementById('withdraw-btn').addEventListener('click', () => { document.getElementById('modal-available-balance').textContent = `₹${currentMemberData.extraBalance.toLocaleString('en-IN', {minimumFractionDigits: 0, maximumFractionDigits: 2})}`; withdrawalModal.classList.remove('hidden'); withdrawalModal.classList.add('flex'); }); document.getElementById('close-withdrawal-modal').addEventListener('click', () => { withdrawalModal.classList.add('hidden'); withdrawalModal.classList.remove('flex'); }); document.getElementById('submit-withdrawal').addEventListener('click', submitWithdrawal); const historyModal = document.getElementById('historyModal'); document.getElementById('view-history-btn').addEventListener('click', () => { populateHistoryModal(); historyModal.classList.remove('hidden'); historyModal.classList.add('flex'); }); document.getElementById('close-history-modal').addEventListener('click', () => { historyModal.classList.add('hidden'); historyModal.classList.remove('flex'); }); const scoreModal = document.getElementById('scoreBreakdownModal'); document.getElementById('score-info-btn').addEventListener('click', () => { populateScoreBreakdownModal(); scoreModal.classList.remove('hidden'); scoreModal.classList.add('flex'); }); document.getElementById('close-score-modal').addEventListener('click', () => { scoreModal.classList.add('hidden'); scoreModal.classList.remove('flex'); }); const cardModal = document.getElementById('cardResultModal'); document.getElementById('close-card-modal').addEventListener('click', () => { cardModal.classList.add('hidden'); cardModal.classList.remove('flex'); }); document.getElementById('download-card-btn').addEventListener('click', downloadCard); document.getElementById('share-card-btn').addEventListener('click', shareCard); }
function populateHistoryModal() { /* Same as before */ const historyList = document.getElementById('history-list'); historyList.innerHTML = ''; if (balanceHistory.length === 0) { historyList.innerHTML = '<p class="text-center text-gray-400 italic py-4">No transactions yet.</p>'; return; } [...balanceHistory].reverse().forEach(item => { const div = document.createElement('div'); const isCredit = item.amount > 0; let title = '', icon = '', subText = ''; switch(item.type) { case 'profit': title = 'Profit Share'; subText = `From: ${item.from}`; icon="fa-chart-line"; break; case 'manual_credit': title = 'Admin Bonus'; icon="fa-gift"; break; case 'withdrawal': title = 'Withdrawal'; icon="fa-arrow-circle-up"; break; case 'Self Return (10%)': title = 'Self Interest (10%)'; icon="fa-undo"; break; case 'Guarantor Commission (10%)': title = `Guarantor Comm.`; subText = `Source: ${item.from}`; icon="fa-handshake"; break; default: title = `Transaction`; icon="fa-coins"; } div.className = 'flex justify-between items-center p-3 border-b border-gray-100 last:border-0 hover:bg-gray-50 transition-colors'; div.innerHTML = `<div class="flex items-center gap-3"><div class="w-8 h-8 rounded-full ${isCredit ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600'} flex items-center justify-center text-xs"><i class="fas ${icon}"></i></div><div><p class="font-semibold text-gray-800 text-sm">${title}</p>${subText ? `<p class="text-[10px] text-gray-500 font-medium truncate w-24 sm:w-auto">${subText}</p>` : ''}<p class="text-[10px] text-gray-400">${item.date.toLocaleDateString('en-GB')}</p></div></div><span class="font-bold text-sm ${isCredit ? 'text-green-600' : 'text-red-600'}">${isCredit ? '+' : ''} ₹${Math.abs(item.amount).toLocaleString('en-IN', {minimumFractionDigits: 0, maximumFractionDigits: 2})}</span>`; historyList.appendChild(div); }); }
function populateScoreBreakdownModal() { /* Same as before */ const contentDiv = document.getElementById('score-breakdown-content'); if (!scoreResultCache) { contentDiv.innerHTML = "Score not calculated yet."; return; } const { totalScore, capitalScore, consistencyScore, creditScore, isNewMemberRuleApplied, originalCapitalScore, originalConsistencyScore, originalCreditScore } = scoreResultCache; const row = (label, val, base) => `<div class="flex justify-between items-center py-2 border-b border-gray-200 last:border-0"><span class="text-sm text-gray-600">${label}</span><div class="text-right"><span class="font-bold text-royal-blue">${val.toFixed(0)}</span>${isNewMemberRuleApplied ? `<p class="text-[9px] text-red-400 line-through">${base.toFixed(0)}</p>` : ''}</div></div>`; let html = ''; html += row("Capital Score", capitalScore, originalCapitalScore); html += row("Consistency", consistencyScore, originalConsistencyScore); html += row("Credit Behavior", creditScore, originalCreditScore); if(isNewMemberRuleApplied) { html += `<p class="text-xs text-red-500 mt-2 bg-red-50 p-2 rounded border border-red-100 text-center"><i class="fas fa-info-circle"></i> New Member Rule: 50% score reduction for first 6 months.</p>`; } html += `<div class="mt-3 pt-3 border-t-2 border-gray-100 flex justify-between items-center"><span class="font-bold text-royal-dark">Total Score</span><span class="font-extrabold text-2xl text-royal-gold">${totalScore.toFixed(2)}</span></div>`; contentDiv.innerHTML = html; }


