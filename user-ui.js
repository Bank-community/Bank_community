// user-ui.js - PART 1 of 3 (Main Controller)
// UPDATED: Added Bottom Nav Router & Gatekeeper Logic

import { 
    displayHeaderButtons, 
    displayMembers, 
    renderProducts, 
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
    observeElements,
    Analytics 
} from './ui-helpers.js';

// --- Global State ---
let globalData = {
    members: [],
    penalty: {},
    transactions: [],
    stats: {},
    products: {},
    notifications: { manual: {}, automated: {} }
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

    // NEW: Gatekeeper Elements
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
    setupBottomNav(); // 🔥 NEW: Initialize Bottom Navigation
    setupPWA();

    setTimeout(() => {
        document.querySelectorAll('.animate-on-scroll').forEach(el => el.classList.add('is-visible'));
    }, 500);

    if (elements.year) elements.year.textContent = new Date().getFullYear();

    window.onpopstate = function(event) {
        if (currentOpenModal) {
            currentOpenModal.classList.remove('show');
            document.body.style.overflow = '';
            currentOpenModal = null;
        }
    };
}

// --- 🔥 NEW: Bottom Navigation Router Logic ---
function setupBottomNav() {
    const navItems = document.querySelectorAll('.nav-item');
    const tabs = document.querySelectorAll('.app-tab');

    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            // Prevent click on "Apply" center button (it has its own onclick in HTML)
            if (item.querySelector('.nav-center-btn')) return;

            const targetId = item.getAttribute('data-target');
            if (!targetId) return;

            // 1. Update Active State in Nav
            navItems.forEach(nav => nav.classList.remove('active'));
            item.classList.add('active');

            // 2. Hide all tabs, Show Target Tab
            tabs.forEach(tab => {
                tab.classList.remove('active-tab');
                if (tab.id === targetId) {
                    tab.classList.add('active-tab');

                    // 3. Trigger Data Load for specific tabs
                    if (targetId === 'tab-history') renderHistoryTab();
                    if (targetId === 'tab-profile') renderProfileGatekeeper();
                }
            });

            // 4. Re-init Icons
            if(typeof feather !== 'undefined') feather.replace();
            window.scrollTo(0, 0);
        });
    });
}

// --- 🔥 NEW: Render History Tab (Instant Load) ---
function renderHistoryTab() {
    const container = document.getElementById('historyListContainer');
    if (!container) return;

    // Get verified user ID
    const myId = localStorage.getItem('verifiedMemberId');
    const transactions = globalData.transactions || [];

    // Filter Logic: If logged in, show MY transactions, else show Global recent 10
    let displayTx = [];
    if (myId) {
        displayTx = transactions.filter(t => t.memberId === myId);
    } else {
        displayTx = transactions.slice(0, 20); // Show top 20 recent
    }

    if (displayTx.length === 0) {
        container.innerHTML = '<div style="text-align:center; padding:20px; color:#aaa;">No transactions found.</div>';
        return;
    }

    container.innerHTML = '';
    displayTx.forEach(tx => {
        const isIncome = ['SIP', 'Extra Payment', 'Loan Return'].includes(tx.type);
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

// --- 🔥 NEW: Render Profile Gatekeeper ---
function renderProfileGatekeeper() {
    const myId = localStorage.getItem('verifiedMemberId');

    // Default "Guest" View
    let member = {
        name: "Guest User",
        displayImageUrl: "https://cdn-icons-png.flaticon.com/512/149/149071.png",
        isPrime: false,
        joiningDate: "--",
        balance: 0
    };

    // If identified, find real data
    if (myId && globalData.members) {
        const found = globalData.members.find(m => m.id === myId);
        if (found) member = found;
    }

    // Update UI
    const imgEl = document.getElementById('gkProfileImg');
    if (imgEl) imgEl.src = member.displayImageUrl;

    document.getElementById('gkProfileName').textContent = member.name;
    document.getElementById('gkProfileRole').style.display = member.isPrime ? 'inline-block' : 'none';
    document.getElementById('gkJoinDate').textContent = member.joiningDate || '--';
    document.getElementById('gkBalance').textContent = '₹' + formatNumberWithCommas(member.balance);

    // Set ID for password check
    if (elements.gkSubmitBtn) {
        elements.gkSubmitBtn.dataset.memberId = myId || '';
    }
}

// --- Main Render Function ---
export function renderPage(data) {
    globalData = data; // Update State

    const approvedMembers = (globalData.members || []).filter(m => m.status === 'Approved');

    // 0. Update TCF Card
    if (elements.tcfAvailableFunds) {
        elements.tcfAvailableFunds.dataset.value = formatNumberWithCommas(globalData.stats.availableCommunityBalance);
        if (!elements.tcfAvailableFunds.classList.contains('masked')) {
            elements.tcfAvailableFunds.textContent = elements.tcfAvailableFunds.dataset.value;
        }
        if (elements.tcfTotalSip) elements.tcfTotalSip.textContent = '₹' + formatNumberWithCommas(globalData.stats.totalSipAmount);
        if (elements.tcfActiveLoans) elements.tcfActiveLoans.textContent = '₹' + formatNumberWithCommas(globalData.stats.totalCurrentLoanAmount);
        if (elements.tcfReturns) elements.tcfReturns.textContent = '₹' + formatNumberWithCommas(globalData.stats.netReturnAmount);
    }

    // 1. Render Header Buttons
    displayHeaderButtons(data.headerButtons || {}, elements.headerActions, elements.staticButtons);

    // 2. Render Members
    displayMembers(approvedMembers, data.adminSettings || {}, elements.memberContainer, (id) => {
        currentMemberForFullView = id;
        showMemberProfileModal(id, globalData.members);
    });

    // 3. Components
    displayCustomCards(data.adminSettings?.custom_cards || {}, elements.customCards);
    displayCommunityLetters(data.adminSettings?.community_letters || {}, elements.letters, showFullImage);
    updateInfoCards(approvedMembers.length, globalData.stats.totalLoanDisbursed);
    startHeaderDisplayRotator(elements.headerDisplay, approvedMembers, globalData.stats);
    buildInfoSlider(elements.infoSlider, globalData.members);
    renderProducts(globalData.products, elements.products, (emi, name, price) => {
        showEmiModal(emi, name, price, elements.emiModal);
    });

    processAndShowNotifications(globalData, elements.popupContainer);

    if(typeof feather !== 'undefined') feather.replace();
    observeElements(document.querySelectorAll('.animate-on-scroll'));
}

// --- Event Listeners ---
function setupEventListeners(database) {
    document.body.addEventListener('click', (e) => {
        const target = e.target;

        // --- NEW GATEKEEPER SUBMIT LOGIC ---
        if (target.closest('#gkSubmitBtn')) {
            const btn = document.getElementById('gkSubmitBtn');
            const input = document.getElementById('gkPasswordInput');
            const memberId = btn.dataset.memberId;

            if (!memberId || memberId === 'null') {
                alert("Please select your identity first (Click on your photo in Home List)");
                promptForDeviceVerification(globalData.members).then(id => {
                    if(id) renderProfileGatekeeper();
                });
                return;
            }

            const member = globalData.members.find(m => m.id === memberId);
            if (member && String(member.password).trim() === String(input.value).trim()) {
                // Success! Redirect
                window.location.href = `view.html?memberId=${memberId}`;
            } else {
                alert("Incorrect Password!");
                input.value = '';
            }
        }

        // --- NEW QUICK ACTIONS MAPPING ---
        if (target.closest('#quickActionSip')) {
            showSipStatusModal(globalData.members);
        }

        // Modal & Other Click Logic (Existing)
        if (target.matches('.close') || target.matches('.close *') || target.classList.contains('modal')) {
            const modal = target.closest('.modal') || target;
            closeModal(modal);
        }
        if (target.closest('#totalMembersCard')) {
            showAllMembersModal(globalData.members, (id) => {
                closeModal(elements.allMembersModal);
                currentMemberForFullView = id;
                showMemberProfileModal(id, globalData.members);
            }, showFullImage);
        }
        if (target.closest('#fullViewBtn')) {
            swapModals(elements.profileModal, elements.passwordModal);
        }
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
        if (target.closest('#submitPasswordBtn')) {
            handlePasswordCheck(database, currentMemberForFullView);
        }

        // TCF Card Toggle
        if (target.closest('#tcfBalanceToggleBtn')) {
            const amountEl = elements.tcfAvailableFunds;
            const iconEl = elements.tcfEyeIcon;
            if (amountEl.classList.contains('masked')) {
                amountEl.classList.remove('masked');
                iconEl.setAttribute('data-feather', 'eye');
                balanceClickSound.play().catch(console.warn);
                const targetVal = amountEl.dataset.value || '0';
                amountEl.textContent = targetVal;
            } else {
                amountEl.classList.add('masked');
                amountEl.textContent = '••••••';
                iconEl.setAttribute('data-feather', 'eye-off');
            }
            if(typeof feather !== 'undefined') feather.replace();
        }

        // Naye Button Mapping
        if (target.closest('#btnQr')) window.location.href = 'qr.html';
        if (target.closest('#btnSip')) showSipStatusModal(globalData.members);
        if (target.closest('#btnLoan')) window.location.href = 'loan_dashbord.html';
        if (target.closest('#btnHistory')) {
            // Switch to history tab instead of page reload
            document.querySelector('.nav-item[data-target="tab-history"]').click();
        }

        if (target.closest('#viewBalanceBtn')) {
            balanceClickSound.play().catch(console.warn);
            showBalanceModal(globalData.stats);
        }
        if (target.closest('#viewPenaltyWalletBtn')) {
            showPenaltyWalletModal(globalData.penalty, globalData.stats.totalPenaltyBalance);
        }
    });
}

// --- Core Modal Logic ---
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
