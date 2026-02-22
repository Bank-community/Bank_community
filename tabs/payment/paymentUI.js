// tabs/payment/paymentUI.js

import { allMembers, currentApp } from './payment.js';
import { openPaymentScreen, validateAmount, initiatePayment, processPinSetup, verifyAndPay } from './paymentLogic.js';

let showingAll = false;
let html5QrcodeScanner = null;

export function initUI(myMemberInfo, membersList) {
    // 1. Set Self Profile Pic & SIP ID (Main Screen)
    const profileImg = document.getElementById('pay-self-profile');
    if(profileImg) profileImg.src = myMemberInfo.profilePicUrl || 'https://placehold.co/100';

    const sipIdEl = document.getElementById('my-sip-id');
    if(sipIdEl) sipIdEl.textContent = myMemberInfo.membershipId;

    // ✅ NEW: Set Data for "Show My QR" Modal
    const qrIdEl = document.getElementById('qr-modal-sip-id');
    if(qrIdEl) qrIdEl.textContent = myMemberInfo.membershipId;

    const qrImg = document.getElementById('my-generated-qr');
    if(qrImg && myMemberInfo.membershipId) {
        // Using a reliable public API to generate QR code instantly
        qrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${myMemberInfo.membershipId}&bgcolor=fff&color=001540&margin=10`;
    }

    // 2. Render Grid
    renderMembersGrid(membersList);
}

// ... (renderMembersGrid फंक्शन पहले जैसा ही रहेगा, उसे बदलने की ज़रूरत नहीं है) ...
export function renderMembersGrid(membersList, searchQuery = "") {
    const grid = document.getElementById('members-grid');
    if(!grid) return;
    grid.innerHTML = '';

    let filteredList = membersList;
    if (searchQuery.trim() !== "") {
        const lowerQ = searchQuery.toLowerCase();
        filteredList = membersList.filter(m => 
            (m.fullName && m.fullName.toLowerCase().includes(lowerQ)) || 
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
        <div class="col-span-4 text-center py-12 opacity-50">
            <div class="w-16 h-16 bg-gray-100 text-gray-400 rounded-full flex items-center justify-center mx-auto mb-3 text-2xl"><i class="fas fa-users-slash"></i></div>
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

        // Copy SIP ID
        if (target.closest('#copy-sip-id-btn')) {
            navigator.clipboard.writeText(document.getElementById('my-sip-id').textContent);
            const btn = target.closest('#copy-sip-id-btn');
            btn.innerHTML = `<span class="text-xs font-bold text-green-600 tracking-wide"><i class="fas fa-check-circle mr-1"></i> ID Copied!</span>`;
            setTimeout(() => btn.innerHTML = `<span class="text-xs font-medium text-gray-800 tracking-wide">My SIP ID: <span id="my-sip-id" class="font-bold text-[#001540]">${document.getElementById('my-sip-id').textContent}</span></span><i class="far fa-copy text-gray-400 text-xs ml-1"></i>`, 2000);
        }

        // View More & Search Focus
        if (target.closest('#view-more-btn')) {
            showingAll = true;
            renderMembersGrid(allMembers, document.getElementById('pay-search-input').value);
        }
        if (target.closest('#pay-anyone-btn')) document.getElementById('pay-search-input').focus();

        // ✅ NEW: Show My QR Modal
        if (target.closest('#show-my-qr-btn')) {
            document.getElementById('myQrModal').classList.replace('hidden', 'flex');
        }
        // ✅ NEW: Close My QR Modal
        if (target.closest('#close-qr-modal')) {
            document.getElementById('myQrModal').classList.replace('flex', 'hidden');
        }
        // ✅ NEW: Download QR Logic
        if (target.closest('#download-qr-btn')) {
            downloadMyQr();
        }

        // ... (बाकी सारे पुराने लिस्टनर्स: Payment Screen, PIN, Scanner आदि वैसे ही रहेंगे) ...
        const memberBtn = target.closest('.member-btn');
        if (memberBtn) openPaymentScreen(memberBtn.getAttribute('data-id'));
        if (target.closest('#close-payment-btn')) {
            document.getElementById('payment-screen').classList.replace('translate-y-0', 'translate-y-full');
            setTimeout(() => document.getElementById('payment-screen').classList.replace('flex', 'hidden'), 300);
        }
        if (target.closest('#proceed-pay-btn')) initiatePayment(parseFloat(document.getElementById('pay-amount-input').value));
        if (target.closest('#close-pin-setup')) document.getElementById('pinSetupModal').classList.replace('flex', 'hidden');
        if (target.closest('#close-pin-entry')) document.getElementById('pinEntryModal').classList.replace('flex', 'hidden');
        if (target.closest('#save-pin-btn')) processPinSetup(document.getElementById('new-sip-pin').value);
        if (target.closest('#verify-pin-btn')) verifyAndPay(document.getElementById('enter-sip-pin').value);
        if (target.closest('#scan-qr-btn')) startScanner();
        if (target.closest('#close-scanner-btn')) stopScanner();
    };
    container.addEventListener('click', container._payListener);

    // ... (Input listeners remain same) ...
    const amountInput = document.getElementById('pay-amount-input');
    if(amountInput) amountInput.addEventListener('input', (e) => validateAmount(e.target.value));
    const searchInput = document.getElementById('pay-search-input');
    if(searchInput) searchInput.addEventListener('input', (e) => renderMembersGrid(allMembers, e.target.value));
}

// ✅ NEW Helper Function for Downloading QR
async function downloadMyQr() {
    const img = document.getElementById('my-generated-qr');
    const sipId = document.getElementById('qr-modal-sip-id').textContent;

    // Create a temporary link to trigger download
    const link = document.createElement('a');
    link.href = img.src;
    link.download = `My-SIP-QR-${sipId}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// ... (Scanner functions: startScanner, stopScanner, onScanSuccess - पहले जैसे ही रहेंगे) ...
function startScanner() {
    const modal = document.getElementById('scannerModal');
    if(modal) { modal.classList.remove('hidden'); modal.classList.add('flex'); }
    if (!html5QrcodeScanner) {
        if (typeof Html5Qrcode !== 'undefined') { html5QrcodeScanner = new Html5Qrcode("reader"); } 
        else { alert("Scanner library loading..."); stopScanner(); return; }
    }
    html5QrcodeScanner.start({ facingMode: "environment" }, { fps: 10, qrbox: { width: 250, height: 250 } }, onScanSuccess)
    .catch(err => { alert("Camera permission needed."); stopScanner(); });
}
function stopScanner() {
    const modal = document.getElementById('scannerModal');
    if(modal) { modal.classList.add('hidden'); modal.classList.remove('flex'); }
    if (html5QrcodeScanner) html5QrcodeScanner.stop().catch(e => console.error(e));
}
function onScanSuccess(decodedText) {
    stopScanner();
    const scannedId = decodedText.trim();
    if(scannedId && scannedId.includes("BCL-")) {
        const foundMember = allMembers.find(m => m.membershipId === scannedId);
        if(foundMember) openPaymentScreen(foundMember.membershipId);
        else alert("❌ Member not found.");
    } else { alert("⚠️ Invalid QR Code."); }
}
