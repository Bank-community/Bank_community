// tabs/payment/paymentLogic.js

// 🚀 FIX: Import hasFullKyc directly from payment.js
import { currentApp, allMembers, allTransactions, hasFullKyc } from './payment.js';
import { executeP2PTransaction, savePinToDb } from './paymentDb.js';
import { renderChatHistory } from './paymentUI.js';

export let selectedReceiver = null;
export let finalAllowedLimit = 0;
let isChangingPin = false; 

export function openChatScreen(receiverId) {
    selectedReceiver = allMembers.find(m => m.membershipId === receiverId);
    if (!selectedReceiver) return alert("Member not found!");

    // 1. Populate Chat UI
    document.getElementById('chat-name').textContent = selectedReceiver.fullName;
    document.getElementById('chat-id').textContent = `ID: ${selectedReceiver.membershipId}`;
    document.getElementById('chat-big-name').textContent = selectedReceiver.fullName;

    const picSrc = selectedReceiver.profilePicUrl || 'https://placehold.co/100';
    document.getElementById('chat-avatar').src = picSrc;
    document.getElementById('chat-big-avatar').src = picSrc;
    document.getElementById('amount-screen-name').textContent = selectedReceiver.fullName;

    // 2. Render Past Chat History instantly
    renderChatHistory(currentApp.state.member.membershipId, receiverId, allTransactions);

    // 3. Pre-Calculate Limits
    calculateLimits();

    // 🚀 4. SENDER KYC UI BLOCK: Disable buttons if KYC is incomplete
    const sender = currentApp.state.member;
    const payBtn = document.getElementById('initiate-pay-btn');
    const msgBox = document.getElementById('chat-message-box');

    if (!hasFullKyc(sender)) {
        // Disable Pay Button visually
        if(payBtn) {
            payBtn.textContent = "KYC Pending";
            payBtn.className = "bg-gray-400 text-white font-bold px-4 py-3 rounded-full shadow-sm cursor-not-allowed opacity-80";
        }
        // Disable Message Box visually
        if(msgBox) {
            msgBox.innerHTML = `<span class="text-sm text-red-500 w-full font-bold"><i class="fas fa-lock"></i> Complete KYC to Pay</span>`;
            msgBox.className = "flex-1 bg-red-50 rounded-full flex items-center px-4 py-3 cursor-not-allowed border border-red-100";
        }
    } else {
        // Enable Pay Button
        if(payBtn) {
            payBtn.textContent = "Pay";
            payBtn.className = "bg-blue-600 text-white font-bold px-6 py-3 rounded-full shadow-md hover:bg-blue-700 transition-colors active:scale-95 cursor-pointer";
        }
        // Enable Message Box
        if(msgBox) {
            msgBox.innerHTML = `<span class="text-sm text-gray-500 w-full">Message or pay...</span><i class="fas fa-paper-plane text-gray-400 ml-2"></i>`;
            msgBox.className = "flex-1 bg-gray-100 rounded-full flex items-center px-4 py-3 cursor-pointer hover:bg-gray-200 transition-colors";
        }
    }

    // 5. Show Chat Interface
    const screen = document.getElementById('chat-interface');
    screen.classList.replace('hidden', 'flex');
    setTimeout(() => screen.classList.replace('translate-x-full', 'translate-x-0'), 10);
}

export function openAmountScreen() {
    // 🔒 DOUBLE SECURITY CHECK: Agar kisi ne zabardasti click kiya tab bhi block karo
    const sender = currentApp.state.member;
    if (!hasFullKyc(sender)) {
        alert("🚨 KYC Incomplete: You cannot send money. Please go to your Profile and upload all 4 documents (Photo, Aadhaar Front, Aadhaar Back, Signature).");
        return; 
    }

    const amountInput = document.getElementById('pay-amount-input');
    amountInput.value = '';
    document.getElementById('pay-note-input').value = '';

    const btn = document.getElementById('proceed-pay-btn');
    btn.disabled = true; 
    btn.classList.replace('opacity-100', 'opacity-50');

    if(finalAllowedLimit <= 0) {
        amountInput.disabled = true;
        amountInput.placeholder = "Not Allowed";
    } else {
        amountInput.disabled = false;
        amountInput.placeholder = "0";
    }

    const amountScreen = document.getElementById('amount-screen');
    amountScreen.classList.replace('hidden', 'flex');
    setTimeout(() => amountScreen.classList.replace('translate-y-full', 'translate-y-0'), 10);
}

export function calculateLimits() {
    if(!currentApp || !currentApp.state) return;
    const sender = currentApp.state.member;
    const receiver = selectedReceiver;

    const currentMonth = new Date().toISOString().substring(0, 7);
    let senderSentThisMonth = 0; 
    let receiverReceivedThisMonth = 0;

    allTransactions.forEach(tx => {
        if (tx && tx.date && tx.date.startsWith(currentMonth)) {
            if (tx.type === 'P2P Sent' && tx.memberId === sender.membershipId) senderSentThisMonth += (tx.amount || 0);
            if (tx.type === 'P2P Received' && tx.memberId === receiver.membershipId) receiverReceivedThisMonth += (tx.amount || 0);
        }
    });

    const senderTotalSip = parseFloat(sender.accountBalance || 0);
    const receiverTotalSip = parseFloat(receiver.accountBalance || 0);

    let senderMaxLimit = 0;
    let receiverMaxLimit = 0;

    if (senderTotalSip > 0) {
        senderMaxLimit = Math.max(0, (senderTotalSip * 0.25) - senderSentThisMonth);
    }

    if (receiverTotalSip > 0) {
        receiverMaxLimit = Math.max(0, (receiverTotalSip * 0.25) - receiverReceivedThisMonth);
    }

    finalAllowedLimit = Math.min(senderMaxLimit, receiverMaxLimit);

    const senderLimitEl = document.getElementById('limit-sender');
    const receiverLimitEl = document.getElementById('limit-receiver');
    const warningEl = document.getElementById('limit-warning');

    if(senderLimitEl && receiverLimitEl) {
        if (senderTotalSip <= 0) {
            senderLimitEl.innerHTML = `<span class="text-red-500 font-bold">Negative Balance</span>`;
        } else {
            senderLimitEl.textContent = `₹${Math.floor(senderMaxLimit).toLocaleString('en-IN')}`;
        }

        if (receiverTotalSip <= 0) {
            receiverLimitEl.innerHTML = `<span class="text-red-500 font-bold">Negative Balance</span>`;
        } else {
            receiverLimitEl.textContent = `₹${Math.floor(receiverMaxLimit).toLocaleString('en-IN')}`;
        }
    }

    if(warningEl) {
        if (finalAllowedLimit <= 0) {
            warningEl.innerHTML = `<i class="fas fa-ban"></i> Transfer Not Allowed`;
            warningEl.classList.remove('hidden');
        } else {
            warningEl.classList.add('hidden');
        }
    }
}

export function validateAmount(val) {
    const btn = document.getElementById('proceed-pay-btn');
    const warning = document.getElementById('limit-warning');
    const amount = parseFloat(val) || 0;

    if (finalAllowedLimit <= 0) {
        btn.disabled = true; btn.classList.replace('opacity-100', 'opacity-50');
        return;
    }

    if (amount > finalAllowedLimit) {
        warning.innerHTML = `<i class="fas fa-exclamation-circle"></i> Exceeds 25% Limit`;
        warning.classList.remove('hidden'); 
        btn.disabled = true; 
        btn.classList.replace('opacity-100', 'opacity-50');
    } else if (amount >= 500) {
        warning.classList.add('hidden'); 
        btn.disabled = false; 
        btn.classList.replace('opacity-50', 'opacity-100');
    } else {
        warning.innerHTML = `<i class="fas fa-info-circle"></i> Minimum transfer ₹500`;
        warning.classList.remove('hidden'); 
        btn.disabled = true; 
        btn.classList.replace('opacity-100', 'opacity-50');
    }
}

export function initiatePayment(amount) {
    const sender = currentApp.state.member;
    if (!sender.sipPin) {
        isChangingPin = false; 
        setupPinModalUI("Set SIP PIN", "Create a 4-digit secure PIN", false);
        document.getElementById('pinSetupModal').classList.replace('hidden', 'flex');
    } else {
        document.getElementById('confirm-amount-text').textContent = `₹${amount.toLocaleString('en-IN')}`;
        document.getElementById('enter-sip-pin').value = '';
        document.getElementById('pin-entry-error').classList.add('hidden');
        document.getElementById('pinEntryModal').classList.replace('hidden', 'flex');
    }
}

export function handlePinChangeMode() {
    isChangingPin = true;
    const sender = currentApp.state.member;

    if(!sender.sipPin) {
        alert("You haven't set a PIN yet. Setup will open.");
        isChangingPin = false;
        setupPinModalUI("Set SIP PIN", "Create a 4-digit secure PIN", false);
    } else {
        setupPinModalUI("Change SIP PIN", "Enter old PIN and new PIN", true);
    }
    document.getElementById('pinSetupModal').classList.replace('hidden', 'flex');
}

function setupPinModalUI(title, desc, showOldPin) {
    document.getElementById('pin-setup-title').textContent = title;
    document.getElementById('pin-setup-desc').textContent = desc;
    document.getElementById('new-sip-pin').value = '';
    document.getElementById('pin-setup-error').classList.add('hidden');

    const oldPinInput = document.getElementById('old-sip-pin');
    if(showOldPin) {
        oldPinInput.classList.remove('hidden');
        oldPinInput.value = '';
    } else {
        oldPinInput.classList.add('hidden');
    }
}

export async function processPinSetup() {
    const errorEl = document.getElementById('pin-setup-error');
    const newPin = document.getElementById('new-sip-pin').value;
    const oldPin = document.getElementById('old-sip-pin').value;

    errorEl.classList.add('hidden');

    if(newPin.length !== 4) {
        errorEl.textContent = "New PIN must be 4 digits"; errorEl.classList.remove('hidden'); return;
    }

    if(isChangingPin) {
        if(oldPin !== currentApp.state.member.sipPin) {
            errorEl.textContent = "Incorrect Old PIN"; errorEl.classList.remove('hidden'); return;
        }
    }

    const btn = document.getElementById('save-pin-btn');
    btn.textContent = "Saving..."; btn.disabled = true;

    try {
        await savePinToDb(currentApp.db, currentApp.state.member.membershipId, newPin);
        currentApp.state.member.sipPin = newPin; 
        document.getElementById('pinSetupModal').classList.replace('flex', 'hidden');

        if(isChangingPin) {
            alert("✅ PIN Changed Successfully!");
        } else {
            initiatePayment(parseFloat(document.getElementById('pay-amount-input').value));
        }
    } catch (err) {
        alert("Failed to save PIN: " + err.message);
    } finally {
        btn.textContent = "Set PIN"; btn.disabled = false;
    }
}

export async function verifyAndPay(enteredPin) {
    const errorEl = document.getElementById('pin-entry-error');
    if (enteredPin !== currentApp.state.member.sipPin) {
        errorEl.classList.remove('hidden'); return;
    }

    const amount = parseFloat(document.getElementById('pay-amount-input').value);
    const note = document.getElementById('pay-note-input').value;
    const btn = document.getElementById('verify-pin-btn');

    btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Processing...`; btn.disabled = true;

    try {
        await executeP2PTransaction(currentApp.db, currentApp.state.member, selectedReceiver, amount, note);

        document.getElementById('pinEntryModal').classList.replace('flex', 'hidden');
        document.getElementById('amount-screen').classList.replace('translate-y-0', 'translate-y-full');
        setTimeout(() => document.getElementById('amount-screen').classList.replace('flex', 'hidden'), 300);

        currentApp.state.member.accountBalance -= amount; 

        const container = document.getElementById('chat-bubbles');
        const time = new Date().toLocaleTimeString('en-IN', {hour: '2-digit', minute:'2-digit'});

        if(container.innerHTML.includes('No previous transactions')) {
            container.innerHTML = '';
        }

        container.innerHTML += `
        <div class="flex justify-end mb-2 animate-fade">
            <div class="bg-white border border-gray-200 rounded-2xl rounded-tr-sm p-3 max-w-[75%] shadow-sm">
                <p class="text-xs text-gray-500 mb-1">You paid</p>
                <p class="text-lg font-bold text-[#001540] mb-1">₹${amount.toLocaleString('en-IN')}</p>
                ${note ? `<p class="text-[10px] text-gray-600 bg-gray-50 p-1.5 rounded-lg mb-1">"${note}"</p>` : ''}
                <div class="flex items-center justify-end gap-1"><i class="fas fa-check-circle text-green-500 text-[10px]"></i><span class="text-[9px] text-gray-400">${time}</span></div>
            </div>
        </div>`;

        const historyCont = document.getElementById('chat-history-container');
        historyCont.scrollTop = historyCont.scrollHeight;

    } catch (err) {
        alert("Payment Failed: " + err.message);
    } finally {
        btn.innerHTML = "Verify & Pay"; btn.disabled = false;
    }
}
