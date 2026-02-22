// tabs/history/history.js

export function init(app) {
    const state = app.state;

    // 1. Calculate & Render Top Card (Passbook Balances)
    renderTopCard(state);

    // 2. Initial Render (Show All Transactions)
    renderHistoryList('all', state);

    // 3. Setup Smart Filter Buttons
    const filterContainer = document.getElementById('history-filters');
    if(filterContainer) {
        // Remove old listener to avoid duplicate clicks
        if (filterContainer._clickListener) filterContainer.removeEventListener('click', filterContainer._clickListener);

        filterContainer._clickListener = (e) => {
            if(e.target.classList.contains('filter-btn')) {
                // Reset all buttons
                document.querySelectorAll('.filter-btn').forEach(b => {
                    b.classList.remove('bg-[#001540]', 'text-white');
                    b.classList.add('text-gray-500');
                });

                // Active clicked button
                const btn = e.target;
                btn.classList.add('bg-[#001540]', 'text-white');
                btn.classList.remove('text-gray-500');

                // Render List based on filter
                const filterType = btn.getAttribute('data-filter');
                renderHistoryList(filterType, state);
            }
        };
        filterContainer.addEventListener('click', filterContainer._clickListener);
    }
}

// --- CALCULATE & RENDER PASSBOOK BALANCES ---
function renderTopCard(state) {
    const memberId = state.member.membershipId;
    const memberTxs = state.allData.filter(t => t.memberId === memberId);

    // Calculate Total SIP
    const totalSip = memberTxs.reduce((sum, tx) => sum + (tx.sipPayment || 0), 0);

    // Calculate Active Loan Due (From activeLoans Node)
    let activeLoanDue = 0;
    if (state.activeLoans) {
        Object.values(state.activeLoans).forEach(loan => {
            if (loan.memberId === memberId && loan.status === 'Active') {
                activeLoanDue += parseFloat(loan.outstandingAmount || 0);
            }
        });
    }

    // Net Available Balance Logic
    const netBalance = totalSip - activeLoanDue;

    document.getElementById('history-net-balance').textContent = `₹${netBalance.toLocaleString('en-IN')}`;
    document.getElementById('history-total-sip').textContent = `₹${totalSip.toLocaleString('en-IN')}`;
    document.getElementById('history-loan-due').textContent = `₹${activeLoanDue.toLocaleString('en-IN')}`;
}

// --- RENDER TRANSACTION LIST ---
function renderHistoryList(filterType, state) {
    const container = document.getElementById('history-container');
    if(!container) return;
    container.innerHTML = '';

    const memberId = state.member.membershipId;

    // Filter to ONLY include SIP, Loans, and Payments (Hides Profit/Admin Bonus completely)
    const relevantTxs = state.allData.filter(tx => 
        tx.memberId === memberId && 
        (tx.sipPayment > 0 || tx.loan > 0 || tx.payment > 0)
    );

    // Apply User Selected Filter (All, Loans, Payments, SIP)
    let filteredData = relevantTxs;
    if (filterType === 'loan') {
        filteredData = relevantTxs.filter(tx => tx.loan > 0);
    } else if (filterType === 'payment') {
        filteredData = relevantTxs.filter(tx => tx.payment > 0);
    } else if (filterType === 'sip') {
        filteredData = relevantTxs.filter(tx => tx.sipPayment > 0);
    }

    // Sort Newest First (Descending Date)
    filteredData.sort((a, b) => b.date - a.date);

    // Empty State Check
    if(filteredData.length === 0) {
        container.innerHTML = `
            <div class="text-center py-12 text-gray-400">
                <div class="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
                    <i class="fas fa-file-invoice text-2xl opacity-50"></i>
                </div>
                <p class="text-sm font-bold">No records found</p>
                <p class="text-[10px] mt-1">Try changing the filter</p>
            </div>`; 
        return;
    }

    // Render Cards
    let html = '';
    filteredData.forEach(tx => {
        let isCredit = false;
        let icon = '';
        let title = '';
        let subText = '';
        let amount = 0;
        let amountClass = '';
        let iconBgClass = '';

        // Dynamic Mapping based on Transaction Type
        if (tx.loan > 0) {
            isCredit = false;
            icon = 'fa-hand-holding-usd';
            title = 'Loan Taken';
            subText = 'Fund Disbursed';
            amount = tx.loan;
            amountClass = 'text-red-600';
            iconBgClass = 'bg-red-50 text-red-500';
        } else if (tx.payment > 0) {
            isCredit = true;
            icon = 'fa-check-circle';
            title = 'Loan Repayment';
            subText = `Principal + Interest`;
            amount = tx.payment;
            amountClass = 'text-green-600';
            iconBgClass = 'bg-green-50 text-green-600';
        } else if (tx.sipPayment > 0) {
            isCredit = true;
            icon = 'fa-coins';
            title = 'SIP Deposit';
            subText = 'Monthly Fund Contribution';
            amount = tx.sipPayment;
            amountClass = 'text-green-600';
            iconBgClass = 'bg-green-50 text-green-600';
        }

        html += `
        <div class="bg-white p-4 rounded-xl border border-gray-100 shadow-sm flex items-center justify-between hover:border-[#D4AF37] hover:shadow-md transition-all">
            <div class="flex items-center gap-4">
                <div class="w-10 h-10 rounded-full ${iconBgClass} flex items-center justify-center text-lg border border-white shadow-inner">
                    <i class="fas ${icon}"></i>
                </div>
                <div>
                    <p class="font-bold text-sm text-[#001540] uppercase tracking-wide leading-tight">${title}</p>
                    <p class="text-[10px] text-gray-400 font-medium mt-0.5">${subText} • ${tx.date.toLocaleDateString('en-GB')}</p>
                </div>
            </div>
            <div class="text-right">
                <p class="font-mono font-bold text-lg ${amountClass}">${isCredit ? '+' : '-'}₹${amount.toLocaleString('en-IN')}</p>
            </div>
        </div>`;
    });

    container.innerHTML = html;
}
