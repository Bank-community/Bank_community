// tabs/payment/paymentUI.js
import { allMembers, currentApp, allTransactions } from './payment.js';
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

// [REPLACE] paymentUI.js mein renderMembersGrid function ko isse replace karein:

// [REPLACE] paymentUI.js mein renderMembersGrid function ko is naye code se replace karein:

export function renderMembersGrid(membersList, searchQuery = "") {
    const grid = document.getElementById('members-grid');
    if(!grid) return;
    grid.innerHTML = '';

    // 1. Global Data Access (Safe Check)
    // Hum payment.js ke exported variable ya global state dono check karenge
    let txs = [];
    if (window.tcfApp && window.tcfApp.state && window.tcfApp.state.allData && window.tcfApp.state.allData.length > 0) {
        txs = window.tcfApp.state.allData;
    } else {
        // Fallback: Agar global state khali hai to payment.js wala variable try karo
        // (Note: Import variable direct access nahi milta yahan easily bina module reload ke, 
        // isliye hum window object ya passed arguments use karte hain usually)
        // Lekin 'payment.js' me humne 'onValue' lagaya hai jo render call kar raha hai,
        // to hum assume kar sakte hain data sync ho raha hai.
        
        // Quick Fix: Hum 'payment.js' se data pass karwa sakte the, par abhi hum global transactions use karenge
        // jo 'view_core.js' ya 'payment.js' se populate hote hain.
        // Chaliye hum 'allTransactions' ko direct import variable mante hain (ES6 module scope)
        // Lekin safety ke liye hum window object pe depend rahenge agar available hai.
    }
    
    // Agar upar wala check fail ho, to hum payment.js se aayi hui 'allTransactions' use karne ki koshish karenge
    // (Iske liye file ke top pe: import { allTransactions } from './payment.js'; hona chahiye)
    // Lekin runtime error se bachne ke liye hum ek custom logic lagayenge:
    const { allTransactions } = require('./payment.js'); // Hack for intelligent IDEs, browser ignore karega
    if (!txs || txs.length === 0) txs = (window.tcfApp && window.tcfApp.state && window.tcfApp.state.allData) || [];

    // My ID
    const myId = (window.tcfApp && window.tcfApp.state && window.tcfApp.state.member) 
                 ? window.tcfApp.state.member.membershipId 
                 : localStorage.getItem('verifiedMemberId');

    // 2. Helper: Get Last Interaction Time
    const getInteractionInfo = (otherMemberId) => {
        if (!myId) return { time: 0, receivedRecently: false };

        // Filter transactions between ME and OTHER
        const interactions = txs.filter(t => 
            (t.senderId === myId && t.receiverId === otherMemberId) || // Maine bheja
            (t.senderId === otherMemberId && t.receiverId === myId) || // Usne bheja
            (t.memberId === myId && t.receiverId === otherMemberId) || // Old structure
            (t.memberId === myId && t.senderId === otherMemberId)      // Old structure
        );

        if (interactions.length === 0) return { time: 0, receivedRecently: false };

        // Sort desc (Latest first)
        interactions.sort((a, b) => new Date(b.date) - new Date(a.date));
        const lastTx = interactions[0];
        const lastTime = new Date(lastTx.date).getTime();

        // Check if I RECEIVED money recently (within 24 hours)
        let receivedRecently = false;
        // Logic: Agar sender WO hai aur receiver MAIN hu
        if (lastTx.senderId === otherMemberId && (lastTx.receiverId === myId || lastTx.memberId === myId)) {
            const diffHours = (new Date() - new Date(lastTx.date)) / (1000 * 60 * 60);
            if (diffHours < 24) receivedRecently = true;
        }

        return { time: lastTime, receivedRecently: receivedRecently };
    };

    // 3. Search Filter
    let filteredList = membersList;
    if (searchQuery.trim() !== "") {
        const lowerQ = searchQuery.toLowerCase();
        filteredList = membersList.filter(m => 
            (m.fullName && m.fullName.toLowerCase().includes(lowerQ)) || 
            (m.membershipId && m.membershipId.toLowerCase().includes(lowerQ))
        );
    }

    // 4. SORTING: Active Members First
    // Hum har member ke object me temporary sort key add karenge
    const listWithMeta = filteredList.map(m => {
        const info = getInteractionInfo(m.membershipId);
        return { ...m, _lastTime: info.time, _isRecent: info.receivedRecently };
    });

    listWithMeta.sort((a, b) => b._lastTime - a._lastTime);

    // 5. Render UI
    let displayList = listWithMeta;
    let needsMoreBtn = false;

    if (!window.showingAllMembers && displayList.length > 7) {
        displayList = displayList.slice(0, 7);
        needsMoreBtn = true;
    }

    let html = '';
    displayList.forEach(m => {
        const initial = m.fullName ? m.fullName.charAt(0).toUpperCase() : '?';
        
        // STYLING LOGIC
        let borderClass = 'border-indigo-100'; // Default Border
        let indicatorHtml = ''; // Green Dot

        // Agar paisa aaya hai (Green Circle + Dot)
        if (m._isRecent) {
            borderClass = 'border-green-500 ring-2 ring-green-100'; // Green Ring styling
            indicatorHtml = `
                <div class="absolute -bottom-1 -right-1 bg-green-500 text-white text-[8px] font-bold w-5 h-5 flex items-center justify-center rounded-full border-2 border-white z-10 shadow-sm animate-pulse">
                    <i class="fas fa-arrow-down"></i>
                </div>`;
        }

        let avatarHtml = m.profilePicUrl 
            ? `<img src="${m.profilePicUrl}" class="w-full h-full object-cover rounded-full" crossorigin="anonymous">`
            : `<div class="w-full h-full bg-indigo-500 text-white flex items-center justify-center text-xl font-bold rounded-full">${initial}</div>`;

        const shortName = m.fullName && m.fullName.length > 10 ? m.fullName.substring(0, 9) + '...' : (m.fullName || 'Unknown');

        // Main HTML Structure
        html += `
        <div class="flex flex-col items-center member-btn cursor-pointer group animate-fade" data-id="${m.membershipId}">
            <div class="w-16 h-16 rounded-full bg-white border-2 ${borderClass} p-0.5 shadow-sm mb-1 relative group-active:scale-95 transition-transform">
                <div class="w-full h-full relative rounded-full overflow-hidden">
                    ${avatarHtml}
                </div>
                ${indicatorHtml}
            </div>
            <span class="text-[10px] font-bold text-gray-700 text-center w-full truncate px-1 ${m._isRecent ? 'text-green-700' : ''}">${shortName}</span>
        </div>`;
    });

    if (needsMoreBtn) {
        html += `
        <div class="flex flex-col items-center cursor-pointer group" id="view-more-btn" onclick="window.showingAllMembers=true; import('./paymentUI.js').then(m=>m.renderMembersGrid(window.tcfApp.state.memberMap.values(), ''))">
            <div class="w-16 h-16 rounded-full bg-white border-2 border-gray-100 p-0.5 shadow-sm flex items-center justify-center mb-1 group-active:scale-95 transition-transform">
                <div class="w-full h-full bg-gray-50 rounded-full flex items-center justify-center"><i class="fas fa-chevron-down text-gray-400 text-xl"></i></div>
            </div>
            <span class="text-[10px] font-bold text-gray-700 text-center">More</span>
        </div>`;
    }

    if (displayList.length === 0) {
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
// [REPLACE] paymentUI.js mein renderFullHistory function ko isse replace karein:

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
    historyArray.forEach((tx, index) => {
        const isSent = tx.type === 'P2P Sent' && tx.memberId === myId;
        const timeStr = new Date(tx.date).toLocaleString('en-IN', {
            day: 'numeric', month: 'short', hour: '2-digit', minute:'2-digit'
        });

        const amountColor = isSent ? 'text-[#001540]' : 'text-green-600';
        const sign = isSent ? '-' : '+';
        const iconBg = isSent ? 'bg-gray-100' : 'bg-green-50';
        const iconColor = isSent ? 'text-gray-500' : 'text-green-500';
        const iconClass = isSent ? 'fa-arrow-up' : 'fa-arrow-down';

        let title = isSent ? `Paid to ${tx.receiverName || 'Unknown'}` : `Received from ${tx.senderName || 'Member'}`;
        
        // Unique ID for receipt generation
        const rowId = `tx-row-${index}`;

        html += `
        <div id="${rowId}" class="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex items-center justify-between transition-transform relative group">
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
            <div class="flex items-center gap-3">
                <div class="text-right">
                    <p class="font-extrabold ${amountColor} text-sm">${sign}₹${tx.amount.toLocaleString('en-IN')}</p>
                    <p class="text-[8px] text-gray-400 mt-0.5">Success</p>
                </div>
                <button onclick="window.downloadReceiptImage('${rowId}', '${title}', '${tx.amount}', '${timeStr}')" class="w-8 h-8 rounded-full bg-gray-50 text-gray-400 hover:text-[#001540] hover:bg-gray-200 flex items-center justify-center transition-colors">
                    <i class="fas fa-download text-xs"></i>
                </button>
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


// [ADD AT THE END] paymentUI.js ke sabse last me ye code paste karein:

// --- RECEIPT GENERATOR ---
window.downloadReceiptImage = function(rowId, title, amount, time) {
    // 1. Create a temporary receipt element
    const receiptDiv = document.createElement('div');
    receiptDiv.style.position = 'fixed';
    receiptDiv.style.top = '-9999px';
    receiptDiv.style.left = '-9999px';
    receiptDiv.style.width = '350px';
    receiptDiv.style.background = 'linear-gradient(135deg, #001540 0%, #002366 100%)';
    receiptDiv.style.padding = '30px 20px';
    receiptDiv.style.borderRadius = '20px';
    receiptDiv.style.color = 'white';
    receiptDiv.style.fontFamily = 'Poppins, sans-serif';
    receiptDiv.style.textAlign = 'center';
    receiptDiv.innerHTML = `
        <div style="border: 2px solid #D4AF37; padding: 20px; border-radius: 15px; position: relative;">
            <h2 style="color: #D4AF37; font-size: 18px; margin: 0 0 5px 0; text-transform: uppercase; letter-spacing: 1px;">TCF Payment Receipt</h2>
            <p style="font-size: 10px; color: #aaa; margin-bottom: 20px;">Trust Community Fund</p>
            
            <div style="background: rgba(255,255,255,0.1); padding: 15px; border-radius: 10px; margin-bottom: 15px;">
                <p style="font-size: 12px; color: #ddd; margin: 0;">Amount</p>
                <p style="font-size: 32px; font-weight: bold; margin: 5px 0; color: #fff;">₹${parseFloat(amount).toLocaleString('en-IN')}</p>
                <p style="font-size: 10px; color: #4ade80;">Payment Successful <span style="font-size:12px">✔</span></p>
            </div>

            <div style="text-align: left; margin-top: 20px; font-size: 12px; color: #ccc;">
                <p style="margin-bottom: 8px;"><strong style="color:#D4AF37">Type:</strong> ${title}</p>
                <p style="margin-bottom: 8px;"><strong style="color:#D4AF37">Date:</strong> ${time}</p>
                <p style="margin-bottom: 0;"><strong style="color:#D4AF37">Status:</strong> Completed</p>
            </div>
            
            <div style="margin-top: 25px; font-size: 9px; color: #666;">
                Generated by TCF App
            </div>
        </div>
    `;
    
    document.body.appendChild(receiptDiv);

    // 2. Capture and Download
    if(typeof html2canvas !== 'undefined') {
        html2canvas(receiptDiv, { scale: 2, backgroundColor: null }).then(canvas => {
            const link = document.createElement('a');
            link.download = `TCF-Receipt-${Date.now()}.png`;
            link.href = canvas.toDataURL();
            link.click();
            document.body.removeChild(receiptDiv);
        });
    } else {
        alert("Receipt library loading... Try again in 2 seconds.");
        document.body.removeChild(receiptDiv);
    }
};