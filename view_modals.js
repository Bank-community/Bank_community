// view_modals.js - EVENT DELEGATION VERSION (Fixes Broken Buttons)

import { ref, update } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-database.js";

const DEFAULT_PROFILE_PIC = 'https://placehold.co/200x200/E0E7FF/4F46E5?text=User';

export function initModals(db, getState) {
    if(document.body.getAttribute('data-listeners-added')) return;
    document.body.setAttribute('data-listeners-added', 'true');

    // --- GLOBAL CLICK LISTENER (THE FIX) ---
    document.body.addEventListener('click', (e) => {
        const target = e.target;

        // 1. Image Viewer (Works for any element with 'document-trigger' class)
        const imgTrigger = target.closest('.document-trigger');
        if (imgTrigger) {
            const img = imgTrigger.querySelector('img');
            if (img) {
                document.getElementById('fullImageView').src = img.src;
                showModal('imageViewerModal');
            }
        }

        // 2. Withdrawal Modal Open
        if (target.closest('#withdraw-btn')) {
            const state = getState();
            document.getElementById('modal-available-balance').textContent = `₹${state.currentMemberData.extraBalance.toLocaleString('en-IN')}`;
            showModal('withdrawalModal');
        }

        // 3. History Modal Open
        if (target.closest('#view-history-btn')) {
            // Logic handled in view_logic.js via direct render, but if needed specifically:
            // This button is usually for toggle, handled by UI logic.
        }

        // 4. Score Info Modal
        if (target.closest('#score-info-btn')) {
            populateScoreBreakdownModal(getState().scoreResultCache);
            showModal('scoreBreakdownModal');
        }

        // 5. Password Change Modal Open
        if (target.closest('#change-password-btn')) {
            resetPasswordForm();
            showModal('passwordModal');
        }

        // 6. Email Change Modal Open
        if (target.closest('#edit-email-btn')) {
            const state = getState();
            document.getElementById('new-email-input').value = state.currentMemberData.email || '';
            resetEmailForm();
            showModal('emailModal');
        }

        // --- CLOSING MODALS ---
        // Close Buttons
        if (target.closest('#closeImageViewer')) hideModal('imageViewerModal');
        if (target.closest('#close-withdrawal-modal')) hideModal('withdrawalModal');
        if (target.closest('#close-score-modal')) hideModal('scoreBreakdownModal');
        if (target.closest('#close-password-modal')) hideModal('passwordModal');
        if (target.closest('#close-email-modal')) hideModal('emailModal');
        if (target.closest('#close-card-modal')) hideModal('cardResultModal');

        // Close on Overlay Click
        if (target.classList.contains('modal-overlay')) {
            target.classList.add('hidden');
            target.classList.remove('flex');
        }

        // --- SUBMIT ACTIONS ---
        if (target.closest('#submit-withdrawal')) submitWithdrawal(getState);
        if (target.closest('#submit-password-change')) submitPasswordChange(db, getState);
        if (target.closest('#submit-email-change')) submitEmailChange(db, getState);
        if (target.closest('#download-card-btn')) downloadCard(getState);
        if (target.closest('#share-card-btn')) shareCard(getState);
    });
}

// --- HELPER FUNCTIONS ---

function showModal(id) {
    const el = document.getElementById(id);
    if(el) { el.classList.remove('hidden'); el.classList.add('flex'); }
}

function hideModal(id) {
    const el = document.getElementById(id);
    if(el) { el.classList.add('hidden'); el.classList.remove('flex'); }
}

// --- LOGIC HANDLERS ---

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
        html += `<p class="text-xs text-red-500 mt-2 bg-red-50 p-2 rounded border border-red-100 text-center"><i class="fas fa-info-circle"></i> New Member Rule applied.</p>`;
    }
    html += `<div class="mt-3 pt-3 border-t-2 border-gray-100 flex justify-between items-center">
        <span class="font-bold text-royal-dark">Total Score</span>
        <span class="font-extrabold text-2xl text-royal-gold">${totalScore.toFixed(2)}</span>
    </div>`;
    contentDiv.innerHTML = html;
}

// Password Logic
function resetPasswordForm() {
    document.getElementById('current-password').value = '';
    document.getElementById('new-password').value = '';
    document.getElementById('confirm-password').value = '';
    document.getElementById('password-error').classList.add('hidden');
    document.getElementById('password-success').classList.add('hidden');
}

async function submitPasswordChange(db, getState) {
    const state = getState();
    const currentPass = document.getElementById('current-password').value.trim();
    const newPass = document.getElementById('new-password').value.trim();
    const confirmPass = document.getElementById('confirm-password').value.trim();
    const errorEl = document.getElementById('password-error');
    const successEl = document.getElementById('password-success');
    const btn = document.getElementById('submit-password-change');

    errorEl.classList.add('hidden');
    successEl.classList.add('hidden');

    if (!currentPass || !newPass || !confirmPass) return showError(errorEl, 'All fields required.');
    if (currentPass !== String(state.currentMemberData.password)) return showError(errorEl, 'Incorrect PIN.');
    if (!/^\d+$/.test(newPass)) return showError(errorEl, 'PIN must be numbers.');
    if (newPass !== confirmPass) return showError(errorEl, 'PINs do not match.');

    try {
        btn.disabled = true; btn.textContent = 'Updating...';
        await update(ref(db, 'members/' + state.currentMemberData.membershipId), { password: newPass });
        state.currentMemberData.password = newPass;
        successEl.classList.remove('hidden');
        setTimeout(() => { hideModal('passwordModal'); btn.disabled = false; btn.textContent = 'Update'; }, 1500);
    } catch (error) {
        showError(errorEl, error.message);
        btn.disabled = false; btn.textContent = 'Update';
    }
}

// Email Logic
function resetEmailForm() {
    document.getElementById('email-error').classList.add('hidden');
    document.getElementById('email-success').classList.add('hidden');
}

async function submitEmailChange(db, getState) {
    const state = getState();
    const newEmail = document.getElementById('new-email-input').value.trim();
    const errorEl = document.getElementById('email-error');
    const successEl = document.getElementById('email-success');
    const btn = document.getElementById('submit-email-change');

    errorEl.classList.add('hidden');

    if (!newEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) return showError(errorEl, 'Invalid Email');

    try {
        btn.disabled = true; btn.textContent = 'Saving...';
        await update(ref(db, 'members/' + state.currentMemberData.membershipId), { email: newEmail });
        state.currentMemberData.email = newEmail;
        document.getElementById('profile-email').textContent = newEmail;
        successEl.classList.remove('hidden');
        setTimeout(() => { hideModal('emailModal'); btn.disabled = false; btn.textContent = 'Save'; }, 1500);
    } catch (error) {
        showError(errorEl, error.message);
        btn.disabled = false; btn.textContent = 'Save';
    }
}

// Withdrawal Logic
function submitWithdrawal(getState) {
    const state = getState();
    const amount = parseFloat(document.getElementById('withdrawal-amount').value);
    const errorMsg = document.getElementById('withdrawal-error');

    if (isNaN(amount) || amount < 10) { errorMsg.classList.remove('hidden'); return; }
    if (amount > state.currentMemberData.extraBalance) { errorMsg.textContent = "Insufficient"; errorMsg.classList.remove('hidden'); return; }

    errorMsg.classList.add('hidden');
    hideModal('withdrawalModal');
    showWithdrawalCard(amount, state.currentMemberData);
}

async function showWithdrawalCard(amount, currentMemberData) {
    document.getElementById('card-name').textContent = currentMemberData.fullName;
    document.getElementById('card-amount').textContent = `₹${amount.toLocaleString('en-IN')}`;
    document.getElementById('card-date').textContent = new Date().toLocaleDateString('en-GB');
    document.getElementById('rand-tx-id').textContent = Math.floor(100000 + Math.random() * 900000);

    const signImg = document.getElementById('card-signature');
    if(currentMemberData.signatureUrl) signImg.src = await toDataURL(currentMemberData.signatureUrl);

    showModal('cardResultModal');
}

// Utils
function showError(el, msg) { el.textContent = msg; el.classList.remove('hidden'); }
function toDataURL(url) { return new Promise((resolve) => { if(!url || url.startsWith('data:')) { resolve(url); return; } const proxyUrl = 'https://cors-anywhere.herokuapp.com/'; const targetUrl = url.includes('firebasestorage') ? proxyUrl + url : url; fetch(targetUrl).then(response => response.blob()).then(blob => { const reader = new FileReader(); reader.onloadend = () => resolve(reader.result); reader.onerror = () => resolve(url); reader.readAsDataURL(blob); }).catch(() => resolve(url)); }); }
async function getCardAsBlob() { const cardElement = document.getElementById('withdrawalCard'); const canvas = await html2canvas(cardElement, { scale: 3, backgroundColor: null, useCORS: true }); return new Promise(resolve => canvas.toBlob(resolve, 'image/png')); }
async function downloadCard(getState) { const state = getState(); const blob = await getCardAsBlob(); const link = document.createElement('a'); link.download = `withdrawal-${state.currentMemberData.fullName.replace(/\s+/g, '-')}.png`; link.href = URL.createObjectURL(blob); link.click(); URL.revokeObjectURL(link.href); }
async function shareCard(getState) { const state = getState(); const blob = await getCardAsBlob(); const file = new File([blob], `withdrawal.png`, { type: 'image/png' }); if (navigator.canShare && navigator.canShare({ files: [file] })) { try { await navigator.share({ files: [file], title: 'Withdrawal Receipt', text: `Withdrawal receipt for ${state.currentMemberData.fullName}.`}); } catch (error) { alert('Could not share.'); } } }
