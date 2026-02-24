// user-ui.js - FINAL REPAIRED VERSION (All-in-One Logic)
// RESPONSIBILITY: Handle Tabs, Inject Modules & Manage All Logic
// NOTE: Templates are merged here to prevent "Missing File" errors.

import { 
    displayHeaderButtons, displayMembers, renderProducts, displayCustomCards, 
    displayCommunityLetters, buildInfoSlider, startHeaderDisplayRotator, updateInfoCards 
} from './ui-components.js';

import { 
    processAndShowNotifications, promptForDeviceVerification, requestNotificationPermission, 
    showSipStatusModal, showPenaltyWalletModal, showAllMembersModal, showMemberProfileModal, 
    showBalanceModal, showEmiModal, showFullImage, handlePasswordCheck, observeElements, 
    setTextContent, Analytics 
} from './ui-helpers.js';

// --- Global State ---
let globalData = {
    members: [],
    transactions: [],
    stats: {},
    activeLoans: {}, 
    products: {},
    notifications: { manual: {}, automated: {} }
};

let modulesLoaded = { loan: false, history: false, profile: false };
let currentMemberForFullView = null;
let currentOpenModal = null;
const balanceClickSound = new Audio('/mixkit-clinking-coins-1993.wav');

// =========================================================
// 🛠️ INTERNAL TEMPLATES (To fix missing file error)
// =========================================================
const SectionTemplates = {
    getLoanDashboardHTML: () => `
        <div class="main-wrapper animate-on-scroll">
            <header class="premium-header">
                <span class="header-super-title">Trust Community Fund</span>
                <h1 class="header-main-title">Loan Dashboard</h1>
                <button id="generate-credit-btn"><i data-feather="credit-card"></i> Generate Card</button>
            </header>
            <div class="stats-wrapper">
                <div class="combined-stats-card">
                    <div class="stat-part"><div class="stat-label">Outstanding Loans</div><div class="stat-value" id="count-val">0</div></div>
                    <div class="stat-separator"></div>
                    <div class="stat-part"><div class="stat-label">Total Due</div><div class="stat-value" id="amount-val">₹0</div></div>
                </div>
            </div>
            <div class="search-area"><input type="text" id="search-input" placeholder="Search member..." autocomplete="off"></div>
            <div id="outstanding-loans-container" style="padding-bottom:100px;"></div>
        </div>
        <div class="modal-overlay" id="gen-modal" style="display:none; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.8); z-index:2000; align-items:center; justify-content:center;">
            <div class="modal-box" style="background:white; width:90%; padding:20px; border-radius:15px; position:relative;">
                <button class="close-modal" style="position:absolute; right:15px; top:10px; border:none; background:none; font-size:24px;">&times;</button>
                <h3 style="text-align:center; color:#002366;">GENERATE CARD</h3>
                <div style="margin-bottom:15px;"><label>Member</label><select id="m-select" style="width:100%; padding:10px;"><option value="">Loading...</option></select></div>
                <div style="margin-bottom:15px;"><label>Type</label><select id="t-select" style="width:100%; padding:10px;"><option value="credit">10 Days Credit</option><option value="recharge">Recharge</option></select></div>
                <div style="margin-bottom:15px;"><label>Amount</label><input type="number" id="amt-input" style="width:100%; padding:10px;" disabled></div>
                <div id="prov-group" style="display:none; margin-bottom:15px;"><label>Operator</label><select id="prov-select" style="width:100%; padding:10px;"><option>Jio</option><option>Airtel</option><option>Vi</option></select></div>
                <button id="btn-create" class="civil-button" style="width:100%;">Create</button>
                <div id="gen-result" style="margin-top:15px;"></div>
            </div>
        </div>
    `,
    getHistoryHTML: () => `
        <div class="main-wrapper animate-on-scroll" style="padding-top: 10px;">
            <div class="history-header"><h2 style="margin:0; color:white; font-size:1.2em;">Transaction History</h2><span id="monthDisplay" style="font-size:0.8em; opacity:0.8;">Current Month</span></div>
            <div class="history-boxes">
                <div class="h-box sip"><span class="h-lbl">SIP Rec.</span><span class="h-val" id="totalSipVal">₹0</span></div>
                <div class="h-box repay"><span class="h-lbl">Repayment</span><span class="h-val" id="totalRepayVal">₹0</span></div>
                <div class="h-box loan"><span class="h-lbl">Loan Given</span><span class="h-val" id="totalLoanVal">₹0</span></div>
            </div>
            <div class="sub-filter-container">
                <button class="filter-chip active" data-filter="ALL">All</button>
                <button class="filter-chip" data-filter="SIP">SIP Rank 🏆</button>
                <button class="filter-chip" data-filter="LOAN">Loan</button>
                <button class="filter-chip" data-filter="REPAY">Repayment</button>
            </div>
            <div id="historyContainer" class="hist-list"><p class="loading-text" style="text-align:center; padding:20px;">Loading transactions...</p></div>
        </div>
    `,
    getProfileHTML: () => `
        <div class="main-wrapper animate-on-scroll">
            <div class="profile-header-card">
                <button class="close-profile-btn" onclick="document.getElementById('profile-full-view').style.display='none'; document.getElementById('profile-gatekeeper').style.display='flex';">&times;</button>
                <img id="fullProfilePic" src="" class="fp-big-img">
                <h2 id="fullProfileName" style="color:white;">Member Name</h2>
                <span id="fullProfileId" class="fp-id-badge">ID: --</span>
            </div>
            <div class="full-profile-body">
                <div class="full-profile-grid">
                    <div class="full-profile-item"><strong>Mobile</strong><span id="fullProfileMobile">--</span></div>
                    <div class="full-profile-item"><strong>DOB</strong><span id="fullProfileDob">--</span></div>
                    <div class="full-profile-item"><strong>Aadhaar</strong><span id="fullProfileAadhaar">--</span></div>
                    <div class="full-profile-item full-width"><strong>Address</strong><span id="fullProfileAddress">--</span></div>
                    <div class="full-profile-item full-width extra-amt-box"><strong>Extra Amount</strong><span id="fullProfileExtraAmount">--</span></div>
                </div>
            </div>
        </div>
    `
};

// --- Initialization ---
export function initUI(database) {
    try {
        setupGlobalListeners(database);
        setupBottomNav(); 
        setupPWA();

        // Initial Animation
        setTimeout(() => {
            document.querySelectorAll('.animate-on-scroll').forEach(el => el.classList.add('is-visible'));
        }, 500);

        if (document.getElementById('currentYear')) 
            document.getElementById('currentYear').textContent = new Date().getFullYear();
    } catch(e) { console.error("UI Init Error:", e); }
}

// =========================================================
// 🚀 PART 1: THE ROUTER (Module Injection Logic)
// =========================================================
function setupBottomNav() {
    const navItems = document.querySelectorAll('.nav-item');
    const tabs = document.querySelectorAll('.app-tab');

    navItems.forEach(item => {
        item.addEventListener('click', () => {
            const targetId = item.getAttribute('data-target');
            if (!targetId) return;

            // 1. Update Active Nav Icon
            navItems.forEach(nav => nav.classList.remove('active'));
            item.classList.add('active');

            // 2. Hide All Tabs, Show Target
            tabs.forEach(tab => {
                tab.classList.remove('active-tab');
                if (tab.id === targetId) {
                    tab.classList.add('active-tab');
                    
                    // 3. LAZY LOAD MODULES
                    if (targetId === 'tab-loan' && !modulesLoaded.loan) loadLoanModule();
                    if (targetId === 'tab-history' && !modulesLoaded.history) loadHistoryModule();
                }
            });
            
            window.scrollTo(0, 0);
            if(typeof feather !== 'undefined') feather.replace();
        });
    });
}

function loadLoanModule() {
    const container = document.getElementById('tab-loan');
    if(container) {
        container.innerHTML = SectionTemplates.getLoanDashboardHTML(); 
        modulesLoaded.loan = true;
        initLoanLogic(); 
        if(typeof feather !== 'undefined') feather.replace();
    }
}

function loadHistoryModule() {
    const container = document.getElementById('tab-history');
    if(container) {
        container.innerHTML = SectionTemplates.getHistoryHTML();
        modulesLoaded.history = true;
        initHistoryLogic();
    }
}

export function loadProfileModule(memberId) {
    let container = document.getElementById('profile-full-view');
    if (container) {
        if (!modulesLoaded.profile) {
            container.innerHTML = SectionTemplates.getProfileHTML();
            modulesLoaded.profile = true;
        }
        document.getElementById('profile-gatekeeper').style.display = 'none';
        container.style.display = 'block';
        populateFullProfile(memberId);
    }
}

// =========================================================
// 📊 PART 2: MAIN HOME RENDERER
// =========================================================
export function renderPage(data) {
    if(!data) return;
    
    // Store Data Globally
    globalData.members = data.processedMembers || [];
    globalData.transactions = data.allTransactions || [];
    globalData.stats = data.communityStats || {};
    globalData.products = data.allProducts || {};
    globalData.notifications = { manual: data.manualNotifications, automated: data.automatedQueue };
    globalData.activeLoans = data.rawActiveLoans || {}; 

    const approvedMembers = globalData.members.filter(m => m.status === 'Approved');

    // 1. Update Home Components
    updateTCFCard(globalData.stats);
    displayHeaderButtons(data.headerButtons || {}, document.getElementById('headerActionsContainer'), document.getElementById('staticHeaderButtons'));
    displayMembers(approvedMembers, data.adminSettings || {}, document.getElementById('memberContainer'), (id) => {
        currentMemberForFullView = id;
        showMemberProfileModal(id, globalData.members);
    });
    
    // 2. Components
    displayCustomCards(data.adminSettings?.custom_cards || {}, document.getElementById('customCardsContainer'));
    displayCommunityLetters(data.adminSettings?.community_letters || {}, document.getElementById('communityLetterSlides'), showFullImage);
    updateInfoCards(approvedMembers.length, globalData.stats.totalLoanDisbursed);
    startHeaderDisplayRotator(document.getElementById('headerDisplay'), approvedMembers, globalData.stats);
    buildInfoSlider(document.getElementById('infoSlider'), globalData.members);
    
    // 3. Products
    renderProducts(globalData.products, document.getElementById('productsContainer'), (emi, name, price) => {
        showEmiModal(emi, name, price, document.getElementById('emiModal'));
    });

    // 4. Notifications
    processAndShowNotifications(globalData, document.getElementById('notification-popup-container'));
    
    // 5. Update Modules if loaded
    if (modulesLoaded.loan) initLoanLogic();
    if (modulesLoaded.history) initHistoryLogic();

    if(typeof feather !== 'undefined') feather.replace();
    observeElements(document.querySelectorAll('.animate-on-scroll'));
}

function updateTCFCard(stats) {
    const fundEl = document.getElementById('tcfAvailableFunds');
    if (fundEl) {
        fundEl.dataset.value = (stats.availableCommunityBalance || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 });
        if (!fundEl.classList.contains('masked')) fundEl.textContent = fundEl.dataset.value;
    }
    setTextContent('tcfTotalSip', '₹' + (stats.totalSipAmount || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 }));
    setTextContent('tcfActiveLoans', '₹' + (stats.totalCurrentLoanAmount || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 }));
    setTextContent('tcfReturns', '₹' + (stats.netReturnAmount || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 }));
}

// =========================================================
// 💰 PART 3: LOAN LOGIC
// =========================================================
function initLoanLogic() {
    const listContainer = document.getElementById('outstanding-loans-container');
    if (!listContainer) return;

    // Filter Active Loans
    const loans = Object.values(globalData.activeLoans || {})
        .filter(l => l.status === 'Active')
        .map(l => {
            const mem = globalData.members.find(m => m.id === l.memberId);
            return { ...l, memberName: mem?.name || 'Unknown', pic: mem?.displayImageUrl || '' };
        })
        .sort((a,b) => new Date(a.loanDate) - new Date(b.loanDate));

    // Update Totals
    const totalDue = loans.reduce((sum, l) => sum + parseFloat(l.outstandingAmount || 0), 0);
    setTextContent('count-val', loans.length);
    setTextContent('amount-val', '₹' + totalDue.toLocaleString('en-IN'));

    // Render List
    const renderList = (filterText = '') => {
        listContainer.innerHTML = '';
        const filtered = loans.filter(l => l.memberName.toLowerCase().includes(filterText));
        
        if (filtered.length === 0) {
            listContainer.innerHTML = '<div style="text-align:center; padding:20px; color:#aaa;">No active loans found.</div>';
            return;
        }

        filtered.forEach(l => {
            listContainer.innerHTML += createLoanCardHTML(l);
        });
        if(typeof feather !== 'undefined') feather.replace();
    };

    renderList();

    const searchInput = document.getElementById('search-input');
    if (searchInput) searchInput.oninput = (e) => renderList(e.target.value.toLowerCase());
    
    // Modal Generator Logic
    const btnGen = document.getElementById('generate-credit-btn');
    const modal = document.getElementById('gen-modal');
    if(btnGen && modal) {
        btnGen.onclick = () => {
            modal.style.display = 'flex';
            const sel = document.getElementById('m-select');
            sel.innerHTML = '<option value="">-- Select Member --</option>';
            globalData.members.forEach(m => {
                sel.innerHTML += `<option value="${m.id}">${m.name}</option>`;
            });
        };
        modal.querySelector('.close-modal').onclick = () => modal.style.display = 'none';
        
        // Mock Card Generate (Simple logic for now)
        document.getElementById('btn-create').onclick = () => {
            alert("Card generated (Preview Only)");
        }
    }
}

function createLoanCardHTML(loan) {
    const dateStr = new Date(loan.loanDate).toLocaleDateString('en-GB');
    const daysActive = Math.ceil(Math.abs(new Date() - new Date(loan.loanDate)) / (1000 * 60 * 60 * 24));
    
    return `
    <div class="premium-card-wrapper card-platinum animate-on-scroll">
        <div class="pc-days-circle"><span class="day-num">${daysActive}</span><span class="day-label">DAYS</span></div>
        <div class="pc-top"><div class="pc-bank">TCF LOAN</div></div>
        <div class="pc-middle">
            <span class="pc-date">${dateStr}</span>
            <h1 class="pc-title">${loan.loanType || 'LOAN'}</h1>
        </div>
        <div class="pc-bottom">
            <div class="pc-profile-group">
                <img src="${loan.pic}" class="pc-pic" onerror="this.src='https://i.ibb.co/HTNrbJxD/20250716-222246.png'">
                <div class="pc-name">${loan.memberName}</div>
            </div>
            <div class="pc-amount-group"><div class="pc-amount">₹${parseFloat(loan.outstandingAmount).toLocaleString('en-IN')}</div></div>
        </div>
    </div>`;
}

// =========================================================
// 📜 PART 4: HISTORY LOGIC
// =========================================================
function initHistoryLogic() {
    const listContainer = document.getElementById('historyContainer');
    if (!listContainer) return;

    const filterBtns = document.querySelectorAll('.filter-chip');
    filterBtns.forEach(btn => {
        btn.onclick = () => {
            filterBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            renderHistoryList(btn.dataset.filter);
        };
    });

    updateHistoryStats();
    renderHistoryList('ALL');
}

function updateHistoryStats() {
    const now = new Date();
    let stats = { sip: 0, repay: 0, loan: 0 };
    
    globalData.transactions.forEach(t => {
        const d = new Date(t.date || t.timestamp);
        if (d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()) {
            const amt = parseFloat(t.amount || 0);
            if (t.type === 'SIP' || t.type === 'Extra Payment') stats.sip += amt;
            else if (t.type === 'Loan Payment') stats.repay += amt;
            else if (t.type.includes('Loan Taken')) stats.loan += amt;
        }
    });

    setTextContent('totalSipVal', '₹' + stats.sip.toLocaleString('en-IN'));
    setTextContent('totalRepayVal', '₹' + stats.repay.toLocaleString('en-IN'));
    setTextContent('totalLoanVal', '₹' + stats.loan.toLocaleString('en-IN'));
    setTextContent('monthDisplay', now.toLocaleString('default', { month: 'long', year: 'numeric' }));
}

function renderHistoryList(filterType) {
    const container = document.getElementById('historyContainer');
    container.innerHTML = '';
    
    const now = new Date();
    let txs = globalData.transactions.filter(t => {
        const d = new Date(t.date || t.timestamp);
        return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    });

    if (filterType === 'SIP') txs = txs.filter(t => t.type === 'SIP' || t.type === 'Extra Payment');
    if (filterType === 'LOAN') txs = txs.filter(t => t.type.includes('Loan Taken'));
    if (filterType === 'REPAY') txs = txs.filter(t => t.type === 'Loan Payment');
    
    txs.sort((a,b) => new Date(b.date) - new Date(a.date));

    if (txs.length === 0) {
        container.innerHTML = '<div style="padding:20px; text-align:center; color:#999;">No transactions found.</div>';
        return;
    }

    txs.forEach(t => {
        const isIncome = ['SIP', 'Extra Payment', 'Loan Payment'].includes(t.type);
        const colorClass = isIncome ? '#28a745' : '#dc3545';
        const member = globalData.members.find(m => m.id === t.memberId);
        
        container.innerHTML += `
        <div class="hist-item">
            <div class="hist-info">
                <h5 style="margin:0; font-size:0.95em;">${member?.name || 'Unknown'}</h5>
                <p style="margin:2px 0 0 0; font-size:0.8em; color:#666;">${t.type} • ${new Date(t.date).getDate()} ${now.toLocaleString('default', {month:'short'})}</p>
            </div>
            <div class="hist-amt" style="color:${colorClass}; font-weight:700;">
                ${isIncome ? '+' : '-'} ₹${parseFloat(t.amount).toLocaleString('en-IN')}
            </div>
        </div>`;
    });
}

// =========================================================
// 👤 PART 5: FULL PROFILE LOGIC
// =========================================================
function populateFullProfile(memberId) {
    const member = globalData.members.find(m => m.id === memberId);
    if (!member) return;

    document.getElementById('fullProfilePic').src = member.displayImageUrl || 'https://i.ibb.co/HTNrbJxD/20250716-222246.png';
    setTextContent('fullProfileName', member.name);
    setTextContent('fullProfileId', `ID: ${member.id}`);
    setTextContent('fullProfileMobile', member.mobile || 'N/A');
    setTextContent('fullProfileDob', member.dob || 'N/A');
    setTextContent('fullProfileAadhaar', member.aadhar || 'N/A');
    setTextContent('fullProfileAddress', member.address || 'N/A');
    setTextContent('fullProfileExtraAmount', `₹${member.extraAmount || 0}`);
}

// --- GLOBAL LISTENERS ---
function setupGlobalListeners(database) {
    document.body.addEventListener('click', (e) => {
        const target = e.target;
        
        // Gatekeeper Login
        if (target.closest('#gkSubmitBtn')) {
            const memberId = document.getElementById('gkSubmitBtn').dataset.memberId;
            const input = document.getElementById('gkPasswordInput');
            
            // Check password manually for SPA
            if(!memberId) return alert("Select user first");
            const mem = globalData.members.find(m => m.id === memberId);
            if(mem && String(mem.password) === String(input.value)) {
                loadProfileModule(memberId);
            } else {
                alert("Incorrect Password");
            }
        }

        // Identify User
        if (target.closest('.gk-avatar') || target.closest('.gk-name')) {
            promptForDeviceVerification(globalData.members).then(id => {
                if(id) {
                    localStorage.setItem('verifiedMemberId', id);
                    const m = globalData.members.find(mem => mem.id === id);
                    if(m) {
                        document.getElementById('gkProfileName').textContent = m.name;
                        document.getElementById('gkProfileImg').src = m.displayImageUrl;
                        document.getElementById('gkJoinDate').textContent = m.joiningDate;
                        document.getElementById('gkBalance').textContent = '₹' + m.balance;
                        document.getElementById('gkSubmitBtn').dataset.memberId = id;
                    }
                }
            });
        }
        
        if (target.closest('#tcfBalanceToggleBtn')) {
            const el = document.getElementById('tcfAvailableFunds');
            el.classList.toggle('masked');
            if(!el.classList.contains('masked')) el.textContent = el.dataset.value;
            else el.textContent = '••••••';
        }
        
        if (target.closest('#quickActionSip')) showSipStatusModal(globalData.members);
        
        if (target.closest('#btnTransactionsShortcut')) {
            document.querySelector('.nav-item[data-target="tab-history"]').click();
        }
    });
}

// Global Export
window.viewImage = showFullImage;
export function openModal(modal) { modal.classList.add('show'); currentOpenModal = modal; }
export function closeModal(modal) { modal.classList.remove('show'); currentOpenModal = null; }
