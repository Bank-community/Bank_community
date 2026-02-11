// modules/dashboard/dashboardView.js
import { openModal } from '../../shared/uiComponents.js';

// Global variable for chart instance
let sipChart = null;

// --- Skeleton Loader ---
export function renderSkeleton(container) {
    container.innerHTML = `
        <div class="space-y-6 animate-pulse">
            <div class="h-40 bg-gray-200 rounded-2xl w-full shadow-sm"></div>
            <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div class="lg:col-span-2 h-64 bg-gray-200 rounded-xl"></div>
                <div class="h-64 bg-gray-200 rounded-xl"></div>
            </div>
        </div>`;
}

// --- Main UI Renderer ---
export function updateDashboardUI(container, headerStatsContainer, data, chartState) {
    const allTransactions = data.transactions || {};
    const penaltyWalletData = data.penaltyWallet || { incomes: {}, expenses: {} };
    const allMembersData = data.members || {};
    const adminSettings = data.admin || {};
    const balanceStats = adminSettings.balanceStats || {}; 

    // Wallet Calculations
    const totalIncomes = Object.values(penaltyWalletData.incomes || {}).reduce((sum, i) => sum + (i.amount || 0), 0);
    const totalExpenses = Object.values(penaltyWalletData.expenses || {}).reduce((sum, e) => sum + (e.amount || 0), 0);
    const totalPenalty = totalIncomes - totalExpenses;

    // --- COMPACT MASTER CARD HTML ---
    const statsCardsHTML = `
        <div class="w-full bg-white rounded-2xl shadow-md p-5 mb-6 border border-indigo-50 relative overflow-hidden">
            <!-- Header -->
            <div class="flex justify-between items-center mb-4">
                <h3 class="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1">
                    <i class="ph-chart-pie-slice text-indigo-500"></i> Overview
                </h3>
                <span class="text-[10px] bg-green-50 text-green-700 px-2 py-0.5 rounded-full font-bold border border-green-100">Live Updates</span>
            </div>

            <!-- Compact Grid Layout -->
            <div class="grid grid-cols-2 gap-4 relative z-10">

                <!-- 1. SIP Collection (Top Left) -->
                <div class="flex flex-col border-r border-gray-100 pr-2">
                    <span class="text-[10px] text-gray-500 font-medium mb-1 flex items-center gap-1">
                        <div class="w-1.5 h-1.5 rounded-full bg-green-500"></div> Total SIP
                    </span>
                    <h3 class="text-lg font-bold text-gray-800 leading-tight">₹${(balanceStats.totalSIP || 0).toLocaleString('en-IN')}</h3>
                </div>

                <!-- 2. Active Loans (Top Right) -->
                <div class="flex flex-col pl-2">
                    <span class="text-[10px] text-gray-500 font-medium mb-1 flex items-center gap-1">
                        <div class="w-1.5 h-1.5 rounded-full bg-red-500"></div> Active Loans
                    </span>
                    <h3 class="text-lg font-bold text-red-500 leading-tight">- ₹${(balanceStats.totalActiveLoans || 0).toLocaleString('en-IN')}</h3>
                </div>

                <!-- 3. Available Balance (Full Width Bottom) -->
                <div class="col-span-2 border-t border-dashed border-gray-200 pt-3 mt-1">
                    <div class="flex items-center justify-between">
                        <div class="flex items-center gap-2">
                            <div class="p-1.5 bg-indigo-100 rounded-lg text-indigo-600">
                                <i class="ph-wallet text-lg"></i>
                            </div>
                            <span class="text-xs text-indigo-900 font-bold uppercase tracking-wide">Available Balance</span>
                        </div>
                        <h3 class="text-3xl font-extrabold text-indigo-600">₹${(balanceStats.availableBalance || 0).toLocaleString('en-IN')}</h3>
                    </div>
                </div>

            </div>

            <!-- Decorative Background -->
            <div class="absolute top-0 right-0 -mr-10 -mt-10 w-40 h-40 rounded-full bg-gradient-to-br from-indigo-50 to-purple-50 opacity-50 pointer-events-none"></div>
        </div>
    `;

    // --- SIP STATUS LOGIC ---
    const today = new Date();
    const currentMonth = today.getMonth();
    const currentYear = today.getFullYear();

    const sipStatusList = Object.entries(allMembersData)
        .filter(([, m]) => m.status === 'Approved')
        .map(([id, member]) => {
            const hasPaid = Object.values(allTransactions).some(tx => 
                tx.memberId === id &&
                tx.type === 'SIP' &&
                new Date(tx.date).getMonth() === currentMonth &&
                new Date(tx.date).getFullYear() === currentYear
            );
            return { name: member.fullName, hasPaid };
        })
        .sort((a, b) => a.name.localeCompare(b.name));

    const sipStatusHTML = `
        <div class="bg-white rounded-2xl shadow-sm p-5 mt-6 border border-gray-100">
             <h3 class="text-sm font-bold text-gray-800 mb-4 flex items-center gap-2">
                <i class="ph-list-checks text-indigo-500"></i> Current Month SIP Status 
                <span class="text-[10px] bg-gray-100 text-gray-500 px-2 py-1 rounded ml-auto border border-gray-200">
                    ${today.toLocaleString('default', { month: 'long' })}
                </span>
             </h3>
             <div class="overflow-y-auto max-h-60 custom-scrollbar pr-1">
                <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                    ${sipStatusList.map(s => `
                        <div class="flex justify-between items-center p-2.5 rounded-lg border ${s.hasPaid ? 'bg-green-50/50 border-green-100' : 'bg-red-50/50 border-red-100'}">
                            <span class="text-sm font-medium text-gray-700 truncate mr-2">${s.name}</span>
                            <span class="text-[10px] font-bold px-2 py-0.5 rounded-full ${s.hasPaid ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}">
                                ${s.hasPaid ? 'PAID' : 'PENDING'}
                            </span>
                        </div>`).join('')}
                </div>
             </div>
        </div>
    `;

    // --- LIVE FEED LOGIC ---
    const todayStr = today.toISOString().split('T')[0];
    const todaysTransactions = Object.values(allTransactions).filter(t => t.date && new Date(t.date).toISOString().split('T')[0] === todayStr);
    let liveFeedHTML = '';

    if (todaysTransactions.length > 0) {
        liveFeedHTML = todaysTransactions.reverse().map(t => { 
            let activity = '';
            const memberName = allMembersData[t.memberId]?.fullName || 'Unknown Member';
            switch(t.type) {
                case 'SIP': activity = `<span class="text-green-400">SIP ₹${t.amount}</span> - ${memberName}`; break;
                case 'SIP Withdrawal': activity = `<span class="text-red-400">Withdraw ₹${t.amount}</span> - ${memberName}`; break;
                case 'Loan Taken': activity = `<span class="text-orange-400">${t.loanType} ₹${t.amount}</span> - ${memberName}`; break;
                case 'Loan Payment': activity = `<span class="text-blue-400">Paid ₹${(t.principalPaid || 0) + (t.interestPaid || 0)}</span> - ${memberName}`; break;
                case 'Extra Payment': activity = `<span class="text-yellow-400">Extra ₹${t.amount}</span>`; break;
                case 'Extra Withdraw': activity = `<span class="text-purple-400">Ex-Withdraw ₹${t.amount}</span>`; break;
            }
            return `<div class="text-xs py-1.5 border-b border-gray-700/30 last:border-0 flex justify-between items-center text-gray-300">
                        <span class="truncate mr-2">${activity}</span>
                        <span class="opacity-60 whitespace-nowrap">${new Date(t.timestamp || t.date).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                    </div>`;
         }).join('');
    } else {
        liveFeedHTML = '<div class="flex items-center justify-center py-4 text-gray-500 text-xs italic gap-2"><i class="ph-moon-stars"></i> No activity today</div>';
    }

    // --- BUTTONS ROW (FIXED & REORDERED) ---
    // Order: 1.Users, 2.Explore, 3.TCF Unit, 4.TCF Page
    if (headerStatsContainer) {
        const totalUsers = Object.values(allMembersData).filter(m => m.status === 'Approved').length;

        headerStatsContainer.innerHTML = `
            <div class="grid grid-cols-4 gap-2">

                <!-- 1. Users -->
                <button class="dashboard-stat-card p-2 flex flex-col items-center bg-white rounded-xl shadow-sm border border-gray-100 active:scale-95 transition-transform cursor-pointer" data-action="all-members">
                    <div class="text-indigo-600 mb-1"><i class="ph-users text-xl"></i></div>
                    <span class="text-[10px] font-bold text-gray-600">${totalUsers} Users</span>
                </button>

                <!-- 2. Explore -->
                <button class="dashboard-stat-card p-2 flex flex-col items-center bg-white rounded-xl shadow-sm border border-gray-100 active:scale-95 transition-transform cursor-pointer" data-action="data-explorer">
                    <div class="text-blue-600 mb-1"><i class="ph-magnifying-glass text-xl"></i></div>
                    <span class="text-[10px] font-bold text-gray-600">Explore</span>
                </button>

                <!-- 3. TCF Unit -->
                <button class="dashboard-stat-card p-2 flex flex-col items-center bg-white rounded-xl shadow-sm border border-gray-100 active:scale-95 transition-transform cursor-pointer relative" data-action="view-balance">
                    <div class="text-yellow-600 mb-1"><i class="ph-wallet text-xl"></i></div>
                    <span class="text-[10px] font-bold text-gray-600">TCF Unit</span>
                </button>

                <!-- 4. TCF Page -->
                <button class="dashboard-stat-card p-2 flex flex-col items-center bg-white rounded-xl shadow-sm border border-gray-100 active:scale-95 transition-transform cursor-pointer" data-action="tcf-page">
                    <div class="text-indigo-600 mb-1"><i class="ph-file-text text-xl"></i></div>
                    <span class="text-[10px] font-bold text-gray-600">TCF Page</span>
                </button>

            </div>
        `;
    }

    const dashboardButtons = adminSettings.dashboard_buttons || {};
    const dashboardButtonsHTML = Object.keys(dashboardButtons).length > 0
        ? `<div class="mt-6"><h3 class="text-sm font-bold text-gray-700 mb-3 px-1">Quick Links</h3><div class="grid grid-cols-4 gap-3">${Object.entries(dashboardButtons).map(([key, btn]) => `<a href="${btn.url}" target="_blank" class="flex flex-col items-center justify-center p-2 rounded-xl text-white text-center shadow hover:opacity-90 transition-opacity" style="background: ${btn.color || '#4f46e5'}"><div class="text-xl mb-1">${btn.icon || '<i class="ph-link"></i>'}</div><span class="text-[9px] font-medium truncate w-full">${btn.name}</span></a>`).join('')}</div></div>` : '';

    // --- MAIN LAYOUT HTML ---
    container.innerHTML = `
        ${statsCardsHTML}

        <!-- Live Feed Section -->
        <div class="live-feed-display rounded-2xl shadow-md p-4 mb-6 bg-[#1e1b4b] text-white border border-indigo-900/50">
            <h3 class="text-xs font-bold mb-2 border-b border-gray-700/50 pb-2 flex items-center gap-2 uppercase tracking-wide opacity-80">
                <i class="ph-broadcast text-red-500 animate-pulse"></i> Live Feed
            </h3>
            <div class="overflow-y-auto max-h-32 custom-scrollbar">
                ${liveFeedHTML}
            </div>
        </div>

        <!-- Graph & Wallet Grid -->
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <!-- Graph Section -->
            <div class="lg:col-span-2 bg-white rounded-2xl shadow-sm p-5 border border-gray-100">
                <div class="flex justify-between items-center mb-4">
                    <div>
                        <h3 class="text-xs font-bold text-gray-500 uppercase">SIP Trends</h3>
                        <h2 class="text-xl font-bold text-gray-900" id="sip-period-total">₹0</h2>
                    </div>
                    <div class="flex gap-1">
                         <button id="filter-this-month" class="px-2 py-1 text-[10px] font-bold rounded border ${chartState.filter === 'thisMonth' ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'bg-gray-50 border-gray-200 text-gray-600'}">Month</button>
                         <button id="filter-all-time" class="px-2 py-1 text-[10px] font-bold rounded border ${chartState.filter === 'allTime' ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'bg-gray-50 border-gray-200 text-gray-600'}">All</button>
                    </div>
                </div>
                <div class="h-48 relative w-full"><canvas id="sipChartCanvas"></canvas></div>
            </div>

            <!-- Wallet Section -->
            <div class="flex flex-col gap-4">
                <div id="penalty-wallet-card" class="relative overflow-hidden rounded-2xl shadow p-5 cursor-pointer bg-gradient-to-br from-orange-50 to-white border border-orange-100">
                    <div class="flex items-center justify-between mb-2">
                        <span class="text-[10px] font-bold bg-white px-2 py-0.5 rounded text-orange-600 border border-orange-100">WALLET</span>
                        <i class="ph-wallet text-xl text-orange-500"></i>
                    </div>
                    <h2 class="text-2xl font-bold text-gray-800">₹${totalPenalty.toLocaleString('en-IN')}</h2>
                    <p class="text-[10px] text-gray-400 mt-1">Tap for history</p>
                </div>
                <button id="add-penalty-money-btn" class="w-full bg-gray-900 text-white font-bold py-3 rounded-xl shadow hover:bg-black transition-colors flex items-center justify-center gap-2 text-sm">
                    <i class="ph-plus-circle text-lg"></i> Add Money
                </button>
            </div>
        </div>

        ${dashboardButtonsHTML}

        ${sipStatusHTML}
    `;

    // Render Chart immediately after DOM update
    // Added safety check for Chart.js
    if(document.getElementById('sipChartCanvas') && typeof Chart !== 'undefined') {
        renderSIPChart(allTransactions, allMembersData, chartState);
    }
}

// --- Chart & Modal Logic ---
function renderSIPChart(transactions, members, chartState) {
    const ctx = document.getElementById('sipChartCanvas').getContext('2d');
    const totalEl = document.getElementById('sip-period-total');
    let labels = [], dataPoints = []; 
    const txArray = Object.values(transactions).filter(tx => tx.type === 'SIP' && tx.date);

    if (chartState.filter === 'allTime') {
        const groupedData = {};
        txArray.forEach(tx => {
            const date = new Date(tx.date);
            const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
            const label = date.toLocaleString('default', { month: 'short', year: '2-digit' });
            if (!groupedData[key]) groupedData[key] = { amount: 0, label: label };
            groupedData[key].amount += parseFloat(tx.amount) || 0;
        });
        Object.keys(groupedData).sort().forEach(key => {
            labels.push(groupedData[key].label);
            dataPoints.push(groupedData[key].amount);
        });
    } else {
        const targetYM = chartState.filter === 'thisMonth' ? new Date().toISOString().slice(0, 7) : chartState.month;
        const groupedData = {};
        txArray.forEach(tx => {
            if (tx.date.startsWith(targetYM)) {
                const day = new Date(tx.date).getDate();
                if (!groupedData[day]) groupedData[day] = { amount: 0 };
                groupedData[day].amount += parseFloat(tx.amount) || 0;
            }
        });
        const daysInMonth = new Date(targetYM.split('-')[0], targetYM.split('-')[1], 0).getDate();
        for (let i = 1; i <= daysInMonth; i++) {
            labels.push(i);
            dataPoints.push(groupedData[i] ? groupedData[i].amount : 0);
        }
    }

    const grandTotal = dataPoints.reduce((acc, curr) => acc + curr, 0);
    if(totalEl) totalEl.textContent = `₹${grandTotal.toLocaleString('en-IN')}`;
    if (sipChart) sipChart.destroy();

    sipChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'SIP', data: dataPoints, backgroundColor: '#4f46e5', borderRadius: 4
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: { y: { beginAtZero: true, grid: { display: false } }, x: { grid: { display: false } } }
        }
    });
}

// --- MODALS RENDER FUNCTIONS ---
export function renderPenaltyHistoryModal(dashboardData) {
    const modal = document.getElementById('penaltyHistoryModal');
    if(!modal) return;

    const penaltyData = dashboardData.penaltyWallet || {};
    const incomes = Object.entries(penaltyData.incomes || {}).map(([key, i]) => ({...i, type: 'income', key}));
    const expenses = Object.entries(penaltyData.expenses || {}).map(([key, e]) => ({...e, type: 'expense', key}));
    const history = [...incomes, ...expenses].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

    let content = `<div class="modal-content bg-white rounded-2xl shadow-2xl w-full max-w-lg scale-95 flex flex-col max-h-[85vh]"><div class="flex justify-between items-center p-5 border-b bg-gray-50/50"><h3 class="text-xl font-bold text-gray-800">Wallet History</h3><button class="close-modal-btn text-gray-400 hover:text-gray-800 text-2xl">&times;</button></div><div class="p-2 overflow-y-auto flex-grow custom-scrollbar">`;
    if (history.length === 0) content += `<p class="text-center text-gray-400 py-10">No records found.</p>`;
    else {
        content += `<ul class="space-y-2 p-2">`;
        history.forEach(tx => {
            const isIncome = tx.type === 'income';
            content += `<li class="flex justify-between items-center p-3 bg-white rounded-xl border border-gray-100 shadow-sm"><div><p class="font-bold text-gray-800 text-sm">${isIncome ? tx.from : tx.reason}</p><p class="text-xs text-gray-400">${new Date(tx.timestamp).toLocaleDateString('en-GB')} &bull; ${isIncome ? 'Deposit' : 'Expense'}</p></div><div class="text-right flex items-center gap-3"><p class="font-bold text-lg ${isIncome ? 'text-green-600' : 'text-red-600'}">${isIncome ? '+' : '-'}₹${tx.amount}</p><div class="flex gap-1"><button class="edit-penalty-btn p-1.5 bg-gray-100 text-blue-600 rounded-lg hover:bg-blue-50" data-key="${tx.key}" data-type="${tx.type}" data-amount="${tx.amount}" data-reason="${isIncome ? tx.from : tx.reason}"><i class="ph-pencil-simple"></i></button><button class="delete-penalty-btn p-1.5 bg-gray-100 text-red-600 rounded-lg hover:bg-red-50" data-key="${tx.key}" data-type="${tx.type}"><i class="ph-trash"></i></button></div></div></li>`;
        });
        content += `</ul>`;
    }
    content += `</div><div class="p-4 border-t bg-white flex justify-center"><button id="burn-money-btn" class="w-full btn-danger py-3 rounded-xl font-bold text-white shadow-lg flex items-center justify-center gap-2"><i class="ph-fire-simple text-xl"></i> Record Expense</button></div></div>`;
    modal.innerHTML = content;
    openModal(modal);
}

export function renderEditPenaltyModal(key, type, amount, reason) {
    const container = document.getElementById('editPenaltyModal');
    if(!container) return;

    container.innerHTML = `<div class="modal-content bg-white rounded-2xl shadow-xl w-full max-w-sm scale-95 p-6"><h3 class="text-lg font-bold mb-4">Edit Record</h3><form id="edit-penalty-form" data-key="${key}" data-type="${type}"><label class="block text-sm font-medium mb-1">Name / Reason</label><input type="text" id="edit-p-reason" class="form-input w-full mb-3" value="${reason}" required><label class="block text-sm font-medium mb-1">Amount</label><input type="number" id="edit-p-amount" class="form-input w-full mb-4" value="${amount}" required><div class="flex justify-end gap-2"><button type="button" class="close-modal-btn px-4 py-2 bg-gray-100 rounded-lg">Cancel</button><button type="submit" class="btn-primary px-4 py-2 rounded-lg text-white">Update</button></div></form></div>`;
    openModal(container);
}

export function renderAddPenaltyMoneyModal(dashboardData) {
    const modal = document.getElementById('addPenaltyMoneyModal');
    if(!modal) return;

    const members = Object.values(dashboardData.members || {}).filter(m => m.status === 'Approved');
    modal.innerHTML = `<div class="modal-content bg-white rounded-2xl shadow-2xl w-full max-w-md scale-95"><form id="add-penalty-money-form"><div class="p-5 border-b border-gray-100 flex justify-between items-center"><h3 class="text-xl font-bold text-gray-800">Deposit Funds</h3><button type="button" class="close-modal-btn text-gray-400 hover:text-gray-800 text-2xl">&times;</button></div><div class="p-6 space-y-5"><div><label class="block text-sm font-semibold text-gray-700 mb-2">Select Member</label><select id="penalty-add-name" class="form-select w-full" required><option value="">Choose a member...</option>${members.map(m => `<option value="${m.fullName}">${m.fullName}</option>`).join('')}<option value="Bank Admin">Bank Admin (Self)</option></select></div><div><label class="block text-sm font-semibold text-gray-700 mb-2">Amount</label><div class="relative"><span class="absolute left-4 top-3.5 text-gray-400 font-bold">₹</span><input type="number" id="penalty-add-amount" class="form-input w-full pl-8" placeholder="0.00" required></div></div><div><label class="block text-sm font-semibold text-gray-700 mb-2">Note (Optional)</label><input type="text" id="penalty-add-reason" class="form-input w-full" placeholder="e.g., Late Fee"></div></div><div class="p-5 flex justify-end gap-3"><button type="button" class="close-modal-btn px-6 py-2.5 text-gray-600 font-medium hover:bg-gray-100 rounded-xl transition-colors">Cancel</button><button type="submit" id="submit-penalty-btn" class="btn-primary px-8 py-2.5 text-white font-bold rounded-xl shadow-lg">Deposit</button></div></form></div>`;
    openModal(modal);
}

export function renderBurnMoneyModal() {
    const modal = document.getElementById('burnMoneyModal');
    if(!modal) return;

    modal.innerHTML = `<div class="modal-content bg-white rounded-2xl shadow-2xl w-full max-w-md scale-95 border-t-4 border-red-500"><form id="burn-money-form"><div class="p-5 flex justify-between items-center"><h3 class="text-xl font-bold text-red-600">Record Expense</h3><button type="button" class="close-modal-btn text-gray-400 hover:text-gray-800 text-2xl">&times;</button></div><div class="p-6 space-y-5 pt-2"><div><label class="block text-sm font-semibold text-gray-700 mb-2">Reason</label><input type="text" id="burn-reason" class="form-input w-full" placeholder="e.g., Refreshments" required></div><div><label class="block text-sm font-semibold text-gray-700 mb-2">Amount</label><div class="relative"><span class="absolute left-4 top-3.5 text-gray-400 font-bold">₹</span><input type="number" id="burn-amount" class="form-input w-full pl-8" placeholder="0.00" required></div></div></div><div class="p-5 flex justify-end gap-3 bg-red-50/50"><button type="button" class="close-modal-btn px-6 py-2.5 text-gray-600 font-medium hover:bg-white rounded-xl transition-colors">Cancel</button><button type="submit" id="submit-burn-btn" class="btn-danger px-8 py-2.5 text-white font-bold rounded-xl shadow-lg shadow-red-500/20">Record</button></div></form></div>`;
    openModal(modal);
}
