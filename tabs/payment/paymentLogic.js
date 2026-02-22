// tabs/payment/paymentLogic.js
import { currentApp, allMembers } from './payment.js';
import { executeP2PTransaction, savePinToDb } from './paymentDb.js';

export let selectedReceiver = null;
export let finalAllowedLimit = 0;

export function openPaymentScreen(receiverId) {
    selectedReceiver = allMembers.find(m => m.membershipId === receiverId);
    if (!selectedReceiver) return alert("Member not found!");

    // UI Update
    document.getElementById('pay-receiver-name').textContent = selectedReceiver.fullName;
    document.getElementById('pay-receiver-id').textContent = `ID: ${selectedReceiver.membershipId}`;
    const pic = document.getElementById('pay-receiver-pic');
    if(pic) pic.src = selectedReceiver.profilePicUrl || 'https://placehold.co/100';

    document.getElementById('pay-amount-input').value = '';
    document.getElementById('pay-note-input').value = '';
    document.getElementById('limit-warning').classList.add('hidden');

    const proceedBtn = document.getElementById('proceed-pay-btn');
    proceedBtn.disabled = true;
    proceedBtn.classList.replace('opacity-100', 'opacity-50');

    // Calculate 25% Limits
    calculateLimits();

    // Show Screen Smoothly
    const screen = document.getElementById('payment-screen');
    if(screen) {
        screen.classList.replace('hidden', 'flex');
        setTimeout(() => screen.classList.replace('translate-y-full', 'translate-y-0'), 10);
    }
}

export function calculateLimits() {
    if(!currentApp || !currentApp.state) return;
    const sender = currentApp.state.member;
    const receiver = selectedReceiver;

    const currentMonth = new Date().toISOString().substring(0, 7); // Gets "YYYY-MM"
    let senderSentThisMonth = 0;
    let receiverReceivedThisMonth = 0;

    // Check history for this month's P2P usage
    if (currentApp.state.allData) {
        currentApp.state.allData.forEach(tx => {
            if (tx.date && tx.date.startsWith(currentMonth)) {
                if (tx.type === 'P2P Sent' && tx.memberId === sender.membershipId) senderSentThisMonth += (tx.amount || 0);
                if (tx.type === 'P2P Received' && tx.memberId === receiver.membershipId) receiverReceivedThisMonth += (tx.amount || 0);
            }
        });
    }

    const senderTotalSip = parseFloat(sender.accountBalance || 0);
    const receiverTotalSip = parseFloat(receiver.accountBalance || 0);

    // 25% Formula limit
    const senderMaxLimit = Math.max(0, (senderTotalSip * 0.25) - senderSentThisMonth);
    const receiverMaxLimit = Math.max(0, (receiverTotalSip * 0.25) - receiverReceivedThisMonth);

    // Final limit is whichever is lower
    finalAllowedLimit = Math.min(senderMaxLimit, receiverMaxLimit);

    document.getElementById('limit-sender').textContent = `₹${Math.floor(senderMaxLimit).toLocaleString('en-IN')}`;
    document.getElementById('limit-receiver').textContent = `₹${Math.floor(receiverMaxLimit).toLocaleString('en-IN')}`;
}

export function validateAmount(val) {
    const btn = document.getElementById('proceed-pay-btn');
    const warning = document.getElementById('limit-warning');
    const amount = parseFloat(val) || 0;

    if (amount > finalAllowedLimit) {
        warning.classList.remove('hidden');
        btn.disabled = true;
        btn.classList.replace('opacity-100', 'opacity-50');
    } else if (amount >= 500) {  // Minimum 500 Rule
        warning.classList.add('hidden');
        btn.disabled = false;
        btn.classList.replace('opacity-50', 'opacity-100');
    } else {
        warning.classList.add('hidden');
        btn.disabled = true;
        btn.classList.replace('opacity-100', 'opacity-50');
    }
}

export function initiatePayment(amount) {
    const sender = currentApp.state.member;

    // Check if user has SIP PIN
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

export async function processPinSetup(pin) {
    const errorEl = document.getElementById('pin-setup-error');
    if(!pin || pin.length !== 4) {
        errorEl.classList.remove('hidden');
        return;
    }

    const btn = document.getElementById('save-pin-btn');
    btn.textContent = "Saving..."; btn.disabled = true;

    try {
        await savePinToDb(currentApp.db, currentApp.state.member.membershipId, pin);
        currentApp.state.member.sipPin = pin; // Save locally
        document.getElementById('pinSetupModal').classList.replace('flex', 'hidden');

        // Go straight to payment
        initiatePayment(parseFloat(document.getElementById('pay-amount-input').value));
    } catch (err) {
        alert("Failed to save PIN: " + err.message);
    } finally {
        btn.textContent = "Set PIN"; btn.disabled = false;
    }
}

export async function verifyAndPay(enteredPin) {
    const errorEl = document.getElementById('pin-entry-error');
    if (enteredPin !== currentApp.state.member.sipPin) {
        errorEl.classList.remove('hidden');
        return;
    }

    const amount = parseFloat(document.getElementById('pay-amount-input').value);
    const note = document.getElementById('pay-note-input').value;
    const btn = document.getElementById('verify-pin-btn');

    btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Processing...`; btn.disabled = true;

    try {
        // Execute Atomic Transaction
        await executeP2PTransaction(currentApp.db, currentApp.state.member, selectedReceiver, amount, note);

        // Success Actions
        document.getElementById('pinEntryModal').classList.replace('flex', 'hidden');
        document.getElementById('payment-screen').classList.replace('translate-y-0', 'translate-y-full');
        setTimeout(() => document.getElementById('payment-screen').classList.replace('flex', 'hidden'), 300);

        // Refresh local balance for immediate UI update
        currentApp.state.member.accountBalance -= amount; 
        alert(`✅ Transfer Successful!\n₹${amount} has been sent to ${selectedReceiver.fullName}`);

    } catch (err) {
        alert("Payment Failed: " + err.message);
    } finally {
        btn.innerHTML = "Verify & Pay"; btn.disabled = false;
    }
}
