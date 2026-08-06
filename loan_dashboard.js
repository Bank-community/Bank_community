// loan_dashboard.js - FINAL UPDATED VERSION
// FIXES: Filters Working, Text Shift on Download Solved, Compact Button Support

const CACHE_KEY = 'tcf_loan_dashboard_cache_v11'; 
const PRELOAD_CONFIG_URL = '/api/firebase-config'; 

const state = {
    activeLoans: [],
    members: {},
    currentFilter: 'all', // 'all', 'personal', 'recharge'
    els: {} // Will be populated after DOM Load
};

// --- INITIALIZATION ---
document.addEventListener("DOMContentLoaded", async () => {
    // 1. Initialize Elements Cache
    state.els = {
        container: document.getElementById('outstanding-loans-container'),
        loader: document.getElementById('loader'),
        count: document.getElementById('count-val'),
        amt: document.getElementById('amount-val'),
        search: document.getElementById('search-input'),

        // Filters
        btnAll: document.getElementById('filter-all'),
        btnPersonal: document.getElementById('filter-personal'),
        btnRecharge: document.getElementById('filter-recharge'),

        // Admin Modal Els
        modal: document.getElementById('gen-modal'),
        mSelect: document.getElementById('m-select'),
        tSelect: document.getElementById('t-select'),
        amtInput: document.getElementById('amt-input'),
        provSelect: document.getElementById('prov-select'),
        provGroup: document.getElementById('prov-group'),
        btnCreate: document.getElementById('btn-create'),
        genResult: document.getElementById('gen-result')
    };

    try {
        setupFilters(); // Setup Click Listeners
        setupAdminModal(); // Setup Generator Logic
        loadFromCache();

        const res = await fetch(PRELOAD_CONFIG_URL);
        if(res.ok) {
            const config = await res.json();
            if (!firebase.apps.length) firebase.initializeApp(config);
        }

        firebase.auth().onAuthStateChanged(u => {
            if(u) loadData(); 
            else window.location.href = `/login.html?redirect=${window.location.pathname}`;
        });
    } catch(e) { console.error("Init Error:", e); }
});

// --- FILTER LOGIC (FIXED) ---
function setupFilters() {
    if(!state.els.btnAll) return; // Safety check

    const setFilter = (type, btn) => {
        state.currentFilter = type;

        // Update Buttons Visual State
        [state.els.btnAll, state.els.btnPersonal, state.els.btnRecharge].forEach(b => {
            if(b) b.classList.remove('active');
        });
        if(btn) btn.classList.add('active');

        // Re-render
        renderLoans();
    };

    state.els.btnAll.onclick = () => setFilter('all', state.els.btnAll);
    state.els.btnPersonal.onclick = () => setFilter('personal', state.els.btnPersonal);
    state.els.btnRecharge.onclick = () => setFilter('recharge', state.els.btnRecharge);

    // Setup Search Listener
    const clearBtn = document.getElementById('clear-search');
    if (state.els.search) {
        state.els.search.addEventListener('input', () => {
            if (clearBtn) clearBtn.style.display = state.els.search.value.trim() !== '' ? 'block' : 'none';
            renderLoans();
        });

        if (clearBtn) {
            clearBtn.addEventListener('click', () => {
                state.els.search.value = '';
                clearBtn.style.display = 'none';
                renderLoans();
            });
        }

        // Handle URL search parameter
        const urlParams = new URLSearchParams(window.location.search);
        const searchParam = urlParams.get('search');
        if (searchParam) {
            state.els.search.value = searchParam;
            if (clearBtn) clearBtn.style.display = 'block';
        }
    }
}

// --- DATA HANDLING ---
function loadFromCache() {
    const cached = localStorage.getItem(CACHE_KEY);
    if (cached) {
        try {
            const data = JSON.parse(cached);
            state.members = data.members || {};
            state.transactions = data.transactions || []; // Added transactions cache
            state.activeLoans = processLoanData(data.rawLoans || {}, state.members);
            if (state.activeLoans.length > 0) {
                renderLoans();
                fillDropdown();
                if(state.els.loader) state.els.loader.classList.add('hidden');
            }
        } catch (e) { console.error(e); }
    }
}

function processLoanData(rawLoans, members) {
    return Object.values(rawLoans)
        .filter(l => l.status && l.status.trim() === 'Active') 
        .map(l => ({
            ...l,
            memberName: members[l.memberId]?.fullName || 'Unknown',
            pic: members[l.memberId]?.profilePicUrl || ''
        }))
        .sort((a,b) => new Date(a.loanDate) - new Date(b.loanDate));
}

async function loadData() {
    try {
        const db = firebase.database();
        // Fetch transactions alongside activeLoans and members
        const [lSnap, mSnap, tSnap] = await Promise.all([
            db.ref('activeLoans').once('value'),
            db.ref('members').once('value'),
            db.ref('transactions').once('value') // Fetching transactions
        ]);
        const membersVal = mSnap.val() || {};
        const loansVal = lSnap.val() || {};
        const txnsVal = tSnap.val() || {};

        state.members = membersVal;
        state.transactions = Object.values(txnsVal);

        localStorage.setItem(CACHE_KEY, JSON.stringify({
            members: membersVal,
            rawLoans: loansVal,
            transactions: state.transactions,
            timestamp: Date.now()
        }));

        state.activeLoans = processLoanData(loansVal, state.members);
        renderLoans();
        fillDropdown();
        if(state.els.loader) state.els.loader.classList.add('hidden');
    } catch(e) {
        console.error(e);
        if(state.els.loader) state.els.loader.classList.add('hidden');
    }
}

// --- MAIN RENDERER ---
function renderLoans() {
    const container = state.els.container;
    if(!container) return;
    container.innerHTML = '';

    // 1. Filter Data
    let filtered = state.activeLoans;
    if (state.currentFilter === 'personal') {
        filtered = filtered.filter(l => l.loanType === 'Personal Loan' || parseFloat(l.amount) >= 10000);
    } else if (state.currentFilter === 'recharge') {
        filtered = filtered.filter(l => l.loanType === 'Recharge' || l.loanType === '10 Days Credit');
    }

    // 2. Search Filter
    if(state.els.search) {
        const term = state.els.search.value.trim().toLowerCase();
        if(term) {
            filtered = filtered.filter(l => 
                (l.memberName && l.memberName.toLowerCase().includes(term)) ||
                (l.loanId && l.loanId.toString().toLowerCase().includes(term)) ||
                (l.loanType && l.loanType.toLowerCase().includes(term)) ||
                (l.outstandingAmount && l.outstandingAmount.toString().includes(term)) ||
                (l.amount && l.amount.toString().includes(term))
            );
        }
    }

    // 3. Update Stats
    const totalDue = filtered.reduce((sum, l) => sum + parseFloat(l.outstandingAmount || 0), 0);
    if(state.els.count) state.els.count.textContent = filtered.length;
    if(state.els.amt) state.els.amt.textContent = `₹${totalDue.toLocaleString('en-IN')}`;

    if(filtered.length === 0) {
        container.innerHTML = '<div style="text-align:center; padding:40px; color:#999; font-weight:600;">No loans found.</div>';
        return;
    }

    // 4. Generate Cards
    filtered.forEach(l => {
        const amount = parseFloat(l.outstandingAmount || 0);
        const dateObj = new Date(l.loanDate);
        const dateStr = dateObj.toLocaleDateString('en-GB', {day:'numeric', month:'short', year:'numeric'});

        const diffTime = Math.abs(new Date() - dateObj);
        const daysActive = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 

        let providerOrProduct = 'N/A';
        let emiAmount = null;
        let tenureMonths = l.tenureMonths || 0; 

        if (l.rechargeDetails) {
            providerOrProduct = l.rechargeDetails.operator;
            emiAmount = l.rechargeDetails.rechargeEmi;
        }
        if (l.loanType === 'Product on EMI' && l.productDetails) {
            providerOrProduct = l.productDetails.name;
            emiAmount = l.productDetails.monthlyEmi;
        }
        if (l.monthlyEmi) emiAmount = l.monthlyEmi;

        // Card Type Selection
        let cardHTML = '';

        // 🔥 NEW: Check for Collab Loan First
        if (l.isCollab || l.loanType === 'Collab Loan') {
            cardHTML = getCollabCardHTML(l, amount, dateStr, tenureMonths, emiAmount);
        }
        else if (l.loanType === '10 Days Credit') {
            cardHTML = getStandardCardHTML(l, amount, dateStr, daysActive, providerOrProduct, emiAmount);
        }
        else if (l.loanType === 'Recharge') {
            cardHTML = getStandardCardHTML(l, amount, dateStr, daysActive, providerOrProduct, emiAmount);
        }
        else if (l.loanCategory === 'VIP Phase Loan') {
            // 🔥 NEW: Check for VIP Loan
            cardHTML = getVIPCardHTML(l, amount, dateStr, daysActive, tenureMonths, emiAmount);
        }
        else {
            if (amount >= 25000) {
                cardHTML = getLuxuryCardHTML(l, amount, dateStr, daysActive, tenureMonths, emiAmount);
            } else {
                cardHTML = getPlatinumCardHTML(l, amount, dateStr, daysActive, tenureMonths, emiAmount);
            }
        }

        const wrapper = document.createElement('div');
        wrapper.innerHTML = cardHTML;
        container.appendChild(wrapper);
    });

    if(typeof feather !== 'undefined') feather.replace();
}

// === HELPER: ALERT LOGIC (Exact EMI & Month Rule) ===
function getAlertStatus(amount, days, loan, tenureMonths = 0) {
    let threshold = 90; 
    let isCritical = days > threshold;

    if (loan.loanType === '10 Days Credit') {
        threshold = 10;
        isCritical = days > threshold;
    } else if (loan.loanType === 'Recharge') {
        // EXACT MONTH TRACKING LOGIC
        let loanDate = new Date(loan.loanDate);
        let today = new Date();
        let monthsPassed = (today.getFullYear() - loanDate.getFullYear()) * 12 + (today.getMonth() - loanDate.getMonth());

        let paidCount = 0;
        if (state.transactions) {
            paidCount = state.transactions.filter(t => t.paidForLoanId === loan.loanId && t.type === 'Loan Payment').length;
        }

        // Warning is ON if current month is reached but not paid yet
        isCritical = (monthsPassed > paidCount);
        threshold = 30; // Just for visual UI in the circle
    } else if (tenureMonths > 0) {
        threshold = tenureMonths === 12 ? 365 : tenureMonths * 30; 
        isCritical = days > threshold;
    } else {
        threshold = amount > 25000 ? 365 : 90;
        isCritical = days > threshold;
    }

    return {
        isCritical: isCritical,
        threshold: threshold
    };
}


// Helper: Pay Now Button (Removed to fix UI and Download overlap)
function getPayButtonHTML(loan, amount) {
    return ''; // Returns empty string so button is completely hidden
}


// Helper: Warning Symbol Injection
function getWarningSymbol(isCritical) {
    if (!isCritical) return '';
    return `<div class="overdue-watermark">⚠️</div>`;
}

// === UNIVERSAL DYNAMIC EMI MONTH TRACKER GENERATOR ===
function getEmiTrackerHTML(loan, tenureMonths) {
    let totalBoxes = parseInt(tenureMonths) || parseInt(loan.tenureMonths) || parseInt(loan.duration) || 0;
    if (totalBoxes === 0) {
        if (loan.loanType === '10 Days Credit') totalBoxes = 1;
        else if (loan.loanType === 'Recharge') totalBoxes = loan.rechargeDetails?.tenure || 3;
        else if (parseFloat(loan.outstandingAmount || loan.amount || 0) >= 25000) totalBoxes = 12;
        else totalBoxes = 6;
    }
    totalBoxes = Math.max(1, Math.min(24, totalBoxes));

    let loanTxns = [];
    if (state.transactions) {
        loanTxns = state.transactions
            .filter(t => t.paidForLoanId === loan.loanId && t.type === 'Loan Payment')
            .sort((a, b) => new Date(a.date || a.timestamp) - new Date(b.date || b.timestamp));
    }
    let paidCount = loanTxns.length;

    let startDate = new Date(loan.loanDate);
    if (isNaN(startDate.getTime())) startDate = new Date();
    let today = new Date();

    // 🔥 NEW LOGIC: 1 to 3 Months Personal Loan (Single Progress Bar)
    // Collab Loan को इस प्रोग्रेस बार से बाहर रखा गया है ताकि उसमें हमेशा डब्बे (Boxes) दिखें
    if (totalBoxes <= 3 && loan.loanType !== 'Recharge' && loan.loanType !== '10 Days Credit' && loan.loanType !== 'Collab Loan' && !loan.isCollab) {
        let dueDate = new Date(startDate.getFullYear(), startDate.getMonth() + totalBoxes, startDate.getDate());

        let totalDays = (dueDate - startDate) / (1000 * 60 * 60 * 24);
        let daysElapsed = (today - startDate) / (1000 * 60 * 60 * 24);
        let percentage = Math.max(0, Math.min(100, (daysElapsed / totalDays) * 100));

        let dueMonthStr = dueDate.toLocaleString('en-GB', { month: 'short' }).toUpperCase();

        let barHtml = '';
        if (paidCount >= totalBoxes || (paidCount > 0 && parseFloat(loan.outstandingAmount) <= 0)) {
            barHtml = `
            <div class="short-loan-progress-wrap">
                <div class="sl-progress-fill sl-completed" style="width: 100%;"></div>
                <div class="sl-text-left">COMPLETED ✅</div>
                <div class="sl-text-right">100%</div>
            </div>`;
        } else {
            let colorClass = 'sl-blue';
            if (percentage > 40 && percentage <= 75) colorClass = 'sl-green';
            else if (percentage > 75 && percentage < 100) colorClass = 'sl-orange';
            else if (percentage >= 100) colorClass = 'sl-red';

            barHtml = `
            <div class="short-loan-progress-wrap">
                <div class="sl-progress-fill ${colorClass}" style="width: ${percentage.toFixed(1)}%;"></div>
                <div class="sl-text-left">ONE-TIME PAY: ${dueMonthStr}</div>
                <div class="sl-text-right">${percentage.toFixed(0)}%</div>
            </div>`;
        }
        return `<div class="emi-month-tracker" style="width: 100%; left: 0; right: 0; padding: 0 14px; box-sizing: border-box;">${barHtml}</div>`;
    }

    // ORIGINAL LOGIC FOR OTHERS (Recharge, >3 months, etc)
    const isCompact = totalBoxes >= 10;
    let monthsPassed = (today.getFullYear() - startDate.getFullYear()) * 12 + (today.getMonth() - startDate.getMonth());
    let overdueMonthsThreshold = today.getDate() > 10 ? monthsPassed : Math.max(0, monthsPassed - 1);

    let boxesHtml = '';
    for (let i = 1; i <= totalBoxes; i++) {
        let mDate = new Date(startDate.getFullYear(), startDate.getMonth() + i, 1);
        let monthName = mDate.toLocaleString('en-GB', { month: 'short' }).toUpperCase();
        if (isCompact && monthName.length > 3) monthName = monthName.substring(0, 3);

        let bgClass = 'tracker-pending';
        let boxText = monthName;

        if (i <= loanTxns.length) {
            let tx = loanTxns[i - 1];
            let pPaid = parseFloat(tx.principalPaid) || 0;
            let iPaid = parseFloat(tx.interestPaid) || 0;

            if (pPaid === 0 && iPaid > 0) {
                bgClass = 'tracker-interest-only';
                boxText = 'SKIP';
            } else {
                bgClass = 'tracker-paid';
            }
        } else if (i <= overdueMonthsThreshold) {
            bgClass = 'tracker-skipped';
        }

        boxesHtml += `<div class="tracker-box ${bgClass}">${boxText}</div>`;
    }

    const compactClass = isCompact ? ' emi-tracker-compact' : '';
    return `<div class="emi-month-tracker${compactClass}">${boxesHtml}</div>`;
}


// === 🔥 DUAL AMOUNT GENERATOR (ORIGINAL LOAN vs REMAINING DUE) 🔥 ===
function getOriginalLoanAmount(loan, currentAmount) {
    if (loan.originalAmount && parseFloat(loan.originalAmount) > 0) {
        return parseFloat(loan.originalAmount);
    }
    if (loan.amount && parseFloat(loan.amount) > parseFloat(currentAmount)) {
        return parseFloat(loan.amount);
    }
    if (state.transactions && state.transactions.length > 0) {
        const linkedTx = state.transactions.find(t => 
            (t.linkedLoanId === loan.loanId || t.loanId === loan.loanId || t.key === loan.loanId) && 
            (t.type === 'Loan Taken' || t.loanType || t.loan > 0)
        );
        if (linkedTx && parseFloat(linkedTx.amount || linkedTx.loan || 0) > 0) {
            return parseFloat(linkedTx.amount || linkedTx.loan);
        }
        const memberTx = state.transactions.find(t => 
            t.memberId === loan.memberId && 
            (t.type === 'Loan Taken' || t.loanType === 'Loan' || t.loanType === loan.loanType || t.loan > 0) &&
            parseFloat(t.amount || t.loan || 0) >= parseFloat(currentAmount)
        );
        if (memberTx && parseFloat(memberTx.amount || memberTx.loan || 0) > 0) {
            return parseFloat(memberTx.amount || memberTx.loan);
        }
    }
    return parseFloat(loan.originalAmount || loan.amount || currentAmount || 0);
}

function getDualAmountHTML(loan, currentAmount, emiDisplay = '') {
    const origAmt = getOriginalLoanAmount(loan, currentAmount);
    const takenFormatted = origAmt.toLocaleString('en-IN');
    const remainingFormatted = currentAmount.toLocaleString('en-IN');

    return `
    <div class="pc-dual-amount">
        <div class="amt-block amt-taken">
            <span class="amt-label">LOAN TAKEN</span>
            <div class="amt-val amt-val-taken">₹${takenFormatted}</div>
        </div>
        <div class="amt-divider"></div>
        <div class="amt-block amt-remaining">
            <span class="amt-label">${emiDisplay || 'REMAINING DUE'}</span>
            <div class="amt-val amt-val-remaining">₹${remainingFormatted}</div>
        </div>
    </div>`;
}

// --- 🔥 VIP PREMIUM CARD 🔥 ---
function getVIPCardHTML(loan, amount, dateStr, daysActive, tenureMonths, emi) {
    const pic = loan.pic || `https://ui-avatars.com/api/?name=${encodeURIComponent(loan.memberName)}`;
    const loanId = `card-${loan.loanId}`;
    const parsedTenure = parseInt(tenureMonths) || 1;

    // Check VIP Rank based on rate
    const rate = loan.interestDetails?.rate || 0;
    let vipBadge = '';
    let emiDisplay = '';

    if (rate === 0) {
        vipBadge = '👑 1ST VIP (0%)';
        emiDisplay = `TOTAL: ₹${amount.toLocaleString('en-IN')} (0% INT)`;
    } else if (rate === 0.001) {
        vipBadge = '👑 2ND VIP (0.10%)';
        const totalPayable = amount + (amount * (0.001 * parsedTenure));
        emiDisplay = `TOTAL: ₹${Math.round(totalPayable).toLocaleString('en-IN')} (0.10% INT)`;
    } else if (rate === 0.0025) {
        vipBadge = '👑 3RD VIP (0.25%)';
        const totalPayable = amount + (amount * (0.0025 * parsedTenure));
        emiDisplay = `TOTAL: ₹${Math.round(totalPayable).toLocaleString('en-IN')} (0.25% INT)`;
    } else {
        vipBadge = '👑 VIP MEMBER';
    }

    // Use EMI if duration is long
    if (parsedTenure > 3 && emi) {
        emiDisplay = `EMI: ₹${parseFloat(emi).toLocaleString('en-IN', {maximumFractionDigits: 0})}`;
    }

    const alertState = getAlertStatus(amount, daysActive, loan, parsedTenure);
    const alertClass = alertState.isCritical ? 'critical' : '';
    const wrapperClass = alertState.isCritical ? 'overdue-active' : '';

    return `
    <div class="premium-card-wrapper card-vip ${wrapperClass}" id="${loanId}">
        <div class="pc-texture"></div>
        <div class="vip-badge-tag">${vipBadge}</div>
        ${getWarningSymbol(alertState.isCritical)}

        <div class="pc-days-circle ${alertClass}">
            <span class="day-num">${daysActive}</span>
            <span class="day-label">DAYS</span>
        </div>

        <div class="pc-top">
            <div class="pc-bank">TRUST COMMUNITY FUND</div>
            <div class="pc-download" onclick="window.dlCard('${loanId}')" style="border-color:#FFD700; color:#FFD700; margin-right: 60px;">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
            </div>
        </div>

        <div class="pc-middle">
            <div class="pc-date">${dateStr}</div>
            <h1 class="pc-title gold-text">VIP TRUST LOAN</h1>
            <div style="font-size:9px; text-transform:uppercase; letter-spacing:1.5px; opacity:0.9; color:#FFD700; font-weight:700;">Exclusive Benefit • Time: ${parsedTenure} Month</div>
        </div>

        <div class="pc-bottom" style="padding-bottom: 72px;">
            <div class="pc-profile-group">
                <img src="${pic}" class="pc-pic" style="border: 2px solid #FFD700;" crossorigin="anonymous">
                <div class="pc-name">${loan.memberName}</div>
            </div>
            ${getDualAmountHTML(loan, amount, emiDisplay)}
        </div>

        ${getEmiTrackerHTML(loan, parsedTenure)}
        <div class="pc-footer">VIP BENEFIT - MAINTAIN TRUST SCORE & DISCIPLINE</div>
    </div>`;
}

// --- 1. LUXURY CARD (>25k) ---
function getLuxuryCardHTML(loan, amount, dateStr, daysActive, tenureMonths, emi) {
    const pic = loan.pic || `https://ui-avatars.com/api/?name=${encodeURIComponent(loan.memberName)}`;
    const loanId = `card-${loan.loanId}`;

    const parsedTenure = parseInt(tenureMonths) || 12;
    let emiDisplay = '';

    if (parsedTenure <= 3) {
        let rate = 0, rateStr = '';
        if (parsedTenure === 1) { rate = 0.01; rateStr = '1%'; }
        else if (parsedTenure === 2) { rate = 0.03; rateStr = '3%'; }
        else if (parsedTenure === 3) { rate = 0.05; rateStr = '5%'; }

        const baseAmt = getOriginalLoanAmount(loan, amount);
        const totalPayable = baseAmt + (baseAmt * rate);
        emiDisplay = `TOTAL: ₹${Math.round(totalPayable).toLocaleString('en-IN')} (${rateStr} INT)`;
    } else {
        emiDisplay = emi ? `EMI: ₹${parseFloat(emi).toLocaleString('en-IN', {maximumFractionDigits: 0})}` : '';
    }

    const alertState = getAlertStatus(amount, daysActive, loan, parsedTenure);
    const alertClass = alertState.isCritical ? 'critical' : '';
    const wrapperClass = alertState.isCritical ? 'overdue-active' : '';

    return `
    <div class="premium-card-wrapper card-premium ${wrapperClass}" id="${loanId}">
        <div class="pc-texture"></div>
        ${getWarningSymbol(alertState.isCritical)}

        <div class="pc-days-circle ${alertClass}">
            <span class="day-num">${daysActive}</span>
            <span class="day-label">DAYS</span>
        </div>

        <div class="pc-top">
            <div class="pc-bank" style="color:#D4AF37;">TRUST COMMUNITY FUND</div>
            <div class="pc-download" onclick="window.dlCard('${loanId}')" style="border-color:#D4AF37; color:#D4AF37;">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
            </div>
        </div>

        <div class="pc-middle">
            <div class="pc-date">${dateStr}</div>
            <h1 class="pc-title gold-text">PERSONAL LOAN</h1>
            <div style="font-size:9px; text-transform:uppercase; letter-spacing:1.5px; opacity:0.9; color:#D4AF37; font-weight:700;">High Value • Time: ${parsedTenure} Month</div>
        </div>

        ${getPayButtonHTML(loan, amount)}

        <div class="pc-bottom" style="padding-bottom: 72px;">
            <div class="pc-profile-group">
                <img src="${pic}" class="pc-pic" crossorigin="anonymous">
                <div class="pc-name">${loan.memberName}</div>
            </div>
            ${getDualAmountHTML(loan, amount, emiDisplay)}
        </div>

        ${getEmiTrackerHTML(loan, parsedTenure)}
        <div class="pc-footer">⚠️ PAY EVERY MONTH EMI 1 TO 10 OTHERWISE 0.5% PENALTY</div>
    </div>`;
}

// --- 2. PLATINUM CARD (<25k) ---
function getPlatinumCardHTML(loan, amount, dateStr, daysActive, tenureMonths, emi) {
    const pic = loan.pic || `https://ui-avatars.com/api/?name=${encodeURIComponent(loan.memberName)}`;
    const loanId = `card-${loan.loanId}`;

    const parsedTenure = parseInt(tenureMonths) || 6;
    let emiDisplay = '';

    if (parsedTenure <= 3) {
        let rate = 0, rateStr = '';
        if (parsedTenure === 1) { rate = 0.01; rateStr = '1%'; }
        else if (parsedTenure === 2) { rate = 0.03; rateStr = '3%'; }
        else if (parsedTenure === 3) { rate = 0.05; rateStr = '5%'; }

        const baseAmt = getOriginalLoanAmount(loan, amount);
        const totalPayable = baseAmt + (baseAmt * rate);
        emiDisplay = `TOTAL: ₹${Math.round(totalPayable).toLocaleString('en-IN')} (${rateStr} INT)`;
    } else {
        emiDisplay = emi ? `EMI: ₹${parseFloat(emi).toLocaleString('en-IN', {maximumFractionDigits: 0})}` : '';
    }

    const alertState = getAlertStatus(amount, daysActive, loan, parsedTenure);
    const alertClass = alertState.isCritical ? 'critical' : '';
    const wrapperClass = alertState.isCritical ? 'overdue-active' : '';

    return `
    <div class="premium-card-wrapper card-platinum ${wrapperClass}" id="${loanId}">
        <div class="pc-texture"></div>
        ${getWarningSymbol(alertState.isCritical)}

        <div class="pc-days-circle ${alertClass}">
            <span class="day-num">${daysActive}</span>
            <span class="day-label">DAYS</span>
        </div>

        <div class="pc-top">
            <div class="pc-bank">TCF PERSONAL</div>
            <div class="pc-download" onclick="window.dlCard('${loanId}')">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
            </div>
        </div>

        <div class="pc-middle">
            <span class="pc-date">${dateStr}</span>
            <h1 class="pc-title">PERSONAL LOAN</h1>
            <div style="font-size:9px; text-transform:uppercase; letter-spacing:1.5px; opacity:0.8; color:#4b5563; font-weight:700;">Standard • Time: ${parsedTenure} Month</div>
        </div>

        ${getPayButtonHTML(loan, amount)}

        <div class="pc-bottom" style="padding-bottom: 72px;">
            <div class="pc-profile-group">
                <img src="${pic}" class="pc-pic" crossorigin="anonymous">
                <div class="pc-name">${loan.memberName}</div>
            </div>
            ${getDualAmountHTML(loan, amount, emiDisplay)}
        </div>

        ${getEmiTrackerHTML(loan, parsedTenure)}
        <div class="pc-footer">Standard terms apply. Pay on time.</div>
    </div>`;
}

// --- 3. STANDARD CARD (Recharge/Credit) ---
function getStandardCardHTML(loan, amount, dateStr, daysActive, providerInfo, emi) {
    const pic = loan.pic || `https://ui-avatars.com/api/?name=${encodeURIComponent(loan.memberName)}`;
    const loanId = `card-${loan.loanId}`;
    const type = loan.loanType;

    let cardClass = 'card-10days'; 
    let title = '10 DAYS CREDIT';
    let footer = 'No Interest if paid within 10 Days.';
    let emiHtml = '';
    let trackerHtml = '';
    let tenureDisplay = '10 Days Credit Card';

    if(type === 'Recharge') {
        cardClass = 'card-recharge';
        title = 'RECHARGE CARD';
        footer = `Operator: ${providerInfo}`;
        if(emi) emiHtml = `<span class="pc-emi-label" style="color:#fff;">EMI: ₹${emi}</span>`;
        const rTenure = loan.rechargeDetails?.tenure || loan.tenureMonths || 3;
        tenureDisplay = `Recharge Card • Time: ${rTenure} Months`;
        trackerHtml = getEmiTrackerHTML(loan, rTenure);
    } else {
        trackerHtml = getEmiTrackerHTML(loan, 1);
    }

    const alertState = getAlertStatus(amount, daysActive, loan, 0);
    const alertClass = alertState.isCritical ? 'critical' : '';
    const wrapperClass = alertState.isCritical ? 'overdue-active' : '';

    return `
    <div class="premium-card-wrapper ${cardClass} ${wrapperClass}" id="${loanId}">
        <div class="pc-texture"></div>
        ${getWarningSymbol(alertState.isCritical)}

        <div class="pc-days-circle ${alertClass}">
            <span class="day-num">${daysActive}</span>
            <span class="day-label">DAYS</span>
        </div>

        <div class="pc-top">
            <div class="pc-bank">TCF CREDIT</div>
            <div class="pc-download" onclick="window.dlCard('${loanId}')">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
            </div>
        </div>

        <div class="pc-middle">
            <span class="pc-date" style="color:inherit; opacity:0.8;">${dateStr}</span>
            <h1 class="pc-title" style="font-size:18px;">${title}</h1>
            <div style="font-size:9px; text-transform:uppercase; letter-spacing:1.5px; opacity:0.85; font-weight:700;">${tenureDisplay}</div>
        </div>

        ${getPayButtonHTML(loan, amount)}

        <div class="pc-bottom" style="padding-bottom: 72px;">
            <div class="pc-profile-group">
                <img src="${pic}" class="pc-pic" crossorigin="anonymous" style="border-color:#fff;">
                <div class="pc-name">${loan.memberName}</div>
            </div>
            ${getDualAmountHTML(loan, amount, emi ? `EMI: ₹${emi}` : '')}
        </div>

        ${trackerHtml}

        <div class="pc-footer" style="background:rgba(0,0,0,0.1);">
            ${footer}
        </div>
    </div>`;
}

// --- SEARCH ---
// (Search listener initialized in setupFilters after DOM load)

// --- HIGH QUALITY DOWNLOAD FIX ---
window.dlCard = (id) => {
    const el = document.getElementById(id);
    const btn = el.querySelector('.pc-download');

    // Hide Download Icon
    btn.style.opacity = '0';

    // 🔥 1 Second (1000ms) delay for perfect layout setup
    setTimeout(() => {
        html2canvas(el, { 
            scale: 3, 
            useCORS: true, 
            allowTaint: true, 
            backgroundColor: null,
            scrollY: -window.scrollY, // FIX 1: Prevents coordinate shifting when user scrolls down
            logging: false,
            onclone: (clonedDoc) => {
                const clonedEl = clonedDoc.getElementById(id);
                clonedEl.style.transform = "none"; 

                // FIX 2: Stop Overdue Watermark from creating grey box artifacts
                const watermark = clonedEl.querySelector('.overdue-watermark');
                if(watermark) {
                    watermark.style.animation = 'none'; // Stop blinking
                    watermark.style.filter = 'none'; // 🔥 REMOVES GREY RECTANGLE BUG
                }

                // FIX 3: Remove Gradient Text for Canvas (Stops the Gold Box bug)
                const goldTexts = clonedEl.querySelectorAll('.gold-text');
                goldTexts.forEach(txt => {
                    txt.style.background = 'none';
                    txt.style.webkitBackgroundClip = 'initial';
                    txt.style.webkitTextFillColor = 'initial';
                    txt.style.color = '#D4AF37'; // Solid Gold Fallback
                    txt.style.textShadow = 'none';
                });

                // FIX 4: Explicitly enforce spacing in canvas backup
                const pcBottom = clonedEl.querySelector('.pc-bottom');
                if(pcBottom) {
                    pcBottom.style.paddingBottom = '72px';
                }

                // FIX 5: Ensure tracker boxes keep exact background colors in canvas
                const trackerBoxes = clonedEl.querySelectorAll('.tracker-box');
                trackerBoxes.forEach(box => {
                    if (box.classList.contains('tracker-paid')) {
                        box.style.backgroundColor = '#28a745';
                        box.style.color = '#ffffff';
                        box.style.borderColor = '#28a745';
                    } else if (box.classList.contains('tracker-skipped')) {
                        box.style.backgroundColor = '#dc3545';
                        box.style.color = '#ffffff';
                        box.style.borderColor = '#dc3545';
                    } else if (box.classList.contains('tracker-interest-only')) {
                        box.style.backgroundColor = '#f59e0b';
                        box.style.color = '#ffffff';
                        box.style.borderColor = '#f59e0b';
                    } else {
                        box.style.color = box.closest('.card-platinum') ? '#002366' : '#ffffff';
                    }
                });
            }
        })
        .then(c => {
            const a = document.createElement('a');
            a.download = `LoanCard_${id}.png`;
            a.href = c.toDataURL('image/png');
            a.click();

            // Restore Icon
            btn.style.opacity = '1';
        }).catch(err => {
            console.error("Download Failed:", err);
            btn.style.opacity = '1';
        });
    }, 1000); 
};


// --- ADMIN GENERATOR ---
function setupAdminModal() {
    if(!state.els.btnCreate) return;

    document.getElementById('generate-credit-btn').onclick = () => {
        state.els.modal.style.visibility = 'visible';
        state.els.modal.style.opacity = '1';
        state.els.genResult.innerHTML = '';
        fillDropdown();
    };
    document.querySelector('.close-modal').onclick = () => {
        state.els.modal.style.visibility = 'hidden';
        state.els.modal.style.opacity = '0';
    };

    state.els.mSelect.onchange = () => {
        state.els.amtInput.disabled = !state.els.mSelect.value;
        if(state.els.mSelect.value) state.els.amtInput.focus();
    };
    state.els.tSelect.onchange = () => {
        state.els.provGroup.style.display = (state.els.tSelect.value === 'recharge') ? 'block' : 'none';
    };
    state.els.btnCreate.onclick = () => {
        const mId = state.els.mSelect.value;
        if(!mId) return alert('Select Member');
        const amt = parseFloat(state.els.amtInput.value);
        if(!amt) return alert('Enter Amount');

        const name = state.els.mSelect.options[state.els.mSelect.selectedIndex].text;
        const pic = state.els.mSelect.options[state.els.mSelect.selectedIndex].dataset.pic;
        const typeKey = state.els.tSelect.value;
        const dateStr = new Date().toLocaleDateString('en-GB', {day:'numeric', month:'short', year:'numeric'});

        const mockLoan = { loanId: 'preview', memberName: name, pic: pic, loanType: typeKey === 'credit' ? '10 Days Credit' : 'Recharge', tenureMonths: 0 };
        let providerInfo = (typeKey === 'recharge') ? state.els.provSelect.value : '';
        state.els.genResult.innerHTML = getStandardCardHTML(mockLoan, amt, dateStr, 1, providerInfo, null);
    };
}

// --- 🔥 NEW: COLLAB CARD GENERATOR 🔥 ---
function getCollabCardHTML(loan, amount, dateStr, tenureMonths, emi) {
    const loanId = `card-${loan.loanId}`;
    const parsedTenure = parseInt(tenureMonths) || 1;

    // 1. Borrower Details
    const borrowerPic = loan.pic || `https://ui-avatars.com/api/?name=${encodeURIComponent(loan.memberName)}`;
    const borrowerName = loan.memberName || 'Unknown';

    // 2. Lender Details (Fetching from global state using lenderId)
    const lender = state.members[loan.lenderId] || {};
    const lenderPic = lender.profilePicUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(loan.lenderName || 'Lender')}`;
    const lenderName = loan.lenderName || lender.fullName || 'Lender';

    // 3. TCF System Logo
    const tcfLogo = 'https://ik.imagekit.io/kdtvm0r78/IMG-20251202-WA0000.jpg';

    // Formatting Data
    const formattedAmt = amount.toLocaleString('en-IN');

    return `
    <div class="premium-card-wrapper card-collab" id="${loanId}">
        <div class="collab-top-badge">COLLAB CARD</div>

        <div class="collab-header-flex">
            <div class="collab-side-info">
                <i data-feather="calendar"></i><br>${dateStr}
            </div>

            <div class="collab-main-amt-box">
                <div class="collab-pill">PERSONAL LOAN COLLAB</div>
                <div class="collab-amt">₹${formattedAmt}</div>
                <div class="collab-amt-lbl">TOTAL LOAN AMOUNT</div>
            </div>

            <div class="collab-side-info right">
                <i data-feather="clock"></i><br>${parsedTenure} MONTHS
            </div>
        </div>

        <div class="collab-network">
            <!-- 1. TCF System (Left) -->
            <div class="collab-person">
                <div class="collab-person-tag" style="background:#0F172A;">TCF SYSTEM</div>
                <img src="${tcfLogo}" class="collab-avatar" style="border-color:#0F172A;" crossorigin="anonymous">
                <div class="collab-name">TCF System</div>
            </div>

            <div class="collab-connector">🤝</div>

            <!-- 2. Lender / Provider (Middle) -->
            <div class="collab-person">
                <div class="collab-person-tag">PROVIDER</div>
                <img src="${lenderPic}" class="collab-avatar" crossorigin="anonymous">
                <div class="collab-name">${lenderName}</div>
            </div>

            <div class="collab-connector"><i data-feather="arrow-right"></i></div>

            <!-- 3. Borrower / Receiver (Right) -->
            <div class="collab-person">
                <div class="collab-person-tag" style="background:#B45309;">RECEIVER</div>
                <img src="${borrowerPic}" class="collab-avatar" crossorigin="anonymous">
                <div class="collab-name">${borrowerName}</div>
            </div>
        </div>

        <!-- Download Icon -->
        <div class="pc-download" onclick="window.dlCard('${loanId}')" style="position: absolute; bottom: 35px; right: 10px; width: 24px; height: 24px; border-color:#D97706; color:#D97706; background: rgba(255,255,255,0.8); z-index: 10;">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
        </div>

        <!-- डब्बों वाला EMI ट्रैकर (1 से 12 महीने के लिए) -->
        ${getEmiTrackerHTML(loan, parsedTenure)}

        <div class="collab-footer-bar">
            <i data-feather="lock" style="width:8px; height:8px;"></i> COLLABORATION BUILDS TRUST, TRUST BUILDS COMMUNITY
        </div>
    </div>`;
}


function fillDropdown() {
    state.els.mSelect.innerHTML = '<option value="">-- Select --</option>';
    Object.values(state.members).sort((a,b)=>a.fullName.localeCompare(b.fullName)).forEach(m => {
        const opt = document.createElement('option');
        opt.value = m.id; 
        opt.text = m.fullName;
        opt.dataset.pic = m.profilePicUrl;
        state.els.mSelect.appendChild(opt);
    });
}