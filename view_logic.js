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
    // UPDATED: Fill Email Address
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
    
    // UPDATED: Fill Documents including Aadhaar Back
    document.getElementById('doc-profile-pic').src = data.profilePicUrl || DEFAULT_PROFILE_PIC;
    document.getElementById('doc-document').src = data.documentUrl || DEFAULT_PROFILE_PIC; // Front
    document.getElementById('doc-document-back').src = data.documentBackUrl || DEFAULT_PROFILE_PIC; // Back
    document.getElementById('doc-signature').src = data.signatureUrl || DEFAULT_PROFILE_PIC;
    
    // --- SCORE & ELIGIBILITY ---
    if (typeof calculatePerformanceScore === 'function') {
        scoreResultCache = calculatePerformanceScore(data.fullName, new Date(), allData, activeLoansData);
        
        document.getElementById('performance-score').textContent = scoreResultCache.totalScore.toFixed(2);
        
        // Calculate Loan Eligibility
        if (typeof getLoanEligibility === 'function') {
            const eligibilityResult = getLoanEligibility(data.fullName, totalSip, allData);
            document.getElementById('loan-eligibility').textContent = eligibilityResult.eligible ? 
                `₹${eligibilityResult.maxAmount.toLocaleString('en-IN')} Limit` : 
                eligibilityResult.reason;
        }
    } else {
        console.error("Score Engine not loaded! Make sure score_engine.js is included.");
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


// --- EVENT LISTENERS & MODALS ---
function setupEventListeners() {
    if(document.body.getAttribute('data-listeners-added')) return;
    document.body.setAttribute('data-listeners-added', 'true');

    const imageViewerModal = document.getElementById('imageViewerModal');
    document.querySelectorAll('.document-thumbnail img').forEach(img => img.addEventListener('click', () => {
        document.getElementById('fullImageView').src = img.src;
        imageViewerModal.classList.remove('hidden');
        imageViewerModal.classList.add('flex');
    }));
    document.getElementById('closeImageViewer').addEventListener('click', () => {
        imageViewerModal.classList.add('hidden');
        imageViewerModal.classList.remove('flex');
    });
    
    const withdrawalModal = document.getElementById('withdrawalModal');
    document.getElementById('withdraw-btn').addEventListener('click', () => {
        document.getElementById('modal-available-balance').textContent = `₹${currentMemberData.extraBalance.toLocaleString('en-IN', {minimumFractionDigits: 0, maximumFractionDigits: 2})}`;
        withdrawalModal.classList.remove('hidden');
        withdrawalModal.classList.add('flex');
    });
    document.getElementById('close-withdrawal-modal').addEventListener('click', () => {
        withdrawalModal.classList.add('hidden');
        withdrawalModal.classList.remove('flex');
    });
    document.getElementById('submit-withdrawal').addEventListener('click', submitWithdrawal);

    const historyModal = document.getElementById('historyModal');
    document.getElementById('view-history-btn').addEventListener('click', () => {
        populateHistoryModal();
        historyModal.classList.remove('hidden');
        historyModal.classList.add('flex');
    });
    document.getElementById('close-history-modal').addEventListener('click', () => {
        historyModal.classList.add('hidden');
        historyModal.classList.remove('flex');
    });

    const scoreModal = document.getElementById('scoreBreakdownModal');
    document.getElementById('score-info-btn').addEventListener('click', () => {
        populateScoreBreakdownModal();
        scoreModal.classList.remove('hidden');
        scoreModal.classList.add('flex');
    });
    document.getElementById('close-score-modal').addEventListener('click', () => {
        scoreModal.classList.add('hidden');
        scoreModal.classList.remove('flex');
    });

    const cardModal = document.getElementById('cardResultModal');
    document.getElementById('close-card-modal').addEventListener('click', () => {
            cardModal.classList.add('hidden');
            cardModal.classList.remove('flex');
    });
    document.getElementById('download-card-btn').addEventListener('click', downloadCard);
    document.getElementById('share-card-btn').addEventListener('click', shareCard);

    setupPasswordListeners();
    setupEmailListeners(); // NEW: Setup Email Edit Listeners
}

function setupPasswordListeners() {
    const passwordModal = document.getElementById('passwordModal');
    const openBtn = document.getElementById('change-password-btn');
    const closeBtn = document.getElementById('close-password-modal');
    const submitBtn = document.getElementById('submit-password-change');
    
    openBtn.addEventListener('click', () => {
        document.getElementById('current-password').value = '';
        document.getElementById('new-password').value = '';
        document.getElementById('confirm-password').value = '';
        document.getElementById('password-error').classList.add('hidden');
        document.getElementById('password-success').classList.add('hidden');
        passwordModal.classList.remove('hidden');
        passwordModal.classList.add('flex');
    });

    closeBtn.addEventListener('click', () => {
        passwordModal.classList.add('hidden');
        passwordModal.classList.remove('flex');
    });

    submitBtn.addEventListener('click', async () => {
        const currentPass = document.getElementById('current-password').value.trim();
        const newPass = document.getElementById('new-password').value.trim();
        const confirmPass = document.getElementById('confirm-password').value.trim();
        const errorEl = document.getElementById('password-error');
        const successEl = document.getElementById('password-success');

        errorEl.classList.add('hidden');
        successEl.classList.add('hidden');

        if (!currentPass || !newPass || !confirmPass) {
            errorEl.innerHTML = '<i class="fas fa-times-circle"></i> All fields are required.';
            errorEl.classList.remove('hidden');
            return;
        }
        if (currentPass !== String(currentMemberData.password)) {
            errorEl.innerHTML = '<i class="fas fa-times-circle"></i> Incorrect current password.';
            errorEl.classList.remove('hidden');
            return;
        }
        if (!/^\d+$/.test(newPass)) {
            errorEl.innerHTML = '<i class="fas fa-times-circle"></i> Password must contain numbers only.';
            errorEl.classList.remove('hidden');
            return;
        }
        if (newPass !== confirmPass) {
            errorEl.innerHTML = '<i class="fas fa-times-circle"></i> New passwords do not match.';
            errorEl.classList.remove('hidden');
            return;
        }

        try {
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Updating...';
            const memberRef = ref(db, 'members/' + currentMemberData.membershipId);
            await update(memberRef, { password: newPass });
            currentMemberData.password = newPass;
            successEl.classList.remove('hidden');
            setTimeout(() => {
                passwordModal.classList.add('hidden');
                passwordModal.classList.remove('flex');
                submitBtn.disabled = false;
                submitBtn.textContent = 'Update';
            }, 1500);
        } catch (error) {
            console.error("Password update failed:", error);
            errorEl.innerHTML = `<i class="fas fa-times-circle"></i> Update failed: ${error.message}`;
            errorEl.classList.remove('hidden');
            submitBtn.disabled = false;
            submitBtn.textContent = 'Update';
        }
    });
}

// --- NEW FUNCTION: Setup Email Edit Listeners ---
function setupEmailListeners() {
    const emailModal = document.getElementById('emailModal');
    const openBtn = document.getElementById('edit-email-btn');
    const closeBtn = document.getElementById('close-email-modal');
    const submitBtn = document.getElementById('submit-email-change');
    
    openBtn.addEventListener('click', () => {
        document.getElementById('new-email-input').value = currentMemberData.email || '';
        document.getElementById('email-error').classList.add('hidden');
        document.getElementById('email-success').classList.add('hidden');
        emailModal.classList.remove('hidden');
        emailModal.classList.add('flex');
    });

    closeBtn.addEventListener('click', () => {
        emailModal.classList.add('hidden');
        emailModal.classList.remove('flex');
    });

    submitBtn.addEventListener('click', async () => {
        const newEmail = document.getElementById('new-email-input').value.trim();
        const errorEl = document.getElementById('email-error');
        const successEl = document.getElementById('email-success');

        errorEl.classList.add('hidden');
        successEl.classList.add('hidden');

        // Simple Email Validation Regex
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!newEmail || !emailRegex.test(newEmail)) {
            errorEl.innerHTML = '<i class="fas fa-times-circle"></i> Please enter a valid email address.';
            errorEl.classList.remove('hidden');
            return;
        }

        try {
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Updating...';
            
            // Firebase Update Call
            const memberRef = ref(db, 'members/' + currentMemberData.membershipId);
            await update(memberRef, { email: newEmail });
            
            // Update Local Data & UI immediately
            currentMemberData.email = newEmail;
            document.getElementById('email-address').textContent = newEmail;
            
            successEl.classList.remove('hidden');
            setTimeout(() => {
                emailModal.classList.add('hidden');
                emailModal.classList.remove('flex');
                submitBtn.disabled = false;
                submitBtn.textContent = 'Update';
            }, 1500);
            
        } catch (error) {
            console.error("Email update failed:", error);
            errorEl.innerHTML = `<i class="fas fa-times-circle"></i> Update failed: ${error.message}`;
            errorEl.classList.remove('hidden');
            submitBtn.disabled = false;
            submitBtn.textContent = 'Update';
        }
    });
}

function populateHistoryModal() {
    const historyList = document.getElementById('history-list');
    historyList.innerHTML = '';
    if (balanceHistory.length === 0) {
        historyList.innerHTML = '<p class="text-center text-gray-400 italic py-4">No transactions yet.</p>';
        return;
    }
    [...balanceHistory].reverse().forEach(item => {
        const div = document.createElement('div');
        const isCredit = item.amount > 0;
        let title = '', icon = '', subText = '';
        
        switch(item.type) {
            case 'profit': 
                title = 'Profit Share'; 
                subText = `From: ${item.from}`;
                icon="fa-chart-line"; 
                break;
            case 'manual_credit': title = 'Admin Bonus'; icon="fa-gift"; break;
            case 'withdrawal': title = 'Withdrawal'; icon="fa-arrow-circle-up"; break;
            case 'Self Return (10%)': title = 'Self Interest (10%)'; icon="fa-undo"; break;
            case 'Guarantor Commission (10%)': 
                title = `Guarantor Comm.`; 
                subText = `Source: ${item.from}`;
                icon="fa-handshake"; 
                break;
            default: title = `Transaction`; icon="fa-coins";
        }
        
        div.className = 'flex justify-between items-center p-3 border-b border-gray-100 last:border-0 hover:bg-gray-50 transition-colors';
        div.innerHTML = `
            <div class="flex items-center gap-3">
                <div class="w-8 h-8 rounded-full ${isCredit ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600'} flex items-center justify-center text-xs">
                    <i class="fas ${icon}"></i>
                </div>
                <div>
                    <p class="font-semibold text-gray-800 text-sm">${title}</p>
                    ${subText ? `<p class="text-[10px] text-gray-500 font-medium truncate w-24 sm:w-auto">${subText}</p>` : ''}
                    <p class="text-[10px] text-gray-400">${item.date.toLocaleDateString('en-GB')}</p>
                </div>
            </div>
            <span class="font-bold text-sm ${isCredit ? 'text-green-600' : 'text-red-600'}">${isCredit ? '+' : ''} ₹${Math.abs(item.amount).toLocaleString('en-IN', {minimumFractionDigits: 0, maximumFractionDigits: 2})}</span>`;
        historyList.appendChild(div);
    });
}

function populateScoreBreakdownModal() {
    const contentDiv = document.getElementById('score-breakdown-content');
    if (!scoreResultCache) { contentDiv.innerHTML = "Score not calculated yet."; return; }
    const { totalScore, capitalScore, consistencyScore, creditScore, isNewMemberRuleApplied, originalCapitalScore, originalConsistencyScore, originalCreditScore } = scoreResultCache;

    const row = (label, val, base) => `
        <div class="flex justify-between items-center py-2 border-b border-gray-200 last:border-0">
            <span class="text-sm text-gray-600">${label}</span>
            <div class="text-right">
                <span class="font-bold text-royal-blue">${val.toFixed(0)}</span>
                ${isNewMemberRuleApplied ? `<p class="text-[9px] text-red-400 line-through">${base.toFixed(0)}</p>` : ''}
            </div>
        </div>`;

    let html = '';
    html += row("Capital Score", capitalScore, originalCapitalScore);
    html += row("Consistency", consistencyScore, originalConsistencyScore);
    html += row("Credit Behavior", creditScore, originalCreditScore);
    
    if(isNewMemberRuleApplied) {
        html += `<p class="text-xs text-red-500 mt-2 bg-red-50 p-2 rounded border border-red-100 text-center"><i class="fas fa-info-circle"></i> New Member Rule: 50% score reduction for first 6 months.</p>`;
    }
    
    html += `<div class="mt-3 pt-3 border-t-2 border-gray-100 flex justify-between items-center">
        <span class="font-bold text-royal-dark">Total Score</span>
        <span class="font-extrabold text-2xl text-royal-gold">${totalScore.toFixed(2)}</span>
    </div>`;
    contentDiv.innerHTML = html;
}

function submitWithdrawal() {
    const amountInput = document.getElementById('withdrawal-amount');
    const errorMsg = document.getElementById('withdrawal-error');
    const amount = parseFloat(amountInput.value);
    if (isNaN(amount) || amount < 10) {
        errorMsg.classList.remove('hidden'); return;
    }
    if (amount > currentMemberData.extraBalance) {
        errorMsg.textContent = "Insufficient Balance";
        errorMsg.classList.remove('hidden'); return;
    }
    errorMsg.classList.add('hidden');
    document.getElementById('withdrawalModal').classList.add('hidden');
    document.getElementById('withdrawalModal').classList.remove('flex');
    showWithdrawalCard(amount);
}

function showError(message) {
    const loaderContainer = document.getElementById('loader-container');
    const errorMessageEl = document.getElementById('error-message');
    if(loaderContainer) loaderContainer.classList.add('fade-out');
    errorMessageEl.querySelector('p').textContent = message;
    errorMessageEl.classList.remove('hidden');
}

// --- CARD GENERATION ---
async function showWithdrawalCard(amount) {
    const cardProfilePic = document.getElementById('card-profile-pic');
    const cardSignature = document.getElementById('card-signature');
    
    cardProfilePic.src = await toDataURL(currentMemberData.profilePicUrl || DEFAULT_PROFILE_PIC);
    cardSignature.src = await toDataURL(currentMemberData.signatureUrl || '');
    
    document.getElementById('card-name').textContent = currentMemberData.fullName;
    document.getElementById('card-amount').textContent = `₹${amount.toLocaleString('en-IN')}`;
    document.getElementById('card-date').textContent = new Date().toLocaleDateString('en-GB');
    document.getElementById('rand-tx-id').textContent = Math.floor(100000 + Math.random() * 900000);
    
    document.getElementById('share-card-btn').classList.toggle('hidden', !navigator.share);
    
    const cardModal = document.getElementById('cardResultModal');
    cardModal.classList.remove('hidden');
    cardModal.classList.add('flex');
}

// --- Helper Functions ---
function toDataURL(url) { return new Promise((resolve) => { if(!url || url.startsWith('data:')) { resolve(url); return; } const proxyUrl = 'https://cors-anywhere.herokuapp.com/'; const targetUrl = url.includes('firebasestorage') ? proxyUrl + url : url; fetch(targetUrl).then(response => response.blob()).then(blob => { const reader = new FileReader(); reader.onloadend = () => resolve(reader.result); reader.onerror = () => resolve(url); reader.readAsDataURL(blob); }).catch(() => resolve(url)); }); }
async function getCardAsBlob() { const cardElement = document.getElementById('withdrawalCard'); const canvas = await html2canvas(cardElement, { scale: 3, backgroundColor: null, useCORS: true }); return new Promise(resolve => canvas.toBlob(resolve, 'image/png')); }
async function downloadCard() { const blob = await getCardAsBlob(); const link = document.createElement('a'); link.download = `withdrawal-${currentMemberData.fullName.replace(/\s+/g, '-')}.png`; link.href = URL.createObjectURL(blob); link.click(); URL.revokeObjectURL(link.href); }
async function shareCard() { const blob = await getCardAsBlob(); const file = new File([blob], `withdrawal.png`, { type: 'image/png' }); if (navigator.canShare && navigator.canShare({ files: [file] })) { try { await navigator.share({ files: [file], title: 'Withdrawal Receipt', text: `Withdrawal receipt for ${currentMemberData.fullName}.`}); } catch (error) { console.error('Share failed:', error); alert('Could not share the image.'); } } else { alert("Sharing is not supported."); } }

// --- PROFIT CALCULATION (UNCHANGED) ---
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
    
    // Note: calculatePerformanceScore used here will be from new file
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
