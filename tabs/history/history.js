// tabs/history/history.js

export function init(app) {
    const state = app.state;

    // 1. Initial Render (Show All)
    renderHistoryList('all', state);

    // 2. Setup Filter Buttons
    const filterContainer = document.getElementById('history-filters');
    if(filterContainer) {
        filterContainer.onclick = (e) => {
            if(e.target.classList.contains('filter-btn')) {
                // Remove active classes from all buttons
                document.querySelectorAll('.filter-btn').forEach(b => {
                    b.classList.remove('bg-[#001540]', 'text-white');
                    b.classList.add('text-gray-500');
                });

                // Add active class to clicked button
                const btn = e.target;
                btn.classList.add('bg-[#001540]', 'text-white');
                btn.classList.remove('text-gray-500');

                // Render List based on filter
                const filterType = btn.getAttribute('data-filter');
                renderHistoryList(filterType, state);
            }
        };
    }
}

function renderHistoryList(filterType, state) {
    const container = document.getElementById('history-container');
    if(!container) return;
    container.innerHTML = '';

    // Logic for Filtering Data
    let data = state.balanceHistory.slice().reverse(); 

    if (filterType === 'loan' || filterType === 'all') {
        const loans = state.allData.filter(t => t.memberId === state.member.membershipId && t.loan > 0).map(l => ({
            type: 'loan', date: l.date, amount: l.loan, desc: 'Loan Taken'
        }));
        if(filterType === 'loan') data = loans.reverse();
        else data = [...data, ...loans].sort((a,b) => b.date - a.date);
    }

    if (filterType === 'transaction') {
         data = state.balanceHistory.filter(h => h.type !== 'loan');
    }

    // Empty State
    if(data.length === 0) {
        container.innerHTML = `<div class="text-center py-10 text-gray-400"><i class="fas fa-receipt text-3xl mb-2 opacity-50"></i><p class="text-sm font-bold">No records found</p></div>`; 
        return;
    }

    // Render Items
    data.slice(0, 50).forEach(item => {
        const isPlus = item.amount > 0 && item.type !== 'withdrawal' && item.type !== 'loan';
        const color = isPlus ? 'text-green-600' : 'text-red-600';
        const icon = item.type === 'profit' ? 'fa-chart-line' : (item.type === 'loan' ? 'fa-hand-holding-usd' : 'fa-exchange-alt');
        const bgIcon = isPlus ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600';
        let title = item.type === 'profit' ? 'Profit Share' : (item.type || 'Txn');

        container.innerHTML += `
        <div class="bg-white p-3 rounded-xl border border-gray-100 shadow-sm flex items-center justify-between hover:shadow-md transition-shadow">
            <div class="flex items-center gap-3">
                <div class="w-9 h-9 rounded-full ${bgIcon} flex items-center justify-center text-sm">
                    <i class="fas ${icon}"></i>
                </div>
                <div>
                    <p class="font-bold text-xs text-[#001540] uppercase tracking-wide">${title.replace(/_/g, ' ')}</p>
                    <p class="text-[10px] text-gray-400 font-medium mt-0.5">${item.date.toLocaleDateString('en-GB')}</p>
                </div>
            </div>
            <p class="font-mono font-bold text-sm ${color}">${isPlus ? '+' : ''}₹${Math.abs(item.amount).toLocaleString('en-IN')}</p>
        </div>`;
    });
}
