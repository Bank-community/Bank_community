// user-ui.js - FINAL FULL VERSION (With SIP & Loan Stats in Profile)
// RESPONSIBILITY: Main UI Controller, Tab Router & Data Renderer

import { 
    displayHeaderButtons, 
    displayMembers, 
    renderProducts,
    displayAllRankedMembers, 
    displayCustomCards, 
    displayCommunityLetters, 
    buildInfoSlider, 
    startHeaderDisplayRotator,
    updateInfoCards 
} from './ui-components.js';

import { 
    processAndShowNotifications, 
    promptForDeviceVerification, 
    requestNotificationPermission, 
    showSipStatusModal, 
    showPenaltyWalletModal, 
    showAllMembersModal, 
    showMemberProfileModal, 
    showBalanceModal, 
    showEmiModal, 
    showFullImage, 
    handlePasswordCheck, 
    observeElements 
} from './ui-helpers.js';

// --- Global State ---
let globalData = {
    members: [],
    penalty: {},
    transactions: [],
    stats: {},
    products: {},
    notifications: { manual: {}, automated: {} },
    activeLoans: {} // 🔥 NEW: Store Loans Globally
};

let currentMemberForFullView = null;
let currentOpenModal = null;
const balanceClickSound = new Audio('/mixkit-clinking-coins-1993.wav');

// --- Element Cache ---
const getElement = (id) => document.getElementById(id);
export const elements = {
    memberContainer: getElement('memberContainer'),
    headerActions: getElement('headerActionsContainer'),
    staticButtons: getElement('staticHeaderButtons'),
    customCards: getElement('customCardsContainer'),
    letters: getElement('communityLetterSlides'),
    totalMembers: getElement('totalMembersValue'),
    totalLoan: getElement('totalLoanValue'),
    year: getElement('currentYear'),
    headerDisplay: getElement('headerDisplay'),
    infoSlider: getElement('infoSlider'),
    products: getElement('productsContainer'),

    // TCF Card Elements
    tcfAvailableFunds: getElement('tcfAvailableFunds'),
    tcfTotalSip: getElement('tcfTotalSip'),
    tcfActiveLoans: getElement('tcfActiveLoans'),
    tcfReturns: getElement('tcfReturns'),
    tcfBalanceToggleBtn: getElement('tcfBalanceToggleBtn'),
    tcfEyeIcon: getElement('tcfEyeIcon'),

    // Modals
    balanceModal: getElement('balanceModal'),
    penaltyModal: getElement('penaltyWalletModal'),
    profileModal: getElement('memberProfileModal'),
    sipModal: getElement('sipStatusModal'),
    allMembersModal: getElement('allMembersModal'),
    passwordModal: getElement('passwordPromptModal'),
    imageModal: getElement('imageModal'),
    verifyModal: getElement('deviceVerificationModal'),
    emiModal: getElement('emiModal'),
    popupContainer: getElement('notification-popup-container'),
    rankedModal: getElement('rankedMembersModal'), // <--- NAYA
    rankedGrid: getElement('rankedMembersGrid'),   // <--- NAYA

    // Gatekeeper Elements
    gkSubmitBtn: getElement('gkSubmitBtn'),
    gkPasswordInput: getElement('gkPasswordInput')
};

// --- Helper: Format Number ---
function formatNumberWithCommas(amount) {
    return (amount || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 });
}

// --- Initialization ---
export function initUI(database) {
    setupEventListeners(database);
    setupBottomNav(); 

    // Auto-Open Tab from URL
    const urlParams = new URLSearchParams(window.location.search);
    const targetTab = urlParams.get('tab');
    if (targetTab) {
        setTimeout(() => {
            const tabBtn = document.querySelector(`.nav-item[data-target="${targetTab}"]`);
            if (tabBtn) tabBtn.click();
        }, 100); 
    }

    setupPWA();

    // Initial Animation Check
    setTimeout(() => {
        document.querySelectorAll('.animate-on-scroll').forEach(el => el.classList.add('is-visible'));
    }, 500);

    if (elements.year) elements.year.textContent = new Date().getFullYear();

    // Back Button Handling
    window.onpopstate = function(event) {
        if (currentOpenModal) {
            currentOpenModal.classList.remove('show');
            document.body.style.overflow = '';
            currentOpenModal = null;
        }
    };
}

// --- Bottom Navigation Router Logic ---
function setupBottomNav() {
    const navItems = document.querySelectorAll('.nav-item');
    const tabs = document.querySelectorAll('.app-tab');

    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            if (item.querySelector('.nav-center-btn')) return;

            const targetId = item.getAttribute('data-target');
            if (!targetId) return;

            // 1. Update Active State
            navItems.forEach(nav => nav.classList.remove('active'));
            item.classList.add('active');

            // 2. Show Target Tab
            tabs.forEach(tab => {
                tab.classList.remove('active-tab');
                if (tab.id === targetId) {
                    tab.classList.add('active-tab');
                    if (targetId === 'tab-history') renderHistoryTab();
                    if (targetId === 'tab-profile') renderProfileGatekeeper();
                }
            });

            if(typeof feather !== 'undefined') feather.replace();
            window.scrollTo(0, 0);
        });
    });
}

// --- Render History Tab ---
function renderHistoryTab() {
    const container = document.getElementById('historyListContainer');
    if (!container) return;

    const myId = localStorage.getItem('verifiedMemberId');
    const transactions = globalData.transactions || [];

    let displayTx = [];
    if (myId) {
        displayTx = transactions.filter(t => t.memberId === myId);
    } else {
        displayTx = transactions.slice(0, 20); 
    }

    if (displayTx.length === 0) {
        container.innerHTML = '<div style="text-align:center; padding:20px; color:#aaa;">No transactions found.</div>';
        return;
    }

    displayTx.sort((a, b) => new Date(b.date) - new Date(a.date));

    container.innerHTML = '';
    displayTx.forEach(tx => {
        const isIncome = ['SIP', 'Extra Payment', 'Loan Return', 'Loan Payment'].includes(tx.type);

        const colorClass = isIncome ? 'income' : 'expense';
        const symbol = isIncome ? '+' : '-';

        container.innerHTML += `
            <div class="history-list-item ${colorClass}">
                <div>
                    <strong style="display:block; font-size:0.9em; color:#333;">${tx.type || 'Transaction'}</strong>
                    <span style="font-size:0.75em; color:#888;">${tx.date || 'N/A'}</span>
                </div>
                <div style="text-align:right;">
                    <strong style="display:block; color:${isIncome ? '#28a745' : '#dc3545'}">
                        ${symbol} ₹${formatNumberWithCommas(tx.amount)}
                    </strong>
                    <span style="font-size:0.7em; color:#aaa;">${tx.status || 'Success'}</span>
                </div>
            </div>
        `;
    });
}

// --- Render Profile Gatekeeper ---
function renderProfileGatekeeper() {
    const myId = localStorage.getItem('verifiedMemberId');

    let member = {
        name: "Guest User",
        displayImageUrl: "https://i.ibb.co/HTNrbJxD/20250716-222246.png",
        isPrime: false,
        joiningDate: null,
        balance: 0,
        id: null
    };

    if (myId && globalData.members) {
        const found = globalData.members.find(m => m.id === myId);
        if (found) member = found;
    }

    const imgEl = document.getElementById('gkProfileImg');
    if (imgEl) imgEl.src = member.displayImageUrl;
    setTextContent('gkProfileName', member.name);

    const roleEl = document.getElementById('gkProfileRole');
    if(roleEl) {
        roleEl.style.display = member.isPrime ? 'inline-block' : 'none';
    }

    let daysText = '-- Days';
    if (member.joiningDate && member.joiningDate !== '--') {
        const joinDate = new Date(member.joiningDate);
        const today = new Date();
        const diffTime = Math.abs(today - joinDate);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
        daysText = `${diffDays} Days`;
    }
    setTextContent('gkTotalDays', daysText);

    const balEl = document.getElementById('gkBalance');
    if(balEl) {
        balEl.textContent = '₹' + formatNumberWithCommas(member.balance);
        balEl.className = `stat-value ${member.balance >= 0 ? 'text-green' : 'text-red'}`;
    }

    let activeLoanAmt = 0;
    if (member.id && globalData.activeLoans) {
        Object.values(globalData.activeLoans).forEach(l => {
            if (l.memberId === member.id && l.status === 'Active') {
                activeLoanAmt += parseFloat(l.outstandingAmount || l.amount || 0);
            }
        });
    }
    const loanEl = document.getElementById('gkActiveLoan');
    if (loanEl) {
        loanEl.textContent = '₹' + formatNumberWithCommas(activeLoanAmt);
        loanEl.style.color = activeLoanAmt > 0 ? '#dc3545' : '#28a745';
    }

    const sipEl = document.getElementById('gkSipStatus');
    if (sipEl) {
        const isPaid = member.sipStatus?.paid;
        sipEl.innerHTML = isPaid 
            ? '<span style="color:#28a745; font-weight:800;">Paid ✅</span>' 
            : '<span style="color:#dc3545; font-weight:800;">Pending ❌</span>';
    }

    if (elements.gkSubmitBtn) {
        elements.gkSubmitBtn.dataset.memberId = myId || '';
    }
}

function setTextContent(id, text) {
    const el = document.getElementById(id);
    if(el) el.textContent = text;
}

// --- Main Render Function ---
export function renderPage(data) {
    globalData.members = data.processedMembers || [];
    globalData.penalty = data.penaltyWalletData || {};
    globalData.transactions = data.allTransactions || [];
    globalData.stats = data.communityStats || {};
    globalData.products = data.allProducts || {};
    globalData.notifications.manual = data.manualNotifications || {};
    globalData.notifications.automated = data.automatedQueue || {};
    globalData.activeLoans = data.rawActiveLoans || {}; 

    const approvedMembers = globalData.members.filter(m => m.status === 'Approved');

    if (elements.tcfAvailableFunds) {
        elements.tcfAvailableFunds.dataset.value = formatNumberWithCommas(globalData.stats.availableCommunityBalance);
        if (!elements.tcfAvailableFunds.classList.contains('masked')) {
            elements.tcfAvailableFunds.textContent = elements.tcfAvailableFunds.dataset.value;
        }
        if (elements.tcfTotalSip) elements.tcfTotalSip.textContent = '₹' + formatNumberWithCommas(globalData.stats.totalSipAmount);
        if (elements.tcfActiveLoans) elements.tcfActiveLoans.textContent = '₹' + formatNumberWithCommas(globalData.stats.totalCurrentLoanAmount);
        if (elements.tcfReturns) elements.tcfReturns.textContent = '₹' + formatNumberWithCommas(globalData.stats.netReturnAmount);
    }

    displayHeaderButtons(data.headerButtons || {}, elements.headerActions, elements.staticButtons);

    displayMembers(approvedMembers, data.adminSettings || {}, elements.memberContainer, (id) => {
        const member = globalData.members.find(m => m.id === id);
        if (member) showFullImage(member.displayImageUrl, member.name);
    });

    displayCustomCards(data.adminSettings?.custom_cards || {}, elements.customCards);
    displayCommunityLetters(data.adminSettings?.community_letters || {}, elements.letters, showFullImage);

    updateInfoCards(approvedMembers.length, globalData.stats.totalLoanDisbursed);
    startHeaderDisplayRotator(elements.headerDisplay, approvedMembers, globalData.stats);
    buildInfoSlider(elements.infoSlider, globalData.members);

    renderProducts(globalData.products, elements.products, (emi, name, price) => {
        showEmiModal(emi, name, price, elements.emiModal);
    });

    processAndShowNotifications(globalData, elements.popupContainer);

    renderEcosystemChart();

    if(typeof feather !== 'undefined') feather.replace();
    observeElements(document.querySelectorAll('.animate-on-scroll'));

    const verifyModal = document.getElementById('deviceVerificationModal');
    const verifiedId = localStorage.getItem('verifiedMemberId');

    if (!verifiedId && verifyModal) {
        verifyModal.classList.add('show'); 
        const select = document.getElementById('verifyNameSelect');
        if (select && select.options.length <= 1 && globalData.members) { 
            select.innerHTML = '<option value="">-- Select Your Name --</option>';
            [...globalData.members]
                .sort((a, b) => a.name.localeCompare(b.name))
                .forEach(m => {
                    const opt = document.createElement('option');
                    opt.value = m.id;
                    opt.textContent = m.name;
                    select.appendChild(opt);
                });
        }
    } else if (verifiedId && verifyModal) {
        verifyModal.classList.remove('show');
        if (typeof renderProfileGatekeeper === 'function') {
            renderProfileGatekeeper();
        }
    }
}

// --- Event Listeners ---
function setupEventListeners(database) {
    document.body.addEventListener('click', (e) => {
        const target = e.target;

        if (target.closest('#verifySubmitBtn')) {
            const select = document.getElementById('verifyNameSelect');
            const input = document.getElementById('verifyPasswordInput');

            const memberId = select ? select.value : null;
            const password = input ? input.value : null;

            if (!memberId) { alert("Please select your name first."); return; }
            if (!password) { alert("Please enter password."); return; }

            const member = globalData.members.find(m => m.id === memberId);

            if (member && String(member.password).trim() === String(password).trim()) {
                localStorage.setItem('verifiedMemberId', memberId);
                const modal = document.getElementById('deviceVerificationModal');
                if(modal) modal.classList.remove('show');
                alert(`Welcome, ${member.name}! Verification Successful.`);
                if (typeof renderProfileGatekeeper === 'function') renderProfileGatekeeper();
            } else {
                alert("Incorrect Password! Please try again.");
                if(input) input.value = ''; 
            }
        }

        if (target.closest('.profile-image-container') || target.closest('#gkProfileImg')) {
            const img = document.getElementById('gkProfileImg');
            const name = document.getElementById('gkProfileName');
            if (img && name) showFullImage(img.src, name.textContent);
        }

        if (target.closest('#verifyForgotBtn')) {
            const select = document.getElementById('verifyNameSelect');
            const memberId = select ? select.value : null;
            if (!memberId) {
                alert("Please select your name from the list first, then click Forgot Password.");
                return;
            }
            const member = globalData.members.find(m => m.id === memberId);
            if (member) {
                const phone = "7903698180"; 
                const text = `*TCF Password Recovery*\n\n*Name:* ${member.name}\n*Issue:* I have forgotten my password.\n*Request:* Please provide me with my login password. 🔑`;
                window.location.href = `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
            }
        }

        if (target.closest('#gkSubmitBtn')) {
            const btn = document.getElementById('gkSubmitBtn');
            const input = document.getElementById('gkPasswordInput');
            const memberId = btn.dataset.memberId;

            if (!memberId || memberId === 'null') {
                alert("Please select your identity first (Click on your photo in Home List)");
                promptForDeviceVerification(globalData.members).then(id => {
                    if(id) {
                        localStorage.setItem('verifiedMemberId', id);
                        renderProfileGatekeeper();
                    }
                });
                return;
            }

            const member = globalData.members.find(m => m.id === memberId);
            if (member && String(member.password).trim() === String(input.value).trim()) {
                window.location.href = `view.html?memberId=${memberId}`;
            } else {
                alert("Incorrect Password!");
                input.value = '';
            }
        }

        if (target.closest('#quickActionSip')) showSipStatusModal(globalData.members);

        if (target.matches('.close') || target.matches('.close *') || target.classList.contains('modal')) {
            const modal = target.closest('.modal') || target;
            closeModal(modal);
        }



        if (target.closest('#fullViewBtn')) swapModals(elements.profileModal, elements.passwordModal);

        if (target.closest('#viewHistoryBtn')) {
            const list = document.getElementById('penaltyHistoryList');
            const btn = target.closest('#viewHistoryBtn');
            const isHidden = list.style.display === 'none' || list.style.display === '';
            list.style.display = isHidden ? 'block' : 'none';
            btn.textContent = isHidden ? 'Hide History' : 'View History';
        }

        if (target.closest('#profileModalHeader')) {
            const img = document.getElementById('profileModalImage');
            const name = document.getElementById('profileModalName');
            if (img && name) showFullImage(img.src, name.textContent);
        }

        if (target.closest('#submitPasswordBtn')) handlePasswordCheck(database, currentMemberForFullView);

        if (target.closest('#tcfBalanceToggleBtn')) {
            const amountEl = elements.tcfAvailableFunds;
            const iconEl = elements.tcfEyeIcon;

            if (amountEl.classList.contains('masked')) {
                amountEl.classList.remove('masked');
                iconEl.setAttribute('data-feather', 'eye');
                balanceClickSound.play().catch(console.warn);

                const targetValueStr = amountEl.dataset.value || '0';
                const endValue = parseInt(targetValueStr.replace(/,/g, '')) || 0; 
                const duration = 1000;
                let startTimestamp = null;

                const step = (timestamp) => {
                    if (!startTimestamp) startTimestamp = timestamp;
                    const progress = Math.min((timestamp - startTimestamp) / duration, 1);
                    const currentVal = Math.floor(progress * endValue);
                    amountEl.textContent = formatNumberWithCommas(currentVal);

                    if (progress < 1) window.requestAnimationFrame(step);
                    else amountEl.textContent = targetValueStr; 
                };
                window.requestAnimationFrame(step);

            } else {
                amountEl.classList.add('masked');
                amountEl.textContent = '••••••';
                iconEl.setAttribute('data-feather', 'eye-off');
            }
            if(typeof feather !== 'undefined') feather.replace();
        }

        if (target.closest('#btnQr')) window.location.href = 'qr.html';
        if (target.closest('#btnSip')) showSipStatusModal(globalData.members);
        if (target.closest('#btnLoan')) window.location.href = 'loan_dashbord.html';

        if (target.closest('#btnHistory')) {
             document.querySelector('.nav-item[data-target="tab-history"]').click();
        }

        if (target.closest('#viewBalanceBtn')) {
            balanceClickSound.play().catch(console.warn);
            showBalanceModal(globalData.stats);
        }

        if (target.closest('#viewPenaltyWalletBtn')) showPenaltyWalletModal(globalData.penalty, globalData.stats.totalPenaltyBalance);
        if (target.closest('#notificationBtn')) window.location.href = 'notifications.html';

        // --- NEW: View All Ranked Members Button Logic ---
        if (target.closest('#viewAllRankedBtn')) {
            const approvedMembers = globalData.members.filter(m => m.status === 'Approved');
            displayAllRankedMembers(approvedMembers, {}, elements.rankedGrid, (imgSrc, name) => {
                showFullImage(imgSrc, name); // Image zoom karne ke liye
            });
            openModal(elements.rankedModal);
        }

        // --- NEW: Close Ranked Members Modal ---
        if (target.closest('#closeRankedModal')) {
            closeModal(elements.rankedModal);
        }

    }); 

    // --- NEW: Live Search Filter for Ranked Members ---
    const rankedSearchInput = document.getElementById('rankedSearchInput');
    if (rankedSearchInput) {
        rankedSearchInput.addEventListener('input', (e) => {
            const searchTerm = e.target.value.toLowerCase();
            const cards = document.querySelectorAll('.scaled-card-wrapper');

            cards.forEach(card => {
                const memberName = card.dataset.name || "";
                if (memberName.includes(searchTerm)) {
                    card.style.display = 'flex';
                } else {
                    card.style.display = 'none';
                }
            });
        });
    }

    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') document.querySelectorAll('.modal.show').forEach(closeModal);
        if (e.key === 'Enter' && document.getElementById('passwordInput') === document.activeElement) {
            handlePasswordCheck(database, currentMemberForFullView);
        }
    });
}

export function openModal(modal) { 
    if (modal) { 
        modal.classList.add('show'); 
        document.body.style.overflow = 'hidden'; 
        window.history.pushState({modalOpen: true}, "", "");
        currentOpenModal = modal;
    } 
}

export function closeModal(modal) { 
    if (modal) { 
        modal.classList.remove('show'); 
        document.body.style.overflow = ''; 
        currentOpenModal = null;
        if (window.history.state && window.history.state.modalOpen) {
            window.history.back();
        }
    } 
}

function swapModals(fromModal, toModal) {
    if (fromModal) fromModal.classList.remove('show');
    if (toModal) {
        toModal.classList.add('show');
        currentOpenModal = toModal;
    }
}

function setupPWA() {
    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        const btn = document.getElementById('installAppBtn');
        if (btn) {
            btn.style.display = 'inline-flex';
            btn.onclick = async () => {
                e.prompt();
                await e.userChoice;
                btn.style.display = 'none';
            };
        }
    });
}

// --- ECOSYSTEM CHART LOGIC (IN vs OUT) ---
function renderEcosystemChart() {
    const ctx = document.getElementById('ecosystemChart');
    const slider = document.getElementById('ecoTimeSlider');
    if (!ctx || !slider) return;

    function updateChart() {
        const txs = globalData.transactions || [];
        const mode = parseInt(slider.value); 
        const now = new Date();
        let cutoffDate = new Date();

        if (mode === 0) cutoffDate = new Date(now.getFullYear(), now.getMonth(), 1); 
        else if (mode === 1) cutoffDate.setMonth(now.getMonth() - 3);
        else if (mode === 2) cutoffDate.setMonth(now.getMonth() - 6);
        else if (mode === 3) cutoffDate.setFullYear(now.getFullYear() - 1);
        else cutoffDate = new Date(2000, 0, 1); 

        document.querySelectorAll('.eco-filter-labels span').forEach((el, idx) => el.classList.toggle('active', idx == mode));

        let totalIn = 0; let totalOut = 0;
        let chartLabels = []; let chartData = []; let runningBalance = 0;

        const filteredTxs = txs.filter(t => new Date(t.date || t.timestamp) >= cutoffDate)
                               .sort((a,b) => new Date(a.date || a.timestamp) - new Date(b.date || b.timestamp));

        filteredTxs.forEach(tx => {
            let amt = parseFloat(tx.amount || 0);
            let addedToGraph = false;

            if (tx.type === 'SIP') {
                totalIn += amt; runningBalance += amt; addedToGraph = true;
            } else if (tx.type === 'Loan Payment') {
                let pPaid = parseFloat(tx.principalPaid || 0);
                let iPaid = parseFloat(tx.interestPaid || 0);
                let paid = (pPaid + iPaid > 0) ? (pPaid + iPaid) : amt;
                totalIn += paid; runningBalance += paid; addedToGraph = true;
            } 
            else if (tx.type === 'Loan Taken' || (tx.type && tx.type.includes('Withdraw'))) {
                totalOut += amt; runningBalance -= amt; addedToGraph = true;
            }

            if (addedToGraph) {
                const d = new Date(tx.date || tx.timestamp);
                chartLabels.push(d.getDate() + ' ' + d.toLocaleString('default', {month:'short'}));
                chartData.push(runningBalance);
            }
        });

        let growth = 0;
        if (totalIn > 0) growth = ((totalIn - totalOut) / totalIn) * 100;

        const growthBadge = document.getElementById('ecoGrowthBadge');
        growthBadge.textContent = (growth >= 0 ? '+' : '') + growth.toFixed(2) + '%';
        growthBadge.className = 'eco-growth ' + (growth >= 0 ? '' : 'negative');

        document.getElementById('ecoTotalIn').textContent = '₹' + Math.round(totalIn).toLocaleString('en-IN');
        document.getElementById('ecoTotalOut').textContent = '₹' + Math.round(totalOut).toLocaleString('en-IN');

        if(window.ecosystemChartInstance) window.ecosystemChartInstance.destroy();
        if(chartData.length === 0) { chartLabels = ['No Data']; chartData = [0]; }

        window.ecosystemChartInstance = new Chart(ctx, {
            type: 'line',
            data: {
                labels: chartLabels,
                datasets: [{
                    data: chartData,
                    borderColor: '#D4AF37', backgroundColor: 'rgba(212, 175, 55, 0.1)',
                    borderWidth: 3, fill: true, tension: 0.4, pointRadius: 0, pointHoverRadius: 6
                }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: { x: { display: false }, y: { display: false } },
                interaction: { mode: 'index', intersect: false }
            }
        });
    }

    slider.oninput = updateChart;
    document.querySelectorAll('.eco-filter-labels span').forEach((el, idx) => {
        el.onclick = () => { slider.value = idx; updateChart(); }
    });
    updateChart(); 
}