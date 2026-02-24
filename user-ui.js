// user-ui.js - FINAL FULL VERSION (Restored & Upgraded)
// RESPONSIBILITY: Main UI Controller, Tab Router & Data Renderer

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
    observeElements 
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
    setupBottomNav(); // 🔥 NEW: Initialize Tabs

    // 🔥 NEW: URL se Tab Auto-Open karne ka logic
    const urlParams = new URLSearchParams(window.location.search);
    const targetTab = urlParams.get('tab');
    if (targetTab) {
        setTimeout(() => {
            const tabBtn = document.querySelector(`.nav-item[data-target="${targetTab}"]`);
            if (tabBtn) tabBtn.click();
        }, 100); // Halki si deri taaki page load ho jaye
    }

    setupPWA();
    // ...


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

    // Filter Logic: If logged in, show MY transactions, else show Global recent 20
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

    // Sort by Date (Newest First)
    displayTx.sort((a, b) => new Date(b.date) - new Date(a.date));

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

    setTextContent('gkProfileName', member.name);

    const roleEl = document.getElementById('gkProfileRole');
    if(roleEl) roleEl.style.display = member.isPrime ? 'inline-block' : 'none';

    setTextContent('gkJoinDate', member.joiningDate || '--');
    setTextContent('gkBalance', '₹' + formatNumberWithCommas(member.balance));

    // Set ID for password check
    if (elements.gkSubmitBtn) {
        elements.gkSubmitBtn.dataset.memberId = myId || '';
    }
}

function setTextContent(id, text) {
    const el = document.getElementById(id);
    if(el) el.textContent = text;
}

// --- Main Render Function (RESTORED FULL LOGIC) ---
export function renderPage(data) {
    // Update Global State
    globalData.members = data.processedMembers || [];
    globalData.penalty = data.penaltyWalletData || {};
    globalData.transactions = data.allTransactions || [];
    globalData.stats = data.communityStats || {};
    globalData.products = data.allProducts || {};
    globalData.notifications.manual = data.manualNotifications || {};
    globalData.notifications.automated = data.automatedQueue || {};

    const approvedMembers = globalData.members.filter(m => m.status === 'Approved');

    // 0. Update TCF Premium Card (Real-Time Data Injection)
    if (elements.tcfAvailableFunds) {
        elements.tcfAvailableFunds.dataset.value = formatNumberWithCommas(globalData.stats.availableCommunityBalance);

        if (!elements.tcfAvailableFunds.classList.contains('masked')) {
            elements.tcfAvailableFunds.textContent = elements.tcfAvailableFunds.dataset.value;
        }

        if (elements.tcfTotalSip) elements.tcfTotalSip.textContent = '₹' + formatNumberWithCommas(globalData.stats.totalSipAmount);
        if (elements.tcfActiveLoans) elements.tcfActiveLoans.textContent = '₹' + formatNumberWithCommas(globalData.stats.totalCurrentLoanAmount);
        if (elements.tcfReturns) elements.tcfReturns.textContent = '₹' + formatNumberWithCommas(globalData.stats.netReturnAmount);
    }

    // 1. Render Header Buttons (Hidden div support)
    displayHeaderButtons(data.headerButtons || {}, elements.headerActions, elements.staticButtons);

        // 2. Render Members (Top 3 + Others) - ONLY SHOW IMAGE ON CLICK
    displayMembers(approvedMembers, data.adminSettings || {}, elements.memberContainer, (id) => {
        const member = globalData.members.find(m => m.id === id);
        if (member) {
            showFullImage(member.displayImageUrl, member.name);
        }
    });


    // 3. Render Custom Cards & Sliders
    displayCustomCards(data.adminSettings?.custom_cards || {}, elements.customCards);
    displayCommunityLetters(data.adminSettings?.community_letters || {}, elements.letters, showFullImage);

    // 4. Update Stats & Info
    updateInfoCards(approvedMembers.length, globalData.stats.totalLoanDisbursed);
    startHeaderDisplayRotator(elements.headerDisplay, approvedMembers, globalData.stats);
    buildInfoSlider(elements.infoSlider, globalData.members);

    // 5. Render Products (Pass Callback for EMI Modal)
    renderProducts(globalData.products, elements.products, (emi, name, price) => {
        showEmiModal(emi, name, price, elements.emiModal);
    });

    // 6. Notifications
    processAndShowNotifications(globalData, elements.popupContainer);

    // 7. Animations & Icons
    if(typeof feather !== 'undefined') feather.replace();
    observeElements(document.querySelectorAll('.animate-on-scroll'));

    // --- 🔒 NEW VERIFICATION LOGIC START ---
    const verifyModal = document.getElementById('deviceVerificationModal');
    const verifiedId = localStorage.getItem('verifiedMemberId');

    // Agar ID verified nahi hai, to Pop-up dikhao
    if (!verifiedId && verifyModal) {
        verifyModal.classList.add('show'); 
        
        // Dropdown list mein naam bharo
        const select = document.getElementById('verifyNameSelect');
        if (select && select.options.length <= 1 && globalData.members) { 
            // List clear karke dobara bharo
            select.innerHTML = '<option value="">-- Select Your Name --</option>';
            
            // Members ko sort karke add karo
            [...globalData.members]
                .sort((a, b) => a.name.localeCompare(b.name))
                .forEach(m => {
                    const opt = document.createElement('option');
                    opt.value = m.id;
                    opt.textContent = m.name;
                    select.appendChild(opt);
                });
        }
    } 
    // Agar verified hai, to Pop-up hata do aur Profile update karo
    else if (verifiedId && verifyModal) {
        verifyModal.classList.remove('show');
        if (typeof renderProfileGatekeeper === 'function') {
            renderProfileGatekeeper();
        }
    }
    // --- 🔒 NEW VERIFICATION LOGIC END ---

}

// --- Event Listeners ---
function setupEventListeners(database) {
    document.body.addEventListener('click', (e) => {
        const target = e.target;

        // --- 🟢 BUTTON CLICK HANDLERS START ---
        
        // 1. LOGIN & VERIFY BUTTON (Jab user password submit kare)
        if (target.closest('#verifySubmitBtn')) {
            const select = document.getElementById('verifyNameSelect');
            const input = document.getElementById('verifyPasswordInput');
            
            const memberId = select ? select.value : null;
            const password = input ? input.value : null;

            if (!memberId) { alert("Please select your name first."); return; }
            if (!password) { alert("Please enter password."); return; }

            // Member dhoondo
            const member = globalData.members.find(m => m.id === memberId);
            
            // Password Check Karo
            if (member && String(member.password).trim() === String(password).trim()) {
                // SUCCESS: ID Save karo
                localStorage.setItem('verifiedMemberId', memberId);
                
                // Modal band karo
                const modal = document.getElementById('deviceVerificationModal');
                if(modal) modal.classList.remove('show');
                
                alert(`Welcome, ${member.name}! Verification Successful.`);
                
                // Profile Page Turant Update karo
                if (typeof renderProfileGatekeeper === 'function') renderProfileGatekeeper();
                
            } else {
                // FAIL
                alert("Incorrect Password! Please try again.");
                if(input) input.value = ''; // Password clear karo
            }
        }

        // 2. FORGOT PASSWORD (WHATSAPP REDIRECT)
        if (target.closest('#verifyForgotBtn')) {
            const select = document.getElementById('verifyNameSelect');
            const memberId = select ? select.value : null;

            // Check: Agar naam select nahi kiya
            if (!memberId) {
                alert("Please select your name from the list first, then click Forgot Password.");
                return;
            }

            // Member detail nikalo aur WhatsApp par bhejo
            const member = globalData.members.find(m => m.id === memberId);
            if (member) {
                const phone = "7903698180"; // Aapka Number
                
                // Message format
                const text = `*TCF Password Recovery*\n\n*Name:* ${member.name}\n*Issue:* I have forgotten my password.\n*Request:* Please provide me with my login password. 🔑`;
                
                const url = `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
                window.location.href = url;
            }
        }
        // --- 🟢 BUTTON CLICK HANDLERS END ---


        // --- NEW GATEKEEPER SUBMIT LOGIC ---
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

        // Close Modal Logic
        if (target.matches('.close') || target.matches('.close *') || target.classList.contains('modal')) {
            const modal = target.closest('.modal') || target;
            closeModal(modal);
        }

        // Feature: Show All Members
        if (target.closest('#totalMembersCard')) {
            showAllMembersModal(globalData.members, (id) => {
                closeModal(elements.allMembersModal);
                currentMemberForFullView = id;
                showMemberProfileModal(id, globalData.members);
            }, showFullImage);
        }

        // Feature: Full Profile View (Password Check)
        if (target.closest('#fullViewBtn')) {
            swapModals(elements.profileModal, elements.passwordModal);
        }

        // Feature: View History (Penalty)
        if (target.closest('#viewHistoryBtn')) {
            const list = document.getElementById('penaltyHistoryList');
            const btn = target.closest('#viewHistoryBtn');
            const isHidden = list.style.display === 'none' || list.style.display === '';
            list.style.display = isHidden ? 'block' : 'none';
            btn.textContent = isHidden ? 'Hide History' : 'View History';
        }

        // Feature: Profile Image Zoom
        if (target.closest('#profileModalHeader')) {
            const img = document.getElementById('profileModalImage');
            const name = document.getElementById('profileModalName');
            if (img && name) showFullImage(img.src, name.textContent);
        }

        // Feature: Submit Password (Existing Modal)
        if (target.closest('#submitPasswordBtn')) {
            handlePasswordCheck(database, currentMemberForFullView);
        }

        // --- TCF CARD LOGIC ---
        // Eye Icon Toggle Logic (Hide/Show Balance)
        if (target.closest('#tcfBalanceToggleBtn')) {
            const amountEl = elements.tcfAvailableFunds;
            const iconEl = elements.tcfEyeIcon;

            if (amountEl.classList.contains('masked')) {
                // Show Real Balance with 2s Animation
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

                    if (progress < 1) {
                        window.requestAnimationFrame(step);
                    } else {
                        amountEl.textContent = targetValueStr; 
                    }
                };
                window.requestAnimationFrame(step);

            } else {
                amountEl.classList.add('masked');
                amountEl.textContent = '••••••';
                iconEl.setAttribute('data-feather', 'eye-off');
            }
            if(typeof feather !== 'undefined') feather.replace();
        }

        // Naye 4 Bottom Buttons Route Mapping (Quick Actions Fallback)
        if (target.closest('#btnQr')) window.location.href = 'qr.html';
        if (target.closest('#btnSip')) showSipStatusModal(globalData.members);
        if (target.closest('#btnLoan')) window.location.href = 'loan_dashbord.html';
        if (target.closest('#btnHistory')) {
             document.querySelector('.nav-item[data-target="tab-history"]').click();
        }

        // --- OLD BUTTONS LOGIC ---
        if (target.closest('#viewBalanceBtn')) {
            balanceClickSound.play().catch(console.warn);
            showBalanceModal(globalData.stats);
        }

        if (target.closest('#viewPenaltyWalletBtn')) {
            showPenaltyWalletModal(globalData.penalty, globalData.stats.totalPenaltyBalance);
        }

        if (target.closest('#notificationBtn')) {
            window.location.href = 'notifications.html';
        }
    });

    // Keyboard Events
    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') document.querySelectorAll('.modal.show').forEach(closeModal);
        if (e.key === 'Enter' && document.getElementById('passwordInput') === document.activeElement) {
            handlePasswordCheck(database, currentMemberForFullView);
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