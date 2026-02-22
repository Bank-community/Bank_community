// tabs/history/history.js

export function init(app) {
    const state = app.state;

    // 1. Calculate & Render Top Card
    renderTopCard(state);

    // 2. Initial Render (Show All Transactions)
    renderHistoryList('all', state);

    // 3. Setup Smart Filter Buttons (BUG FIXED)
    const filterContainer = document.getElementById('history-filters');
    if(filterContainer) {
        if (filterContainer._clickListener) filterContainer.removeEventListener('click', filterContainer._clickListener);

        filterContainer._clickListener = (e) => {
            const btn = e.target.closest('.filter-btn');
            if(btn) {
                // Reset all buttons to default (Transparent bg, Gray text)
                document.querySelectorAll('.filter-btn').forEach(b => {
                    b.classList.remove('bg-royal-dark', 'text-white', 'shadow-md');
                    b.classList.add('bg-transparent', 'text-gray-400');
                });

                // Active clicked button (Royal Dark bg, White text)
                btn.classList.remove('bg-transparent', 'text-gray-400');
                btn.classList.add('bg-royal-dark', 'text-white', 'shadow-md');

                // Render List based on filter
                const filterType = btn.getAttribute('data-filter');
                renderHistoryList(filterType, state);
            }
        };
        filterContainer.addEventListener('click', filterContainer._clickListener);
    }
}

function renderTopCard(state) {
    const memberId = state.member.membershipId;
    const memberTxs = state.allData.filter(t => t.memberId === memberId);

    const totalSip = memberTxs.reduce((sum, tx) => sum + (tx.sipPayment || 0), 0);

    let activeLoanDue = 0;
    if (state.activeLoans) {
        Object.values(state.activeLoans).forEach(loan => {
            if (loan.memberId === memberId && loan.status === 'Active') {
                activeLoanDue += parseFloat(loan.outstandingAmount || 0);
            }
        });
    }

    const netBalance = totalSip - activeLoanDue;

    document.getElementById('history-net-balance').textContent = `₹${netBalance.toLocaleString('en-IN')}`;
    document.getElementById('history-total-sip').textContent = `₹${totalSip.toLocaleString('en-IN')}`;
    document.getElementById('history-loan-due').textContent = `₹${activeLoanDue.toLocaleString('en-IN')}`;
}

function renderHistoryList(filterType, state) {
    const container = document.getElementById('history-container');
    if(!container) return;
    container.innerHTML = '';

    const memberId = state.member.membershipId;

    const relevantTxs = state.allData.filter(tx => 
        tx.memberId === memberId && 
        (tx.sipPayment > 0 || tx.loan > 0 || tx.payment > 0)
    );

    let filteredData = relevantTxs;
    if (filterType === 'loan') filteredData = relevantTxs.filter(tx => tx.loan > 0);
    else if (filterType === 'payment') filteredData = relevantTxs.filter(tx => tx.payment > 0);
    else if (filterType === 'sip') filteredData = relevantTxs.filter(tx => tx.sipPayment > 0);

    filteredData.sort((a, b) => b.date - a.date);

    if(filteredData.length === 0) {
        container.innerHTML = `
            <div class="text-center py-12 text-gray-400">
                <div class="w-14 h-14 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
                    <i class="fas fa-file-invoice text-xl opacity-50"></i>
                </div>
                <p class="text-sm font-bold">No records found</p>
            </div>`; 
        return;
    }

    let html = '';
    filteredData.forEach(tx => {
        let icon = '';
        let title = '';
        let subText = '';
        let amount = 0;
        let amountClass = '';
        let iconBgClass = '';
        let displayPrefix = '';

        // Matching Exact Design from Screenshot
        if (tx.loan > 0) {
            icon = 'fa-hand-holding-usd';
            title = 'LOAN';
            subText = tx.date.toLocaleDateString('en-GB'); 
            amount = tx.loan;
            amountClass = 'text-[#e53935]'; // Red
            iconBgClass = 'bg-red-50 text-[#e53935]';
            displayPrefix = ''; // No minus sign
        } else if (tx.payment > 0) {
            icon = 'fa-check-circle';
            title = 'LOAN REPAYMENT';
            subText = `Principal + Interest • ${tx.date.toLocaleDateString('en-GB')}`;
            amount = tx.payment;
            amountClass = 'text-[#4caf50]'; // Green
            iconBgClass = 'bg-green-50 text-[#4caf50]';
            displayPrefix = '+';
        } else if (tx.sipPayment > 0) {
            icon = 'fa-coins';
            title = 'SIP DEPOSIT';
            subText = `Monthly Fund Contribution • ${tx.date.toLocaleDateString('en-GB')}`;
            amount = tx.sipPayment;
            amountClass = 'text-[#4caf50]'; // Green
            iconBgClass = 'bg-green-50 text-[#4caf50]';
            displayPrefix = '+';
        }

        html += `
        <div class="bg-white p-4 rounded-[1rem] border border-gray-100 shadow-sm flex items-center justify-between hover:shadow-md transition-shadow">
            <div class="flex items-center gap-4">
                <div class="w-11 h-11 rounded-full ${iconBgClass} flex items-center justify-center text-lg">
                    <i class="fas ${icon}"></i>
                </div>
                <div>
                    <p class="font-extrabold text-[13px] text-royal-dark uppercase tracking-wide leading-tight">${title}</p>
                    <p class="text-[10px] text-gray-400 font-medium mt-0.5">${subText}</p>
                </div>
            </div>
            <div class="text-right">
                <p class="font-bold text-[15px] ${amountClass}">${displayPrefix}₹${amount.toLocaleString('en-IN')}</p>
            </div>
        </div>`;
    });

    container.innerHTML = html;
}
