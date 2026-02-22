// tabs/wallet/wallet.js

export function init(app) {
    const state = app.state;

    // 1. Render Wallet Data
    renderWalletTab(state);

    // 2. Setup Events (Modals & Actions)
    setupListeners(state);

    // Show Share button if supported
    const shareBtn = document.getElementById('share-card-btn');
    if (shareBtn && navigator.share) {
        shareBtn.classList.remove('hidden');
    }
}

function renderWalletTab(state) {
    const m = state.member;
    setText('wallet-balance', `₹${(m.extraBalance || 0).toLocaleString('en-IN', {minimumFractionDigits: 2})}`);
    setText('wallet-profit', `₹${(m.lifetimeProfit || 0).toLocaleString('en-IN')}`);
    setText('wallet-invested', `₹${(m.totalSip || 0).toLocaleString('en-IN')}`);
    setText('wallet-guarantor', m.guarantorName || 'N/A');
}

function setText(id, val) { const el = document.getElementById(id); if(el) el.textContent = val; }

function showModal(id) { const el = document.getElementById(id); if(el) { el.classList.remove('hidden'); el.classList.add('flex'); } }
function hideModal(id) { const el = document.getElementById(id); if(el) { el.classList.add('hidden'); el.classList.remove('flex'); } }

function setupListeners(state) {
    const container = document.getElementById('app-content');

    container.onclick = async (e) => {
        const target = e.target;

        // 1. Withdrawal Modal Open
        if (target.closest('#withdraw-btn')) {
            document.getElementById('modal-available-balance').textContent = `₹${(state.member.extraBalance || 0).toLocaleString('en-IN')}`;
            document.getElementById('withdrawal-amount').value = '';
            document.getElementById('withdrawal-error').classList.add('hidden');
            showModal('withdrawalModal');
        }

        // 2. History Modal Open
        if (target.closest('#view-history-btn')) {
            populateHistoryModal(state.balanceHistory);
            showModal('historyModal');
        }

        // 3. Submit Withdrawal
        if (target.closest('#submit-withdrawal')) {
            submitWithdrawal(state);
        }

        // 4. Download & Share Buttons
        if (target.closest('#download-card-btn')) await downloadCard(state);
        if (target.closest('#share-card-btn')) await shareCard(state);

        // 5. Close Buttons
        if (target.closest('#close-withdrawal-modal')) hideModal('withdrawalModal');
        if (target.closest('#close-history-modal')) hideModal('historyModal');
        if (target.closest('#close-card-modal')) hideModal('cardResultModal');
        if (target.classList.contains('modal-overlay')) hideModal(target.id);
    };
}

// --- WITHDRAWAL LOGIC ---
function submitWithdrawal(state) {
    const amountInput = document.getElementById('withdrawal-amount');
    const errorMsg = document.getElementById('withdrawal-error');
    const amount = parseFloat(amountInput.value);

    if (isNaN(amount) || amount < 10) { 
        errorMsg.textContent = "Amount must be at least ₹10"; 
        errorMsg.classList.remove('hidden'); 
        return; 
    }
    if (amount > state.member.extraBalance) { 
        errorMsg.textContent = "Insufficient Balance"; 
        errorMsg.classList.remove('hidden'); 
        return; 
    }

    errorMsg.classList.add('hidden');
    hideModal('withdrawalModal');

    // Render the certificate
    showWithdrawalCard(amount, state.member);
}

async function showWithdrawalCard(amount, currentMemberData) {
    const profileImg = document.getElementById('card-profile-pic');
    const sigImg = document.getElementById('card-signature');

    document.getElementById('card-name').textContent = currentMemberData.fullName;
    document.getElementById('card-amount').textContent = `₹${amount.toLocaleString('en-IN')}`;
    document.getElementById('card-date').textContent = new Date().toLocaleDateString('en-GB');
    document.getElementById('rand-tx-id').textContent = Math.floor(100000 + Math.random() * 900000);

    profileImg.src = 'https://placehold.co/100'; // Default Fallback
    if(currentMemberData.profilePicUrl) profileImg.src = await toDataURL(currentMemberData.profilePicUrl);

    if(currentMemberData.signatureUrl) {
        sigImg.src = await toDataURL(currentMemberData.signatureUrl);
        sigImg.style.display = 'inline-block';
    } else {
        sigImg.style.display = 'none';
    }

    showModal('cardResultModal');
}

// --- HISTORY MODAL ---
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
                    <p class="font-bold text-[#001540] text-xs uppercase">${title}</p>
                    ${subText ? `<p class="text-[9px] text-gray-500 truncate w-32">${subText}</p>` : ''}
                    <p class="text-[9px] text-gray-400 font-medium">${new Date(item.date).toLocaleDateString('en-GB')}</p>
                </div>
            </div>
            <span class="font-bold text-sm ${isCredit ? 'text-green-600' : 'text-red-600'}">
                ${isCredit ? '+' : ''}₹${Math.abs(item.amount).toLocaleString('en-IN')}
            </span>`;
        historyList.appendChild(div);
    });
}

// --- HTML2CANVAS UTILS (PDF / Image Generator) ---
function toDataURL(url) {
    return new Promise((resolve) => {
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
        img.onerror = () => resolve(url); 
    });
}

async function getCardAsBlob() {
    const element = document.getElementById('withdrawalCard');
    await new Promise(r => setTimeout(r, 200)); // Wait for render
    // html2canvas is loaded globally via index.html script tag
    const canvas = await html2canvas(element, { scale: 3, backgroundColor: '#ffffff', useCORS: true, logging: false });
    return new Promise(r => canvas.toBlob(r, 'image/png'));
}

async function downloadCard(state) {
    const btn = document.getElementById('download-card-btn');
    const originalText = btn.innerHTML;
    btn.textContent = "Saving...";
    btn.disabled = true;
    try {
        const blob = await getCardAsBlob();
        const link = document.createElement('a');
        link.download = `TCF-Withdrawal-${state.member.fullName.replace(/\s+/g, '-')}.png`;
        link.href = URL.createObjectURL(blob);
        link.click();
        URL.revokeObjectURL(link.href);
    } catch(e) { 
        alert("Save failed. Try taking a screenshot manually."); 
    } finally { 
        btn.innerHTML = originalText; 
        btn.disabled = false; 
    }
}

async function shareCard(state) {
    try {
        const blob = await getCardAsBlob();
        const file = new File([blob], "receipt.png", { type: "image/png" });
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
            await navigator.share({ files: [file], title: 'TCF Withdrawal Receipt', text: 'Official TCF Verified Transaction' });
        } else { 
            alert("Share not supported on this device."); 
        }
    } catch(e) { 
        console.error(e); 
    }
}
