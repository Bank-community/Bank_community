// tabs/history/history.js

export function init(app) {
    const state = app.state;

    // 1. Calculate & Render Top Card
    renderTopCard(state);

    // 2. Initial Render (Show All Transactions)
    renderHistoryList('all', state);

    // 3. Setup Smart Filter Buttons
    const filterContainer = document.getElementById('history-filters');
    if(filterContainer) {
        if (filterContainer._clickListener) filterContainer.removeEventListener('click', filterContainer._clickListener);

        filterContainer._clickListener = (e) => {
            const btn = e.target.closest('.filter-btn');
            if(btn) {
                document.querySelectorAll('.filter-btn').forEach(b => {
                    b.classList.remove('bg-[#001540]', 'text-white', 'shadow-md');
                    b.classList.add('bg-transparent', 'text-gray-400');
                });

                btn.classList.remove('bg-transparent', 'text-gray-400');
                btn.classList.add('bg-[#001540]', 'text-white', 'shadow-md');

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

    const totalP2pSent = memberTxs.reduce((sum, tx) => sum + (tx.p2pSent || 0), 0);
    const totalP2pReceived = memberTxs.reduce((sum, tx) => sum + (tx.p2pReceived || 0), 0);

    let activeLoanDue = 0;
    if (state.activeLoans) {
        Object.values(state.activeLoans).forEach(loan => {
            if (loan.memberId === memberId && loan.status === 'Active') {
                activeLoanDue += parseFloat(loan.outstandingAmount || 0);
            }
        });
    }

    const netBalance = (totalSip + totalP2pReceived) - totalP2pSent - activeLoanDue;

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
        (tx.sipPayment > 0 || tx.loan > 0 || tx.payment > 0 || tx.p2pSent > 0 || tx.p2pReceived > 0)
    );

    let filteredData = relevantTxs;
    if (filterType === 'loan') filteredData = relevantTxs.filter(tx => tx.loan > 0);
    else if (filterType === 'payment') filteredData = relevantTxs.filter(tx => tx.payment > 0);
    else if (filterType === 'sip') filteredData = relevantTxs.filter(tx => tx.sipPayment > 0);
    else if (filterType === 'p2p') filteredData = relevantTxs.filter(tx => tx.p2pSent > 0 || tx.p2pReceived > 0);

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

        if (tx.loan > 0) {
            icon = 'fa-hand-holding-usd';

            // 🚀 UPDATE: Using loanType from data, uppercase format
            title = tx.loanType ? tx.loanType.toUpperCase() : 'LOAN';

            // 🚀 UPDATE: Joining Category, Months and Date dynamically
            let extraInfo = [];
            if (tx.loanCategory) extraInfo.push(tx.loanCategory);
            if (tx.tenureMonths) extraInfo.push(`${tx.tenureMonths} Months`);
            extraInfo.push(tx.date.toLocaleDateString('en-GB'));

            subText = extraInfo.join(' • '); // Output example: Small Value • 6 Months • 27/02/2026

            amount = tx.loan;
            amountClass = 'text-[#e53935]'; 
            iconBgClass = 'bg-red-50 text-[#e53935]';
            displayPrefix = ''; 
        } else if (tx.payment > 0) {
            icon = 'fa-check-circle';
            title = 'LOAN REPAYMENT';
            subText = `Principal + Interest • ${tx.date.toLocaleDateString('en-GB')}`;
            amount = tx.payment;
            amountClass = 'text-[#4caf50]'; 
            iconBgClass = 'bg-green-50 text-[#4caf50]';
            displayPrefix = '+';
        } else if (tx.sipPayment > 0) {
            icon = 'fa-coins';
            title = 'SIP DEPOSIT';
            subText = `Monthly Fund Contribution • ${tx.date.toLocaleDateString('en-GB')}`;
            amount = tx.sipPayment;
            amountClass = 'text-[#4caf50]'; 
            iconBgClass = 'bg-green-50 text-[#4caf50]';
            displayPrefix = '+';
        } else if (tx.p2pSent > 0) {
            icon = 'fa-arrow-up';
            title = 'P2P SENT';
            subText = `To ${tx.otherPartyName || 'Member'} • ${tx.date.toLocaleDateString('en-GB')}`;
            amount = tx.p2pSent;
            amountClass = 'text-[#e53935]'; 
            iconBgClass = 'bg-gray-100 text-gray-500';
            displayPrefix = '-';
        } else if (tx.p2pReceived > 0) {
            icon = 'fa-arrow-down';
            title = 'P2P RECEIVED';
            subText = `From ${tx.otherPartyName || 'Member'} • ${tx.date.toLocaleDateString('en-GB')}`;
            amount = tx.p2pReceived;
            amountClass = 'text-[#4caf50]'; 
            iconBgClass = 'bg-green-50 text-[#4caf50]';
            displayPrefix = '+';
        }

        html += `
        <div class="bg-white p-4 rounded-[1rem] border border-gray-100 shadow-sm flex items-center justify-between hover:shadow-md transition-shadow">
            <div class="flex items-center gap-4">
                <div class="w-11 h-11 rounded-full ${iconBgClass} flex items-center justify-center text-lg shadow-inner">
                    <i class="fas ${icon}"></i>
                </div>
                <div>
                    <p class="font-extrabold text-[13px] text-[#001540] uppercase tracking-wide leading-tight">${title}</p>
                    <p class="text-[10px] text-gray-400 font-medium mt-0.5">${subText}</p>
                    ${tx.p2pNote ? `<p class="text-[9px] text-gray-500 italic mt-0.5 truncate max-w-[150px]">"${tx.p2pNote}"</p>` : ''}
                </div>
            </div>
            <div class="text-right">
                <p class="font-bold text-[15px] ${amountClass}">${displayPrefix}₹${amount.toLocaleString('en-IN')}</p>
            </div>
        </div>`;
    });

    container.innerHTML = html;
}
