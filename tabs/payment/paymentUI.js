// tabs/payment/paymentUI.js

import { allMembers, currentApp } from './payment.js';
import { openPaymentScreen, validateAmount, initiatePayment, processPinSetup, verifyAndPay } from './paymentLogic.js';

let showingAll = false;
let html5QrcodeScanner = null; // For Camera Scanner

export function initUI(myMemberInfo, membersList) {
    // 1. Set Self Profile Pic & SIP ID
    const profileImg = document.getElementById('pay-self-profile');
    if(profileImg) profileImg.src = myMemberInfo.profilePicUrl || 'https://placehold.co/100';

    const sipIdEl = document.getElementById('my-sip-id');
    if(sipIdEl) sipIdEl.textContent = myMemberInfo.membershipId;

    // 2. Render Grid
    renderMembersGrid(membersList);
}

export function renderMembersGrid(membersList, searchQuery = "") {
    const grid = document.getElementById('members-grid');
    if(!grid) return;
    grid.innerHTML = '';

    // Search Logic
    let filteredList = membersList;
    if (searchQuery.trim() !== "") {
        const lowerQ = searchQuery.toLowerCase();
        filteredList = membersList.filter(m => 
            (m.fullName && m.fullName.toLowerCase().includes(lowerQ)) || 
            (m.membershipId && m.membershipId.toLowerCase().includes(lowerQ))
        );
        showingAll = true; // Auto-expand when searching
    }

    // Limit to 7 if not showing all
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
            ? `<img src="${m.profilePicUrl}" class="w-full h-full object-cover shadow-sm" crossorigin="anonymous">`
            : `<div class="w-full h-full bg-blue-500 text-white flex items-center justify-center text-xl font-bold shadow-sm">${initial}</div>`;

        const shortName = m.fullName && m.fullName.length > 10 ? m.fullName.substring(0, 9) + '...' : (m.fullName || 'Unknown');

        html += `
        <div class="flex flex-col items-center member-btn cursor-pointer group" data-id="${m.membershipId}">
            <div class="w-14 h-14 rounded-full bg-white border border-gray-100 overflow-hidden mb-1 relative group-active:scale-95 transition-transform">
                ${avatarHtml}
                <div class="absolute top-0 right-0 w-3 h-3 bg-green-500 border-2 border-white rounded-full"></div>
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
        grid.innerHTML = `
        <div class="col-span-4 text-center py-8">
            <div class="w-16 h-16 bg-gray-100 text-gray-400 rounded-full flex items-center justify-center mx-auto mb-2 text-2xl"><i class="fas fa-users-slash"></i></div>
            <p class="text-gray-500 text-xs font-bold">No active members found</p>
        </div>`;
        return;
    }

    grid.innerHTML = html;
}

export function setupUIListeners() {
    const container = document.getElementById('app-content');
    if(container._payListener) container.removeEventListener('click', container._payListener);

    container._payListener = (e) => {
        const target = e.target;

        // 1. Copy SIP ID (With nice animation)
        if (target.closest('#copy-sip-id-btn')) {
            navigator.clipboard.writeText(document.getElementById('my-sip-id').textContent);
            const btn = target.closest('#copy-sip-id-btn');
            const originalHtml = btn.innerHTML;
            btn.innerHTML = `<span class="text-xs font-bold text-green-600"><i class="fas fa-check-circle"></i> ID Copied!</span>`;
            setTimeout(() => btn.innerHTML = originalHtml, 2000);
        }

        // 2. View More Members
        if (target.closest('#view-more-btn')) {
            showingAll = true;
            renderMembersGrid(allMembers, document.getElementById('pay-search-input').value);
        }

        // 3. Open Payment Screen (When clicking on a member)
        const memberBtn = target.closest('.member-btn');
        if (memberBtn) {
            openPaymentScreen(memberBtn.getAttribute('data-id'));
        }

        // 4. Close Payment Screen
        if (target.closest('#close-payment-btn')) {
            document.getElementById('payment-screen').classList.replace('translate-y-0', 'translate-y-full');
            setTimeout(() => document.getElementById('payment-screen').classList.replace('flex', 'hidden'), 300);
        }

        // 5. Proceed to Pay Button
        if (target.closest('#proceed-pay-btn')) {
            initiatePayment(parseFloat(document.getElementById('pay-amount-input').value));
        }

        // 6. Close PIN Modals
        if (target.closest('#close-pin-setup')) document.getElementById('pinSetupModal').classList.replace('flex', 'hidden');
        if (target.closest('#close-pin-entry')) document.getElementById('pinEntryModal').classList.replace('flex', 'hidden');

        // 7. Submit PIN Actions
        if (target.closest('#save-pin-btn')) processPinSetup(document.getElementById('new-sip-pin').value);
        if (target.closest('#verify-pin-btn')) verifyAndPay(document.getElementById('enter-sip-pin').value);

        // 8. Scanner & Focus Actions
        if (target.closest('#scan-qr-btn')) startScanner();
        if (target.closest('#close-scanner-btn')) stopScanner();
        if (target.closest('#pay-anyone-btn')) {
            document.getElementById('pay-search-input').focus();
        }
    };
    container.addEventListener('click', container._payListener);

    // Live Amount Validation (Check 25% limits while typing)
    const amountInput = document.getElementById('pay-amount-input');
    if(amountInput) {
        amountInput.addEventListener('input', (e) => validateAmount(e.target.value));
    }

    // Live Search Input Validation
    const searchInput = document.getElementById('pay-search-input');
    if(searchInput) {
        searchInput.addEventListener('input', (e) => renderMembersGrid(allMembers, e.target.value));
    }
}

// ==========================================
// 📷 QR SCANNER LOGIC
// ==========================================

function startScanner() {
    const modal = document.getElementById('scannerModal');
    if(modal) {
        modal.classList.remove('hidden');
        modal.classList.add('flex');
    }

    // Initialize scanner if not done already
    if (!html5QrcodeScanner) {
        if (typeof Html5Qrcode !== 'undefined') {
            html5QrcodeScanner = new Html5Qrcode("reader");
        } else {
            alert("Scanner library is loading... Please wait 2 seconds and try again.");
            stopScanner();
            return;
        }
    }

    const config = { fps: 10, qrbox: { width: 250, height: 250 } };

    // Open Rear Camera
    html5QrcodeScanner.start({ facingMode: "environment" }, config, onScanSuccess)
    .catch(err => {
        console.error("Camera Error: ", err);
        alert("Camera permission denied or not available. Please allow camera access.");
        stopScanner();
    });
}

function stopScanner() {
    const modal = document.getElementById('scannerModal');
    if(modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }

    if (html5QrcodeScanner) {
        html5QrcodeScanner.stop().catch(err => console.error("Error stopping scanner:", err));
    }
}

function onScanSuccess(decodedText, decodedResult) {
    stopScanner(); // Stop camera

    // Clean up the text (Remove extra spaces)
    const scannedId = decodedText.trim();

    // Check if the scanned ID belongs to a valid member
    if(scannedId && scannedId.includes("BCL-")) {
        const foundMember = allMembers.find(m => m.membershipId === scannedId);

        if(foundMember) {
            // Direct open the payment screen for that member!
            openPaymentScreen(foundMember.membershipId);
        } else {
            alert("❌ Scanned ID not found in your active members list.");
        }
    } else {
        alert("⚠️ Invalid QR Code. Please scan a valid TCF SIP QR.");
    }
}
