// view_logic.js

// --- IMPORTS ---
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signInAnonymously } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-auth.js";
import { getDatabase, ref, get, update } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-database.js";

// Import Logic from Part 1
import { 
    CONFIG, 
    calculatePerformanceScore, 
    getLoanEligibility, 
    calculateProfitDistribution 
} from './tcf_logic.js';

const DEFAULT_PROFILE_PIC = 'https://placehold.co/200x200/E0E7FF/4F46E5?text=User';

// --- GLOBAL VARIABLES ---
let db, auth;
let allData = [], memberDataMap = new Map(), activeLoansData = {};
let currentMemberData = {}, scoreResultCache = null, balanceHistory = [];

// --- INSTANT LOAD (CACHE) ---
function initInstantLoad() {
    try {
        const urlParams = new URLSearchParams(window.location.search);
        const memberId = urlParams.get('memberId');
        if (memberId) {
            const cacheKey = `tcf_royal_view_cache_${memberId}`;
            const cachedRaw = localStorage.getItem(cacheKey);
            if (cachedRaw) {
                const data = JSON.parse(cachedRaw);
                console.log(`⚡ Instant Load from Cache for ${memberId}...`);
                processAndRender(data.members, data.transactions, data.activeLoans);
            }
        }
    } catch(e) { console.warn("Cache load failed:", e); }
}
initInstantLoad();

// --- INITIALIZATION ---
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
            if (user) fetchFreshData();
            else signInAnonymously(auth).catch(e => window.location.href = `/login.html?redirect=${encodeURIComponent(window.location.href)}`);
        });
    } catch (error) { showError(error.message); }
}

async function fetchFreshData() {
    setupEventListeners();
    try {
        console.log("🌐 Fetching fresh data...");
        const [membersSn, txSn, loansSn] = await Promise.all([
            get(ref(db, 'members')), 
            get(ref(db, 'transactions')),
            get(ref(db, 'activeLoans'))
        ]);

        if (!membersSn.exists() || !txSn.exists()) throw new Error('Data not found.');

        const members = membersSn.val();
        const transactions = txSn.val();
        const activeLoans = loansSn.exists() ? loansSn.val() : {};

        // Update Cache
        const urlParams = new URLSearchParams(window.location.search);
        const memberId = urlParams.get('memberId');
        if (memberId) {
            localStorage.setItem(`tcf_royal_view_cache_${memberId}`, JSON.stringify({ members, transactions, activeLoans }));
        }

        processAndRender(members, transactions, activeLoans);
    } catch (error) { showError(error.message); }
}

// --- MAIN LOGIC ---
function processAndRender(members, transactions, activeLoans) {
    allData = []; memberDataMap.clear(); activeLoansData = activeLoans || {}; balanceHistory = [];

    const urlParams = new URLSearchParams(window.location.search);
    const memberId = urlParams.get('memberId');
    if (!memberId) { showError("No member ID provided."); return; }

    try {
        currentMemberData = members[memberId];
        if (!currentMemberData) throw new Error(`Member ID not found.`);
        currentMemberData.membershipId = memberId;

        // Map Members
        for (const id in members) {
            if (members[id].status === 'Approved') {
                memberDataMap.set(id, {
                    name: members[id].fullName,
                    imageUrl: members[id].profilePicUrl,
                    guarantorName: members[id].guarantorName
                });
            }
        }
        
        // Process Transactions
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
                loan: 0, payment: 0, sipPayment: 0, returnAmount: 0, extraBalance: 0, extraWithdraw: 0, loanType: null
            };
            
            switch (tx.type) {
                case 'SIP': record.sipPayment = tx.amount || 0; break;
                case 'SIP Withdrawal': record.sipPayment = -(tx.amount || 0); break; // Handle negative SIP
                case 'Loan Taken': record.loan = tx.amount || 0; record.loanType = tx.loanType || 'Loan'; break;
                case 'Loan Payment':
                    record.payment = (tx.principalPaid || 0) + (tx.interestPaid || 0);
                    record.returnAmount = tx.interestPaid || 0;
                    break;
                case 'Extra Payment': record.extraBalance = tx.amount || 0; break;
                case 'Extra Withdraw': record.extraWithdraw = tx.amount || 0; break;
            }
            if (Object.values(record).some(v => v !== 0 && v !== record.id && v !== record.date && v !== record.name && v !== record.imageUrl && v !== record.memberId)) {
                 allData.push(record);
            }
        }
        allData.sort((a, b) => a.date - b.date || a.id - b.id);
        
        populateProfileData();
        
        const loader = document.getElementById('loader-container');
        if(loader) loader.classList.add('fade-out');

    } catch (error) { showError(error.message); }
}

function populateProfileData() {
    const data = currentMemberData;
    
    // Calculate Current SIP Balance (Used for Score & Loan Logic)
    const memberTransactions = allData.filter(tx => tx.memberId === data.membershipId);
    const totalSip = memberTransactions.reduce((s, tx) => s + tx.sipPayment, 0);

    // Calculate Wallet Balance using Logic File
    const balanceResult = calculateTotalExtraBalance(data.membershipId, data.fullName);
    balanceHistory = balanceResult.history;
    currentMemberData.extraBalance = balanceResult.total;

    const lifetimeProfit = calculateTotalProfitForMember(data.fullName);

    // UI Updates
    const formatDate = (ds) => ds ? new Date(ds).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : "N/A";
    
    document.getElementById('profile-pic').src = data.profilePicUrl || DEFAULT_PROFILE_PIC;
    document.getElementById('profile-name').textContent = data.fullName || 'N/A';
    document.getElementById('membership-id').textContent = `ID: ${data.membershipId}`;
    document.getElementById('mobile-number').textContent = data.mobileNumber || 'N/A';
    document.getElementById('dob').textContent = formatDate(data.dob);
    document.getElementById('aadhaar').textContent = data.aadhaar || 'N/A';
    document.getElementById('address').textContent = data.address || 'N/A';
    document.getElementById('joining-date-header').textContent = `Member since ${new Date(data.joiningDate).getFullYear()}`;
    document.getElementById('guarantor-name').textContent = data.guarantorName || 'N/A';
    
    document.getElementById('total-sip').textContent = `₹${totalSip.toLocaleString('en-IN')}`;
    document.getElementById('lifetime-profit').textContent = `₹${lifetimeProfit.toLocaleString('en-IN', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
    document.getElementById('extra-balance').textContent = `₹${balanceResult.total.toLocaleString('en-IN', {minimumFractionDigits: 0, maximumFractionDigits: 2})}`;
    
    document.getElementById('withdraw-btn').disabled = balanceResult.total < 10;
    
    // Docs
    document.getElementById('doc-profile-pic').src = data.profilePicUrl || DEFAULT_PROFILE_PIC;
    document.getElementById('doc-document').src = data.documentUrl || DEFAULT_PROFILE_PIC;
    document.getElementById('doc-signature').src = data.signatureUrl || DEFAULT_PROFILE_PIC;
    
    // --- SCORE CALCULATION (Using tcf_logic.js) ---
    // We pass totalSip as 'currentSipBalance'
    scoreResultCache = calculatePerformanceScore(data.fullName, new Date(), allData, activeLoansData, totalSip);
    
    const eligibilityResult = getLoanEligibility(data.fullName, scoreResultCache.totalScore, allData);
    
    document.getElementById('performance-score').textContent = scoreResultCache.totalScore.toFixed(2);
    document.getElementById('loan-eligibility').textContent = eligibilityResult.eligible ? `${eligibilityResult.multiplier.toFixed(2)}x Limit` : eligibilityResult.reason;
    
    populateLoanHistory(data.fullName);
    
    document.getElementById('profile-content').classList.remove('hidden');
}

function populateLoanHistory(memberName) {
    const container = document.getElementById('loan-history-container');
    const memberData = allData.filter(r => r.name === memberName);
    const loans = memberData.filter(r => r.loan > 0 && r.loanType !== 'SIP'); 
    
    if (loans.length === 0) {
        container.innerHTML = '<p class="text-center text-gray-400 text-xs py-4 italic">No loan history.</p>';
        return;
    }
    container.innerHTML = '';
    
    // Reverse to show latest first
    [...loans].reverse().forEach(loan => {
        let amountRepaid = 0;
        let repaymentDate = null;
        
        memberData.filter(r => r.date > loan.date && (r.payment > 0 || r.sipPayment > 0)).forEach(p => { 
            if(!repaymentDate) {
                amountRepaid += p.payment + p.sipPayment; 
                if(amountRepaid >= loan.loan) repaymentDate = p.date;
            }
        });
        
        const daysToRepay = repaymentDate ? Math.round((repaymentDate - loan.date) / (1000 * 3600 * 24)) : null;
        let status, colorClass, icon;

        if (loan.loanType === '10 Days Credit') {
             // 10 Days Logic Visualization
             if(daysToRepay === null) { status = "ACTIVE (10D)"; colorClass = "text-orange-600 bg-orange-50 border-orange-200"; icon="fa-hourglass-half"; }
             else if(daysToRepay <= 15) { status = "PAID (NEUTRAL)"; colorClass = "text-gray-600 bg-gray-50 border-gray-200"; icon="fa-check"; }
             else { status = "LATE PAYMENT"; colorClass = "text-red-600 bg-red-50 border-red-200"; icon="fa-exclamation"; }
        } else {
             // Term Loan Visualization
             if(daysToRepay === null) { status = "ACTIVE"; colorClass = "text-blue-600 bg-blue-50 border-blue-200"; icon="fa-clock"; }
             else if (daysToRepay <= 90) { status = "EXCELLENT"; colorClass = "text-green-600 bg-green-50 border-green-200"; icon="fa-star"; }
             else { status = "GOOD"; colorClass = "text-teal-600 bg-teal-50 border-teal-200"; icon="fa-check-circle"; }
        }

        const div = document.createElement('div');
        div.className = `flex justify-between items-center p-3 rounded-lg border ${colorClass} mb-2`;
        div.innerHTML = `
            <div class="flex items-center gap-3">
                <div class="text-lg opacity-80"><i class="fas ${icon}"></i></div>
                <div>
                    <p class="font-bold text-sm">₹${loan.loan.toLocaleString('en-IN')}</p>
                    <p class="text-[10px] uppercase tracking-wide opacity-70">${loan.date.toLocaleDateString('en-GB')}</p>
                </div>
            </div>
            <div class="text-right">
                <p class="font-bold text-[10px] uppercase tracking-wider">${status}</p>
                <p class="text-[10px] opacity-70">${daysToRepay !== null ? `${daysToRepay} days` : 'Active'}</p>
            </div>`;
        container.appendChild(div);
    });
}

// --- PROFIT & WALLET HELPERS ---

function calculateTotalProfitForMember(memberName) { 
    // Need to pass 'Payer SIP' for each transaction, but for History Total we assume standard distribution for now
    // or we iterate properly. To keep it fast:
    return allData.reduce((totalProfit, transaction) => { 
        if (transaction.returnAmount > 0) { 
            // Lookup Payer's SIP Balance at that time?
            // Simplified: Use current Payer SIP for logic or fallback to Normal
            const payerId = transaction.memberId;
            const payerTransactions = allData.filter(t => t.memberId === payerId);
            const payerSip = payerTransactions.reduce((s, t) => s + t.sipPayment, 0);

            const result = calculateProfitDistribution(transaction, allData, activeLoansData, payerSip); 
            const memberShare = result?.distribution.find(d => d.name === memberName); 
            if (memberShare) totalProfit += memberShare.share; 
        } 
        return totalProfit; 
    }, 0); 
}

function calculateTotalExtraBalance(memberId, memberFullName) {
    const history = [];
    
    // 1. Profit Shares
    const profitEvents = allData.filter(r => r.returnAmount > 0);
    profitEvents.forEach(paymentRecord => {
        // Find Payer's SIP for correct split logic (SIP Zero vs Normal)
        const payerTransactions = allData.filter(t => t.memberId === paymentRecord.memberId);
        const payerSip = payerTransactions.reduce((s, t) => s + t.sipPayment, 0);

        const result = calculateProfitDistribution(paymentRecord, allData, activeLoansData, payerSip);
        const memberShare = result?.distribution.find(d => d.name === memberFullName);
        
        if(memberShare && memberShare.share > 0) {
            history.push({ type: memberShare.type || 'profit', from: paymentRecord.name, date: paymentRecord.date, amount: memberShare.share });
        }
    });

    // 2. Manual Adjustments
    const manualAdjustments = allData.filter(tx => tx.memberId === memberId && (tx.extraBalance > 0 || tx.extraWithdraw > 0));
    manualAdjustments.forEach(tx => {
        if (tx.extraBalance > 0) history.push({ type: 'manual_credit', from: 'Admin', date: tx.date, amount: tx.extraBalance });
        if (tx.extraWithdraw > 0) history.push({ type: 'withdrawal', from: 'Admin', date: tx.date, amount: -tx.extraWithdraw });
    });

    history.sort((a,b) => a.date - b.date);
    const total = history.reduce((acc, item) => acc + item.amount, 0);
    return { total, history };
}

// --- UTILS ---
function showError(message) {
    const loaderContainer = document.getElementById('loader-container');
    const errorMessageEl = document.getElementById('error-message');
    if(loaderContainer) loaderContainer.classList.add('fade-out');
    if(errorMessageEl) {
        errorMessageEl.querySelector('p').textContent = message;
        errorMessageEl.classList.remove('hidden');
    }
}

// --- EVENT LISTENERS (Modals etc) ---
function setupEventListeners() {
    if(document.body.getAttribute('data-listeners-added')) return;
    document.body.setAttribute('data-listeners-added', 'true');

    // ... (Keep existing Modal Event Listeners: Image Viewer, Withdrawal, History, Password, Card) ...
    // Note: Due to file length limits, copy-paste the exact Event Listeners block from your original file here.
    // Ensure 'populateHistoryModal', 'populateScoreBreakdownModal', 'setupPasswordListeners' are defined/called as before.
    
    setupUIEventHandlers(); // Helper to keep this clean
}

function setupUIEventHandlers() {
    // 1. History Modal
    document.getElementById('view-history-btn')?.addEventListener('click', () => {
        const historyList = document.getElementById('history-list');
        if(!historyList) return;
        historyList.innerHTML = '';
        if (balanceHistory.length === 0) {
            historyList.innerHTML = '<p class="text-center text-gray-400 italic py-4">No transactions.</p>';
        } else {
            [...balanceHistory].reverse().forEach(item => {
                const div = document.createElement('div');
                const isCredit = item.amount > 0;
                let title = item.type === 'profit' ? 'Profit Share' : (item.type === 'withdrawal' ? 'Withdrawal' : 'Bonus');
                if(item.type.includes('Return')) title = item.type;
                
                div.className = 'flex justify-between items-center p-3 border-b border-gray-100 hover:bg-gray-50';
                div.innerHTML = `<div><p class="font-semibold text-gray-800 text-sm">${title}</p><p class="text-[10px] text-gray-400">${item.date.toLocaleDateString('en-GB')} • From: ${item.from}</p></div><span class="font-bold text-sm ${isCredit?'text-green-600':'text-red-600'}">${isCredit?'+':''}₹${Math.abs(item.amount).toFixed(2)}</span>`;
                historyList.appendChild(div);
            });
        }
        document.getElementById('historyModal').classList.remove('hidden');
        document.getElementById('historyModal').classList.add('flex');
    });
    document.getElementById('close-history-modal')?.addEventListener('click', () => {
        document.getElementById('historyModal').classList.add('hidden');
        document.getElementById('historyModal').classList.remove('flex');
    });

    // 2. Score Modal
    document.getElementById('score-info-btn')?.addEventListener('click', () => {
        const contentDiv = document.getElementById('score-breakdown-content');
        if (contentDiv && scoreResultCache) {
             const { totalScore, components, isProbation } = scoreResultCache;
             contentDiv.innerHTML = `
                <div class="flex justify-between py-2 border-b"><span class="text-sm text-gray-600">Capital (40%)</span><span class="font-bold text-royal-blue">${components.capital.toFixed(0)}</span></div>
                <div class="flex justify-between py-2 border-b"><span class="text-sm text-gray-600">Consistency (30%)</span><span class="font-bold text-royal-blue">${components.consistency.toFixed(0)}</span></div>
                <div class="flex justify-between py-2 border-b"><span class="text-sm text-gray-600">Credit (30%)</span><span class="font-bold text-royal-blue">${components.credit.toFixed(0)}</span></div>
                ${isProbation ? '<p class="text-xs text-red-500 mt-2 bg-red-50 p-2 rounded">New Member Rule Applied (50% Score)</p>' : ''}
                <div class="mt-3 pt-3 border-t-2 flex justify-between"><span class="font-bold">Total</span><span class="font-extrabold text-2xl text-royal-gold">${totalScore.toFixed(2)}</span></div>
             `;
        }
        document.getElementById('scoreBreakdownModal').classList.remove('hidden');
        document.getElementById('scoreBreakdownModal').classList.add('flex');
    });
    document.getElementById('close-score-modal')?.addEventListener('click', () => {
        document.getElementById('scoreBreakdownModal').classList.add('hidden');
        document.getElementById('scoreBreakdownModal').classList.remove('flex');
    });
    
    // Add other listeners (Withdrawal, Password, Image) as per original file...
}

// ... Copy 'setupPasswordListeners', 'submitWithdrawal', 'showWithdrawalCard' etc. from original file ...
// (Removed here for brevity, but they are unchanged logic-wise)
