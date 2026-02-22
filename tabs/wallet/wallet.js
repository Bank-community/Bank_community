// tabs/wallet/wallet.js

let walletChartInstance = null;
let processedChartData = [];

export function init(app) {
    const state = app.state;

    // 1. Render Basic Wallet Data
    renderWalletTab(state);

    // 2. Process Data & Draw Chart
    processChartData(state.balanceHistory);
    renderChart('ALL');

    // 3. Setup Events (Modals & Actions)
    setupListeners(state);

    // Share button check
    const shareBtn = document.getElementById('share-card-btn');
    if (shareBtn && navigator.share) shareBtn.classList.remove('hidden');
}

function renderWalletTab(state) {
    const m = state.member;
    const balance = m.extraBalance || 0;

    setText('wallet-balance', `₹${balance.toLocaleString('en-IN', {minimumFractionDigits: 2})}`);
    setText('chart-current-balance', `₹${balance.toLocaleString('en-IN')}`);
    setText('modal-available-balance', `₹${balance.toLocaleString('en-IN')}`);
    setText('wallet-profit', `₹${(m.lifetimeProfit || 0).toLocaleString('en-IN')}`);
    setText('wallet-invested', `₹${(m.totalSip || 0).toLocaleString('en-IN')}`);
    setText('wallet-guarantor', m.guarantorName || 'N/A');
}

// --- GRAPH LOGIC (Running Balance) ---
function processChartData(history) {
    processedChartData = [];
    let runningBalance = 0;

    // Sort history from Oldest to Newest
    const sortedHistory = [...history].sort((a,b) => new Date(a.date) - new Date(b.date));

    // Add a starting point at zero if needed for better visual flow
    if(sortedHistory.length > 0) {
        let firstDate = new Date(sortedHistory[0].date);
        firstDate.setDate(firstDate.getDate() - 1);
        processedChartData.push({ date: firstDate, balance: 0 });
    }

    sortedHistory.forEach(tx => {
        runningBalance += tx.amount; // Profit adds (+), Withdrawal subtracts (-)
        processedChartData.push({
            date: new Date(tx.date),
            balance: runningBalance,
        });
    });
}

function renderChart(filter) {
    const canvas = document.getElementById('walletChart');
    if(!canvas) return;
    const ctx = canvas.getContext('2d');

    // Apply Filter Logic (1M, 1Y, ALL)
    const now = new Date();
    let filteredData = [];

    if (filter === '1M') {
        const oneMonthAgo = new Date();
        oneMonthAgo.setMonth(now.getMonth() - 1);
        filteredData = processedChartData.filter(d => d.date >= oneMonthAgo);
    } else if (filter === '1Y') {
        const oneYearAgo = new Date();
        oneYearAgo.setFullYear(now.getFullYear() - 1);
        filteredData = processedChartData.filter(d => d.date >= oneYearAgo);
    } else {
        filteredData = [...processedChartData];
    }

    // Extract X (Labels) and Y (Data)
    const labels = filteredData.map(d => d.date.toLocaleDateString('en-GB', {day: 'numeric', month: 'short'}));
    const dataPoints = filteredData.map(d => d.balance);

    // Destroy old chart before re-drawing
    if(walletChartInstance) {
        walletChartInstance.destroy();
    }

    // Create Premium Gold Gradient
    let gradient = ctx.createLinearGradient(0, 0, 0, 150);
    gradient.addColorStop(0, 'rgba(212, 175, 55, 0.4)'); // Gold transparent at top
    gradient.addColorStop(1, 'rgba(212, 175, 55, 0.0)'); // Fades out at bottom

    walletChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Available Balance',
                data: dataPoints,
                borderColor: '#D4AF37', // Solid Gold Line
                backgroundColor: gradient,
                borderWidth: 3,
                pointRadius: 0, // Hide dots normally
                pointHoverRadius: 6, // Show big dot on hover
                pointBackgroundColor: '#001540',
                pointBorderColor: '#D4AF37',
                pointBorderWidth: 2,
                fill: true,
                tension: 0.4 // Makes the line smooth/curvy
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: '#001540',
                    titleColor: '#D4AF37',
                    bodyColor: '#ffffff',
                    displayColors: false,
                    padding: 10,
                    callbacks: {
                        label: function(context) {
                            return '₹ ' + context.parsed.y.toLocaleString('en-IN');
                        }
                    }
                }
            },
            scales: {
                x: { display: false }, // Hides bottom dates for a clean look
                y: { display: false, beginAtZero: true } // Hides side numbers
            },
            interaction: {
                mode: 'index',
                intersect: false,
            }
        }
    });
}

// --- EVENTS ---
function setupListeners(state) {
    const container = document.getElementById('app-content');

    // Clear old listener
    if (container._walletListener) container.removeEventListener('click', container._walletListener);

    container._walletListener = async (e) => {
        const target = e.target;

        // 1. Chart Filters
        const filterBtn = target.closest('.chart-filter-btn');
        if (filterBtn) {
            // UI Toggle
            document.querySelectorAll('.chart-filter-btn').forEach(b => {
                b.classList.remove('bg-white', 'text-[#D4AF37]', 'shadow-sm', 'border-gray-100', 'active-filter');
            });
            filterBtn.classList.add('bg-white', 'text-[#D4AF37]', 'shadow-sm', 'border-gray-100', 'active-filter');

            // Re-render chart
            const filterValue = filterBtn.getAttribute('data-filter');
            renderChart(filterValue);
        }

        // 2. Modals Open
        if (target.closest('#withdraw-btn')) {
            document.getElementById('withdrawal-amount').value = '';
            document.getElementById('withdrawal-error').classList.add('hidden');
            showModal('withdrawalModal');
        }
        if (target.closest('#view-history-btn')) {
            populateHistoryModal(state.balanceHistory);
            showModal('historyModal');
        }

        // 3. Actions
        if (target.closest('#submit-withdrawal')) submitWithdrawal(state);
        if (target.closest('#download-card-btn')) await downloadCard(state);
        if (target.closest('#share-card-btn')) await shareCard(state);

        // 4. Modals Close
        if (target.closest('#close-withdrawal-modal')) hideModal('withdrawalModal');
        if (target.closest('#close-history-modal')) hideModal('historyModal');
        if (target.closest('#close-card-modal')) hideModal('cardResultModal');
        if (target.classList.contains('modal-overlay')) hideModal(target.id);
    };

    container.addEventListener('click', container._walletListener);
}

// --- WITHDRAWAL LOGIC ---
function submitWithdrawal(state) {
    const amountInput = document.getElementById('withdrawal-amount');
    const errorMsg = document.getElementById('withdrawal-error');
    const amount = parseFloat(amountInput.value);

    if (isNaN(amount) || amount < 10) { errorMsg.textContent = "Amount must be at least ₹10"; errorMsg.classList.remove('hidden'); return; }
    if (amount > state.member.extraBalance) { errorMsg.textContent = "Insufficient Balance"; errorMsg.classList.remove('hidden'); return; }

    errorMsg.classList.add('hidden');
    hideModal('withdrawalModal');
    showWithdrawalCard(amount, state.member);
}

async function showWithdrawalCard(amount, currentMemberData) {
    const profileImg = document.getElementById('card-profile-pic');
    const sigImg = document.getElementById('card-signature');

    document.getElementById('card-name').textContent = currentMemberData.fullName;
    document.getElementById('card-amount').textContent = `₹${amount.toLocaleString('en-IN')}`;
    document.getElementById('card-date').textContent = new Date().toLocaleDateString('en-GB');
    document.getElementById('rand-tx-id').textContent = Math.floor(100000 + Math.random() * 900000);

    profileImg.src = 'https://placehold.co/100'; 
    if(currentMemberData.profilePicUrl) profileImg.src = await toDataURL(currentMemberData.profilePicUrl);

    if(currentMemberData.signatureUrl) {
        sigImg.src = await toDataURL(currentMemberData.signatureUrl);
        sigImg.style.display = 'inline-block';
    } else {
        sigImg.style.display = 'none';
    }

    showModal('cardResultModal');
}

function populateHistoryModal(balanceHistory) {
    const historyList = document.getElementById('history-list');
    historyList.innerHTML = '';

    if (!balanceHistory || balanceHistory.length === 0) {
        historyList.innerHTML = '<div class="text-center py-10 text-gray-400">No transaction history.</div>'; return;
    }

    [...balanceHistory].reverse().forEach(item => {
        const isCredit = item.amount > 0;
        let title = 'Transaction', icon = 'fa-coins', subText = '';

        if (item.type === 'profit') { title = 'Profit Share'; icon = 'fa-chart-line'; subText = item.from ? `From: ${item.from}` : ''; }
        else if (item.type === 'manual_credit') { title = 'Admin Bonus'; icon = 'fa-gift'; }
        else if (item.type === 'withdrawal') { title = 'Withdrawal'; icon = 'fa-arrow-up'; }
        else if (item.type && item.type.includes('Self Return')) { title = 'Self Interest'; icon = 'fa-undo'; }
        else if (item.type && item.type.includes('Guarantor')) { title = 'Guarantor Comm.'; icon = 'fa-user-shield'; }

        historyList.innerHTML += `
        <div class="flex justify-between items-center p-3 border-b border-gray-100 last:border-0 hover:bg-gray-50">
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
            </span>
        </div>`;
    });
}

function showModal(id) { const el = document.getElementById(id); if(el) { el.classList.remove('hidden'); el.classList.add('flex'); } }
function hideModal(id) { const el = document.getElementById(id); if(el) { el.classList.add('hidden'); el.classList.remove('flex'); } }
function setText(id, val) { const el = document.getElementById(id); if(el) el.textContent = val; }

// --- HTML2CANVAS UTILS ---
function toDataURL(url) {
    return new Promise((resolve) => {
        if (!url) { resolve(''); return; }
        if (url.startsWith('data:')) { resolve(url); return; }
        const img = new Image(); img.crossOrigin = 'Anonymous'; img.src = url;
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.width; canvas.height = img.height;
            canvas.getContext('2d').drawImage(img, 0, 0);
            try { resolve(canvas.toDataURL('image/png')); } catch (e) { resolve(url); }
        };
        img.onerror = () => resolve(url); 
    });
}
async function getCardAsBlob() {
    const element = document.getElementById('withdrawalCard');
    await new Promise(r => setTimeout(r, 200)); 
    const canvas = await html2canvas(element, { scale: 3, backgroundColor: '#ffffff', useCORS: true, logging: false });
    return new Promise(r => canvas.toBlob(r, 'image/png'));
}
async function downloadCard(state) {
    const btn = document.getElementById('download-card-btn');
    const originalText = btn.innerHTML;
    btn.textContent = "Saving..."; btn.disabled = true;
    try {
        const blob = await getCardAsBlob();
        const link = document.createElement('a');
        link.download = `TCF-Withdrawal-${state.member.fullName.replace(/\s+/g, '-')}.png`;
        link.href = URL.createObjectURL(blob); link.click(); URL.revokeObjectURL(link.href);
    } catch(e) { alert("Save failed. Try taking a screenshot manually."); } 
    finally { btn.innerHTML = originalText; btn.disabled = false; }
}
async function shareCard(state) {
    try {
        const blob = await getCardAsBlob();
        const file = new File([blob], "receipt.png", { type: "image/png" });
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
            await navigator.share({ files: [file], title: 'TCF Withdrawal Receipt' });
        }
    } catch(e) { console.error(e); }
}
