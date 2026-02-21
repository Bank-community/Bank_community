// view_logic.js - Main Controller for Fetching Data and Populating Profile

// --- Firebase SDKs & Modals Import ---
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signInAnonymously } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-auth.js";
import { getDatabase, ref, get } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-database.js";
import { initModals } from './view_modals.js'; // Importing Modals logic

const CONFIG = {
    INACTIVE_DAYS_LEVEL_1: 180, 
    INACTIVE_PROFIT_MULTIPLIER_LEVEL_1: 0.90,
    INACTIVE_DAYS_LEVEL_2: 365, 
    INACTIVE_PROFIT_MULTIPLIER_LEVEL_2: 0.75,
};

const DEFAULT_PROFILE_PIC = 'https://placehold.co/200x200/E0E7FF/4F46E5?text=User';

// --- GLOBAL VARIABLES & STATE ---
let db, auth;
let allData = [], memberDataMap = new Map(), activeLoansData = {};
let currentMemberData = {}, scoreResultCache = null, balanceHistory = [];

// Get state function to pass to view_modals.js
function getState() {
    return { currentMemberData, scoreResultCache, balanceHistory };
}

// --- INSTANT LOAD (STEP 1) ---
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
            if (user) fetchFreshData();
            else signInAnonymously(auth).catch(e => console.error("Auth failed:", e));
        });
    } catch (error) { showError(error.message); }
}

// --- DATA FETCHING ---
async function fetchFreshData() {
    // Initialize Modals Event Listeners once DB is ready
    initModals(db, getState);
    
    try {
        console.log("🌐 Fetching fresh data...");
        const [membersSnap, txSnap, loansSnap] = await Promise.all([
            get(ref(db, 'members')), 
            get(ref(db, 'transactions')),
            get(ref(db, 'activeLoans'))
        ]);

        if (!membersSnap.exists() || !txSnap.exists()) throw new Error('Data not found.');

        const members = membersSnap.val();
        const transactions = txSnap.val();
        const activeLoans = loansSnap.exists() ? loansSnap.val() : {};

        const urlParams = new URLSearchParams(window.location.search);
        const memberId = urlParams.get('memberId');
        if (memberId) {
            localStorage.setItem(`tcf_royal_view_cache_${memberId}`, JSON.stringify({ members, transactions, activeLoans }));
        }

        processAndRender(members, transactions, activeLoans);
    } catch (error) { showError(error.message); }
}

// --- MAIN LOGIC: PROCESS & RENDER ---
function processAndRender(members, transactions, activeLoans) {
    allData = []; memberDataMap.clear(); activeLoansData = {}; balanceHistory = [];

    const urlParams = new URLSearchParams(window.location.search);
    const memberId = urlParams.get('memberId');
    if (!memberId) { showError("No member ID provided."); return; }

    try {
        activeLoansData = activeLoans || {};
        currentMemberData = members[memberId];
        if (!currentMemberData) throw new Error(`Member ID not found.`);
        currentMemberData.membershipId = memberId;

        for (const id in members) {
            if (members[id].status === 'Approved') {
                memberDataMap.set(id, {
                    name: members[id].fullName,
                    imageUrl: members[id].profilePicUrl,
                    guarantorName: members[id].guarantorName
                });
            }
        }
        
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
                loan: 0, payment: 0, sipPayment: 0, returnAmount: 0,
                extraBalance: 0, extraWithdraw: 0, loanType: null, 
                transactionId: txId 
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
                default: continue; 
            }
            allData.push(record);
        }
        allData.sort((a, b) => a.date - b.date || a.id - b.id);
        
        populateProfileData();
    } catch (error) { showError(error.message); }
}

// --- UI POPULATION ---
function populateProfileData() {
    const balanceResult = calculateTotalExtraBalance(currentMemberData.membershipId, currentMemberData.fullName);
    balanceHistory = balanceResult.history;
    currentMemberData.extraBalance = balanceResult.total;
    
    const memberTransactions = allData.filter(tx => tx.memberId === currentMemberData.membershipId);
    const totalSip = memberTransactions.reduce((s, tx) => s + tx.sipPayment, 0);
    const lifetimeProfit = calculateTotalProfitForMember(currentMemberData.fullName, allData, activeLoansData);

    const data = currentMemberData;
    const formatDate = (ds) => ds ? new Date(ds).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : "N/A";
    
    // Fill Basic UI
    document.getElementById('profile-pic').src = data.profilePicUrl || DEFAULT_PROFILE_PIC;
    document.getElementById('profile-name').textContent = data.fullName || 'N/A';
    document.getElementById('membership-id').textContent = `ID: ${data.membershipId || 'N/A'}`;
    document.getElementById('mobile-number').textContent = data.mobileNumber || 'N/A';
    document.getElementById('email-address').textContent = data.email || 'Not Provided';
    document.getElementById('dob').textContent = formatDate(data.dob);
    document.getElementById('aadhaar').textContent = data.aadhaar || 'N/A';
    document.getElementById('address').textContent = data.address || 'N/A';
    document.getElementById('joining-date-header').textContent = `Member since ${new Date(data.joiningDate).getFullYear()}`;
    document.getElementById('guarantor-name').textContent = data.guarantorName || 'N/A';
    document.getElementById('total-sip').textContent = `₹${totalSip.toLocaleString('en-IN')}`;
    document.getElementById('lifetime-profit').textContent = `₹${lifetimeProfit.toLocaleString('en-IN', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
    document.getElementById('extra-balance').textContent = `₹${balanceResult.total.toLocaleString('en-IN', {minimumFractionDigits: 0, maximumFractionDigits: 2})}`;
    
    document.getElementById('withdraw-btn').disabled = balanceResult.total < 10;
    
    // Documents
    document.getElementById('doc-profile-pic').src = data.profilePicUrl || DEFAULT_PROFILE_PIC;
    document.getElementById('doc-document').src = data.documentUrl || DEFAULT_PROFILE_PIC;
    document.getElementById('doc-document-back').src = data.documentBackUrl || DEFAULT_PROFILE_PIC; 
    document.getElementById('doc-signature').src = data.signatureUrl || DEFAULT_PROFILE_PIC;
    
    // Score & Eligibility
    if (typeof calculatePerformanceScore === 'function') {
        scoreResultCache = calculatePerformanceScore(data.fullName, new Date(), allData, activeLoansData);
        document.getElementById('performance-score').textContent = scoreResultCache.totalScore.toFixed(2);
        
        if (typeof getLoanEligibility === 'function') {
            const eligibilityResult = getLoanEligibility(data.fullName, totalSip, allData);
            document.getElementById('loan-eligibility').textContent = eligibilityResult.eligible ? 
                `₹${eligibilityResult.maxAmount.toLocaleString('en-IN')} Limit` : 
                eligibilityResult.reason;
        }
    }
    
    populateLoanHistory(data.fullName);
    document.getElementById('loader-container').classList.add('fade-out'); 
    document.getElementById('profile-content').classList.remove('hidden');
}

function populateLoanHistory(memberName) {
    const container = document.getElementById('loan-history-container');
    const memberData = allData.filter(r => r.name === memberName);
    const loans = memberData.filter(r => r.loan > 0 && r.loanType === 'Loan'); 
    
    if (loans.length === 0) {
        container.innerHTML = '<p class="text-center text-gray-400 text-xs py-4 italic">No loan history records found.</p>';
        return;
    }
    container.innerHTML = '';
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
        
        if(daysToRepay === null) { status = "PENDING"; colorClass = "text-yellow-600 bg-yellow-50 border-yellow-200"; icon = "fa-clock"; }
        else if (daysToRepay <= 90) { status = "PAID ON TIME"; colorClass = "text-green-600 bg-green-50 border-green-200"; icon = "fa-check-circle"; }
        else { status = "LATE REPAYMENT"; colorClass = "text-red-600 bg-red-50 border-red-200"; icon = "fa-exclamation-circle"; }

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

function showError(message) {
    const loaderContainer = document.getElementById('loader-container');
    const errorMessageEl = document.getElementById('error-message');
    if(loaderContainer) loaderContainer.classList.add('fade-out');
    errorMessageEl.querySelector('p').textContent = message;
    errorMessageEl.classList.remove('hidden');
}

// --- PROFIT CALCULATION ---
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

function calculateProfitDistribution(paymentRecord, allData, activeLoansData) { 
    const totalInterest = paymentRecord.returnAmount; if (totalInterest <= 0) return null; 
    const distribution = [];
    const selfShare = totalInterest * 0.10;
    distribution.push({ name: paymentRecord.name, share: selfShare, type: 'Self Return (10%)' });
    const payerMemberInfo = memberDataMap.get(paymentRecord.memberId);
    if (payerMemberInfo && payerMemberInfo.guarantorName && payerMemberInfo.guarantorName !== 'Xxxxx') {
            distribution.push({ name: payerMemberInfo.guarantorName, share: totalInterest * 0.10, type: 'Guarantor Commission (10%)' });
    }
    const communityPool = totalInterest * 0.70;
    const userLoansBeforePayment = allData.filter(r => r.name === paymentRecord.name && r.loan > 0 && r.date < paymentRecord.date && r.loanType === 'Loan' ); 
    if (userLoansBeforePayment.length === 0) return { distribution };
    const relevantLoan = userLoansBeforePayment.pop(); const loanDate = relevantLoan.date; 
    const snapshotScores = {}; let totalScoreInSnapshot = 0; 
    
    const membersInSystemAtLoanDate = [...new Set(allData.filter(r => r.date <= loanDate).map(r => r.name))]; 
    membersInSystemAtLoanDate.forEach(name => { 
        if (name === paymentRecord.name) return;
        if (typeof calculatePerformanceScore === 'function') {
            const scoreObject = calculatePerformanceScore(name, loanDate, allData, activeLoansData); 
            if (scoreObject.totalScore > 0) { snapshotScores[name] = scoreObject; totalScoreInSnapshot += scoreObject.totalScore; } 
        }
    }); 
    
    if (totalScoreInSnapshot > 0) {
        for (const memberName in snapshotScores) { 
            let memberShare = (snapshotScores[memberName].totalScore / totalScoreInSnapshot) * communityPool; 
            const lastLoanDate = allData.filter(r => r.name === memberName && r.loan > 0 && r.date <= loanDate && r.loanType === 'Loan').pop()?.date;
            const daysSinceLastLoan = lastLoanDate ? (loanDate - lastLoanDate) / (1000 * 3600 * 24) : Infinity; 
            let appliedMultiplier = 1.0; 
            if (daysSinceLastLoan > CONFIG.INACTIVE_DAYS_LEVEL_2) appliedMultiplier = CONFIG.INACTIVE_PROFIT_MULTIPLIER_LEVEL_2; 
            else if (daysSinceLastLoan > CONFIG.INACTIVE_DAYS_LEVEL_1) appliedMultiplier = CONFIG.INACTIVE_PROFIT_MULTIPLIER_LEVEL_1; 
            memberShare *= appliedMultiplier; 
            if (memberShare > 0) distribution.push({ name: memberName, share: memberShare, type: 'Community Profit' }); 
        } 
    }
    return { distribution }; 
}

function calculateTotalExtraBalance(memberId, memberFullName) {
    const history = [];
    const profitEvents = allData.filter(r => r.returnAmount > 0);
    profitEvents.forEach(paymentRecord => {
        const result = calculateProfitDistribution(paymentRecord, allData, activeLoansData);
        const memberShare = result?.distribution.find(d => d.name === memberFullName);
        if(memberShare && memberShare.share > 0) {
            history.push({ type: memberShare.type || 'profit', from: paymentRecord.name, date: paymentRecord.date, amount: memberShare.share });
        }
    });
    const manualAdjustments = allData.filter(tx => tx.memberId === memberId && (tx.extraBalance > 0 || tx.extraWithdraw > 0));
    manualAdjustments.forEach(tx => {
        if (tx.extraBalance > 0) history.push({ type: 'manual_credit', from: 'Admin', date: tx.date, amount: tx.extraBalance });
        if (tx.extraWithdraw > 0) history.push({ type: 'withdrawal', from: 'Admin', date: tx.date, amount: -tx.extraWithdraw });
    });
    history.sort((a,b) => a.date - b.date);
    const total = history.reduce((acc, item) => acc + item.amount, 0);
    return { total, history };
}
