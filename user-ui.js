// user-ui.js - PART 1 (Main Controller)
// FINAL STRICT UPDATE V6: SPLIT VERSION
// 1. Controller Logic: Handles State, Modals, and Events.
// 2. Imports: Renders UI components from ui-components.js.

import { 
    renderProducts, 
    displayCustomCards, 
    displayCommunityLetters, 
    buildInfoSlider, 
    startHeaderDisplayRotator, 
    showPopupNotification 
} from './ui-components.js';

// --- Global Variables & Element Cache ---
let allMembersData = [];
let penaltyWalletData = {};
let allTransactions = [];
let communityStats = {};
let cardColors = {};
let allManualNotifications = {};
let allAutomatedQueue = {};
let allProducts = {};
let currentMemberForFullView = null;
let deferredInstallPrompt = null;
let currentOpenModal = null; // Track open modal for back button

// Sound file path check
const balanceClickSound = new Audio('/mixkit-clinking-coins-1993.wav');

const getElement = (id) => document.getElementById(id);
const elements = {
    memberContainer: getElement('memberContainer'),
    headerActionsContainer: getElement('headerActionsContainer'),
    staticHeaderButtonsContainer: getElement('staticHeaderButtons'),
    customCardsContainer: getElement('customCardsContainer'),
    communityLetterSlides: getElement('communityLetterSlides'),
    totalMembersValue: getElement('totalMembersValue'),
    totalLoanValue: getElement('totalLoanValue'),
    currentYear: getElement('currentYear'),
    headerDisplay: getElement('headerDisplay'),
    infoSlider: getElement('infoSlider'),
    balanceModal: getElement('balanceModal'),
    penaltyWalletModal: getElement('penaltyWalletModal'),
    memberProfileModal: getElement('memberProfileModal'),
    sipStatusModal: getElement('sipStatusModal'),
    allMembersModal: getElement('allMembersModal'),
    passwordPromptModal: getElement('passwordPromptModal'),
    imageModal: getElement('imageModal'),
    deviceVerificationModal: getElement('deviceVerificationModal'),
    productsContainer: getElement('productsContainer'),
    emiModal: getElement('emiModal'),
};

const DEFAULT_IMAGE = 'https://i.ibb.co/HTNrbJxD/20250716-222246.png';
const WHATSAPP_NUMBER = '7903698180';
const BANK_LOGO_URL = 'https://ik.imagekit.io/kdtvm0r78/IMG-20251202-WA0000.jpg';

// --- Initialization ---
export function initUI(database) {
    setupEventListeners(database);
    setupPWA();
    observeElements(document.querySelectorAll('.animate-on-scroll'));
    
    // FAILSAFE: Force visibility after a short delay
    setTimeout(() => {
        document.querySelectorAll('.animate-on-scroll').forEach(el => el.classList.add('is-visible'));
    }, 500);

    if (elements.currentYear) elements.currentYear.textContent = new Date().getFullYear();
    
    // Handle Browser Back Button for Modals
    window.onpopstate = function(event) {
        if (currentOpenModal) {
            // If a modal is open, close it visually but don't call history.back() again
            currentOpenModal.classList.remove('show');
            document.body.style.overflow = '';
            currentOpenModal = null;
        }
    };
}

export function renderPage(data) {
    allMembersData = data.processedMembers || [];
    penaltyWalletData = data.penaltyWalletData || {};
    allTransactions = data.allTransactions || [];
    communityStats = data.communityStats || {};
    cardColors = (data.adminSettings && data.adminSettings.card_colors) || {};
    allManualNotifications = data.manualNotifications || {};
    allAutomatedQueue = data.automatedQueue || {};
    allProducts = data.allProducts || {};

    displayHeaderButtons(data.headerButtons || {});
    
    const approvedMembers = allMembersData.filter(m => m.status === 'Approved');
    displayMembers(approvedMembers, data.adminSettings || {});

    // Calls to External Components (ui-components.js)
    displayCustomCards(
        (data.adminSettings && data.adminSettings.custom_cards) || {}, 
        elements.customCardsContainer,
        getElement('custom-cards-indicator')
    );
    
    displayCommunityLetters(
        (data.adminSettings && data.adminSettings.community_letters) || {},
        elements.communityLetterSlides,
        getElement('slideIndicator'),
        getElement('prevSlideBtn'),
        getElement('nextSlideBtn'),
        showFullImage // Callback
    );

    updateInfoCards(approvedMembers.length, communityStats.totalLoanDisbursed || 0);
    
    startHeaderDisplayRotator(
        elements.headerDisplay,
        approvedMembers, 
        communityStats, 
        BANK_LOGO_URL
    );
    
    buildInfoSlider(elements.infoSlider, allMembersData);
    
    // Trigger Royal Notifications
    processAndShowNotifications();
    
    // Pass showEmiModal as callback so the component can open the modal
    renderProducts(
        allProducts, 
        elements.productsContainer, 
        showEmiModal, 
        WHATSAPP_NUMBER
    );

    if(typeof feather !== 'undefined') feather.replace();
    
    const newAnimatedElements = document.querySelectorAll('.animate-on-scroll:not(.is-visible)');
    observeElements(newAnimatedElements);
    setTimeout(() => {
        newAnimatedElements.forEach(el => el.classList.add('is-visible'));
    }, 300);
}

export function showLoadingError(message) {
    if (elements.memberContainer) {
        elements.memberContainer.innerHTML = `<p class="error-text">❌ ${message}</p>`;
    }
}

function getTodayDateStringLocal() {
    const today = new Date();
    const year = today.getFullYear();
    const month = (today.getMonth() + 1).toString().padStart(2, '0');
    const day = today.getDate().toString().padStart(2, '0');
    return `${year}-${month}-${day}`;
}

// --- Display & Rendering Functions ---

function displayHeaderButtons(buttons) {
    if (!elements.headerActionsContainer || !elements.staticHeaderButtonsContainer) return;
    
    elements.headerActionsContainer.innerHTML = '';
    elements.staticHeaderButtonsContainer.innerHTML = '';
    
    if (Object.keys(buttons).length === 0) {
        elements.headerActionsContainer.innerHTML = '<p class="loading-text" style="color: white;">No actions configured.</p>';
        return;
    }

    const buttonWrapper = document.createElement('div');
    buttonWrapper.className = 'dynamic-buttons-wrapper';

    Object.values(buttons).sort((a, b) => (a.order || 99) - (b.order || 99)).forEach(btnData => {
        const isAutoUrl = btnData.url === 'auto';
        const isLink = btnData.url && !isAutoUrl;
        
        const element = document.createElement(isLink ? 'a' : 'button');
        element.className = `${btnData.base_class || 'civil-button'} ${btnData.style_preset || ''}`;
        
        if (btnData.id) {
            element.id = btnData.id;
        }

        if (isLink) {
            element.href = btnData.url;
            if (btnData.target) element.target = btnData.target;
        }

        element.innerHTML = `${btnData.icon_svg || ''}<b>${btnData.name || ''}</b>` + (btnData.id === 'notificationBtn' ? '<span id="notificationDot" class="notification-dot"></span>' : '');
        
        if (!['viewBalanceBtn', 'viewPenaltyWalletBtn'].includes(btnData.id)) {
            Object.assign(element.style, {
                backgroundColor: btnData.transparent ? 'transparent' : (btnData.color || 'var(--primary-color)'),
                color: btnData.textColor || 'white',
                borderColor: btnData.borderColor,
                borderWidth: btnData.borderWidth,
                borderStyle: (parseFloat(btnData.borderWidth) > 0 || btnData.style_preset === 'btn-outline') ? 'solid' : 'none'
            });
        }

        if (['viewBalanceBtn', 'viewPenaltyWalletBtn'].includes(btnData.id)) {
            elements.staticHeaderButtonsContainer.appendChild(element);
        } else {
            buttonWrapper.appendChild(element);
        }
    });
    
    elements.headerActionsContainer.appendChild(buttonWrapper);
    attachDynamicButtonListeners();
}

function displayMembers(members, adminSettings) {
    if (!elements.memberContainer) return;
    elements.memberContainer.innerHTML = '';
    if (!members || members.length === 0) {
        elements.memberContainer.innerHTML = '<p class="loading-text">Koi sadasya nahi mila.</p>';
        return;
    }

    const normalCardFrameUrl = adminSettings.normal_card_frame_url || 'https://ik.imagekit.io/nsyr92pse/20251007_103318.png';

    members.forEach((member, index) => {
        if (index < 3) {
            const card = document.createElement('div');
            const rankClasses = ['gold-card', 'silver-card', 'bronze-card'];
            const rankClass = rankClasses[index] || '';
            card.className = `framed-card-wrapper ${rankClass} animate-on-scroll`; 
            
            const rankType = ['gold', 'silver', 'bronze'][index];
            const frameImageUrls = {
                gold: 'https://ik.imagekit.io/kdtvm0r78/1764742107098.png',
                silver: 'https://ik.imagekit.io/kdtvm0r78/20251203_134510.png',
                bronze: 'https://ik.imagekit.io/kdtvm0r78/20251203_133726.png'
            };

            card.innerHTML = `
                <div class="framed-card-content">
                    <img src="${member.displayImageUrl}" alt="${member.name}" class="framed-member-photo" loading="lazy" onerror="this.onerror=null; this.src='${DEFAULT_IMAGE}';">
                    <img src="${frameImageUrls[rankType]}" alt="${rankType} frame" class="card-frame-image">
                    <div class="framed-info-container">
                        <p class="framed-member-name ${rankType}-text" title="${member.name}">${member.name}</p>
                        <div class="framed-balance-badge ${rankType}-bg">
                            ${(member.balance || 0).toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })}
                        </div>
                    </div>
                    ${member.isPrime ? '<div class="framed-prime-tag">Prime</div>' : ''}
                </div>`;
            card.onclick = () => showMemberProfileModal(member.id);
            elements.memberContainer.appendChild(card);

        } else {
            const card = document.createElement('div');
            card.className = 'normal-framed-card-wrapper animate-on-scroll';
            
            const getRankSuffix = (i) => {
                const j = i % 10, k = i % 100;
                if (j === 1 && k !== 11) return "st";
                if (j === 2 && k !== 12) return "nd";
                if (j === 3 && k !== 13) return "rd";
                return "th";
            };
            const rank = index + 1;
            const rankText = rank + getRankSuffix(rank);

            card.innerHTML = `
                <div class="normal-card-content">
                    <img src="${member.displayImageUrl}" alt="${member.name}" class="normal-framed-photo" loading="lazy" onerror="this.onerror=null; this.src='${DEFAULT_IMAGE}';">
                    <img src="${normalCardFrameUrl}" alt="Card Frame" class="normal-card-frame-image">
                    <div class="normal-card-rank">${rankText}</div>
                    <div class="normal-info-container">
                        <p class="normal-framed-name" title="${member.name}">${member.name}</p>
                        <div class="normal-framed-balance">
                            ${(member.balance || 0).toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })}
                        </div>
                    </div>
                    ${member.isPrime ? '<div class="normal-prime-tag">Prime</div>' : ''}
                </div>`;
            card.onclick = () => showMemberProfileModal(member.id);
            elements.memberContainer.appendChild(card);
        }
    });
}

function updateInfoCards(memberCount, totalLoan) {
    if (elements.totalMembersValue) elements.totalMembersValue.textContent = memberCount;
    if (elements.totalLoanValue) elements.totalLoanValue.textContent = (totalLoan || 0).toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
}

export function promptForDeviceVerification(allMembers) {
    return new Promise(resolve => {
        const modal = elements.deviceVerificationModal;
        if (!modal) return resolve(null);
        const modalContent = modal.querySelector('.modal-content');
        const sortedMembers = [...allMembers].sort((a, b) => a.name.localeCompare(b.name));
        modalContent.innerHTML = `
            <span class="close" id="closeVerificationModal">×</span>
            <h2>Verify Your Name</h2>
            <p style="margin-bottom: 20px; font-size: 0.9em; color: var(--light-text);">
                To receive important notifications, please select your name from the list below. This is a one-time setup.
            </p>
            <select id="memberSelect" style="width: 100%; padding: 12px; font-size: 1.1em; border: 1px solid var(--border-color); border-radius: 8px; margin-bottom: 20px;">
                <option value="">-- Select Your Name --</option>
                ${sortedMembers.map(m => `<option value="${m.id}">${m.name}</option>`).join('')}
            </select>
            <button id="confirmMemberBtn" style="width: 100%; padding: 12px; background-color: var(--success-color); color: white; border: none; border-radius: 8px; font-size: 1.1em; cursor: pointer;">Confirm</button>
        `;
        const confirmBtn = getElement('confirmMemberBtn');
        const memberSelect = getElement('memberSelect');
        const closeModalBtn = getElement('closeVerificationModal');
        const cleanupAndResolve = (value) => {
            closeModal(modal);
            resolve(value);
        };
        confirmBtn.onclick = () => {
            if (memberSelect.value) {
                cleanupAndResolve(memberSelect.value);
            } else {
                alert('Please select your name.');
            }
        };
        closeModalBtn.onclick = () => cleanupAndResolve(null);
        openModal(modal);
    });
}

export async function requestNotificationPermission() {
    if (!('Notification' in window)) {
        alert('This browser does not support desktop notification');
        return false;
    }
    const permission = await Notification.requestPermission();
    return permission === 'granted';
}

function showMemberProfileModal(memberId) {
    const member = allMembersData.find(m => m.id === memberId);
    if (!member) return;
    currentMemberForFullView = memberId;
    getElement('profileModalImage').src = member.displayImageUrl;
    getElement('profileModalName').textContent = member.name;
    getElement('profileModalJoiningDate').textContent = formatDate(member.joiningDate);
    getElement('profileModalBalance').textContent = (member.balance || 0).toLocaleString('en-IN', { style: 'currency', currency: 'INR' });
    getElement('profileModalReturn').textContent = (member.totalReturn || 0).toLocaleString('en-IN', { style: 'currency', currency: 'INR' });
    getElement('profileModalLoanCount').textContent = member.loanCount || 0;
    getElement('profileModalSipStatus').innerHTML = member.sipStatus.paid
        ? `<span class="sip-status-icon paid">✔</span><span class="sip-status-text">Paid: ${(member.sipStatus.amount || 0).toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}</span>`
        : `<span class="sip-status-icon not-paid">✖</span><span class="sip-status-text">Not Paid</span>`;
    getElement('profileModalBalance').className = `stat-value ${(member.balance || 0) >= 0 ? 'positive' : 'negative'}`;
    elements.memberProfileModal.classList.toggle('prime-modal', member.isPrime);
    getElement('profileModalPrimeTag').style.display = member.isPrime ? 'block' : 'none';
    openModal(elements.memberProfileModal);
}

function showBalanceModal() {
    openModal(elements.balanceModal);
    animateValue(getElement('totalSipAmountDisplay'), 0, communityStats.totalSipAmount || 0, 1200);
    animateValue(getElement('totalCurrentLoanDisplay'), 0, communityStats.totalCurrentLoanAmount || 0, 1200);
    animateValue(getElement('netReturnAmountDisplay'), 0, communityStats.netReturnAmount || 0, 1200);
    animateValue(getElement('availableAmountDisplay'), 0, communityStats.availableCommunityBalance || 0, 1200);
}

// FIXED: SIP Status List
function showSipStatusModal() {
    const container = getElement('sipStatusListContainer');
    if (!container) return;
    container.innerHTML = '';
    const sortedMembers = [...allMembersData].filter(m => m.status === 'Approved').sort((a, b) => (a.sipStatus.paid ? 1 : 0) - (b.sipStatus.paid ? 1 : 0) || a.name.localeCompare(b.name));
    sortedMembers.forEach(member => {
        const item = document.createElement('div');
        item.className = 'sip-status-item';
        const statusClass = member.sipStatus.paid ? 'paid' : 'not-paid';
        item.innerHTML = `
            <img src="${member.displayImageUrl}" alt="${member.name}" loading="lazy" onerror="this.onerror=null; this.src='${DEFAULT_IMAGE}';">
            <span class="sip-status-name">${member.name}</span>
            <span class="sip-status-badge ${statusClass}">${member.sipStatus.paid ? 'Paid' : 'Not Paid'}</span>`;
        container.appendChild(item);
    });
    openModal(elements.sipStatusModal);
}

// FIXED: All Members - Small Card Grid Layout WITH IMAGE ZOOM
function showAllMembersModal() {
    const container = getElement('allMembersListContainer');
    if (!container) return;
    container.innerHTML = '';
    // Use Grid Class
    container.className = 'all-members-grid'; 
    
    const sortedMembers = [...allMembersData].filter(m => m.status === 'Approved').sort((a, b) => a.name.localeCompare(b.name));
    
    sortedMembers.forEach(member => {
        const item = document.createElement('div');
        item.className = 'small-member-card';
        
        // CLICK 1: Card click opens Profile (Default behavior)
        item.onclick = () => { 
            closeModal(elements.allMembersModal); 
            showMemberProfileModal(member.id); 
        }; 
        
        // Create Image element manually to add specific Event Listener
        const img = document.createElement('img');
        img.src = member.displayImageUrl;
        img.alt = member.name;
        img.onerror = function() { this.src = DEFAULT_IMAGE; };
        
        // CLICK 2: Image click opens Full Image (Zoom) - STOPS PROPAGATION
        img.onclick = (e) => {
            e.stopPropagation(); // Prevents card click (profile open)
            showFullImage(member.displayImageUrl, member.name);
        };

        const nameSpan = document.createElement('span');
        nameSpan.textContent = member.name;

        item.appendChild(img);
        item.appendChild(nameSpan);
        container.appendChild(item);
    });
    openModal(elements.allMembersModal);
}

// LUXURY UPDATE: Penalty Wallet Modal Logic
function showPenaltyWalletModal() {
    const incomes = Object.values(penaltyWalletData.incomes || {}).map(i => ({...i, type: 'income'}));
    const expenses = Object.values(penaltyWalletData.expenses || {}).map(e => ({...e, type: 'expense'}));
    const history = [...incomes, ...expenses].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    
    // Main Balance Update
    getElement('penaltyBalance').textContent = `₹${(communityStats.totalPenaltyBalance || 0).toLocaleString('en-IN')}`;
    
    // List Logic
    const list = getElement('penaltyHistoryList');
    list.innerHTML = '';
    
    // Ensure Hidden initially
    list.style.display = 'none';
    getElement('viewHistoryBtn').textContent = 'View History';
    
    if (history.length === 0) {
        list.innerHTML = `<li class="no-penalty-history" style="text-align: center; color: #777;">No records found.</li>`;
    } else {
        history.forEach(tx => {
            const isIncome = tx.type === 'income';
            
            // Logic: Income = Green, Expense = Red
            const amountClass = isIncome ? 'green-text' : 'red-text';
            const sign = isIncome ? '+' : '-';
            
            // Date Formatting
            const dateObj = new Date(tx.timestamp);
            const dateStr = dateObj.toLocaleDateString('en-GB'); // DD/MM/YYYY
            const timeStr = dateObj.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

            list.innerHTML += `
                <li class="luxury-history-item">
                    <div class="history-main">
                        <span class="history-name">${isIncome ? tx.from : (tx.reason || 'Admin Expense')}</span>
                        <div class="history-meta">
                            ${isIncome ? tx.reason : 'Expense'} · ${dateStr}, ${timeStr}
                        </div>
                    </div>
                    <span class="history-amount ${amountClass}">
                        ${sign} ₹${(tx.amount || 0).toLocaleString('en-IN')}
                    </span>
                </li>`;
        });
    }
    openModal(elements.penaltyWalletModal);
}

// EMI Modal Logic (Exported so ui-components can use it via callback)
function showEmiModal(emiOptions, productName, productPrice) {
    const modal = elements.emiModal;
    if (!modal) return;
    const modalTitle = getElement('emiModalTitle');
    const list = getElement('emiDetailsList');
    modalTitle.textContent = `EMI Details for ${productName}`;
    list.innerHTML = '';
    const validEmi = Object.entries(emiOptions).filter(([, rate]) => rate && parseFloat(rate) >= 0);
    if (validEmi.length > 0) {
        validEmi.forEach(([duration, rate]) => {
            const li = document.createElement('li');
            const interestRate = parseFloat(rate);
            const months = parseInt(duration);
            const totalAmount = productPrice * (1 + interestRate / 100);
            const monthlyEmi = Math.ceil(totalAmount / months);
            li.innerHTML = `
                <span class="duration">${duration} Months</span> 
                <span class="rate">${rate}% Interest (${monthlyEmi.toLocaleString('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 0 })}/mo)</span>`;
            list.appendChild(li);
        });
    } else {
        list.innerHTML = '<li>No EMI options available for this product.</li>';
    }
    openModal(modal);
}

function setupEventListeners(database) {
    document.body.addEventListener('click', (e) => {
        // Close Modal Logic (Updated for better target detection)
        if (e.target.matches('.close') || e.target.matches('.close *')) {
            const modal = e.target.closest('.modal');
            if (modal) closeModal(modal);
        }
        if (e.target.classList.contains('modal')) closeModal(e.target);
        
        if (e.target.closest('#totalMembersCard')) showAllMembersModal();
        
        // --- FIXED: SMART SWAP FOR FULL VIEW ---
        if (e.target.closest('#fullViewBtn')) {
            swapModals(elements.memberProfileModal, elements.passwordPromptModal);
        }
        
        if (e.target.closest('#submitPasswordBtn')) handlePasswordCheck(database);
        
        // LUXURY UPDATE: View History Toggle Logic
        if (e.target.closest('#viewHistoryBtn')) {
            const list = getElement('penaltyHistoryList');
            const btn = e.target.closest('#viewHistoryBtn');
            
            if (list.style.display === 'none' || list.style.display === '') {
                list.style.display = 'block';
                btn.textContent = 'Hide History';
            } else {
                list.style.display = 'none';
                btn.textContent = 'View History';
            }
        }
        
        if (e.target.closest('#profileModalHeader')) {
            const imgSrc = getElement('profileModalImage').src;
            if (imgSrc) showFullImage(imgSrc, getElement('profileModalName').textContent);
        }
    });
    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') document.querySelectorAll('.modal.show').forEach(closeModal);
    });
    const passwordInput = getElement('passwordInput');
    if (passwordInput) {
        passwordInput.addEventListener('keyup', (e) => {
            if (e.key === 'Enter') handlePasswordCheck(database);
        });
    }
}

function attachDynamicButtonListeners() {
    const sipStatusBtn = getElement('sipStatusBtn');
    const notificationBtn = getElement('notificationBtn');
    const installBtn = getElement('installAppBtn');
    const viewBalanceBtn = getElement('viewBalanceBtn');
    const viewPenaltyWalletBtn = getElement('viewPenaltyWalletBtn');
    
    if (sipStatusBtn) sipStatusBtn.onclick = showSipStatusModal;
    
    if (viewBalanceBtn) {
        viewBalanceBtn.onclick = () => {
            if(balanceClickSound) {
                balanceClickSound.play().catch(error => console.warn("Audio play failed:", error));
            }
            showBalanceModal();
        };
    }
    
    if (viewPenaltyWalletBtn) viewPenaltyWalletBtn.onclick = showPenaltyWalletModal;
    
    if (notificationBtn) {
        notificationBtn.onclick = () => {
            window.location.href = 'notifications.html';
        };
    }

    if (installBtn) installBtn.onclick = async () => {
        if (deferredInstallPrompt) {
            deferredInstallPrompt.prompt();
            await deferredInstallPrompt.userChoice;
            deferredInstallPrompt = null;
            installBtn.style.display = 'none';
        }
    };
}

// === UPDATED NOTIFICATION LOGIC (STRICT TODAY + ROYAL POPUP) ===
function processAndShowNotifications() {
    const todayDateString = getTodayDateStringLocal();
    const sessionPopupsKey = `royalPopups_${todayDateString}`; // Unique Key for Today

    // Prevent showing again if already shown for this session AND this day
    if (sessionStorage.getItem(sessionPopupsKey)) {
        return;
    }

    let delay = 500; // Start quicker
    const baseDelay = 4000; // Enough time to read

    // 1. Transaction Notifications (STRICT DATE CHECK)
    const todaysTransactions = allTransactions.filter(tx => {
        if (!tx.date) return false;
        const txDate = new Date(tx.date);
        const y = txDate.getFullYear();
        const m = (txDate.getMonth() + 1).toString().padStart(2, '0');
        const d = txDate.getDate().toString().padStart(2, '0');
        const txDateString = `${y}-${m}-${d}`;
        return txDateString === todayDateString;
    });

    if (todaysTransactions.length > 0) {
        todaysTransactions.forEach((tx, index) => {
            setTimeout(() => {
                // Find Member Info for Notification
                const member = allMembersData.find(m => m.id === tx.memberId);
                showPopupNotification(getElement('notification-popup-container'), 'transaction', tx, member);
            }, delay + index * baseDelay);
        });
        delay += todaysTransactions.length * baseDelay;
    }

    // 2. Manual Notices
    Object.values(allManualNotifications).forEach((notif, index) => {
        setTimeout(() => {
             showPopupNotification(getElement('notification-popup-container'), 'manual', notif, null);
        }, delay + index * baseDelay);
    });

    // Mark as shown for this session
    sessionStorage.setItem(sessionPopupsKey, 'true');
    
    // Notification Dot Logic (Unchanged)
    const verifiedMemberId = localStorage.getItem('verifiedMemberId');
    if (!verifiedMemberId) return;
    const userReminders = Object.values(allAutomatedQueue).filter(item => item.memberId === verifiedMemberId && item.status === 'active');
    
    const dot = getElement('notificationDot');
    if (dot && (userReminders.length > 0 || Object.keys(allManualNotifications).length > 0)) {
        dot.style.display = 'block';
    }
}

function setupPWA() {
    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredInstallPrompt = e;
        const installBtn = getElement('installAppBtn');
        if (installBtn) installBtn.style.display = 'inline-flex';
    });
}

function animateValue(el, start, end, duration) {
    if (!el) return;
    let startTimestamp = null;
    const step = (timestamp) => {
        if (!startTimestamp) startTimestamp = timestamp;
        const progress = Math.min((timestamp - startTimestamp) / duration, 1);
        const currentValue = Math.floor(progress * (end - start) + start);
        el.textContent = currentValue.toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
        if (progress < 1) window.requestAnimationFrame(step);
    };
    window.requestAnimationFrame(step);
}

// --- FIXED: AUTO-RECONNECT & ROBUST PASSWORD CHECK ---
async function handlePasswordCheck(database) {
    const input = getElement('passwordInput');
    const password = input.value;
    if (!password) return alert('Please enter password.');
    
    // Fallback: If initUI was called with null, use global firebase
    let dbInstance = database;
    if (!dbInstance) {
        try {
            if (typeof firebase !== 'undefined') {
                dbInstance = firebase.database();
            } else {
                throw new Error("Firebase SDK not loaded");
            }
        } catch (e) {
            console.error("Database auto-connect failed:", e);
            return alert("System Error: Database not connected. Please refresh page.");
        }
    }

    try {
        const snapshot = await dbInstance.ref(`members/${currentMemberForFullView}/password`).once('value');
        const correctPassword = snapshot.val();
        
        // Fix: Use trim() to ignore accidental spaces and String() for type safety
        if (String(password).trim() === String(correctPassword).trim()) {
            closeModal(elements.passwordPromptModal);
            window.location.href = `view.html?memberId=${currentMemberForFullView}`;
        } else {
            alert('Incorrect password.');
            input.value = '';
        }
    } catch (error) {
        alert('Could not verify password. Please try again.');
        console.error("Password check failed:", error);
    }
}

// === HISTORY API LOGIC FOR MODALS ===
function openModal(modal) { 
    if (modal) { 
        modal.classList.add('show'); 
        document.body.style.overflow = 'hidden'; 
        
        // Push state to history
        window.history.pushState({modalOpen: true}, "", "");
        currentOpenModal = modal;
    } 
}

// --- NEW FUNCTION: SMART SWAP (PREVENTS BACK LOOP CRASH) ---
function swapModals(fromModal, toModal) {
    if (fromModal) {
        fromModal.classList.remove('show');
    }
    if (toModal) {
        toModal.classList.add('show');
        // Update the reference so back button closes the NEW modal
        currentOpenModal = toModal;
        // KEY FIX: We DO NOT push a new state. We reuse the existing state.
    }
}

function closeModal(modal) { 
    if (modal) { 
        modal.classList.remove('show'); 
        document.body.style.overflow = ''; 
        currentOpenModal = null;
        
        // Only go back if state was pushed (avoid double back)
        if (window.history.state && window.history.state.modalOpen) {
            window.history.back();
        }
    } 
}

function showFullImage(src, alt) {
    const fullImageSrc = getElement('fullImageSrc');
    const imageModal = getElement('imageModal');
    if (fullImageSrc && imageModal) {
        fullImageSrc.src = src;
        fullImageSrc.alt = alt;
        openModal(imageModal);
    }
}

// Fixed Observer
const scrollObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            scrollObserver.unobserve(entry.target); 
        }
    });
}, { threshold: 0.1 });

function observeElements(elements) {
    if(!elements || elements.length === 0) return;
    elements.forEach(el => scrollObserver.observe(el));
}

function formatDate(dateString) { return dateString ? new Date(new Date(dateString).getTime()).toLocaleDateString('en-GB') : 'N/A'; }
