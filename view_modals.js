// view_modals.js - Handles all Popups (Modals), Forms, and Certificate UI

import { ref, update } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-database.js";

const DEFAULT_PROFILE_PIC = 'https://placehold.co/200x200/E0E7FF/4F46E5?text=User';

// --- MAIN INIT FUNCTION ---
export function initModals(db, getState) {
    if(document.body.getAttribute('data-listeners-added')) return;
    document.body.setAttribute('data-listeners-added', 'true');

    // 1. Image Viewer (Using Event Delegation for dynamically loaded images)
    const imageViewerModal = document.getElementById('imageViewerModal');
    document.body.addEventListener('click', (e) => {
        const img = e.target.closest('.document-thumbnail img');
        if (img) {
            document.getElementById('fullImageView').src = img.src;
            imageViewerModal.classList.remove('hidden');
            imageViewerModal.classList.add('flex');
        }
    });
    document.getElementById('closeImageViewer').addEventListener('click', () => {
        imageViewerModal.classList.add('hidden');
        imageViewerModal.classList.remove('flex');
    });
    
    // 2. Withdrawal Modal
    const withdrawalModal = document.getElementById('withdrawalModal');
    document.getElementById('withdraw-btn').addEventListener('click', () => {
        const state = getState();
        document.getElementById('modal-available-balance').textContent = `₹${state.currentMemberData.extraBalance.toLocaleString('en-IN', {minimumFractionDigits: 0, maximumFractionDigits: 2})}`;
        withdrawalModal.classList.remove('hidden');
        withdrawalModal.classList.add('flex');
    });
    document.getElementById('close-withdrawal-modal').addEventListener('click', () => {
        withdrawalModal.classList.add('hidden');
        withdrawalModal.classList.remove('flex');
    });
    document.getElementById('submit-withdrawal').addEventListener('click', () => submitWithdrawal(getState));

    // 3. History Modal
    const historyModal = document.getElementById('historyModal');
    document.getElementById('view-history-btn').addEventListener('click', () => {
        populateHistoryModal(getState().balanceHistory);
        historyModal.classList.remove('hidden');
        historyModal.classList.add('flex');
    });
    document.getElementById('close-history-modal').addEventListener('click', () => {
        historyModal.classList.add('hidden');
        historyModal.classList.remove('flex');
    });

    // 4. Score Modal
    const scoreModal = document.getElementById('scoreBreakdownModal');
    document.getElementById('score-info-btn').addEventListener('click', () => {
        populateScoreBreakdownModal(getState().scoreResultCache);
        scoreModal.classList.remove('hidden');
        scoreModal.classList.add('flex');
    });
    document.getElementById('close-score-modal').addEventListener('click', () => {
        scoreModal.classList.add('hidden');
        scoreModal.classList.remove('flex');
    });

    // 5. Certificate Result Modal
    const cardModal = document.getElementById('cardResultModal');
    document.getElementById('close-card-modal').addEventListener('click', () => {
            cardModal.classList.add('hidden');
            cardModal.classList.remove('flex');
    });
    document.getElementById('download-card-btn').addEventListener('click', () => downloadCard(getState));
    document.getElementById('share-card-btn').addEventListener('click', () => shareCard(getState));

    // 6. Form Listeners (Password & Email)
    setupPasswordListeners(db, getState);
    setupEmailListeners(db, getState);
}

// --- PASSWORD LOGIC ---
function setupPasswordListeners(db, getState) {
    const passwordModal = document.getElementById('passwordModal');
    const openBtn = document.getElementById('change-password-btn');
    const closeBtn = document.getElementById('close-password-modal');
    const submitBtn = document.getElementById('submit-password-change');
    
    openBtn.addEventListener('click', () => {
        document.getElementById('current-password').value = '';
        document.getElementById('new-password').value = '';
        document.getElementById('confirm-password').value = '';
        document.getElementById('password-error').classList.add('hidden');
        document.getElementById('password-success').classList.add('hidden');
        passwordModal.classList.remove('hidden');
        passwordModal.classList.add('flex');
    });

    closeBtn.addEventListener('click', () => {
        passwordModal.classList.add('hidden');
        passwordModal.classList.remove('flex');
    });

    submitBtn.addEventListener('click', async () => {
        const state = getState();
        const currentPass = document.getElementById('current-password').value.trim();
        const newPass = document.getElementById('new-password').value.trim();
        const confirmPass = document.getElementById('confirm-password').value.trim();
        const errorEl = document.getElementById('password-error');
        const successEl = document.getElementById('password-success');

        errorEl.classList.add('hidden');
        successEl.classList.add('hidden');

        if (!currentPass || !newPass || !confirmPass) {
            errorEl.innerHTML = '<i class="fas fa-times-circle"></i> All fields are required.';
            errorEl.classList.remove('hidden');
            return;
        }
        if (currentPass !== String(state.currentMemberData.password)) {
            errorEl.innerHTML = '<i class="fas fa-times-circle"></i> Incorrect current password.';
            errorEl.classList.remove('hidden');
            return;
        }
        if (!/^\d+$/.test(newPass)) {
            errorEl.innerHTML = '<i class="fas fa-times-circle"></i> Password must contain numbers only.';
            errorEl.classList.remove('hidden');
            return;
        }
        if (newPass !== confirmPass) {
            errorEl.innerHTML = '<i class="fas fa-times-circle"></i> New passwords do not match.';
            errorEl.classList.remove('hidden');
            return;
        }

        try {
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Updating...';
            const memberRef = ref(db, 'members/' + state.currentMemberData.membershipId);
            await update(memberRef, { password: newPass });
            state.currentMemberData.password = newPass;
            successEl.classList.remove('hidden');
            setTimeout(() => {
                passwordModal.classList.add('hidden');
                passwordModal.classList.remove('flex');
                submitBtn.disabled = false;
                submitBtn.textContent = 'Update';
            }, 1500);
        } catch (error) {
            errorEl.innerHTML = `<i class="fas fa-times-circle"></i> Update failed: ${error.message}`;
            errorEl.classList.remove('hidden');
            submitBtn.disabled = false;
            submitBtn.textContent = 'Update';
        }
    });
}

// --- EMAIL LOGIC ---
function setupEmailListeners(db, getState) {
    const emailModal = document.getElementById('emailModal');
    const openBtn = document.getElementById('edit-email-btn');
    const closeBtn = document.getElementById('close-email-modal');
    const submitBtn = document.getElementById('submit-email-change');
    
    openBtn.addEventListener('click', () => {
        const state = getState();
        document.getElementById('new-email-input').value = state.currentMemberData.email || '';
        document.getElementById('email-error').classList.add('hidden');
        document.getElementById('email-success').classList.add('hidden');
        emailModal.classList.remove('hidden');
        emailModal.classList.add('flex');
    });

    closeBtn.addEventListener('click', () => {
        emailModal.classList.add('hidden');
        emailModal.classList.remove('flex');
    });

    submitBtn.addEventListener('click', async () => {
        const state = getState();
        const newEmail = document.getElementById('new-email-input').value.trim();
        const errorEl = document.getElementById('email-error');
        const successEl = document.getElementById('email-success');

        errorEl.classList.add('hidden');
        successEl.classList.add('hidden');

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!newEmail || !emailRegex.test(newEmail)) {
            errorEl.innerHTML = '<i class="fas fa-times-circle"></i> Please enter a valid email address.';
            errorEl.classList.remove('hidden');
            return;
        }

        try {
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Updating...';
            const memberRef = ref(db, 'members/' + state.currentMemberData.membershipId);
            await update(memberRef, { email: newEmail });
            
            state.currentMemberData.email = newEmail;
            document.getElementById('email-address').textContent = newEmail;
            
            successEl.classList.remove('hidden');
            setTimeout(() => {
                emailModal.classList.add('hidden');
                emailModal.classList.remove('flex');
                submitBtn.disabled = false;
                submitBtn.textContent = 'Update';
            }, 1500);
        } catch (error) {
            errorEl.innerHTML = `<i class="fas fa-times-circle"></i> Update failed: ${error.message}`;
            errorEl.classList.remove('hidden');
            submitBtn.disabled = false;
            submitBtn.textContent = 'Update';
        }
    });
}

// --- POPULATE MODALS ---
function populateHistoryModal(balanceHistory) {
    const historyList = document.getElementById('history-list');
    historyList.innerHTML = '';
    if (!balanceHistory || balanceHistory.length === 0) {
        historyList.innerHTML = '<p class="text-center text-gray-400 italic py-4">No transactions yet.</p>';
        return;
    }
    [...balanceHistory].reverse().forEach(item => {
        const div = document.createElement('div');
        const isCredit = item.amount > 0;
        let title = '', icon = '', subText = '';
        
        switch(item.type) {
            case 'profit': title = 'Profit Share'; subText = `From: ${item.from}`; icon="fa-chart-line"; break;
            case 'manual_credit': title = 'Admin Bonus'; icon="fa-gift"; break;
            case 'withdrawal': title = 'Withdrawal'; icon="fa-arrow-circle-up"; break;
            case 'Self Return (10%)': title = 'Self Interest (10%)'; icon="fa-undo"; break;
            case 'Guarantor Commission (10%)': title = `Guarantor Comm.`; subText = `Source: ${item.from}`; icon="fa-handshake"; break;
            default: title = `Transaction`; icon="fa-coins";
        }
        
        div.className = 'flex justify-between items-center p-3 border-b border-gray-100 last:border-0 hover:bg-gray-50 transition-colors';
        div.innerHTML = `
            <div class="flex items-center gap-3">
                <div class="w-8 h-8 rounded-full ${isCredit ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600'} flex items-center justify-center text-xs">
                    <i class="fas ${icon}"></i>
                </div>
                <div>
                    <p class="font-semibold text-gray-800 text-sm">${title}</p>
                    ${subText ? `<p class="text-[10px] text-gray-500 font-medium truncate w-24 sm:w-auto">${subText}</p>` : ''}
                    <p class="text-[10px] text-gray-400">${item.date.toLocaleDateString('en-GB')}</p>
                </div>
            </div>
            <span class="font-bold text-sm ${isCredit ? 'text-green-600' : 'text-red-600'}">${isCredit ? '+' : ''} ₹${Math.abs(item.amount).toLocaleString('en-IN', {minimumFractionDigits: 0, maximumFractionDigits: 2})}</span>`;
        historyList.appendChild(div);
    });
}

function populateScoreBreakdownModal(scoreResultCache) {
    const contentDiv = document.getElementById('score-breakdown-content');
    if (!scoreResultCache) { contentDiv.innerHTML = "Score not calculated yet."; return; }
    const { totalScore, capitalScore, consistencyScore, creditScore, isNewMemberRuleApplied, originalCapitalScore, originalConsistencyScore, originalCreditScore } = scoreResultCache;

    const row = (label, val, base) => `
        <div class="flex justify-between items-center py-2 border-b border-gray-200 last:border-0">
            <span class="text-sm text-gray-600">${label}</span>
            <div class="text-right">
                <span class="font-bold text-royal-blue">${val.toFixed(0)}</span>
                ${isNewMemberRuleApplied ? `<p class="text-[9px] text-red-400 line-through">${base.toFixed(0)}</p>` : ''}
            </div>
        </div>`;

    let html = '';
    html += row("Capital Score", capitalScore, originalCapitalScore);
    html += row("Consistency", consistencyScore, originalConsistencyScore);
    html += row("Credit Behavior", creditScore, originalCreditScore);
    
    if(isNewMemberRuleApplied) {
        html += `<p class="text-xs text-red-500 mt-2 bg-red-50 p-2 rounded border border-red-100 text-center"><i class="fas fa-info-circle"></i> New Member Rule: 50% score reduction for first 6 months.</p>`;
    }
    html += `<div class="mt-3 pt-3 border-t-2 border-gray-100 flex justify-between items-center">
        <span class="font-bold text-royal-dark">Total Score</span>
        <span class="font-extrabold text-2xl text-royal-gold">${totalScore.toFixed(2)}</span>
    </div>`;
    contentDiv.innerHTML = html;
}

// --- WITHDRAWAL & CERTIFICATE ---
function submitWithdrawal(getState) {
    const state = getState();
    const amountInput = document.getElementById('withdrawal-amount');
    const errorMsg = document.getElementById('withdrawal-error');
    const amount = parseFloat(amountInput.value);
    
    if (isNaN(amount) || amount < 10) {
        errorMsg.classList.remove('hidden'); return;
    }
    if (amount > state.currentMemberData.extraBalance) {
        errorMsg.textContent = "Insufficient Balance";
        errorMsg.classList.remove('hidden'); return;
    }
    
    errorMsg.classList.add('hidden');
    document.getElementById('withdrawalModal').classList.add('hidden');
    document.getElementById('withdrawalModal').classList.remove('flex');
    showWithdrawalCard(amount, state.currentMemberData);
}

async function showWithdrawalCard(amount, currentMemberData) {
    const cardProfilePic = document.getElementById('card-profile-pic');
    const cardSignature = document.getElementById('card-signature');
    
    cardProfilePic.src = await toDataURL(currentMemberData.profilePicUrl || DEFAULT_PROFILE_PIC);
    cardSignature.src = await toDataURL(currentMemberData.signatureUrl || '');
    
    document.getElementById('card-name').textContent = currentMemberData.fullName;
    document.getElementById('card-amount').textContent = `₹${amount.toLocaleString('en-IN')}`;
    document.getElementById('card-date').textContent = new Date().toLocaleDateString('en-GB');
    document.getElementById('rand-tx-id').textContent = Math.floor(100000 + Math.random() * 900000);
    
    document.getElementById('share-card-btn').classList.toggle('hidden', !navigator.share);
    
    const cardModal = document.getElementById('cardResultModal');
    cardModal.classList.remove('hidden');
    cardModal.classList.add('flex');
}

// --- Helper Functions for Download/Share ---
function toDataURL(url) { return new Promise((resolve) => { if(!url || url.startsWith('data:')) { resolve(url); return; } const proxyUrl = 'https://cors-anywhere.herokuapp.com/'; const targetUrl = url.includes('firebasestorage') ? proxyUrl + url : url; fetch(targetUrl).then(response => response.blob()).then(blob => { const reader = new FileReader(); reader.onloadend = () => resolve(reader.result); reader.onerror = () => resolve(url); reader.readAsDataURL(blob); }).catch(() => resolve(url)); }); }
async function getCardAsBlob() { const cardElement = document.getElementById('withdrawalCard'); const canvas = await html2canvas(cardElement, { scale: 3, backgroundColor: null, useCORS: true }); return new Promise(resolve => canvas.toBlob(resolve, 'image/png')); }
async function downloadCard(getState) { const state = getState(); const blob = await getCardAsBlob(); const link = document.createElement('a'); link.download = `withdrawal-${state.currentMemberData.fullName.replace(/\s+/g, '-')}.png`; link.href = URL.createObjectURL(blob); link.click(); URL.revokeObjectURL(link.href); }
async function shareCard(getState) { const state = getState(); const blob = await getCardAsBlob(); const file = new File([blob], `withdrawal.png`, { type: 'image/png' }); if (navigator.canShare && navigator.canShare({ files: [file] })) { try { await navigator.share({ files: [file], title: 'Withdrawal Receipt', text: `Withdrawal receipt for ${state.currentMemberData.fullName}.`}); } catch (error) { alert('Could not share the image.'); } } else { alert("Sharing is not supported."); } }
