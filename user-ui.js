// FINAL STRICT UPDATE V6:
// 1. Penalty Wallet: History REMOVED & Button HIDDEN (Direct Balance Display).
// 2. All Members: Image Zoom logic retained.
// 3. ROYAL NOTIFICATION UPDATE: Strict Today's Date Filter.
// 4. SMART MODAL SWAP: Fixes "Full View" redirect.

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
let currentOpenModal = null; 

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
    
    setTimeout(() => {
        document.querySelectorAll('.animate-on-scroll').forEach(el => el.classList.add('is-visible'));
    }, 500);

    if (elements.currentYear) elements.currentYear.textContent = new Date().getFullYear();
    
    window.onpopstate = function(event) {
        if (currentOpenModal) {
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

    displayCustomCards((data.adminSettings && data.adminSettings.custom_cards) || {});
    displayCommunityLetters((data.adminSettings && data.adminSettings.community_letters) || {});
    updateInfoCards(approvedMembers.length, communityStats.totalLoanDisbursed || 0);
    startHeaderDisplayRotator(approvedMembers, communityStats);
    buildInfoSlider();
    
    processAndShowNotifications();
    renderProducts();
    feather.replace();
    
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

// --- Display Functions ---
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
        if (btnData.id) element.id = btnData.id;
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
            const rankType = ['gold', 'silver', 'bronze'][index];
            const rankClasses = ['gold-card', 'silver-card', 'bronze-card'];
            card.className = `framed-card-wrapper ${rankClasses[index]} animate-on-scroll`;
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
            card.innerHTML = `
                <div class="normal-card-content">
                    <img src="${member.displayImageUrl}" alt="${member.name}" class="normal-framed-photo" loading="lazy" onerror="this.onerror=null; this.src='${DEFAULT_IMAGE}';">
                    <img src="${normalCardFrameUrl}" alt="Card Frame" class="normal-card-frame-image">
                    <div class="normal-card-rank">${rank + getRankSuffix(rank)}</div>
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

function renderProducts() {
    const container = elements.productsContainer;
    if (!container) return;
    const productEntries = Object.entries(allProducts);
    if (productEntries.length === 0) {
        const productSection = container.closest('.products-section');
        if (productSection) productSection.style.display = 'none';
        return;
    }
    container.innerHTML = '';
    productEntries.forEach(([id, product]) => {
        const card = document.createElement('div');
        card.className = 'product-card animate-on-scroll';
        const price = parseFloat(product.price) || 0;
        const mrp = parseFloat(product.mrp) || 0;
        let emiText = '';
        if (product.emi && Object.keys(product.emi).length > 0) {
            const firstEmiOption = Object.entries(product.emi).sort((a,b) => parseInt(a[0]) - parseInt(b[0]))[0];
            const months = parseInt(firstEmiOption[0]);
            const interestRate = parseFloat(firstEmiOption[1]);
            const totalAmount = price * (1 + interestRate / 100);
            const monthlyEmi = Math.ceil(totalAmount / months);
            emiText = `\n\n*EMI Details:* Starts from ₹${monthlyEmi.toLocaleString('en-IN')}/month at ${interestRate}% interest for ${months} months.`;
        }
        const productLink = product.exploreLink || 'Not available';
        const finalMessage = `Hello, I want to know more about *${product.name}*.\n\n*Price:* ₹${price.toLocaleString('en-IN')}\n*Product Link:* ${productLink}${emiText}`;
        const whatsappMessage = encodeURIComponent(finalMessage);
        const whatsappLink = `https://wa.me/${WHATSAPP_NUMBER}?text=${whatsappMessage}`;
        
        card.innerHTML = `
            <div class="product-image-wrapper">
                <img src="${product.imageUrl}" alt="${product.name}" class="product-image" loading="lazy" onerror="this.onerror=null; this.src='${DEFAULT_IMAGE}';">
            </div>
            <div class="product-info">
                <p class="product-name">${product.name}</p>
                <div class="product-price-container">
                    <span class="product-price">₹${price.toLocaleString('en-IN')}</span>
                    ${mrp > price ? `<span class="product-mrp">₹${mrp.toLocaleString('en-IN')}</span>` : ''}
                </div>
                ${product.emi && Object.keys(product.emi).length > 0 ? `<a class="product-emi-link" data-product-id="${id}">View EMI Details</a>` : ''}
            </div>
            <div class="product-actions">
                <a href="${whatsappLink}" target="_blank" class="product-btn whatsapp"><img src="https://www.svgrepo.com/show/452133/whatsapp.svg" alt="WhatsApp"></a>
                <a href="${product.exploreLink || '#'}" target="_blank" class="product-btn explore">Explore</a>
            </div>`;
        const emiLink = card.querySelector('.product-emi-link');
        if (emiLink) {
            emiLink.addEventListener('click', () => {
                const clickedProduct = allProducts[emiLink.dataset.productId];
                showEmiModal(clickedProduct.emi, clickedProduct.name, parseFloat(clickedProduct.price));
            });
        }
        container.appendChild(card);
    });
}

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

function displayCustomCards(cards) {
    const section = getElement('customCardsSection');
    if (!elements.customCardsContainer || !section) return;
    elements.customCardsContainer.innerHTML = '';
    const cardArray = Object.values(cards);
    if (cardArray.length === 0) {
        section.style.display = 'none';
        return;
    }
    section.style.display = 'block';
    cardArray.forEach(cardData => {
        const cardElement = document.createElement('div');
        cardElement.className = 'custom-card animate-on-scroll';
        cardElement.innerHTML = `
            <div class="custom-card-img-wrapper">
                <img src="${cardData.imageUrl || DEFAULT_IMAGE}" alt="${cardData.title || ''}" class="custom-card-img" onerror="this.onerror=null; this.src='${DEFAULT_IMAGE}';">
                <a href="${cardData.buttonLink || '#'}" class="custom-card-btn" style="background-color: ${cardData.buttonColor || 'var(--primary-color)'}" target="_blank" rel="noopener noreferrer">${cardData.buttonText || 'Learn More'}</a>
            </div>
            <div class="custom-card-content">
                <h3 class="custom-card-title">${cardData.title || ''}</h3>
                <p class="custom-card-desc">${cardData.description || ''}</p>
            </div>`;
        elements.customCardsContainer.appendChild(cardElement);
    });
    initializeCustomCardSlider(cardArray);
}

function displayCommunityLetters(letters) {
    if (!elements.communityLetterSlides) return;
    elements.communityLetterSlides.innerHTML = '';
    const letterArray = Object.values(letters);
    if (letterArray.length === 0) {
        elements.communityLetterSlides.innerHTML = `<div class="slide"><p class="p-8 text-center text-gray-500">No letters available.</p></div>`;
    } else {
        letterArray.forEach(letter => {
            elements.communityLetterSlides.innerHTML += `<div class="slide"><img src="${letter.imageUrl}" alt="${letter.altText || 'Letter'}" loading="lazy" onerror="this.onerror=null; this.src='${DEFAULT_IMAGE}';"></div>`;
        });
    }
    initializeLetterSlider();
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

function showAllMembersModal() {
    const container = getElement('allMembersListContainer');
    if (!container) return;
    container.innerHTML = '';
    container.className = 'all-members-grid'; 
    const sortedMembers = [...allMembersData].filter(m => m.status === 'Approved').sort((a, b) => a.name.localeCompare(b.name));
    sortedMembers.forEach(member => {
        const item = document.createElement('div');
        item.className = 'small-member-card';
        item.onclick = () => { 
            closeModal(elements.allMembersModal); 
            showMemberProfileModal(member.id); 
        }; 
        const img = document.createElement('img');
        img.src = member.displayImageUrl;
        img.alt = member.name;
        img.onerror = function() { this.src = DEFAULT_IMAGE; };
        img.onclick = (e) => {
            e.stopPropagation(); 
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

// LUXURY UPDATE: Penalty Wallet - HISTORY DISABLED
function showPenaltyWalletModal() {
    // 1. Show Main Balance (Direct Read)
    getElement('penaltyBalance').textContent = `₹${(communityStats.totalPenaltyBalance || 0).toLocaleString('en-IN')}`;
    
    // 2. Hide History Elements
    const list = getElement('penaltyHistoryList');
    const btn = getElement('viewHistoryBtn');
    
    if(list) list.style.display = 'none';
    if(btn) btn.style.display = 'none'; // Button Hidden as requested
    
    // 3. Open Modal
    openModal(elements.penaltyWalletModal);
}

function setupEventListeners(database) {
    document.body.addEventListener('click', (e) => {
        if (e.target.matches('.close') || e.target.matches('.close *')) {
            const modal = e.target.closest('.modal');
            if (modal) closeModal(modal);
        }
        if (e.target.classList.contains('modal')) closeModal(e.target);
        if (e.target.closest('#totalMembersCard')) showAllMembersModal();
        if (e.target.closest('#fullViewBtn')) {
            swapModals(elements.memberProfileModal, elements.passwordPromptModal);
        }
        if (e.target.closest('#submitPasswordBtn')) handlePasswordCheck(database);
        
        // Removed History Button Listener (since button is hidden)
        
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

function initializeLetterSlider() {
    const slidesContainer = elements.communityLetterSlides;
    if (!slidesContainer || slidesContainer.children.length === 0) return;
    slidesContainer.querySelectorAll('.slide img').forEach(img => {
        img.onclick = () => showFullImage(img.src, img.alt);
    });
    let currentSlideIndex = 0;
    const slides = slidesContainer.children;
    const totalSlides = slides.length;
    const indicator = getElement('slideIndicator');
    if (!indicator) return;
    indicator.innerHTML = '';
    for (let i = 0; i < totalSlides; i++) {
        const dot = document.createElement('span');
        dot.className = 'indicator-dot';
        dot.onclick = () => showSlide(i);
        indicator.appendChild(dot);
    }
    const showSlide = (index) => {
        currentSlideIndex = (index + totalSlides) % totalSlides;
        slidesContainer.style.transform = `translateX(${-currentSlideIndex * 100}%)`;
        indicator.childNodes.forEach((dot, idx) => dot.classList.toggle('active', idx === currentSlideIndex));
    };
    const prevBtn = getElement('prevSlideBtn');
    const nextBtn = getElement('nextSlideBtn');
    if (prevBtn) prevBtn.onclick = () => showSlide(currentSlideIndex - 1);
    if (nextBtn) nextBtn.onclick = () => showSlide(currentSlideIndex + 1);
    if (totalSlides > 0) showSlide(0);
}

function initializeCustomCardSlider(cards) {
    const container = elements.customCardsContainer;
    const indicator = getElement('custom-cards-indicator');
    if (!container || !indicator || cards.length <= 1) {
        if (indicator) indicator.style.display = 'none';
        return;
    }
    indicator.style.display = 'block';
    indicator.innerHTML = '';
    cards.forEach((card, index) => {
        const dot = document.createElement('span');
        dot.className = 'indicator-dot';
        dot.style.backgroundImage = `url(${card.imageUrl})`;
        dot.onclick = () => container.children[index].scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'start' });
        indicator.appendChild(dot);
    });
    const updateActiveDot = () => {
        if (container.children.length === 0) return;
        const scrollLeft = container.scrollLeft;
        let activeIndex = Math.round(scrollLeft / container.children[0].offsetWidth);
        indicator.childNodes.forEach((dot, idx) => dot.classList.toggle('active', idx === activeIndex));
    };
    container.addEventListener('scroll', updateActiveDot, { passive: true });
    updateActiveDot();
}

function startHeaderDisplayRotator(members, stats) {
    if (!elements.headerDisplay) return;
    const adContainer = elements.headerDisplay.querySelector('.ad-content');
    if (!adContainer) return;
    const ads = [];
    const topThree = members.slice(0, 3);
    if (topThree.length >= 3) {
        ads.push(() => {
            let topThreeHtml = topThree.map(member => `
                <div class="ad-top-three-member">
                    <img src="${member.displayImageUrl}" class="ad-top-three-img" alt="${member.name}">
                    <p class="ad-top-three-name">${member.name}</p>
                    <p class="ad-top-three-amount">${(member.balance || 0).toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })}</p>
                </div>`).join('');
            return `<div class="ad-headline">🚀 Top 3 Wealth Creators 🚀</div><div class="ad-top-three-container">${topThreeHtml}</div>`;
        });
    }
    if (stats) {
        ads.push(() => `
            <div class="ad-bank-stats-container">
                <img src="${BANK_LOGO_URL}" alt="Bank Logo" class="ad-bank-logo">
                <ul class="ad-bank-stats">
                    <li>Established: <strong>23 June 2024</strong></li>
                    <li>Total Members: <strong>${members.length}</strong></li>
                    <li>Loan Disbursed: <strong>${(stats.totalLoanDisbursed || 0).toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })}</strong></li>
                </ul>
            </div>`);
    }
    if (ads.length === 0) return;
    let currentAdIndex = 0;
    const showNextAd = () => {
        adContainer.innerHTML = ads[currentAdIndex]();
        currentAdIndex = (currentAdIndex + 1) % ads.length;
    };
    showNextAd();
    setInterval(showNextAd, 6000);
}

function buildInfoSlider() {
    if (!elements.infoSlider) return;
    elements.infoSlider.innerHTML = '';
    let infoCards = [
        { 
            icon: 'dollar-sign', 
            title: 'Fund Deposit', 
            text: 'Sabhi sadasya milkar fund jama karte hain <strong>(Every Month SIP)</strong> ke roop mein.',
            imageUrl: 'https://i.ibb.co/LzBMSjTy/20251005-091714.png'
        },
        { 
            icon: 'gift', 
            title: 'Loan Provision', 
            text: 'Zarooratmand sadasya ko usi fund se <strong>loan</strong> diya jaata hai.',
            imageUrl: 'https://i.ibb.co/WNkzG5rm/20251005-100155.png'
        },
        { 
            icon: 'calendar', 
            title: 'Loan Duration', 
            text: 'Loan keval <strong>1 mahine</strong> ke liye hota hai (nyunatam byaj par).',
            imageUrl: 'https://i.ibb.co/bjkNcWrv/20251005-100324.png'
        },
        { 
            icon: 'percent', 
            title: 'Interest Rate', 
            text: 'Avadhi aur rashi ke anusaar byaj darein badal sakti hain.',
            imageUrl: 'https://i.ibb.co/3ypdpzWR/20251005-095800.png'
        }
    ];
    const primeMembers = allMembersData.filter(member => member.isPrime);
    if (primeMembers.length > 0) {
        primeMembers.forEach(pm => {
            infoCards.push({
                icon: 'award',
                title: 'Prime Member',
                htmlContent: `
                    <div class="prime-member-card">
                        <img src="${pm.displayImageUrl}" alt="${pm.name}" loading="lazy" onerror="this.onerror=null; this.src='${DEFAULT_IMAGE}';">
                        <span>${pm.name}</span>
                    </div>`
            });
        });
    }
    infoCards.forEach(card => {
        const imageHTML = card.imageUrl ? `<img src="${card.imageUrl}" class="info-card-image" alt="${card.title}" loading="lazy" onerror="this.style.display='none';">` : '';
        let content = card.text ? `<p>${card.text}</p>` : card.htmlContent;
        elements.infoSlider.innerHTML += `
            <div class="info-card-slide animate-on-scroll">
                <h3><i data-feather="${card.icon}"></i> ${card.title}</h3>
                ${content}
                ${imageHTML} 
            </div>`;
    });
    feather.replace();
}

function processAndShowNotifications() {
    const todayDateString = getTodayDateStringLocal();
    const sessionPopupsKey = `royalPopups_${todayDateString}`;
    if (sessionStorage.getItem(sessionPopupsKey)) return;

    let delay = 500;
    const baseDelay = 4000;
    const todaysTransactions = allTransactions.filter(tx => {
        if (!tx.date) return false;
        const txDate = new Date(tx.date);
        const y = txDate.getFullYear();
        const m = (txDate.getMonth() + 1).toString().padStart(2, '0');
        const d = txDate.getDate().toString().padStart(2, '0');
        return `${y}-${m}-${d}` === todayDateString;
    });

    if (todaysTransactions.length > 0) {
        todaysTransactions.forEach((tx, index) => {
            setTimeout(() => showPopupNotification('transaction', tx), delay + index * baseDelay);
        });
        delay += todaysTransactions.length * baseDelay;
    }
    Object.values(allManualNotifications).forEach((notif, index) => {
        setTimeout(() => showPopupNotification('manual', notif), delay + index * baseDelay);
    });
    sessionStorage.setItem(sessionPopupsKey, 'true');
    const verifiedMemberId = localStorage.getItem('verifiedMemberId');
    if (!verifiedMemberId) return;
    const userReminders = Object.values(allAutomatedQueue).filter(item => item.memberId === verifiedMemberId && item.status === 'active');
    const dot = getElement('notificationDot');
    if (dot && (userReminders.length > 0 || Object.keys(allManualNotifications).length > 0)) {
        dot.style.display = 'block';
    }
}

function showPopupNotification(type, data) {
    const container = getElement('notification-popup-container');
    if (!container) return;
    const popup = document.createElement('div');
    popup.className = 'notification-popup';
    popup.onclick = () => { window.location.href = 'notifications.html'; };
    let contentHTML = '';
    let imgUrl = DEFAULT_IMAGE;
    let title = 'Notification';

    if(type === 'transaction') {
        const member = allMembersData.find(m => m.id === data.memberId);
        if (!member) return;
        title = member.name;
        imgUrl = member.displayImageUrl;
        let message = '', amount = '', typeClass = '';
        switch(data.type) {
            case 'SIP': message = `Paid Monthly SIP`; amount = `+ ₹${(data.amount || 0).toLocaleString()}`; typeClass = 'sip'; break;
            case 'Loan Taken': message = `Took a Loan`; amount = `- ₹${(data.amount || 0).toLocaleString()}`; typeClass = 'loan'; break;
            case 'Loan Payment': 
                const totalPaid = (parseFloat(data.principalPaid)||0) + (parseFloat(data.interestPaid)||0);
                message = `Loan Repayment`; amount = `+ ₹${totalPaid.toLocaleString()}`; typeClass = 'payment'; 
                break;
            case 'Extra Payment': message = `Extra Deposit`; amount = `+ ₹${(data.amount || 0).toLocaleString()}`; typeClass = 'sip'; break;
            case 'Extra Withdraw': message = `Withdrawal`; amount = `- ₹${(data.amount || 0).toLocaleString()}`; typeClass = 'loan'; break;
            default: return;
        }
        contentHTML = `<strong>${title}</strong><p>${message}</p><span class="notification-popup-amount ${typeClass}">${amount}</span>`;
    } else if (type === 'manual') {
         imgUrl = data.imageUrl || DEFAULT_IMAGE;
         title = data.title || 'Notice';
         contentHTML = `<strong>${title}</strong><p style="font-size: 0.85em; opacity: 0.9;">Click to view details</p>`;
    }

    popup.innerHTML = `
        <img src="${imgUrl}" alt="${title}" class="notification-popup-img" onerror="this.src='${DEFAULT_IMAGE}'">
        <div class="notification-popup-content">${contentHTML}</div>
        <button class="notification-popup-close">&times;</button>
    `;
    const closeBtn = popup.querySelector('.notification-popup-close');
    closeBtn.onclick = (e) => {
        e.stopPropagation(); 
        popup.classList.add('closing');
        popup.addEventListener('animationend', () => popup.remove(), { once: true });
    };
    setTimeout(() => {
        if(popup.parentNode) {
            popup.classList.add('closing');
            popup.addEventListener('animationend', () => popup.remove(), { once: true });
        }
    }, 5000);
    container.appendChild(popup);
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

async function handlePasswordCheck(database) {
    const input = getElement('passwordInput');
    const password = input.value;
    if (!password) return alert('Please enter password.');
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

function openModal(modal) { 
    if (modal) { 
        modal.classList.add('show'); 
        document.body.style.overflow = 'hidden'; 
        window.history.pushState({modalOpen: true}, "", "");
        currentOpenModal = modal;
    } 
}

function swapModals(fromModal, toModal) {
    if (fromModal) fromModal.classList.remove('show');
    if (toModal) {
        toModal.classList.add('show');
        currentOpenModal = toModal;
    }
}

function closeModal(modal) { 
    if (modal) { 
        modal.classList.remove('show'); 
        document.body.style.overflow = ''; 
        currentOpenModal = null;
        if (window.history.state && window.history.state.modalOpen) window.history.back();
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

