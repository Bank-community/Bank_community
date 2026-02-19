// --- CONFIGURATION CONSTANTS ---
const CONFIG = {
    // Score Weights
    CAPITAL_WEIGHT: 0.40, 
    CONSISTENCY_WEIGHT: 0.30, 
    CREDIT_BEHAVIOR_WEIGHT: 0.30,

    // Capital Targets & Limits
    CAPITAL_SCORE_TARGET_SIP: 50000, // Updated to 50k for 18 months
    
    // Loan Eligibility Slabs (New Rule)
    SIP_SLAB_THRESHOLD: 25000,
    MULTIPLIER_BELOW_SLAB: 1.5,
    MULTIPLIER_ABOVE_SLAB: 2.0,
    MAX_LOAN_LIMIT_AMOUNT: 50000, // Hard Cap

    // Timeframes & Dates
    NEW_LOGIC_START_DATE: '2026-02-15', // Cutoff Date
    REVIEW_PERIOD_DAYS: 540, // 18 Months Fixed
    MINIMUM_MEMBERSHIP_DAYS: 60, 
    MINIMUM_MEMBERSHIP_FOR_CREDIT_SCORE: 30,
    NEW_MEMBER_PROBATION_DAYS: 180,

    // Payment Rules
    SIP_ON_TIME_LIMIT: 10, 
    EMI_DATE_START: 1,
    EMI_DATE_END: 10,
    
    // Old Logic Constants (Pre-Feb 2026)
    LOAN_TERM_BEST: 30, 
    LOAN_TERM_BETTER: 60, 
    LOAN_TERM_GOOD: 90,
    TEN_DAY_CREDIT_GRACE_DAYS: 15, 
    BUSINESS_LOAN_TERM_DAYS: 365,
    
    // Inactivity Penalties (Profit)
    INACTIVE_DAYS_LEVEL_1: 180, 
    INACTIVE_PROFIT_MULTIPLIER_LEVEL_1: 0.90,
    INACTIVE_DAYS_LEVEL_2: 365, 
    INACTIVE_PROFIT_MULTIPLIER_LEVEL_2: 0.75,
};

const DEFAULT_PROFILE_PIC = 'https://placehold.co/200x200/E0E7FF/4F46E5?text=User';

// --- Firebase SDKs (Modular v9) ---
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signInAnonymously } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-auth.js";
import { getDatabase, ref, get, update } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-database.js";

// --- GLOBAL VARIABLES & STATE ---
let db, auth;
let allData = [], memberDataMap = new Map(), activeLoansData = {};
let currentMemberData = {}, scoreResultCache = null, balanceHistory = [];

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
    setupEventListeners();
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
                transactionId: txId // Important for precise tracking
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
    document.getElementById('dob').textContent = formatDate(data.dob);
    document.getElementById('aadhaar').textContent = data.aadhaar || 'N/A';
    document.getElementById('address').textContent = data.address || 'N/A';
    document.getElementById('joining-date-header').textContent = `Member since ${new Date(data.joiningDate).getFullYear()}`;
    document.getElementById('guarantor-name').textContent = data.guarantorName || 'N/A';
    document.getElementById('total-sip').textContent = `₹${totalSip.toLocaleString('en-IN')}`;
    document.getElementById('lifetime-profit').textContent = `₹${lifetimeProfit.toLocaleString('en-IN', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
    document.getElementById('extra-balance').textContent = `₹${balanceResult.total.toLocaleString('en-IN', {minimumFractionDigits: 0, maximumFractionDigits: 2})}`;
    
    document.getElementById('withdraw-btn').disabled = balanceResult.total < 10;
    
    document.getElementById('doc-profile-pic').src = data.profilePicUrl || DEFAULT_PROFILE_PIC;
    document.getElementById('doc-document').src = data.documentUrl || DEFAULT_PROFILE_PIC;
    document.getElementById('doc-signature').src = data.signatureUrl || DEFAULT_PROFILE_PIC;
    
    // --- SCORE & ELIGIBILITY CALCULATION ---
    // Using new Date() as 'untilDate'
    scoreResultCache = calculatePerformanceScore(data.fullName, new Date(), allData, activeLoansData);
    
    // Calculate Loan Eligibility using NEW Rules
    const eligibilityResult = getLoanEligibility(data.fullName, totalSip, allData);

    document.getElementById('performance-score').textContent = scoreResultCache.totalScore.toFixed(2);
    document.getElementById('loan-eligibility').textContent = eligibilityResult.eligible ? `₹${eligibilityResult.maxAmount.toLocaleString('en-IN')} Limit` : eligibilityResult.reason;
    
    populateLoanHistory(data.fullName);
    
    document.getElementById('loader-container').classList.add('fade-out'); 
    document.getElementById('profile-content').classList.remove('hidden');
}

// ------------------------------------------------------------------
// --- CORE SCORING LOGIC (UPDATED 18 MONTHS + FEB 15 LOGIC) ---
// ------------------------------------------------------------------

function calculatePerformanceScore(memberName, untilDate, allData, activeLoansData) {
    const memberData = allData.filter(r => r.name === memberName && r.date <= untilDate);
    if (memberData.length === 0) return { totalScore: 0, capitalScore: 0, consistencyScore: 0, creditScore: 0 };
    
    const firstTransactionDate = memberData[0]?.date;
    const membershipDays = firstTransactionDate ? (untilDate - firstTransactionDate) / (1000 * 3600 * 24) : 0;
    const isNewMemberRuleApplied = membershipDays < CONFIG.NEW_MEMBER_PROBATION_DAYS;
    
    // 1. Capital Score (18 Months + Skip First SIP)
    let capitalScore = calculateCapitalScore(memberName, untilDate, allData);
    
    // 2. Consistency Score (18 Months + Skip First SIP)
    let consistencyScore = calculateConsistencyScore(memberData, untilDate);
    
    // 3. Credit Behavior (Hybrid Logic: Pre & Post Feb 15)
    let creditScore = calculateCreditBehaviorScore(memberName, untilDate, allData, activeLoansData); 

    const originalCapitalScore = capitalScore;
    const originalConsistencyScore = consistencyScore;
    const originalCreditScore = creditScore;
    
    // Probation Rule (50% score for first 6 months)
    if (isNewMemberRuleApplied) { 
        capitalScore *= 0.50; 
        consistencyScore *= 0.50; 
        creditScore *= 0.50; 
    }
    
    const totalScore = (capitalScore * CONFIG.CAPITAL_WEIGHT) + (consistencyScore * CONFIG.CONSISTENCY_WEIGHT) + (creditScore * CONFIG.CREDIT_BEHAVIOR_WEIGHT);
    
    return { 
        totalScore, capitalScore, consistencyScore, creditScore, 
        isNewMemberRuleApplied, originalCapitalScore, originalConsistencyScore, originalCreditScore 
    };
}

function calculateCapitalScore(memberName, untilDate, allData) {
    // 18 Months Window
    const startDate = new Date(untilDate.getTime() - CONFIG.REVIEW_PERIOD_DAYS * 24 * 3600 * 1000);
    const memberData = allData.filter(r => r.name === memberName && r.date <= untilDate);
    
    const allSips = memberData.filter(r => r.sipPayment > 0);
    // Skip First SIP
    const validSips = allSips.slice(1).filter(r => r.date >= startDate);
    
    const totalSipAmount = validSips.reduce((sum, tx) => sum + tx.sipPayment, 0);
    
    // Target 50,000
    const normalizedScore = (totalSipAmount / CONFIG.CAPITAL_SCORE_TARGET_SIP) * 100;
    return Math.min(100, Math.max(0, normalizedScore));
}

function calculateConsistencyScore(memberData, untilDate) {
    const allSipData = memberData.filter(r => r.sipPayment > 0);
    if (allSipData.length <= 1) return 0; // Need at least 2 SIPs to measure consistency

    // Skip First SIP
    const validSips = allSips = allSipData.slice(1);
    
    // 18 Months Window
    const reviewDate = new Date(untilDate); 
    reviewDate.setDate(reviewDate.getDate() - CONFIG.REVIEW_PERIOD_DAYS);
    
    const recentValidSips = validSips.filter(r => r.date >= reviewDate); 
    if (recentValidSips.length === 0) return 0;

    const sipHistory = {};
    recentValidSips.forEach(r => { 
        const monthKey = `${r.date.getFullYear()}-${r.date.getMonth()}`; 
        if (!sipHistory[monthKey]) { 
            // Rule: On Time <= 10th
            sipHistory[monthKey] = r.date.getDate() <= CONFIG.SIP_ON_TIME_LIMIT ? 10 : 5; 
        } 
    });
    
    if (Object.keys(sipHistory).length === 0) return 0;
    const consistencyPoints = Object.values(sipHistory).reduce((a, b) => a + b, 0);
    const monthsConsidered = Math.max(1, Object.keys(sipHistory).length);
    return (consistencyPoints / (monthsConsidered * 10)) * 100;
}

// --- MAIN CREDIT SCORE ROUTER ---
function calculateCreditBehaviorScore(memberName, untilDate, allData, activeLoansData = {}) {
    const memberData = allData.filter(r => r.name === memberName && r.date <= untilDate);
    
    // 18 Months Window
    const reviewStart = new Date(untilDate); 
    reviewStart.setDate(reviewStart.getDate() - CONFIG.REVIEW_PERIOD_DAYS);
    
    const memberActiveLoans = Object.values(activeLoansData).filter(loan => loan.memberName === memberName);
    const loansInWindow = memberData.filter(r => r.loan > 0 && r.date >= reviewStart && r.loanType === 'Loan'); 

    // NO LOAN CASE (Gravity Cap Logic)
    if (loansInWindow.length === 0) {
        const firstTransactionDate = memberData[0]?.date;
        if (!firstTransactionDate) return 40;
        const membershipDays = (untilDate - firstTransactionDate) / (1000 * 3600 * 24);
        if (membershipDays < CONFIG.MINIMUM_MEMBERSHIP_FOR_CREDIT_SCORE) return 40; 
        
        const sipData = memberData.filter(r => r.sipPayment > 0);
        if (sipData.length < 2) return 60;
        
        const avgSipDay = sipData.slice(1).reduce((sum, r) => sum + r.date.getDate(), 0) / (sipData.length - 1);
        const scoreBasedOnSip = (15 - avgSipDay) * 5 + 40;
        
        // CAP Score at 75 if no loans taken
        return Math.min(75, Math.max(0, scoreBasedOnSip));
    }
    
    // HYBRID LOGIC: Loop through loans and apply Old vs New rules
    let totalPoints = 0; 
    let loansProcessed = 0;
    const cutOffDate = new Date(CONFIG.NEW_LOGIC_START_DATE);

    for (const loanRecord of loansInWindow) {
        loansProcessed++;
        const loanDate = new Date(loanRecord.date);
        
        // Find Active Loan details to get type/tenure
        const loanDetails = memberActiveLoans.find(l => {
             // Match by date (approx) and amount
             const lDate = new Date(l.loanDate);
             return Math.abs(lDate - loanDate) < 86400000 && l.originalAmount === loanRecord.loan;
        });

        if (loanDate >= cutOffDate) {
            // --- NEW LOGIC (Post Feb 15) ---
            totalPoints += applyNewCreditLogic(loanRecord, loanDetails, memberData, untilDate);
        } else {
            // --- OLD LOGIC (Pre Feb 15) ---
            totalPoints += applyOldCreditLogic(loanRecord, loanDetails, memberData, untilDate);
        }
    }

    if (loansProcessed === 0) return 40;
    return Math.max(0, Math.min(100, (totalPoints / (loansProcessed * 25)) * 100));
}

// Helper: Old Logic (Business Loan & 10 Days)
function applyOldCreditLogic(loanRecord, loanDetails, memberData, untilDate) {
    let points = 0;
    
    if (loanDetails && loanDetails.loanType === 'Business Loan') {
        // Business Loan Logic
        const loanStartDate = new Date(loanDetails.loanDate);
        const monthsPassed = (untilDate.getFullYear() - loanStartDate.getFullYear()) * 12 + (untilDate.getMonth() - loanStartDate.getMonth());
        for (let i = 1; i <= monthsPassed; i++) {
            const checkMonth = new Date(loanStartDate); checkMonth.setMonth(checkMonth.getMonth() + i);
            const hasPaidInterest = memberData.some(tx => tx.returnAmount > 0 && 
                new Date(tx.date).getFullYear() === checkMonth.getFullYear() && 
                new Date(tx.date).getMonth() === checkMonth.getMonth());
            if (hasPaidInterest) points += 5; else points -= 10;
        }
        if ((untilDate - loanStartDate) / (1000 * 3600 * 24) > CONFIG.BUSINESS_LOAN_TERM_DAYS && loanDetails.status === 'Active') points -= 50;
    } 
    else if (loanDetails && loanDetails.loanType === '10 Days Credit') {
        // 10 Days Logic
        if (loanDetails.status === 'Paid') {
            const payments = memberData.filter(r => r.date > loanRecord.date && r.payment > 0);
            let repaidDate = null; let amountRepaid = 0;
            for (const p of payments) { amountRepaid += p.payment; if (amountRepaid >= loanRecord.loan) { repaidDate = p.date; break; } }
            const daysToRepay = repaidDate ? (repaidDate - loanRecord.date) / (1000 * 3600 * 24) : Infinity;
            if (daysToRepay <= CONFIG.TEN_DAY_CREDIT_GRACE_DAYS) points += 15; else points -= 20;
        } else points -= 30;
    } 
    else {
        // Normal Loan
        let amountRepaid = 0; let repaymentDate = null;
        const paymentsAfterLoan = memberData.filter(r => r.date > loanRecord.date && (r.payment > 0 || r.sipPayment > 0)); 
        for (const p of paymentsAfterLoan) { amountRepaid += p.payment + p.sipPayment; if (amountRepaid >= loanRecord.loan) { repaymentDate = p.date; break; } }
        if (repaymentDate) {
            const daysToRepay = (repaymentDate - loanRecord.date) / (1000 * 3600 * 24);
            if (daysToRepay <= CONFIG.LOAN_TERM_BEST) points += 25; else if (daysToRepay <= CONFIG.LOAN_TERM_BETTER) points += 20; else if (daysToRepay <= CONFIG.LOAN_TERM_GOOD) points += 15; else points -= 20;
        } else points -= 40;
    }
    return points;
}

// Helper: New Logic (Recharge, EMI, 90 Days)
function applyNewCreditLogic(loanRecord, loanDetails, memberData, untilDate) {
    let points = 0;
    const loanStartDate = new Date(loanRecord.date);
    const tenureMonths = loanDetails ? (loanDetails.tenureMonths || 0) : 0;
    const loanType = loanDetails ? loanDetails.loanType : 'Loan';

    // 1. Recharge System & EMI Loans (Tenure >= 4 months)
    if (loanType === 'Recharge' || tenureMonths >= 4) {
        // Check 1st-10th payment for every month passed
        const monthsPassed = (untilDate.getFullYear() - loanStartDate.getFullYear()) * 12 + (untilDate.getMonth() - loanStartDate.getMonth());
        
        for (let i = 1; i <= monthsPassed; i++) {
            // Target Month: Next month after loan start
            const targetDate = new Date(loanStartDate);
            targetDate.setMonth(targetDate.getMonth() + i);
            
            // Check transactions in 1st-10th of that month
            const hasValidPayment = memberData.some(tx => {
                const tDate = new Date(tx.date);
                return tDate.getFullYear() === targetDate.getFullYear() &&
                       tDate.getMonth() === targetDate.getMonth() &&
                       tDate.getDate() >= CONFIG.EMI_DATE_START &&
                       tDate.getDate() <= CONFIG.EMI_DATE_END &&
                       (tx.payment > 0 || tx.sipPayment > 0); // Any payment counts
            });

            if (hasValidPayment) points += 5; // Good EMI
            else points -= 15; // Late EMI Penalty
        }
        
        // Recharge Specific: Only 3 months tenure usually
        if(loanType === 'Recharge' && monthsPassed > 3 && loanDetails.status !== 'Paid') {
             points -= 20; // Overdue Recharge
        }
    }
    // 2. Small Loans (< 4 Months / 90 Days)
    else {
        // No EMI pressure. Check if cleared by 91 days.
        const daysPassed = (untilDate - loanStartDate) / (1000 * 3600 * 24);
        
        if (loanDetails && loanDetails.status === 'Paid') {
            const payments = memberData.filter(r => r.date > loanRecord.date && r.payment > 0);
            let repaidDate = null; let amountRepaid = 0;
            for (const p of payments) { amountRepaid += p.payment; if (amountRepaid >= loanRecord.loan) { repaidDate = p.date; break; } }
            
            const daysToRepay = repaidDate ? (repaidDate - loanRecord.date) / (1000 * 3600 * 24) : daysPassed;
            
            if (daysToRepay <= 90) points += 25; // Good Repayment
            else points -= 20; // Late Repayment
        } else {
             // Not paid yet
             if (daysPassed > 90) points -= 50; // Overdue (> 90 days) - Heavy Penalty
        }
    }
    return points;
}

// --- LOAN ELIGIBILITY (UPDATED SIP SLAB) ---
function getLoanEligibility(memberName, totalSipAmount, allData) {
    const memberData = allData.filter(r => r.name === memberName);
    let totalCapital = memberData.reduce((sum, r) => sum + r.sipPayment + r.payment - r.loan, 0);
    
    // Basic Checks
    if (totalCapital < 0) return { eligible: false, reason: 'Outstanding Loan' };
    const firstSip = memberData.find(r => r.sipPayment > 0);
    if (!firstSip) return { eligible: false, reason: 'No SIP yet' };
    
    const daysSinceFirstSip = (new Date() - firstSip.date) / (1000 * 3600 * 24);
    if (daysSinceFirstSip < CONFIG.MINIMUM_MEMBERSHIP_DAYS) { 
        const daysLeft = Math.ceil(CONFIG.MINIMUM_MEMBERSHIP_DAYS - daysSinceFirstSip); 
        return { eligible: false, reason: `${daysLeft} days left` }; 
    }

    // New Rules: Multiplier based on SIP Amount
    let multiplier = CONFIG.MULTIPLIER_BELOW_SLAB;
    if (totalSipAmount >= CONFIG.SIP_SLAB_THRESHOLD) {
        multiplier = CONFIG.MULTIPLIER_ABOVE_SLAB;
    }

    let maxLoanAmount = totalSipAmount * multiplier;
    
    // Hard Cap of 50,000
    if (maxLoanAmount > CONFIG.MAX_LOAN_LIMIT_AMOUNT) {
        maxLoanAmount = CONFIG.MAX_LOAN_LIMIT_AMOUNT;
    }

    return { eligible: true, maxAmount: maxLoanAmount };
}

// ------------------------------------------------------------------
// --- SUPPORTING FUNCTIONS (UNCHANGED LOGIC) ---
// ------------------------------------------------------------------

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
        const scoreObject = calculatePerformanceScore(name, loanDate, allData, activeLoansData); 
        if (scoreObject.totalScore > 0) { snapshotScores[name] = scoreObject; totalScoreInSnapshot += scoreObject.totalScore; } 
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
