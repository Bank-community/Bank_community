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
}

// --- DATA HANDLING ---
function loadFromCache() {
    const cached = localStorage.getItem(CACHE_KEY);
    if (cached) {
        try {
            const data = JSON.parse(cached);
            state.members = data.members || {};
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
        const [lSnap, mSnap] = await Promise.all([
            db.ref('activeLoans').once('value'),
            db.ref('members').once('value')
        ]);
        const membersVal = mSnap.val() || {};
        const loansVal = lSnap.val() || {};
        state.members = membersVal;
        
        localStorage.setItem(CACHE_KEY, JSON.stringify({
            members: membersVal,
            rawLoans: loansVal,
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
        const term = state.els.search.value.toLowerCase();
        if(term) {
            filtered = filtered.filter(l => l.memberName.toLowerCase().includes(term));
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
        if (l.loanType === '10 Days Credit') {
            cardHTML = getStandardCardHTML(l, amount, dateStr, daysActive, providerOrProduct, emiAmount);
        }
        else if (l.loanType === 'Recharge') {
            cardHTML = getStandardCardHTML(l, amount, dateStr, daysActive, providerOrProduct, emiAmount);
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

// === HELPER: ALERT LOGIC (New 90/365 Rule) ===
function getAlertStatus(amount, days) {
    let threshold = 90; // Default 90 days for small loans
    
    // For Big Loans (> 25000), limit is 1 year (365 days)
    if (amount > 25000) {
        threshold = 365;
    }

    return {
        isCritical: days > threshold,
        threshold: threshold
    };
}

// Helper: Pay Now Button (Supports CSS Updates)
function getPayButtonHTML(loan, amount) {
    const payLink = `qr.html?amount=${amount}&type=loan&id=${loan.loanId}`;
    return `
    <a href="${payLink}" class="btn-pay-now">
        PAY NOW <i data-feather="chevron-right"></i>
    </a>`;
}

// Helper: Warning Symbol Injection
function getWarningSymbol(isCritical) {
    if (!isCritical) return '';
    return `<div class="overdue-watermark">⚠️</div>`;
}

// --- 1. LUXURY CARD (>25k) ---
function getLuxuryCardHTML(loan, amount, dateStr, daysActive, tenureMonths, emi) {
    const pic = loan.pic || `https://ui-avatars.com/api/?name=${encodeURIComponent(loan.memberName)}`;
    const loanId = `card-${loan.loanId}`;
    const showEmi = (tenureMonths > 3) || (emi && emi > 0);
    const emiDisplay = showEmi && emi ? `EMI: ₹${emi.toLocaleString('en-IN')}` : '';
    
    const alertState = getAlertStatus(amount, daysActive);
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
            <div style="font-size:9px; text-transform:uppercase; letter-spacing:2px; opacity:0.8; color:#D4AF37;">HIGH VALUE</div>
        </div>

        ${getPayButtonHTML(loan, amount)}

        <div class="pc-bottom">
            <div class="pc-profile-group">
                <img src="${pic}" class="pc-pic" crossorigin="anonymous">
                <div class="pc-name">${loan.memberName}</div>
            </div>
            <div class="pc-amount-group">
                <span class="pc-emi-label" style="color:#D4AF37;">${emiDisplay}</span>
                <div class="pc-amount gold-text">₹${amount.toLocaleString('en-IN')}</div>
            </div>
        </div>

        <div class="loan-tenure-tag">Time: ${tenureMonths || 12} Month</div>
        <div class="pc-footer">⚠️ PAY EVERY MONTH EMI 1 TO 10 OTHERWISE 0.5% PENALTY</div>
    </div>`;
}

// --- 2. PLATINUM CARD (<25k) ---
function getPlatinumCardHTML(loan, amount, dateStr, daysActive, tenureMonths, emi) {
    const pic = loan.pic || `https://ui-avatars.com/api/?name=${encodeURIComponent(loan.memberName)}`;
    const loanId = `card-${loan.loanId}`;
    const showEmi = (tenureMonths > 3) || (emi && emi > 0);
    const emiDisplay = showEmi && emi ? `EMI: ₹${emi.toLocaleString('en-IN')}` : '';

    const alertState = getAlertStatus(amount, daysActive);
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
            <div style="font-size:9px; text-transform:uppercase; letter-spacing:2px; opacity:0.6; color:#4b5563;">Standard</div>
        </div>

        ${getPayButtonHTML(loan, amount)}

        <div class="pc-bottom">
            <div class="pc-profile-group">
                <img src="${pic}" class="pc-pic" crossorigin="anonymous">
                <div class="pc-name">${loan.memberName}</div>
            </div>
            <div class="pc-amount-group">
                <span class="pc-emi-label">${emiDisplay}</span>
                <div class="pc-amount">₹${amount.toLocaleString('en-IN')}</div>
            </div>
        </div>

        <div class="loan-tenure-tag">Time: ${tenureMonths || 6} Month</div>
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

    if(type === 'Recharge') {
        cardClass = 'card-recharge';
        title = 'RECHARGE CARD';
        footer = `Operator: ${providerInfo}`;
        if(emi) emiHtml = `<span class="pc-emi-label" style="color:#fff;">EMI: ₹${emi}</span>`;
    }

    const alertState = getAlertStatus(amount, daysActive);
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
            <div style="font-size:9px; text-transform:uppercase; letter-spacing:2px; opacity:0.7;">CARD</div>
        </div>

        ${getPayButtonHTML(loan, amount)}

        <div class="pc-bottom">
            <div class="pc-profile-group">
                <img src="${pic}" class="pc-pic" crossorigin="anonymous" style="border-color:#fff;">
                <div class="pc-name">${loan.memberName}</div>
            </div>
            <div class="pc-amount-group">
                ${emiHtml}
                <div class="pc-amount">₹${amount.toLocaleString('en-IN')}</div>
            </div>
        </div>

        <div class="pc-footer" style="background:rgba(0,0,0,0.1);">
            ${footer}
        </div>
    </div>`;
}

// --- SEARCH ---
if(state.els.search) {
    state.els.search.addEventListener('input', () => renderLoans());
}

// --- HIGH QUALITY DOWNLOAD FIX (Text Shift Solved) ---
window.dlCard = (id) => {
    const el = document.getElementById(id);
    const btn = el.querySelector('.pc-download');
    
    // Hide Download Icon
    btn.style.opacity = '0';

    html2canvas(el, { 
        scale: 4, // High Quality
        useCORS: true, 
        allowTaint: true, 
        backgroundColor: null,
        logging: false,
        onclone: (clonedDoc) => {
            const clonedEl = clonedDoc.getElementById(id);
            const clonedPayBtn = clonedEl.querySelector('.btn-pay-now');
            
            // 🔥 1. Fix Text Shift Issue
            clonedEl.style.transform = "none"; 
            const titles = clonedEl.querySelectorAll('.pc-title, .pc-amount');
            titles.forEach(t => {
                t.style.marginTop = "-5px"; // Pull text up slightly for screenshot
                t.style.lineHeight = "1";
            });

            // 2. Ensure Button is Visible in Download
            if(clonedPayBtn) {
                clonedPayBtn.style.display = 'flex';
                clonedPayBtn.style.boxShadow = 'none'; 
                clonedPayBtn.style.border = '1px solid #D4AF37';
            }
        }
    })
    .then(c => {
        const a = document.createElement('a');
        a.download = `LoanCard_${id}.png`;
        a.href = c.toDataURL('image/png');
        a.click();
        
        // Restore
        btn.style.opacity = '1';
    });
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
