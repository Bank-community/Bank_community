// tabs/payment/payment.js

let html5QrcodeScanner = null;
let allMembers = [];
let showingAll = false;
let currentApp = null;

// Payment State Variables
let selectedReceiver = null;
let senderMaxLimit = 0;
let receiverMaxLimit = 0;
let finalAllowedLimit = 0;

export function init(app) {
    currentApp = app;
    const state = app.state;
    const myMemberId = state.member.membershipId;

    // Set Profile Pic and SIP ID
    const profileImg = document.getElementById('pay-self-profile');
    if(profileImg) profileImg.src = state.member.profilePicUrl || 'https://placehold.co/100';

    const sipIdEl = document.getElementById('my-sip-id');
    if(sipIdEl) sipIdEl.textContent = myMemberId;

    // Filter members (To avoid 'No members found', check structure)
    // We assume app.state.membersData exists. If not, we will handle it later.
    const rawMembers = state.membersData || {};
    allMembers = Object.values(rawMembers).filter(m => 
        m.status === 'Approved' && m.membershipId !== myMemberId
    );

    renderMembersGrid();
    setupListeners();
}

function renderMembersGrid(searchQuery = "") {
    const grid = document.getElementById('members-grid');
    if(!grid) return;
    grid.innerHTML = '';

    let filteredList = allMembers;
    if (searchQuery.trim() !== "") {
        const lowerQ = searchQuery.toLowerCase();
        filteredList = allMembers.filter(m => 
            m.fullName.toLowerCase().includes(lowerQ) || 
            (m.membershipId && m.membershipId.toLowerCase().includes(lowerQ))
        );
        showingAll = true;
    }

    let displayList = filteredList;
    let needsMoreBtn = false;

    if (!showingAll && filteredList.length > 7) {
        displayList = filteredList.slice(0, 7);
        needsMoreBtn = true;
    }

    let html = '';
    displayList.forEach(m => {
        const initial = m.fullName ? m.fullName.charAt(0).toUpperCase() : '?';
        let avatarHtml = m.profilePicUrl 
            ? `<img src="${m.profilePicUrl}" class="w-full h-full object-cover" crossorigin="anonymous">`
            : `<div class="w-full h-full bg-blue-500 text-white flex items-center justify-center text-xl font-bold">${initial}</div>`;

        const shortName = m.fullName.length > 10 ? m.fullName.substring(0, 9) + '...' : m.fullName;

        html += `
        <div class="flex flex-col items-center member-btn cursor-pointer group" data-id="${m.membershipId}">
            <div class="w-14 h-14 rounded-full bg-white shadow-sm border border-gray-100 overflow-hidden mb-1 relative group-active:scale-95 transition-transform">
                ${avatarHtml}
            </div>
            <span class="text-[10px] font-medium text-gray-700 text-center w-full truncate px-1">${shortName}</span>
        </div>`;
    });

    if (needsMoreBtn) {
        html += `
        <div class="flex flex-col items-center cursor-pointer group" id="view-more-btn">
            <div class="w-14 h-14 rounded-full bg-white shadow-sm border border-gray-200 flex items-center justify-center mb-1 group-active:scale-95 transition-transform">
                <i class="fas fa-chevron-down text-gray-400 text-xl"></i>
            </div>
            <span class="text-[10px] font-medium text-gray-700 text-center">More</span>
        </div>`;
    }

    if (filteredList.length === 0) {
        grid.innerHTML = `<div class="col-span-4 text-center py-6 text-gray-400 text-xs">No members found.</div>`;
        return;
    }

    grid.innerHTML = html;
}

function setupListeners() {
    const container = document.getElementById('app-content');
    if(container._payListener) container.removeEventListener('click', container._payListener);

    container._payListener = (e) => {
        const target = e.target;

        if (target.closest('#copy-sip-id-btn')) {
            navigator.clipboard.writeText(document.getElementById('my-sip-id').textContent);
            alert("SIP ID Copied!");
        }
        if (target.closest('#view-more-btn')) {
            showingAll = true;
            renderMembersGrid(document.getElementById('pay-search-input').value);
        }
        if (target.closest('#scan-qr-btn')) startScanner();
        if (target.closest('#close-scanner-btn')) stopScanner();

        // Step 2: Select Member and Open Payment Screen
        const memberBtn = target.closest('.member-btn');
        if (memberBtn) {
            const selectedId = memberBtn.getAttribute('data-id');
            openPaymentScreen(selectedId);
        }

        // Close Payment Screen
        if (target.closest('#close-payment-btn')) {
            document.getElementById('payment-screen').classList.replace('translate-y-0', 'translate-y-full');
            setTimeout(() => document.getElementById('payment-screen').classList.replace('flex', 'hidden'), 300);
            selectedReceiver = null;
        }

        // Proceed to Pay
        if (target.closest('#proceed-pay-btn')) {
            const amount = parseFloat(document.getElementById('pay-amount-input').value);
            initiatePayment(amount);
        }

        // Modals Logic
        if (target.closest('#close-pin-setup')) document.getElementById('pinSetupModal').classList.replace('flex', 'hidden');
        if (target.closest('#close-pin-entry')) document.getElementById('pinEntryModal').classList.replace('flex', 'hidden');

        if (target.closest('#save-pin-btn')) saveSipPin();
        if (target.closest('#verify-pin-btn')) verifyPinAndExecuteTransaction();
    };
    container.addEventListener('click', container._payListener);

    // Limit Validation on Input Typing
    const amountInput = document.getElementById('pay-amount-input');
    if(amountInput) {
        amountInput.addEventListener('input', (e) => validateAmount(e.target.value));
    }
}

// --- STEP 2: LOGIC ---

function openPaymentScreen(receiverId) {
    selectedReceiver = allMembers.find(m => m.membershipId === receiverId);
    if (!selectedReceiver) return alert("Member not found!");

    // 1. Populate UI
    document.getElementById('pay-receiver-name').textContent = selectedReceiver.fullName;
    document.getElementById('pay-receiver-id').textContent = `ID: ${selectedReceiver.membershipId}`;
    document.getElementById('pay-receiver-pic').src = selectedReceiver.profilePicUrl || 'https://placehold.co/100';

    document.getElementById('pay-amount-input').value = '';
    document.getElementById('pay-note-input').value = '';
    document.getElementById('limit-warning').classList.add('hidden');

    // 2. Calculate Limits (25% Rule)
    calculateLimits();

    // 3. Show Screen
    const screen = document.getElementById('payment-screen');
    screen.classList.replace('hidden', 'flex');
    setTimeout(() => screen.classList.replace('translate-y-full', 'translate-y-0'), 10);
}

function calculateLimits() {
    const sender = currentApp.state.member;
    const receiver = selectedReceiver;

    const currentMonth = new Date().toISOString().substring(0, 7); // Gets "YYYY-MM"
    let senderSentThisMonth = 0;
    let receiverReceivedThisMonth = 0;

    // Scan allData (transactions) to find this month's P2P usage
    if (currentApp.state.allData) {
        currentApp.state.allData.forEach(tx => {
            if (tx.date && tx.date.startsWith(currentMonth)) {
                if (tx.type === 'P2P Sent' && tx.memberId === sender.membershipId) {
                    senderSentThisMonth += tx.amount;
                }
                if (tx.type === 'P2P Received' && tx.memberId === receiver.membershipId) {
                    receiverReceivedThisMonth += tx.amount;
                }
            }
        });
    }

    // 25% Math
    const senderTotalSip = parseFloat(sender.accountBalance || 0);
    const receiverTotalSip = parseFloat(receiver.accountBalance || 0);

    senderMaxLimit = Math.max(0, (senderTotalSip * 0.25) - senderSentThisMonth);
    receiverMaxLimit = Math.max(0, (receiverTotalSip * 0.25) - receiverReceivedThisMonth);

    // Final limit is whichever is lower
    finalAllowedLimit = Math.min(senderMaxLimit, receiverMaxLimit);

    // Update UI
    document.getElementById('limit-sender').textContent = `₹${senderMaxLimit.toLocaleString('en-IN', {maximumFractionDigits:0})}`;
    document.getElementById('limit-receiver').textContent = `₹${receiverMaxLimit.toLocaleString('en-IN', {maximumFractionDigits:0})}`;
}

function validateAmount(val) {
    const btn = document.getElementById('proceed-pay-btn');
    const warning = document.getElementById('limit-warning');
    const amount = parseFloat(val) || 0;

    if (amount > finalAllowedLimit) {
        warning.classList.remove('hidden');
        btn.disabled = true;
        btn.classList.replace('opacity-100', 'opacity-50');
        btn.classList.remove('cursor-pointer');
    } else if (amount >= 500) {
        warning.classList.add('hidden');
        btn.disabled = false;
        btn.classList.replace('opacity-50', 'opacity-100');
        btn.classList.add('cursor-pointer');
    } else {
        warning.classList.add('hidden');
        btn.disabled = true;
        btn.classList.replace('opacity-100', 'opacity-50');
    }
}

function initiatePayment(amount) {
    const sender = currentApp.state.member;

    // Check if user has SIP PIN setup
    if (!sender.sipPin) {
        document.getElementById('new-sip-pin').value = '';
        document.getElementById('pin-setup-error').classList.add('hidden');
        document.getElementById('pinSetupModal').classList.replace('hidden', 'flex');
    } else {
        document.getElementById('confirm-amount-text').textContent = `₹${amount.toLocaleString('en-IN')}`;
        document.getElementById('enter-sip-pin').value = '';
        document.getElementById('pin-entry-error').classList.add('hidden');
        document.getElementById('pinEntryModal').classList.replace('hidden', 'flex');
    }
}

// (Mock functions for Step 3)
function saveSipPin() {
    const pin = document.getElementById('new-sip-pin').value;
    if(pin.length !== 4) return document.getElementById('pin-setup-error').classList.remove('hidden');

    // Will save to firebase in Step 3
    alert("PIN Saved Successfully! Proceeding to Payment...");
    document.getElementById('pinSetupModal').classList.replace('flex', 'hidden');
    currentApp.state.member.sipPin = pin; // Mock temporary save

    // Auto-open payment PIN entry
    initiatePayment(parseFloat(document.getElementById('pay-amount-input').value));
}

function verifyPinAndExecuteTransaction() {
    const enteredPin = document.getElementById('enter-sip-pin').value;
    const realPin = currentApp.state.member.sipPin;

    if (enteredPin !== realPin) {
        return document.getElementById('pin-entry-error').classList.remove('hidden');
    }

    document.getElementById('pinEntryModal').classList.replace('flex', 'hidden');
    alert(`Ready for Step 3: Firebase Atomic Transaction!\nWill transfer ₹${document.getElementById('pay-amount-input').value} to ${selectedReceiver.fullName}`);
}

// --- SCANNER LOGIC ---
function startScanner() {
    const modal = document.getElementById('scannerModal');
    modal.classList.remove('hidden');
    modal.classList.add('flex');

    if (!html5QrcodeScanner) {
        html5QrcodeScanner = new Html5Qrcode("reader");
    }

    const config = { fps: 10, qrbox: { width: 250, height: 250 } };

    html5QrcodeScanner.start({ facingMode: "environment" }, config, onScanSuccess)
    .catch(err => {
        console.error("Camera Error: ", err);
        alert("Camera permission denied or not available. Please allow camera access.");
        stopScanner();
    });
}

function stopScanner() {
    const modal = document.getElementById('scannerModal');
    modal.classList.add('hidden');
    modal.classList.remove('flex');

    if (html5QrcodeScanner) {
        html5QrcodeScanner.stop().catch(err => console.error(err));
    }
}

function onScanSuccess(decodedText, decodedResult) {
    stopScanner();
    // Assuming QR contains the SIP ID like: "BCL-123456"
    alert(`QR Scanned! Found SIP ID: ${decodedText}\n\nStep 2: Payment screen will open now.`);
    // Next step: Check if ID exists, then openPaymentScreen(decodedText);
}
