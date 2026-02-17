// loan_dashboard.js

const CACHE_KEY = 'tcf_loan_dashboard_cache_v6'; 
const PRELOAD_CONFIG_URL = '/api/firebase-config'; 

const state = {
    activeLoans: [],
    members: {},
    els: {
        container: document.getElementById('outstanding-loans-container'),
        loader: document.getElementById('loader'),
        count: document.getElementById('count-val'),
        amt: document.getElementById('amount-val'),
        search: document.getElementById('search-input'),
        modal: document.getElementById('gen-modal'),
        mSelect: document.getElementById('m-select'),
        tSelect: document.getElementById('t-select'),
        amtInput: document.getElementById('amt-input'),
        provSelect: document.getElementById('prov-select'),
        provGroup: document.getElementById('prov-group'),
        btnCreate: document.getElementById('btn-create'),
        genResult: document.getElementById('gen-result')
    }
};

// --- INITIALIZATION ---
document.addEventListener("DOMContentLoaded", async () => {
    try {
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

// --- CACHE & DATA ---
function loadFromCache() {
    const cached = localStorage.getItem(CACHE_KEY);
    if (cached) {
        try {
            const data = JSON.parse(cached);
            state.members = data.members || {};
            state.activeLoans = processLoanData(data.rawLoans || {}, state.members);
            if (state.activeLoans.length > 0) {
                updateUI(state.activeLoans);
                fillDropdown();
                state.els.loader.classList.add('hidden');
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
        updateUI(state.activeLoans);
        fillDropdown();
        state.els.loader.classList.add('hidden');
    } catch(e) {
        console.error(e);
        state.els.loader.classList.add('hidden');
    }
}

// --- UI UPDATES ---
function updateUI(loans) {
    const total = loans.reduce((s,l) => s + parseFloat(l.outstandingAmount || 0), 0);
    state.els.count.textContent = loans.length;
    state.els.amt.textContent = `₹${total.toLocaleString('en-IN')}`;
    state.els.container.innerHTML = '';
    
    if(!loans.length) {
        state.els.container.innerHTML = '<div style="text-align:center; padding:20px; color:#666;">No Active Loans</div>';
        return;
    }

    loans.forEach(l => {
        const amount = parseFloat(l.outstandingAmount || 0);
        const dateObj = new Date(l.loanDate);
        const dateStr = dateObj.toLocaleDateString('en-GB', {day:'numeric', month:'short', year:'numeric'});
        
        // Days Count
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

        // === CARD SELECTION ===
        let cardHTML = '';
        
        if (l.loanType === '10 Days Credit') {
            cardHTML = getStandardCardHTML(l, amount, dateStr, daysActive, providerOrProduct, emiAmount);
        }
        else if (l.loanType === 'Recharge') {
            cardHTML = getStandardCardHTML(l, amount, dateStr, daysActive, providerOrProduct, emiAmount);
        }
        else if (l.loanType === 'Personal Loan' || amount >= 25000) {
            if (amount >= 25000) {
                // LUXURY CARD (High Value)
                cardHTML = getLuxuryCardHTML(l, amount, dateStr, daysActive, tenureMonths, emiAmount);
            } else {
                // PLATINUM CARD (Small Value)
                cardHTML = getPlatinumCardHTML(l, amount, dateStr, daysActive, tenureMonths, emiAmount);
            }
        }
        else {
            cardHTML = getPlatinumCardHTML(l, amount, dateStr, daysActive, tenureMonths, emiAmount);
        }
        
        const el = document.createElement('div');
        el.innerHTML = cardHTML;
        state.els.container.appendChild(el);
    });
}

// --- 1. LUXURY CARD (High Value >= 25k) ---
// Structure: Month Left, Days Right, EMI Top-Right
function getLuxuryCardHTML(loan, amount, dateStr, daysActive, tenureMonths, emi) {
    const defaultPic = `https://ui-avatars.com/api/?name=${encodeURIComponent(loan.memberName)}&background=fff&color=000`;
    const pic = loan.pic || defaultPic;
    const loanId = `card-${loan.loanId}`;
    
    // EMI Show Logic: Tenure > 3 OR explicit EMI exists
    const showEmi = (tenureMonths > 3) || (emi && emi > 0);
    const rate = loan.interestDetails?.rate ? (loan.interestDetails.rate * 100).toFixed(1) : '0.7';

    return `
    <div class="premium-card-wrapper card-premium" id="${loanId}">
        <div class="pc-texture"></div>
        
        <div class="pc-badge-circle badge-left">
            <span class="day-num">${tenureMonths || 12}</span>
            <span class="day-label">MTHS</span>
        </div>

        <div class="pc-badge-circle badge-right">
            <span class="day-num">${daysActive}</span>
            <span class="day-label">DAYS</span>
        </div>

        <div class="pc-top">
            <div class="pc-bank" style="color:#D4AF37;">TRUST COMMUNITY FUND</div>
            <div class="pc-download" onclick="window.dlCard('${loanId}')" style="border-color:#D4AF37; color:#D4AF37;">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
            </div>
        </div>

        <div class="pc-middle" style="padding-left: 70px; padding-right: 70px;">
            <div class="pc-date">${dateStr}</div>
            <h1 class="pc-title gold-text">PERSONAL LOAN</h1>
            <div style="font-size:9px; text-transform:uppercase; letter-spacing:2px; opacity:0.8; color:#D4AF37;">HIGH VALUE</div>
        </div>

        <div class="pc-bottom">
            <div class="pc-profile-group">
                <img src="${pic}" class="pc-pic" crossorigin="anonymous">
                <div class="pc-name">${loan.memberName}</div>
            </div>
            <div class="pc-amount-group">
                ${showEmi ? `<span class="pc-emi-label">EMI: ₹${emi ? emi.toLocaleString('en-IN') : '-'} | Rate: ${rate}%</span>` : ''}
                <div class="pc-amount gold-text">₹${amount.toLocaleString('en-IN')}</div>
            </div>
        </div>

        <div class="pc-footer">
            ⚠️ Pay every month EMI 1-10 otherwise 1% penalty
        </div>
    </div>`;
}

// --- 2. PLATINUM CARD (Small Value < 25k) ---
// Structure: Days Left, Month Right, EMI Top-Right
function getPlatinumCardHTML(loan, amount, dateStr, daysActive, tenureMonths, emi) {
    const defaultPic = `https://ui-avatars.com/api/?name=${encodeURIComponent(loan.memberName)}&background=fff&color=000`;
    const pic = loan.pic || defaultPic;
    const loanId = `card-${loan.loanId}`;

    const showEmi = (tenureMonths > 3) || (emi && emi > 0);

    return `
    <div class="premium-card-wrapper card-platinum" id="${loanId}">
        <div class="pc-texture"></div>
        
        <div class="pc-badge-circle badge-left">
            <span class="day-num">${daysActive}</span>
            <span class="day-label">DAYS</span>
        </div>

        <div class="pc-badge-circle badge-right">
            <span class="day-num">${tenureMonths || 6}</span>
            <span class="day-label">MTHS</span>
        </div>

        <div class="pc-top">
            <div class="pc-bank">TCF PERSONAL</div>
            <div class="pc-download" onclick="window.dlCard('${loanId}')">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
            </div>
        </div>

        <div class="pc-middle" style="padding-left: 70px; padding-right: 70px;">
            <span class="pc-date">${dateStr}</span>
            <h1 class="pc-title">PERSONAL LOAN</h1>
            <div style="font-size:9px; text-transform:uppercase; letter-spacing:2px; opacity:0.6; color:#4b5563;">SMALL VALUE</div>
        </div>

        <div class="pc-bottom">
            <div class="pc-profile-group">
                <img src="${pic}" class="pc-pic" crossorigin="anonymous">
                <div class="pc-name">${loan.memberName}</div>
            </div>
            <div class="pc-amount-group">
                ${showEmi ? `<span class="pc-emi-label">EMI: ₹${emi ? emi.toLocaleString('en-IN') : '-'}</span>` : ''}
                <div class="pc-amount">₹${amount.toLocaleString('en-IN')}</div>
            </div>
        </div>

        <div class="pc-footer">
            Standard terms apply. Pay on time.
        </div>
    </div>`;
}

// --- 3. STANDARD CARD (10 Days / Recharge) ---
// Structure: Days Left, No Right Badge, EMI Top-Right
function getStandardCardHTML(loan, amount, dateStr, daysActive, providerInfo, emi) {
    const defaultPic = `https://ui-avatars.com/api/?name=${encodeURIComponent(loan.memberName)}&background=fff&color=000`;
    const pic = loan.pic || defaultPic;
    const loanId = `card-${loan.loanId}`;
    const type = loan.loanType;

    let cardClass = 'card-10days'; 
    let title = type;
    let footer = 'Standard terms apply.';
    let emiHtml = '';

    if(type === '10 Days Credit') {
        cardClass = 'card-10days';
        title = '10 DAYS CREDIT';
        footer = 'No Interest if paid within 10 Days.';
    } 
    else if(type === 'Recharge') {
        cardClass = 'card-recharge';
        title = 'RECHARGE CARD';
        footer = `Operator: ${providerInfo}`;
        if(emi) emiHtml = `<span class="pc-emi-label" style="color:#fff;">EMI: ₹${emi}</span>`;
    }

    return `
    <div class="premium-card-wrapper ${cardClass}" id="${loanId}">
        <div class="pc-texture"></div>
        
        <div class="pc-badge-circle badge-left">
            <span class="day-num">${daysActive}</span>
            <span class="day-label">DAYS</span>
        </div>

        <div class="pc-top">
            <div class="pc-bank">TCF CREDIT</div>
            <div class="pc-download" onclick="window.dlCard('${loanId}')">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
            </div>
        </div>

        <div class="pc-middle" style="padding-left: 70px;">
            <span class="pc-date" style="color:inherit; opacity:0.8;">${dateStr}</span>
            <h1 class="pc-title" style="font-size:18px;">${title}</h1>
            <div style="font-size:9px; text-transform:uppercase; letter-spacing:2px; opacity:0.7;">CARD</div>
        </div>

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

// --- SEARCH & DOWNLOAD ---
state.els.search.addEventListener('input', (e) => {
    const term = e.target.value.toLowerCase();
    const filtered = state.activeLoans.filter(l => l.memberName.toLowerCase().includes(term));
    updateUI(filtered);
});

window.dlCard = (id) => {
    const el = document.getElementById(id);
    const btn = el.querySelector('.pc-download');
    btn.style.opacity = '0';
    html2canvas(el, { scale: 3, useCORS: true, allowTaint: true, backgroundColor: null })
    .then(c => {
        const a = document.createElement('a');
        a.download = `LoanCard_${id}.png`;
        a.href = c.toDataURL('image/png');
        a.click();
        btn.style.opacity = '1';
    });
};

// --- MODAL & GENERATOR ---
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

state.els.mSelect.onchange = () => {
    state.els.amtInput.disabled = !state.els.mSelect.value;
    if(state.els.mSelect.value) state.els.amtInput.focus();
};
state.els.tSelect.onchange = () => {
    const val = state.els.tSelect.value;
    state.els.provGroup.style.display = (val === 'recharge') ? 'block' : 'none';
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

    const mockLoan = {
        loanId: 'preview',
        memberName: name,
        pic: pic,
        loanType: typeKey === 'credit' ? '10 Days Credit' : 'Recharge',
        tenureMonths: 0
    };
    
    let html = '';
    let providerInfo = (typeKey === 'recharge') ? state.els.provSelect.value : '';
    html = getStandardCardHTML(mockLoan, amt, dateStr, 1, providerInfo, null);
    
    state.els.genResult.innerHTML = html;
};
