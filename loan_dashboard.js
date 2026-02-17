// loan_dashboard.js

const CACHE_KEY = 'tcf_loan_dashboard_cache_v2'; // Version changed to force refresh
const PRELOAD_CONFIG_URL = '/api/firebase-config'; // Assuming you have this, otherwise replace with hardcoded config

// State Management
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
        // 1. Load Cache (Fast Paint)
        loadFromCache();

        // 2. Initialize Firebase
        // Note: Use your existing fetch logic or hardcode config if API is unavailable
        const res = await fetch(PRELOAD_CONFIG_URL);
        if(res.ok) {
            const config = await res.json();
            if (!firebase.apps.length) firebase.initializeApp(config);
        } else {
            console.warn("Config API failed, checking for global config...");
             // If you want to hardcode fallback, put it here
        }
        
        // 3. Auth Listener & Data Fetch
        firebase.auth().onAuthStateChanged(u => {
            if(u) {
                loadData(); 
            } else {
                // Auto Redirect if not logged in
                window.location.href = `/login.html?redirect=${window.location.pathname}`;
            }
        });

    } catch(e) { console.error("Init Error:", e); }
});

// --- CACHE SYSTEM ---
function loadFromCache() {
    const cached = localStorage.getItem(CACHE_KEY);
    if (cached) {
        try {
            const data = JSON.parse(cached);
            state.members = data.members || {};
            const rawLoans = data.rawLoans || {};
            state.activeLoans = processLoanData(rawLoans, state.members);

            if (state.activeLoans.length > 0) {
                updateUI(state.activeLoans);
                fillDropdown();
                state.els.loader.classList.add('hidden');
                console.log("⚡ Loaded from Cache");
            }
        } catch (e) { console.error("Cache Parse Error", e); }
    }
}

// --- DATA PROCESSING ---
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
        
        // Save to Cache
        localStorage.setItem(CACHE_KEY, JSON.stringify({
            members: membersVal,
            rawLoans: loansVal,
            timestamp: Date.now()
        }));

        state.activeLoans = processLoanData(loansVal, state.members);
        
        updateUI(state.activeLoans);
        fillDropdown();
        state.els.loader.classList.add('hidden');
        console.log("🌐 Synced with Firebase");

    } catch(e) {
        console.error(e);
        if (!state.activeLoans.length) {
            state.els.container.innerHTML = `<div class="text-center p-4 text-red-500">Error loading data. Check console.</div>`;
            state.els.loader.classList.add('hidden');
        }
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
        
        // Calculate Days
        const diffTime = Math.abs(new Date() - dateObj);
        const daysActive = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 

        // Extract Extra Info
        let providerOrProduct = 'N/A';
        let emiAmount = null;
        let tenureMonths = l.tenureMonths || 12; // Default to 12 if missing
        
        if (l.rechargeDetails) {
            providerOrProduct = l.rechargeDetails.operator || providerOrProduct;
            emiAmount = l.rechargeDetails.rechargeEmi || null;
        }
        
        if (l.loanType === 'Product on EMI' && l.productDetails) {
            providerOrProduct = l.productDetails.name || 'Unknown Product';
            emiAmount = l.productDetails.monthlyEmi || null;
        }

        if (l.monthlyEmi) emiAmount = l.monthlyEmi;

        // === DECISION: PREMIUM VS STANDARD ===
        let cardHTML = '';
        
        if (amount >= 25000) {
            // RENDER LUXURY CARD
            cardHTML = getLuxuryCardHTML(l, amount, dateStr, daysActive, tenureMonths, emiAmount);
        } else {
            // RENDER STANDARD CARD
            cardHTML = getStandardCardHTML(l, amount, dateStr, daysActive, providerOrProduct, emiAmount);
        }
        
        const el = document.createElement('div');
        el.innerHTML = cardHTML;
        state.els.container.appendChild(el);
    });
}

// --- 1. LUXURY CARD TEMPLATE (>= 25k) ---
function getLuxuryCardHTML(loan, amount, dateStr, daysActive, tenureMonths, emi) {
    const defaultPic = `https://ui-avatars.com/api/?name=${encodeURIComponent(loan.memberName)}&background=fff&color=000`;
    const pic = loan.pic || defaultPic;
    const loanId = `card-${loan.loanId}`;
    
    const totalDays = tenureMonths * 30; // approx
    const rate = loan.interestDetails?.rate ? (loan.interestDetails.rate * 100).toFixed(1) : '0.7';

    return `
    <div class="premium-card-wrapper card-premium" id="${loanId}">
        <div class="pc-texture"></div>
        
        <div class="gold-badge">
            <span class="gb-num">${tenureMonths}</span>
            <span class="gb-label">MTHS</span>
        </div>

        <div class="pc-top">
            <div class="pc-bank" style="color:#D4AF37;">TRUST COMMUNITY FUND</div>
            <div class="pc-download" onclick="window.dlCard('${loanId}')" style="border-color:#D4AF37; color:#D4AF37;">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
            </div>
        </div>

        <div class="pc-middle">
            <h1 class="pc-title gold-text">${loan.loanType}</h1>
            <div class="premium-progress">
                DAY ${daysActive} OF ${totalDays}
            </div>
        </div>

        <div class="pc-bottom">
            <div class="pc-profile-group">
                <img src="${pic}" class="pc-pic" crossorigin="anonymous">
                <div class="pc-name">${loan.memberName}</div>
            </div>
            <div class="pc-amount-group">
                <span class="pc-emi-label">EMI: ₹${emi ? emi.toLocaleString('en-IN') : '-'} | Rate: ${rate}%</span>
                <div class="pc-amount gold-text">₹${amount.toLocaleString('en-IN')}</div>
            </div>
        </div>

        <div class="pc-footer">
            ⚠️ Pay every month EMI 1-10 otherwise 1% penalty
        </div>
    </div>`;
}

// --- 2. STANDARD CARD TEMPLATE (< 25k) ---
function getStandardCardHTML(loan, amount, dateStr, daysActive, providerInfo, emi) {
    const defaultPic = `https://ui-avatars.com/api/?name=${encodeURIComponent(loan.memberName)}&background=fff&color=000`;
    const pic = loan.pic || defaultPic;
    const loanId = `card-${loan.loanId}`;
    const type = loan.loanType;

    // Standard Themes
    let cardClass = 'card-grocery'; // Default Green
    let title = 'GROCERY CREDIT';
    let footer = 'Pay within 1st-15th monthly, Get 6000 credit for No interest.';
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
    // Fallback for others
    else if(type === 'Personal Loan') {
        // Small Personal Loan
        cardClass = 'card-10days'; // Reuse gold/yellow theme for visibility
        title = 'SMALL LOAN';
        footer = 'Standard terms apply.';
    }

    return `
    <div class="premium-card-wrapper ${cardClass}" id="${loanId}">
        <div class="pc-texture"></div>
        
        <div class="pc-days-circle" style="
            position: absolute; left: 20px; top: 50%; transform: translateY(-50%);
            width: 50px; height: 50px; border-radius: 50%; border: 2px solid rgba(255,255,255,0.5);
            display: flex; flex-direction: column; align-items: center; justify-content: center;
            text-align: center; background: rgba(0,0,0,0.2); backdrop-filter: blur(4px); z-index: 5;
        ">
            <span class="day-num" style="font-size:16px; font-weight:800; line-height:1;">${daysActive}</span>
            <span class="day-label" style="font-size:7px;">DAYS</span>
        </div>

        <div class="pc-top">
            <div class="pc-bank">TCF CREDIT</div>
            <div class="pc-download" onclick="window.dlCard('${loanId}')" style="
                background: rgba(255,255,255,0.25); border-radius: 50%; width: 32px; height: 32px; 
                display: flex; align-items: center; justify-content: center; border: 1px solid rgba(255,255,255,0.4);
            ">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
            </div>
        </div>

        <div class="pc-middle" style="text-align:right;">
            <span class="pc-date" style="font-size:9px; opacity:0.8; letter-spacing:1px; display:block; margin-bottom:2px;">${dateStr}</span>
            <h1 class="pc-title">${title}</h1>
            <div style="font-size:9px; text-transform:uppercase; letter-spacing:2px; opacity:0.7;">CARD</div>
        </div>

        <div class="pc-bottom">
            <div class="pc-profile-group" style="margin-left:60px;">
                <img src="${pic}" class="pc-pic" crossorigin="anonymous" style="border-color:#fff;">
                <div class="pc-name" style="text-shadow:0 1px 2px rgba(0,0,0,0.3);">${loan.memberName}</div>
            </div>
            <div class="pc-amount-group">
                ${emiHtml}
                <div class="pc-amount">₹${amount.toLocaleString('en-IN')}</div>
            </div>
        </div>

        <div class="pc-footer" style="background:rgba(0,0,0,0.2); backdrop-filter:blur(2px);">
            ${footer}
        </div>
    </div>`;
}

// --- SEARCH & FILTER ---
state.els.search.addEventListener('input', (e) => {
    const term = e.target.value.toLowerCase();
    const filtered = state.activeLoans.filter(l => l.memberName.toLowerCase().includes(term));
    updateUI(filtered);
});

// --- DOWNLOAD FUNCTION ---
window.dlCard = (id) => {
    const el = document.getElementById(id);
    const btn = el.querySelector('.pc-download');
    btn.style.opacity = '0'; // Hide button for screenshot
    
    html2canvas(el, { scale: 3, useCORS: true, allowTaint: true, backgroundColor: null })
    .then(c => {
        const a = document.createElement('a');
        a.download = `LoanCard_${id}.png`;
        a.href = c.toDataURL('image/png');
        a.click();
        btn.style.opacity = '1';
    })
    .catch(err => {
        console.error(err);
        btn.style.opacity = '1';
    });
};

// --- MODAL LOGIC (RESTRICTED OPTIONS) ---
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

// --- MANUAL CARD GENERATE (PREVIEW) ---
state.els.btnCreate.onclick = () => {
    const mId = state.els.mSelect.value;
    if(!mId) return alert('Select Member');
    const amt = parseFloat(state.els.amtInput.value);
    if(!amt) return alert('Enter Amount');
    
    const name = state.els.mSelect.options[state.els.mSelect.selectedIndex].text;
    const pic = state.els.mSelect.options[state.els.mSelect.selectedIndex].dataset.pic;
    const typeKey = state.els.tSelect.value;
    
    const displayDate = new Date().toLocaleDateString('en-GB', {day:'numeric', month:'short', year:'numeric'});
    
    // Mock Data for Preview
    const mockLoan = {
        loanId: 'preview',
        memberName: name,
        pic: pic,
        loanType: typeKey === 'credit' ? '10 Days Credit' : 'Recharge',
        interestDetails: { rate: 0.007 },
        tenureMonths: 12
    };

    if (typeKey === 'recharge') {
        mockLoan.rechargeDetails = { 
            operator: state.els.provSelect.value,
            rechargeEmi: Math.round(amt) 
        };
    }

    // Logic to choose card style based on Amount
    let html = '';
    if (amt >= 25000) {
        // Luxury Preview (Even in Generator)
        html = getLuxuryCardHTML(mockLoan, amt, displayDate, 1, 12, null);
    } else {
        // Standard Preview
        let providerInfo = typeKey === 'recharge' ? state.els.provSelect.value : '';
        html = getStandardCardHTML(mockLoan, amt, displayDate, 1, providerInfo, null);
    }
    
    state.els.genResult.innerHTML = html;
};
