// --- CONFIGURATION CONSTANTS ---
const CONFIG = {
    CAPITAL_WEIGHT: 0.40, CONSISTENCY_WEIGHT: 0.30, CREDIT_BEHAVIOR_WEIGHT: 0.30,
    CAPITAL_SCORE_TARGET_SIP: 50000,
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
// Note: added 'update' to imports for password change functionality
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signInAnonymously } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-auth.js";
import { getDatabase, ref, get, update } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-database.js";

// --- GLOBAL VARIABLES & STATE ---
let db, auth;
let allData = [], memberDataMap = new Map(), activeLoansData = {};
let currentMemberData = {}, scoreResultCache = null, balanceHistory = [];

// --- INSTANT LOAD (STEP 1 - UNIQUE CACHE) ---
function initInstantLoad() {
    try {
        const urlParams = new URLSearchParams(window.location.search);
        const memberId = urlParams.get('memberId');
        
        if (memberId) {
            const cacheKey = `tcf_royal_view_cache_${memberId}`; // UNIQUE KEY
            const cachedRaw = localStorage.getItem(cacheKey);
            
            if (cachedRaw) {
                const data = JSON.parse(cachedRaw);
                console.log(`⚡ Instant Load from Cache for ${memberId}...`);
                processAndRender(data.members, data.transactions, data.activeLoans);
            }
        }
    } catch(e) {
        console.warn("Cache load failed:", e);
    }
}
// Run immediately
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
                fetchFreshData(); // Get fresh data from network
            } else {
                console.log("No user found, signing in anonymously...");
                signInAnonymously(auth).catch(error => {
                    console.error("Anonymous auth failed:", error);
                    window.location.href = `/login.html?redirect=${encodeURIComponent(window.location.href)}`;
                });
            }
        });
    } catch (error) {
        const content = document.getElementById('profile-content');
        if (content.classList.contains('hidden')) {
            showError(error.message);
        }
    }
}

// --- DATA FETCHING (NETWORK) ---
async function fetchFreshData() {
    setupEventListeners();
    
    try {
        console.log("🌐 Fetching fresh data...");
        const membersRef = ref(db, 'members');
        const transactionsRef = ref(db, 'transactions');
        const activeLoansRef = ref(db, 'activeLoans');
        
        const [membersSnapshot, transactionsSnapshot, activeLoansSnapshot] = await Promise.all([
            get(membersRef), 
            get(transactionsRef),
            get(activeLoansRef)
        ]);

        if (!membersSnapshot.exists() || !transactionsSnapshot.exists()) {
            throw new Error('Data not found in Firebase.');
        }

        const members = membersSnapshot.val();
        const transactions = transactionsSnapshot.val();
        const activeLoans = activeLoansSnapshot.exists() ? activeLoansSnapshot.val() : {};

        // Fix: Save to Unique Cache Key
        const urlParams = new URLSearchParams(window.location.search);
        const memberId = urlParams.get('memberId');
        if (memberId) {
            const cacheKey = `tcf_royal_view_cache_${memberId}`; // UNIQUE KEY
            localStorage.setItem(cacheKey, JSON.stringify({
                members, transactions, activeLoans
            }));
        }

        // Render with fresh data
        processAndRender(members, transactions, activeLoans);

    } catch (error) {
        console.error("Network fetch failed:", error);
        if (document.getElementById('profile-content').classList.contains('hidden')) {
            showError(error.message);
        }
    }
}

// --- MAIN LOGIC: PROCESS & RENDER ---
function processAndRender(members, transactions, activeLoans) {
    allData = []; memberDataMap.clear(); activeLoansData = {}; balanceHistory = [];

    const urlParams = new URLSearchParams(window.location.search);
    const memberId = urlParams.get('memberId');
    if (!memberId) { showError("No member ID provided in URL."); return; }

    try {
        activeLoansData = activeLoans || {};
        
        currentMemberData = members[memberId];
        if (!currentMemberData) {
            throw new Error(`Member ID not found.`);
        }
        currentMemberData.membershipId = memberId;

        // Map all members for lookup
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
                loan: 0,
                payment: 0,
                sipPayment: 0,
                returnAmount: 0,
                extraBalance: 0, 
                extraWithdraw: 0,
                loanType: null, 
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
            processedTransactions.push(record);
        }

        allData = processedTransactions.sort((a, b) => a.date - b.date || a.id - b.id);
        
        // Update UI
        populateProfileData();

        // Hide Loader
        const loader = document.getElementById('loader-container');
        if(loader) loader.classList.add('fade-out'); // Smooth fade

    } catch (error) {
        console.error("Render error:", error);
        showError(error.message);
    }
}


// --- UI POPULATION ---
function populateProfileData() {
    const balanceResult = calculateTotalExtraBalance(currentMemberData.membershipId, currentMemberData.fullName);
    balanceHistory = balanceResult.history;
    const lifetimeProfit = calculateTotalProfitForMember(currentMemberData.fullName, allData, activeLoansData);
    
    const memberTransactions = allData.filter(tx => tx.memberId === currentMemberData.membershipId);
    const totalSip = memberTransactions.reduce((s, tx) => s + tx.sipPayment, 0);
    currentMemberData.extraBalance = balanceResult.total;

    const data = currentMemberData;
    const formatDate = (ds) => ds ? new Date(ds).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : "N/A";
    
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
    
    const withdrawBtn = document.getElementById('withdraw-btn');
    withdrawBtn.disabled = balanceResult.total < 10;
    
    document.getElementById('doc-profile-pic').src = data.profilePicUrl || DEFAULT_PROFILE_PIC;
    document.getElementById('doc-document').src = data.documentUrl || DEFAULT_PROFILE_PIC;
    document.getElementById('doc-signature').src = data.signatureUrl || DEFAULT_PROFILE_PIC;
    
    scoreResultCache = calculatePerformanceScore(data.fullName, new Date(), allData, activeLoansData);
    const eligibilityResult = getLoanEligibility(data.fullName, scoreResultCache.totalScore, allData);
    document.getElementById('performance-score').textContent = scoreResultCache.totalScore.toFixed(2);
    document.getElementById('loan-eligibility').textContent = eligibilityResult.eligible ? `${eligibilityResult.multiplier.toFixed(2)}x Limit` : eligibilityResult.reason;
    
    populateLoanHistory(data.fullName);
    
    // Final visibility check
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
    // Prevent duplicate listeners
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

    // Setup Password Change Listeners
    setupPasswordListeners();
}

function setupPasswordListeners() {
    const passwordModal = document.getElementById('passwordModal');
    const openBtn = document.getElementById('change-password-btn');
    const closeBtn = document.getElementById('close-password-modal');
    const submitBtn = document.getElementById('submit-password-change');
    
    // Open Modal
    openBtn.addEventListener('click', () => {
        // Reset fields
        document.getElementById('current-password').value = '';
        document.getElementById('new-password').value = '';
        document.getElementById('confirm-password').value = '';
        document.getElementById('password-error').classList.add('hidden');
        document.getElementById('password-success').classList.add('hidden');
        
        passwordModal.classList.remove('hidden');
        passwordModal.classList.add('flex');
    });

    // Close Modal
    closeBtn.addEventListener('click', () => {
        passwordModal.classList.add('hidden');
        passwordModal.classList.remove('flex');
    });

    // Submit Logic
    submitBtn.addEventListener('click', async () => {
        const currentPass = document.getElementById('current-password').value.trim();
        const newPass = document.getElementById('new-password').value.trim();
        const confirmPass = document.getElementById('confirm-password').value.trim();
        const errorEl = document.getElementById('password-error');
        const successEl = document.getElementById('password-success');

        errorEl.classList.add('hidden');
        successEl.classList.add('hidden');

        // 1. Validation: Empty fields
        if (!currentPass || !newPass || !confirmPass) {
            errorEl.innerHTML = '<i class="fas fa-times-circle"></i> All fields are required.';
            errorEl.classList.remove('hidden');
            return;
        }

        // 2. Validation: Check Current Password (from loaded data)
        // Using string comparison because password is stored as string in DB
        if (currentPass !== String(currentMemberData.password)) {
            errorEl.innerHTML = '<i class="fas fa-times-circle"></i> Incorrect current password.';
            errorEl.classList.remove('hidden');
            return;
        }

        // 3. Validation: Numeric Only (User Requirement)
        if (!/^\d+$/.test(newPass)) {
            errorEl.innerHTML = '<i class="fas fa-times-circle"></i> Password must contain numbers only.';
            errorEl.classList.remove('hidden');
            return;
        }

        // 4. Validation: Match New & Confirm
        if (newPass !== confirmPass) {
            errorEl.innerHTML = '<i class="fas fa-times-circle"></i> New passwords do not match.';
            errorEl.classList.remove('hidden');
            return;
        }

        // 5. Update Firebase
        try {
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Updating...';

            const memberRef = ref(db, 'members/' + currentMemberData.membershipId);
            await update(memberRef, {
                password: newPass
            });

            // Update local data immediately to reflect change without reload
            currentMemberData.password = newPass;

            successEl.classList.remove('hidden');
            
            // Close modal after 1.5 seconds
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

// --- UPDATED HISTORY FUNCTION ---
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
    // Setup Card Data
    const cardProfilePic = document.getElementById('card-profile-pic');
    const cardSignature = document.getElementById('card-signature');
    
    // Wait for images
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

function calculatePerformanceScore(memberName, untilDate, allData, activeLoansData) {
    const memberData = allData.filter(r => r.name === memberName && r.date <= untilDate);
    if (memberData.length === 0) return { totalScore: 0, capitalScore: 0, consistencyScore: 0, creditScore: 0, isNewMemberRuleApplied: false, originalCapitalScore: 0, originalConsistencyScore: 0, originalCreditScore: 0 };
    const firstTransactionDate = memberData[0]?.date;
    const membershipDays = firstTransactionDate ? (untilDate - firstTransactionDate) / (1000 * 3600 * 24) : 0;
    const isNewMemberRuleApplied = membershipDays < CONFIG.NEW_MEMBER_PROBATION_DAYS;
    let capitalScore = calculateCapitalScore(memberName, untilDate, allData);
    let consistencyScore = calculateConsistencyScore(memberData, untilDate);
    let creditScore = calculateCreditBehaviorScore(memberName, untilDate, allData, activeLoansData); 
    const originalCapitalScore = capitalScore;
    const originalConsistencyScore = consistencyScore;
    const originalCreditScore = creditScore;
    if (isNewMemberRuleApplied) { capitalScore *= 0.50; consistencyScore *= 0.50; creditScore *= 0.50; }
    const totalScore = (capitalScore * CONFIG.CAPITAL_WEIGHT) + (consistencyScore * CONFIG.CONSISTENCY_WEIGHT) + (creditScore * CONFIG.CREDIT_BEHAVIOR_WEIGHT);
    return { totalScore, capitalScore, consistencyScore, creditScore, isNewMemberRuleApplied, originalCapitalScore, originalConsistencyScore, originalCreditScore };
}

function calculateCapitalScore(memberName, untilDate, allData) {
    // 18 Mahine (approx 540 days) ka limit
    const daysToReview = 540;
    const startDate = new Date(untilDate.getTime() - daysToReview * 24 * 3600 * 1000);
    
    // Member ka data nikalo
    const memberData = allData.filter(r => r.name === memberName && r.date <= untilDate);
    
    // Sabhi SIPs nikal kar pehli SIP ko hata do (slice(1) se), aur sirf pichle 18 mahine ka data rakho
    const allSips = memberData.filter(r => r.sipPayment > 0);
    const validSips = allSips.slice(1).filter(r => r.date >= startDate);
    
    // Bachi hui SIPs ka total karo
    const totalSipAmount = validSips.reduce((sum, tx) => sum + tx.sipPayment, 0);
    
    // Score calculate karo
    const normalizedScore = (totalSipAmount / CONFIG.CAPITAL_SCORE_TARGET_SIP) * 100;
    return Math.min(100, Math.max(0, normalizedScore));
}


function calculateConsistencyScore(memberData, untilDate) {
    const allSipData = memberData.filter(r => r.sipPayment > 0);
    // Agar member ne sirf 1 hi SIP diya hai, to consistency 0 (kyunki first SIP skip karna hai)
    if (allSipData.length <= 1) return 0;

    // Pehle SIP ko skip karo
    const validSips = allSipData.slice(1);

    // Aaj se thik 18 mahine pichhe ki date nikalo
    const eighteenMonthsAgo = new Date(untilDate); 
    eighteenMonthsAgo.setMonth(untilDate.getMonth() - 18);
    
    // Sirf 18 mahine ke andar wali SIPs filter karo
    const recentValidSips = validSips.filter(r => r.date >= eighteenMonthsAgo); 
    if (recentValidSips.length === 0) return 0;

    const sipHistory = {};
    recentValidSips.forEach(r => { 
        const monthKey = `${r.date.getFullYear()}-${r.date.getMonth()}`; 
        if (!sipHistory[monthKey]) { 
            sipHistory[monthKey] = r.date.getDate() <= CONFIG.SIP_ON_TIME_LIMIT ? 10 : 5; 
        } 
    });
    
    if (Object.keys(sipHistory).length === 0) return 0;
    
    const consistencyPoints = Object.values(sipHistory).reduce((a, b) => a + b, 0);
    const monthsConsidered = Math.max(1, Object.keys(sipHistory).length);
    
    return (consistencyPoints / (monthsConsidered * 10)) * 100;
}



function calculateCreditBehaviorScore(memberName, untilDate, allData, activeLoansData = {}) {
    const memberData = allData.filter(r => r.name === memberName && r.date <= untilDate);
    
    // 1 saal ki jagah ab 18 mahine ka calculation
    const eighteenMonthsAgo = new Date(untilDate); 
    eighteenMonthsAgo.setMonth(untilDate.getMonth() - 18);
    
    const memberActiveLoans = Object.values(activeLoansData).filter(loan => loan.memberName === memberName);
    
    // Pichle 18 mahine mein liye gaye loans
    const recentLoans = memberData.filter(r => r.loan > 0 && r.date >= eighteenMonthsAgo && r.loanType === 'Loan'); 
    
    if (recentLoans.length === 0) {
        const firstTransactionDate = memberData[0]?.date;
        if (!firstTransactionDate) return 40;
        const membershipDays = (untilDate - firstTransactionDate) / (1000 * 3600 * 24);
        if (membershipDays < CONFIG.MINIMUM_MEMBERSHIP_FOR_CREDIT_SCORE) return 40; 
        
        const sipData = memberData.filter(r => r.sipPayment > 0);
        if (sipData.length < 2) return 60;
        
        // First SIP ko ignore karne ke liye slice(1)
        const avgSipDay = sipData.slice(1).reduce((sum, r) => sum + r.date.getDate(), 0) / (sipData.length - 1);
        return Math.min(100, Math.max(0, (15 - avgSipDay) * 5 + 40));
    }
    
    let totalPoints = 0; let loansProcessed = 0;
    for (const loanRecord of recentLoans) {
        loansProcessed++;
        const loanDetails = memberActiveLoans.find(l => new Date(l.loanDate).getTime() === loanRecord.date.getTime() && l.originalAmount === loanRecord.loan);
        if (loanDetails && loanDetails.loanType === 'Business Loan') {
            const loanStartDate = new Date(loanDetails.loanDate);
            const monthsPassed = (untilDate.getFullYear() - loanStartDate.getFullYear()) * 12 + (untilDate.getMonth() - loanStartDate.getMonth());
            for (let i = 1; i <= monthsPassed; i++) {
                const checkMonth = new Date(loanStartDate); checkMonth.setMonth(checkMonth.getMonth() + i);
                const hasPaidInterest = memberData.some(tx => tx.returnAmount > 0 && new Date(tx.date).getFullYear() === checkMonth.getFullYear() && new Date(tx.date).getMonth() === checkMonth.getMonth());
                if (hasPaidInterest) totalPoints += 5; else totalPoints -= 10;
            }
            if ((untilDate - loanStartDate) / (1000 * 3600 * 24) > CONFIG.BUSINESS_LOAN_TERM_DAYS && loanDetails.status === 'Active') totalPoints -= 50;
        } else if (loanDetails && loanDetails.loanType === '10 Days Credit') {
            if (loanDetails.status === 'Paid') {
                const payments = memberData.filter(r => r.date > loanRecord.date && r.payment > 0);
                let repaidDate = null; let amountRepaid = 0;
                for (const p of payments) { amountRepaid += p.payment; if (amountRepaid >= loanRecord.loan) { repaidDate = p.date; break; } }
                const daysToRepay = repaidDate ? (repaidDate - loanRecord.date) / (1000 * 3600 * 24) : Infinity;
                if (daysToRepay <= CONFIG.TEN_DAY_CREDIT_GRACE_DAYS) totalPoints += 15; else totalPoints -= 20;
            } else totalPoints -= 30;
        } else {
            let amountRepaid = 0; let repaymentDate = null;
            const paymentsAfterLoan = memberData.filter(r => r.date > loanRecord.date && (r.payment > 0 || r.sipPayment > 0)); 
            for (const p of paymentsAfterLoan) { amountRepaid += p.payment + p.sipPayment; if (amountRepaid >= loanRecord.loan) { repaymentDate = p.date; break; } }
            if (repaymentDate) {
                const daysToRepay = (repaymentDate - loanRecord.date) / (1000 * 3600 * 24);
                if (daysToRepay <= CONFIG.LOAN_TERM_BEST) totalPoints += 25; else if (daysToRepay <= CONFIG.LOAN_TERM_BETTER) totalPoints += 20; else if (daysToRepay <= CONFIG.LOAN_TERM_GOOD) totalPoints += 15; else totalPoints -= 20;
            } else totalPoints -= 40;
        }
    }
    if (loansProcessed === 0) return 40;
    return Math.max(0, Math.min(100, (totalPoints / (loansProcessed * 25)) * 100));
}


function getLoanEligibility(memberName, score, allData) {
    const memberData = allData.filter(r => r.name === memberName);
    let totalCapital = memberData.reduce((sum, r) => sum + r.sipPayment + r.payment - r.loan, 0);
    if (totalCapital < 0) return { eligible: false, reason: 'Outstanding Loan' };
    const firstSip = memberData.find(r => r.sipPayment > 0);
    if (!firstSip) return { eligible: false, reason: 'No SIP yet' };
    const daysSinceFirstSip = (new Date() - firstSip.date) / (1000 * 3600 * 24);
    if (daysSinceFirstSip < CONFIG.MINIMUM_MEMBERSHIP_DAYS) { const daysLeft = Math.ceil(CONFIG.MINIMUM_MEMBERSHIP_DAYS - daysSinceFirstSip); return { eligible: false, reason: `${daysLeft} days left` }; }
    const { LOAN_LIMIT_TIER1_SCORE, LOAN_LIMIT_TIER2_SCORE, LOAN_LIMIT_TIER3_SCORE, LOAN_LIMIT_TIER1_MAX, LOAN_LIMIT_TIER2_MAX, LOAN_LIMIT_TIER3_MAX, LOAN_LIMIT_TIER4_MAX } = CONFIG;
    let multiplier = LOAN_LIMIT_TIER1_MAX;
    if (score < LOAN_LIMIT_TIER1_SCORE) multiplier = LOAN_LIMIT_TIER1_MAX;
    else if (score < LOAN_LIMIT_TIER2_SCORE) multiplier = LOAN_LIMIT_TIER1_MAX + ((score - LOAN_LIMIT_TIER1_SCORE) / (LOAN_LIMIT_TIER2_SCORE - LOAN_LIMIT_TIER1_SCORE)) * (LOAN_LIMIT_TIER2_MAX - LOAN_LIMIT_TIER1_MAX);
    else if (score < LOAN_LIMIT_TIER3_SCORE) multiplier = LOAN_LIMIT_TIER2_MAX + ((score - LOAN_LIMIT_TIER2_SCORE) / (LOAN_LIMIT_TIER3_SCORE - LOAN_LIMIT_TIER2_SCORE)) * (LOAN_LIMIT_TIER3_MAX - LOAN_LIMIT_TIER2_MAX);
    else multiplier = LOAN_LIMIT_TIER3_MAX + ((score - LOAN_LIMIT_TIER3_SCORE) / (100 - LOAN_LIMIT_TIER3_SCORE)) * (LOAN_LIMIT_TIER4_MAX - LOAN_LIMIT_TIER3_MAX); 
    return { eligible: true, multiplier: Math.max(LOAN_LIMIT_TIER1_MAX, multiplier) };
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

