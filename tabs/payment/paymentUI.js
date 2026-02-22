// tabs/payment/paymentUI.js
import { allMembers, currentApp } from './payment.js';
import { openChatScreen, openAmountScreen, validateAmount, initiatePayment, processPinSetup, verifyAndPay, handlePinChangeMode } from './paymentLogic.js';

let showingAll = false;

export function initUI(myMemberInfo, membersList) {
    const profileImg = document.getElementById('pay-self-profile');
    if(profileImg) profileImg.src = myMemberInfo.profilePicUrl || 'https://placehold.co/100';

    document.getElementById('my-sip-id').textContent = myMemberInfo.membershipId;
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

        // ✅ ADDED BORDER HERE (border-2 border-indigo-100 p-0.5)
        html += `
        <div class="flex flex-col items-center member-btn cursor-pointer group" data-id="${m.membershipId}">
            <div class="w-16 h-16 rounded-full bg-white border-2 border-indigo-100 p-0.5 shadow-sm overflow-hidden mb-1 relative group-active:scale-95 transition-transform">
                ${avatarHtml}
                <div class="absolute top-1 right-1 w-3 h-3 bg-green-500 border-2 border-white rounded-full"></div>
            </div>
            <span class="text-[10px] font-bold text-gray-700 text-center w-full truncate px-1">${shortName}</span>
        </div>`;
    });

    if (needsMoreBtn) {
        html += `
        <div class="flex flex-col items-center cursor-pointer group" id="view-more-btn">
            <div class="w-16 h-16 rounded-full bg-white border-2 border-gray-100 p-0.5 shadow-sm flex items-center justify-center mb-1 group-active:scale-95 transition-transform"><div class="w-full h-full bg-gray-50 rounded-full flex items-center justify-center"><i class="fas fa-chevron-down text-gray-400 text-xl"></i></div></div>
            <span class="text-[10px] font-bold text-gray-700 text-center">More</span>
        </div>`;
    }

    if (filteredList.length === 0) {
        grid.innerHTML = `<div class="col-span-4 text-center py-12"><p class="text-gray-500 text-xs font-bold">No members found</p></div>`; return;
    }
    grid.innerHTML = html;
}

export function renderChatHistory(myId, receiverId, transactions) {
    const container = document.getElementById('chat-bubbles');
    container.innerHTML = '';

    // Filter P2P transactions between these two users
    let chatTxs = transactions.filter(tx => 
        (tx.type === 'P2P Sent' || tx.type === 'P2P Received') &&
        ((tx.memberId === myId && tx.receiverId === receiverId) || 
         (tx.memberId === receiverId && tx.senderId === myId) ||
         (tx.memberId === myId && tx.senderId === receiverId) || // Catch all variations
         (tx.memberId === receiverId && tx.receiverId === myId))
    );

    // Sort by Date Oldest to Newest for Chat Flow
    chatTxs.sort((a, b) => new Date(a.date) - new Date(b.date));

    // To avoid duplicates (since we save 2 records per transfer), we use a Set
    const uniqueTxs = new Set();

    chatTxs.forEach(tx => {
        // Unique key based on amount, date, and note
        const key = `${tx.amount}_${tx.date.substring(0,16)}`;
        if(uniqueTxs.has(key)) return;
        uniqueTxs.add(key);

        const isMeSender = (tx.type === 'P2P Sent' && tx.memberId === myId) || (tx.type === 'P2P Received' && tx.senderId === myId);
        const time = new Date(tx.date).toLocaleTimeString('en-IN', {hour: '2-digit', minute:'2-digit'});
        const amountStr = `₹${tx.amount.toLocaleString('en-IN')}`;

        if (isMeSender) {
            // Sent Bubble (Right Side)
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
            // Received Bubble (Left Side)
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

    // Scroll to bottom
    const historyCont = document.getElementById('chat-history-container');
    historyCont.scrollTop = historyCont.scrollHeight;
}

export function setupUIListeners() {
    const container = document.getElementById('app-content');
    if(container._payListener) container.removeEventListener('click', container._payListener);

    container._payListener = (e) => {
        const target = e.target;

        // Profile Menu (Change PIN)
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

        // Open Chat Interface on Member Click
        const memberBtn = target.closest('.member-btn');
        if (memberBtn) {
            openChatScreen(memberBtn.getAttribute('data-id'));
        }

        // Close Chat
        if (target.closest('#close-chat-btn')) {
            document.getElementById('chat-interface').classList.replace('translate-x-0', 'translate-x-full');
            setTimeout(() => document.getElementById('chat-interface').classList.replace('flex', 'hidden'), 300);
        }

        // Open Amount Screen from Chat
        if (target.closest('#initiate-pay-btn')) openAmountScreen();

        // Close Amount Screen
        if (target.closest('#close-amount-screen')) {
            document.getElementById('amount-screen').classList.replace('translate-y-0', 'translate-y-full');
            setTimeout(() => document.getElementById('amount-screen').classList.replace('flex', 'hidden'), 300);
        }

        // Action Modals
        if (target.closest('#proceed-pay-btn')) initiatePayment(parseFloat(document.getElementById('pay-amount-input').value));
        if (target.closest('#close-pin-setup')) document.getElementById('pinSetupModal').classList.replace('flex', 'hidden');
        if (target.closest('#close-pin-entry')) document.getElementById('pinEntryModal').classList.replace('flex', 'hidden');
        if (target.closest('#save-pin-btn')) processPinSetup();
        if (target.closest('#verify-pin-btn')) verifyAndPay(document.getElementById('enter-sip-pin').value);
    };
    container.addEventListener('click', container._payListener);

    const amountInput = document.getElementById('pay-amount-input');
    if(amountInput) amountInput.addEventListener('input', (e) => validateAmount(e.target.value));
}
