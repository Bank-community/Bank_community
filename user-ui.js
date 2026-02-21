// user-ui.js - PART 1 of 3 (Main Controller)
// RESPONSIBILITY: State Management, Event Handling, & Orchestration
// DEPENDENCIES: ui-components.js, ui-helpers.js

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
    // Dynamic
    popupContainer: getElement('notification-popup-container')
};

// --- Initialization ---
export function initUI(database) {
    setupEventListeners(database);
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

// --- Main Render Function ---
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

    // 1. Render Header Buttons
    displayHeaderButtons(data.headerButtons || {}, elements.headerActions, elements.staticButtons);

    // 2. Render Members (Top 3 + Others)
    displayMembers(approvedMembers, data.adminSettings || {}, elements.memberContainer, (id) => {
        currentMemberForFullView = id;
        showMemberProfileModal(id, globalData.members);
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

    // 7. Animations
    if(typeof feather !== 'undefined') feather.replace();
    observeElements(document.querySelectorAll('.animate-on-scroll'));
}

// --- Event Listeners ---
function setupEventListeners(database) {
    document.body.addEventListener('click', (e) => {
        const target = e.target;

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
        
        // Feature: Submit Password
        if (target.closest('#submitPasswordBtn')) {
            handlePasswordCheck(database, currentMemberForFullView);
        }
        
        // Dynamic Buttons (ID based)
        if (target.closest('#sipStatusBtn')) showSipStatusModal(globalData.members);
        
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
