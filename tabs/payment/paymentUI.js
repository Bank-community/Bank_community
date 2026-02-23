// tabs/payment/paymentUI.js
import { allMembers, currentApp } from './payment.js';
import { openChatScreen, openAmountScreen, validateAmount, initiatePayment, processPinSetup, verifyAndPay, handlePinChangeMode, openHistoryScreen } from './paymentLogic.js';

let showingAll = false;
let html5QrcodeScanner = null;

export function initUI(myMemberInfo, membersList) {
    const profileImg = document.getElementById('pay-self-profile');
    if(profileImg) profileImg.src = myMemberInfo.profilePicUrl || 'https://placehold.co/100';

    const sipIdEl = document.getElementById('my-sip-id');
    if(sipIdEl) sipIdEl.textContent = myMemberInfo.membershipId;

    const qrIdEl = document.getElementById('qr-modal-sip-id');
    if(qrIdEl) qrIdEl.textContent = myMemberInfo.membershipId;

    const qrImg = document.getElementById('my-generated-qr');
    if(qrImg && myMemberInfo.membershipId) {
        qrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${myMemberInfo.membershipId}&bgcolor=fff&color=001540&margin=10`;
    }

    renderMembersGrid(membersList);
}

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
            ? `<img src="${m.profilePicUrl}" class="w-full h-full object-cover rounded-full" crossorigin="anonymous">`
            : `<div class="w-full h-full bg-indigo-500 text-white flex items-center justify-center text-xl font-bold rounded-full">${initial}</div>`;

        const shortName = m.fullName && m.fullName.length > 10 ? m.fullName.substring(0, 9) + '...' : (m.fullName || 'Unknown');

        html += `
        <div class="flex flex-col items-center member-btn cursor-pointer group" data-id="${m.membershipId}">
            <div class="w-16 h-16 rounded-full bg-white border-2 border-indigo-100 p-0.5 shadow-sm overflow-hidden mb-1 relative group-active:scale-95 transition-transform">
                ${avatarHtml}
            </div>
            <span class="text-[10px] font-bold text-gray-700 text-center w-full truncate px-1">${shortName}</span>
        </div>`;
    });

    if (needsMoreBtn) {
        html += `
        <div class="flex flex-col items-center cursor-pointer group" id="view-more-btn">
            <div class="w-16 h-16 rounded-full bg-white border-2 border-gray-100 p-0.5 shadow-sm flex items-center justify-center mb-1 group-active:scale-95 transition-transform">
                <div class="w-full h-full bg-gray-50 rounded-full flex items-center justify-center"><i class="fas fa-chevron-down text-gray-400 text-xl"></i></div>
            </div>
            <span class="text-[10px] font-bold text-gray-700 text-center">More</span>
        </div>`;
    }

    if (filteredList.length === 0) {
        grid.innerHTML = `<div class="col-span-4 text-center py-12"><p class="text-gray-500 text-xs font-bold">No members found</p></div>`;
        return;
    }
    grid.innerHTML = html;
}

export function renderChatHistory(myId, receiverId, transactions) {
    const container = document.getElementById('chat-bubbles');
    container.innerHTML = '';

    let chatTxs = transactions.filter(tx => 
        (tx.type === 'P2P Sent' || tx.type === 'P2P Received') &&
        ((tx.memberId === myId && tx.receiverId === receiverId) || 
         (tx.memberId === receiverId && tx.senderId === myId) ||
         (tx.memberId === myId && tx.senderId === receiverId) ||
         (tx.memberId === receiverId && tx.receiverId === myId))
    );

    chatTxs.sort((a, b) => new Date(a.date) - new Date(b.date));

    const uniqueTxs = new Set();

    chatTxs.forEach(tx => {
        const key = `${tx.amount}_${tx.date.substring(0,16)}`;
        if(uniqueTxs.has(key)) return;
        uniqueTxs.add(key);

        const isMeSender = (tx.type === 'P2P Sent' && tx.memberId === myId) || (tx.type === 'P2P Received' && tx.senderId === myId);
        const time = new Date(tx.date).toLocaleTimeString('en-IN', {hour: '2-digit', minute:'2-digit'});
        const amountStr = `₹${tx.amount.toLocaleString('en-IN')}`;

        if (isMeSender) {
            container.innerHTML += `
            <div class="flex justify-end mb-2">
                <div class="bg-white border border-gray-200 rounded-2xl rounded-tr-sm p-3 max-w-[75%] shadow-sm">
                    <p class="text-xs text-gray-500 mb-1">You paid</p>
                    <p class="text-lg font-bold text-[#001540] mb-1">${amountStr}</p>
                    ${tx.p2pNote ? `<p class="text-[10px] text-gray-600 bg-gray-50 p-1.5 rounded-lg mb-1">"${tx.p2pNote}"</p>` : ''}
                    <div class="flex items-center justify-end gap-1"><i class="fas fa-check-circle text-green-500 text-[10px]"></i><span class="text-[9px] text-gray-400">${time}</span></div>
                </div>
            </div>`;
        } else {
            container.innerHTML += `
            <div class="flex justify-start mb-2">
                <div class="bg-blue-50 border border-blue-100 rounded-2xl rounded-tl-sm p-3 max-w-[75%] shadow-sm">
                    <p class="text-xs text-gray-500 mb-1">Received</p>
                    <p class="text-lg font-bold text-blue-700 mb-1">${amountStr}</p>
                    ${tx.p2pNote ? `<p class="text-[10px] text-gray-600 bg-white p-1.5 rounded-lg mb-1">"${tx.p2pNote}"</p>` : ''}
                    <div class="flex items-center gap-1"><i class="fas fa-check-circle text-green-500 text-[10px]"></i><span class="text-[9px] text-gray-400">${time}</span></div>
                </div>
            </div>`;
        }
    });

    if(container.innerHTML === '') {
        container.innerHTML = `<p class="text-center text-[10px] text-gray-400 mt-4">No previous transactions. Say hello!</p>`;
    }

    const historyCont = document.getElementById('chat-history-container');
    historyCont.scrollTop = historyCont.scrollHeight;
}

// 📜 NEW: RENDER FULL TRANSACTION HISTORY LIST
export function renderFullHistory(historyArray, myId) {
    const container = document.getElementById('history-list-container');
    if (!container) return;
    container.innerHTML = '';

    if (historyArray.length === 0) {
        container.innerHTML = `
        <div class="text-center py-12 opacity-60">
            <div class="w-16 h-16 bg-gray-100 text-gray-400 rounded-full flex items-center justify-center mx-auto mb-3 text-2xl"><i class="fas fa-receipt"></i></div>
            <p class="text-gray-500 text-xs font-bold">No transactions yet</p>
        </div>`;
        return;
    }

    let html = '';
    historyArray.forEach(tx => {
        const isSent = tx.type === 'P2P Sent' && tx.memberId === myId;
        const timeStr = new Date(tx.date).toLocaleString('en-IN', {
            day: 'numeric', month: 'short', hour: '2-digit', minute:'2-digit'
        });

        const amountColor = isSent ? 'text-[#001540]' : 'text-green-600';
        const sign = isSent ? '-' : '+';
        const iconBg = isSent ? 'bg-gray-100' : 'bg-green-50';
        const iconColor = isSent ? 'text-gray-500' : 'text-green-500';
        const iconClass = isSent ? 'fa-arrow-up' : 'fa-arrow-down';

        // Define title carefully based on transaction type
        let title = '';
        if (isSent) {
            title = `Paid to ${tx.receiverName || 'Unknown'}`;
        } else {
            // For received, we should ideally use senderName. 
            // Fallback to "Member" if senderName is missing in older DB records.
            title = `Received from ${tx.senderName || 'Member'}`; 
        }

        html += `
        <div class="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex items-center justify-between transition-transform active:scale-[0.98]">
            <div class="flex items-center gap-3">
                <div class="w-10 h-10 rounded-full ${iconBg} ${iconColor} flex items-center justify-center text-sm shadow-inner">
                    <i class="fas ${iconClass}"></i>
                </div>
                <div>
                    <p class="font-bold text-[#001540] text-xs">${title}</p>
                    <p class="text-[9px] text-gray-400 mt-0.5">${timeStr}</p>
                    ${tx.p2pNote ? `<p class="text-[9px] text-gray-500 italic mt-0.5 max-w-[120px] truncate">"${tx.p2pNote}"</p>` : ''}
                </div>
            </div>
            <div class="text-right">
                <p class="font-extrabold ${amountColor} text-sm">${sign}₹${tx.amount.toLocaleString('en-IN')}</p>
                <p class="text-[8px] text-gray-400 mt-0.5">Success</p>
            </div>
        </div>`;
    });

    container.innerHTML = html;
}

export function setupUIListeners() {
    const container = document.getElementById('app-content');
    if(container._payListener) container.removeEventListener('click', container._payListener);

    container._payListener = (e) => {
        const target = e.target;

        // === 1. TOP HEADER BUTTONS ===

        if (target.closest('#copy-sip-id-btn')) {
            navigator.clipboard.writeText(document.getElementById('my-sip-id').textContent);
            const btn = target.closest('#copy-sip-id-btn');
            btn.innerHTML = `<span class="text-xs font-bold text-green-600 tracking-wide"><i class="fas fa-check-circle mr-1"></i> ID Copied!</span>`;
            setTimeout(() => btn.innerHTML = `<span class="text-xs font-medium text-gray-800 tracking-wide">My SIP ID: <span id="my-sip-id" class="font-bold text-[#001540]">${document.getElementById('my-sip-id').textContent}</span></span><i class="far fa-copy text-gray-400 text-xs ml-1"></i>`, 2000);
        }

        if (target.closest('#pay-anyone-btn')) {
            document.getElementById('pay-search-input').focus();
        }

        if (target.closest('#scan-qr-btn')) {
            startScanner();
        }

        if (target.closest('#show-my-qr-btn')) {
            document.getElementById('myQrModal').classList.replace('hidden', 'flex');
        }

        // 🚀 NEW: OPEN HISTORY SCREEN
        if (target.closest('#show-history-btn')) {
            openHistoryScreen();
        }

        // 🚀 NEW: CLOSE HISTORY SCREEN
        if (target.closest('#close-history-btn')) {
            document.getElementById('history-interface').classList.replace('translate-x-0', 'translate-x-full');
            setTimeout(() => document.getElementById('history-interface').classList.replace('flex', 'hidden'), 300);
        }

        if (target.closest('#close-qr-modal')) document.getElementById('myQrModal').classList.replace('flex', 'hidden');
        if (target.closest('#download-qr-btn')) downloadMyQr();

        if (target.closest('#pay-profile-menu-btn')) {
            document.getElementById('pay-settings-dropdown').classList.toggle('hidden');
        } else if (!target.closest('#pay-settings-dropdown')) {
            const drop = document.getElementById('pay-settings-dropdown');
            if(drop) drop.classList.add('hidden');
        }

        if (target.closest('#open-change-pin-btn')) {
            document.getElementById('pay-settings-dropdown').classList.add('hidden');
            handlePinChangeMode();
        }

        if (target.closest('#view-more-btn')) {
            showingAll = true;
            renderMembersGrid(allMembers, document.getElementById('pay-search-input').value);
        }

        // === 2. CHAT & PAYMENT SCREENS ===

        const memberBtn = target.closest('.member-btn');
        if (memberBtn) {
            openChatScreen(memberBtn.getAttribute('data-id'));
        }

        if (target.closest('#close-chat-btn')) {
            document.getElementById('chat-interface').classList.replace('translate-x-0', 'translate-x-full');
            setTimeout(() => document.getElementById('chat-interface').classList.replace('flex', 'hidden'), 300);
        }

        if (target.closest('#initiate-pay-btn') || target.closest('#chat-message-box')) {
            openAmountScreen();
        }

        if (target.closest('#close-amount-screen')) {
            document.getElementById('amount-screen').classList.replace('translate-y-0', 'translate-y-full');
            setTimeout(() => document.getElementById('amount-screen').classList.replace('flex', 'hidden'), 300);
        }

        // === 3. PIN & TRANSACTION MODALS ===
        if (target.closest('#proceed-pay-btn')) initiatePayment(parseFloat(document.getElementById('pay-amount-input').value));
        if (target.closest('#close-pin-setup')) document.getElementById('pinSetupModal').classList.replace('flex', 'hidden');
        if (target.closest('#close-pin-entry')) document.getElementById('pinEntryModal').classList.replace('flex', 'hidden');
        if (target.closest('#save-pin-btn')) processPinSetup();
        if (target.closest('#verify-pin-btn')) verifyAndPay(document.getElementById('enter-sip-pin').value);

        if (target.closest('#close-scanner-btn')) stopScanner();
    };

    container.addEventListener('click', container._payListener);

    const amountInput = document.getElementById('pay-amount-input');
    if(amountInput) amountInput.addEventListener('input', (e) => validateAmount(e.target.value));

    const searchInput = document.getElementById('pay-search-input');
    if(searchInput) searchInput.addEventListener('input', (e) => renderMembersGrid(allMembers, e.target.value));

    const qrInput = document.getElementById('qr-upload-input');
    if(qrInput) {
        qrInput.addEventListener('change', (e) => {
            if(e.target.files && e.target.files.length > 0) {
                handleQrFileUpload(e.target.files[0]);
            }
        });
    }
}

async function downloadMyQr() {
    const img = document.getElementById('my-generated-qr');
    const sipId = document.getElementById('qr-modal-sip-id').textContent;
    const link = document.createElement('a');
    link.href = img.src; link.download = `My-SIP-QR-${sipId}.png`;
    document.body.appendChild(link); link.click(); document.body.removeChild(link);
}

// ==========================================
// 📷 QR SCANNER & UPLOAD LOGIC
// ==========================================

function startScanner() {
    const modal = document.getElementById('scannerModal');
    if(modal) { modal.classList.remove('hidden'); modal.classList.add('flex'); }
    if (!html5QrcodeScanner) {
        if (typeof Html5Qrcode !== 'undefined') { html5QrcodeScanner = new Html5Qrcode("reader"); } 
        else { alert("Scanner library loading..."); stopScanner(); return; }
    }

    html5QrcodeScanner.start({ facingMode: "environment" }, { fps: 10, qrbox: { width: 250, height: 250 } }, onScanSuccess)
    .catch(err => { console.warn("Camera init failed, might be desktop or permission denied."); });
}

function stopScanner() {
    const modal = document.getElementById('scannerModal');
    if(modal) { modal.classList.add('hidden'); modal.classList.remove('flex'); }
    if (html5QrcodeScanner && html5QrcodeScanner.isScanning) {
        html5QrcodeScanner.stop().catch(e => console.error(e));
    }
    document.getElementById('qr-upload-input').value = ""; 
}

function handleQrFileUpload(file) {
    if (!html5QrcodeScanner) {
        if (typeof Html5Qrcode !== 'undefined') html5QrcodeScanner = new Html5Qrcode("reader");
        else return alert("Library not loaded yet.");
    }

    if(html5QrcodeScanner.isScanning) {
        html5QrcodeScanner.stop().then(() => scanFileNow(file)).catch(e => console.error(e));
    } else {
        scanFileNow(file);
    }
}

function scanFileNow(file) {
    html5QrcodeScanner.scanFile(file, true)
    .then(decodedText => {
        onScanSuccess(decodedText);
    })
    .catch(err => {
        alert("❌ Could not read QR code from this image. Please ensure it's a clear TCF QR.");
    });
}

function onScanSuccess(decodedText) {
    stopScanner();
    const scannedId = decodedText.trim();
    if(scannedId && scannedId.includes("BCL-")) {
        const foundMember = allMembers.find(m => m.membershipId === scannedId);
        if(foundMember) openChatScreen(foundMember.membershipId);
        else alert(`❌ Member ID [${scannedId}] not found in your active list.`);
    } else { alert("⚠️ Invalid QR Code. Please scan a valid TCF SIP QR."); }
}
