// view_modals.js - FINAL ROBUST VERSION (Event Delegation for All Buttons)

import { ref, update } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-database.js";

const DEFAULT_PROFILE_PIC = 'https://placehold.co/200x200/E0E7FF/4F46E5?text=User';

// --- MAIN INIT FUNCTION ---
export function initModals(db, getState) {
    // Prevent double initialization
    if(document.body.getAttribute('data-listeners-added')) return;
    document.body.setAttribute('data-listeners-added', 'true');

    // --- GLOBAL CLICK LISTENER (Handles ALL Clicks) ---
    document.body.addEventListener('click', (e) => {
        const target = e.target;

        // 1. Image Viewer (Zoom)
        const trigger = target.closest('.document-trigger');
        if (trigger) {
            const img = trigger.querySelector('img');
            if (img && img.src) {
                document.getElementById('fullImageView').src = img.src;
                showModal('imageViewerModal');
            }
        }

        // 2. Withdrawal Modal Open
        if (target.closest('#withdraw-btn')) {
            const state = getState();
            document.getElementById('modal-available-balance').textContent = `₹${state.currentMemberData.extraBalance.toLocaleString('en-IN', {minimumFractionDigits: 0, maximumFractionDigits: 2})}`;
            showModal('withdrawalModal');
        }

        // 3. History Modal Open
        if (target.closest('#view-history-btn')) {
            populateHistoryModal(getState().balanceHistory);
            showModal('historyModal');
        }

        // 4. Score Info Modal Open
        if (target.closest('#score-info-btn')) {
            populateScoreBreakdownModal(getState().scoreResultCache);
            showModal('scoreBreakdownModal');
        }

        // 5. Change Password Modal Open (FIXED)
        if (target.closest('#change-password-btn')) {
            document.getElementById('current-password').value = '';
            document.getElementById('new-password').value = '';
            document.getElementById('confirm-password').value = '';
            document.getElementById('password-error').classList.add('hidden');
            document.getElementById('password-success').classList.add('hidden');
            showModal('passwordModal');
        }

        // 6. Edit Email Modal Open (FIXED)
        if (target.closest('#edit-email-btn')) {
            const state = getState();
            document.getElementById('new-email-input').value = state.currentMemberData.email || '';
            document.getElementById('email-error').classList.add('hidden');
            document.getElementById('email-success').classList.add('hidden');
            showModal('emailModal');
        }

        // --- SUBMIT ACTIONS ---
        
        // Submit Withdrawal
        if (target.closest('#submit-withdrawal')) {
            submitWithdrawal(getState);
        }

        // Submit Password Change
        if (target.closest('#submit-password-change')) {
            handlePasswordSubmit(db, getState);
        }

        // Submit Email Change
        if (target.closest('#submit-email-change')) {
            handleEmailSubmit(db, getState);
        }

        // Download & Share
        if (target.closest('#download-card-btn')) downloadCard(getState);
        if (target.closest('#share-card-btn')) shareCard(getState);

        // --- CLOSE ACTIONS ---
        if (target.closest('#closeImageViewer')) hideModal('imageViewerModal');
        if (target.closest('#close-withdrawal-modal')) hideModal('withdrawalModal');
        if (target.closest('#close-history-modal')) hideModal('historyModal');
        if (target.closest('#close-score-modal')) hideModal('scoreBreakdownModal');
        if (target.closest('#close-card-modal')) hideModal('cardResultModal');
        if (target.closest('#close-password-modal')) hideModal('passwordModal');
        if (target.closest('#close-email-modal')) hideModal('emailModal');

        // Overlay Click Close
        if (target.classList.contains('modal-overlay')) {
            target.classList.add('hidden');
            target.classList.remove('flex');
        }
    });

    // Share Button Visibility Check
    const shareBtn = document.getElementById('share-card-btn');
    if (shareBtn && navigator.share) {
        shareBtn.classList.remove('hidden');
    }
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

async function handlePasswordSubmit(db, getState) {
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
    if (String(currentPass) !== String(state.currentMemberData.password)) return showError(errorEl, 'Incorrect current PIN.');
    if (!/^\d+$/.test(newPass)) return showError(errorEl, 'PIN must be numbers only.');
    if (newPass !== confirmPass) return showError(errorEl, 'New PINs do not match.');

    try {
        btn.disabled = true; btn.textContent = 'Updating...';
        await update(ref(db, 'members/' + state.currentMemberData.membershipId), { password: newPass });
        
        state.currentMemberData.password = newPass; // Update local state
        successEl.classList.remove('hidden');
        
        setTimeout(() => { 
            hideModal('passwordModal'); 
            btn.disabled = false; 
            btn.textContent = 'Update'; 
        }, 1500);
    } catch (error) {
        showError(errorEl, error.message);
        btn.disabled = false; btn.textContent = 'Update';
    }
}

async function handleEmailSubmit(db, getState) {
    const state = getState();
    const newEmail = document.getElementById('new-email-input').value.trim();
    const errorEl = document.getElementById('email-error');
    const successEl = document.getElementById('email-success');
    const btn = document.getElementById('submit-email-change');

    errorEl.classList.add('hidden');
    
    if (!newEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) return showError(errorEl, 'Invalid email address.');

    try {
        btn.disabled = true; btn.textContent = 'Saving...';
        await update(ref(db, 'members/' + state.currentMemberData.membershipId), { email: newEmail });
        
        state.currentMemberData.email = newEmail; // Update local state
        const displayEmail = document.getElementById('profile-email');
        if(displayEmail) displayEmail.textContent = newEmail;

        successEl.classList.remove('hidden');
        
        setTimeout(() => { 
            hideModal('emailModal'); 
            btn.disabled = false; 
            btn.textContent = 'Save'; 
        }, 1500);
    } catch (error) {
        showError(errorEl, error.message);
        btn.disabled = false; btn.textContent = 'Save';
    }
}

function populateHistoryModal(balanceHistory) {
    const historyList = document.getElementById('history-list');
    historyList.innerHTML = '';
    
    if (!balanceHistory || balanceHistory.length === 0) {
        historyList.innerHTML = '<div class="text-center py-10 text-gray-400">No transaction history.</div>';
        return;
    }

    [...balanceHistory].reverse().forEach(item => {
        const div = document.createElement('div');
        const isCredit = item.amount > 0;
        let title = 'Transaction', icon = 'fa-coins', subText = '';

        if (item.type === 'profit') { title = 'Profit Share'; icon = 'fa-chart-line'; subText = item.from ? `From: ${item.from}` : ''; }
        else if (item.type === 'manual_credit') { title = 'Admin Bonus'; icon = 'fa-gift'; }
        else if (item.type === 'withdrawal') { title = 'Withdrawal'; icon = 'fa-arrow-up'; }
        else if (item.type && item.type.includes('Self Return')) { title = 'Self Interest'; icon = 'fa-undo'; }
        else if (item.type && item.type.includes('Guarantor')) { title = 'Guarantor Comm.'; icon = 'fa-user-shield'; }

        div.className = 'flex justify-between items-center p-3 border-b border-gray-100 last:border-0 hover:bg-gray-50';
        div.innerHTML = `
            <div class="flex items-center gap-3">
                <div class="w-9 h-9 rounded-full ${isCredit ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600'} flex items-center justify-center text-sm">
                    <i class="fas ${icon}"></i>
                </div>
                <div>
                    <p class="font-bold text-gray-800 text-xs uppercase">${title}</p>
                    ${subText ? `<p class="text-[9px] text-gray-500 truncate w-32">${subText}</p>` : ''}
                    <p class="text-[9px] text-gray-400">${new Date(item.date).toLocaleDateString('en-GB')}</p>
                </div>
            </div>
            <span class="font-bold text-sm ${isCredit ? 'text-green-600' : 'text-red-600'}">
                ${isCredit ? '+' : ''}₹${Math.abs(item.amount).toLocaleString('en-IN')}
            </span>`;
        historyList.appendChild(div);
    });
}

function populateScoreBreakdownModal(scoreResultCache) {
    const contentDiv = document.getElementById('score-breakdown-content');
    if (!scoreResultCache) { contentDiv.innerHTML = "Score pending calculation."; return; }
    const { totalScore, capitalScore, consistencyScore, creditScore, isNewMemberRuleApplied, originalCapitalScore, originalConsistencyScore, originalCreditScore } = scoreResultCache;

    const row = (l, v, b) => `
        <div class="flex justify-between items-center py-2 border-b border-gray-100 text-sm">
            <span class="text-gray-600">${l}</span>
            <div class="text-right">
                <span class="font-bold text-royal-blue">${v.toFixed(0)}</span>
                ${isNewMemberRuleApplied ? `<span class="text-[9px] text-red-400 line-through ml-1">${b.toFixed(0)}</span>` : ''}
            </div>
        </div>`;

    let html = row("Capital", capitalScore, originalCapitalScore) + 
               row("Consistency", consistencyScore, originalConsistencyScore) + 
               row("Credit Behavior", creditScore, originalCreditScore);
    
    if(isNewMemberRuleApplied) html += `<p class="text-[10px] text-red-500 mt-2 text-center bg-red-50 p-1 rounded">New Member Rule Applied (50% Score)</p>`;
    
    html += `<div class="mt-3 pt-2 border-t flex justify-between items-center">
        <span class="font-bold text-royal-dark">Total Score</span>
        <span class="font-extrabold text-2xl text-royal-gold">${totalScore.toFixed(1)}</span>
    </div>`;
    contentDiv.innerHTML = html;
}

// --- WITHDRAWAL & CERTIFICATE ---
function submitWithdrawal(getState) {
    const state = getState();
    const amountInput = document.getElementById('withdrawal-amount');
    const errorMsg = document.getElementById('withdrawal-error');
    const amount = parseFloat(amountInput.value);
    
    if (isNaN(amount) || amount < 10) { errorMsg.classList.remove('hidden'); return; }
    if (amount > state.currentMemberData.extraBalance) { errorMsg.textContent = "Insufficient Balance"; errorMsg.classList.remove('hidden'); return; }
    
    errorMsg.classList.add('hidden');
    hideModal('withdrawalModal');
    
    // Show Loading on Button (if needed, but modal hides instantly here)
    showWithdrawalCard(amount, state.currentMemberData);
}

async function showWithdrawalCard(amount, currentMemberData) {
    const cardModal = document.getElementById('cardResultModal');
    const profileImg = document.getElementById('card-profile-pic');
    const sigImg = document.getElementById('card-signature');

    // Fill Data
    document.getElementById('card-name').textContent = currentMemberData.fullName;
    document.getElementById('card-amount').textContent = `₹${amount.toLocaleString('en-IN')}`;
    document.getElementById('card-date').textContent = new Date().toLocaleDateString('en-GB');
    document.getElementById('rand-tx-id').textContent = Math.floor(100000 + Math.random() * 900000);

    // Fix Images (CORS/Base64)
    profileImg.src = 'https://placehold.co/100'; // Default
    if(currentMemberData.profilePicUrl) profileImg.src = await toDataURL(currentMemberData.profilePicUrl);
    
    if(currentMemberData.signatureUrl) {
        sigImg.src = await toDataURL(currentMemberData.signatureUrl);
        sigImg.style.display = 'inline-block';
    } else {
        sigImg.style.display = 'none';
    }

    showModal('cardResultModal');
}

// --- UTILS ---
function showError(el, msg) { el.textContent = msg; el.classList.remove('hidden'); }

function toDataURL(url) {
    return new Promise((resolve, reject) => {
        if (!url) { resolve(''); return; }
        if (url.startsWith('data:')) { resolve(url); return; }
        
        const img = new Image();
        img.crossOrigin = 'Anonymous';
        img.src = url;
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.width; canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);
            try { resolve(canvas.toDataURL('image/png')); } catch (e) { resolve(url); }
        };
        img.onerror = () => resolve(url); // Fallback to URL if CORS fails
    });
}

async function getCardAsBlob() {
    const element = document.getElementById('withdrawalCard');
    await new Promise(r => setTimeout(r, 200)); // Wait for render
    const canvas = await html2canvas(element, { scale: 3, backgroundColor: '#ffffff', useCORS: true, logging: false });
    return new Promise(r => canvas.toBlob(r, 'image/png'));
}

async function downloadCard(getState) {
    const btn = document.getElementById('download-card-btn');
    const originalText = btn.innerHTML;
    btn.textContent = "Saving...";
    btn.disabled = true;
    try {
        const state = getState();
        const blob = await getCardAsBlob();
        const link = document.createElement('a');
        link.download = `TCF-Withdrawal-${state.currentMemberData.fullName.replace(/\s+/g, '-')}.png`;
        link.href = URL.createObjectURL(blob);
        link.click();
        URL.revokeObjectURL(link.href);
    } catch(e) { alert("Save failed. Try screenshot."); }
    finally { btn.innerHTML = originalText; btn.disabled = false; }
}

async function shareCard(getState) {
    try {
        const blob = await getCardAsBlob();
        const file = new File([blob], "receipt.png", { type: "image/png" });
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
            await navigator.share({ files: [file], title: 'Withdrawal Receipt', text: 'TCF Verified Transaction' });
        } else { alert("Share not supported."); }
    } catch(e) { console.error(e); }
}
