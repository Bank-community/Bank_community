// modules/explorer/explorerController.js
import { db } from '../../core/firebaseConfig.js';
import { ref, onValue, remove, update, get, query, orderByChild, equalTo, off } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-database.js";
import { showToast, showConfirmation, openModal, closeModal, setButtonState } from '../../shared/uiComponents.js';

let transactionsListener = null;
let membersListener = null;
let allTransactions = {};
let allMembersData = {};

// Filters State
let currentFilters = {
    name: 'all',
    type: 'all',
    date: ''
};

export async function init() {
    console.log("Data Explorer Module Initialized");
    const container = document.getElementById('data-explorer-view');

    // 1. Filter Change Listeners
    container.addEventListener('input', (e) => { // Changed to 'input' for better date handling
        if (e.target.id === 'explorer-name-filter') {
            currentFilters.name = e.target.value;
            renderTable();
        }
        if (e.target.id === 'explorer-type-filter') {
            currentFilters.type = e.target.value;
            renderTable();
        }
        if (e.target.id === 'explorer-date-filter') {
            currentFilters.date = e.target.value; // Valid date or empty string
            renderTable();
        }
    });

    // 2. Reset Filters Button
    container.addEventListener('click', (e) => {
        if (e.target.id === 'reset-explorer-btn') {
            document.getElementById('explorer-name-filter').value = 'all';
            document.getElementById('explorer-type-filter').value = 'all';
            document.getElementById('explorer-date-filter').value = '';

            currentFilters = { name: 'all', type: 'all', date: '' };
            renderTable();
            showToast('Filters reset. Showing all data.');
        }

        // Action Buttons (Edit/Delete)
        // Delete Button
        if (e.target.closest('.delete-transaction-btn')) {
            const btn = e.target.closest('.delete-transaction-btn');
            const txId = btn.dataset.txId;
            handleDeleteTransaction(txId);
        }

        // Edit Button
        if (e.target.closest('.edit-transaction-btn')) {
            const btn = e.target.closest('.edit-transaction-btn');
            const txId = btn.dataset.txId;
            // Pass full data to modal
            renderEditTransactionModal(txId, allTransactions[txId], allMembersData);
        }
    });

    // 3. Edit Modal Form Submit Listener (Delegated to Body)
    document.body.addEventListener('submit', async (e) => {
        if (e.target.id === 'edit-transaction-form') {
            e.preventDefault();
            await handleEditSubmit(e);
        }
    });
}

export async function render() {
    const container = document.getElementById('data-explorer-view');

    // Skeleton UI with Reset Button
    container.innerHTML = `
        <div class="bg-white p-4 rounded-xl shadow-md mb-6">
            <div class="flex justify-between items-center mb-4">
                <h3 class="font-bold text-gray-700">Filters</h3>
                <button id="reset-explorer-btn" class="text-sm text-indigo-600 hover:text-indigo-800 font-semibold hover:underline">
                    Reset / Show All
                </button>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                    <label class="text-sm font-medium text-gray-700">By Name</label>
                    <select id="explorer-name-filter" class="form-select w-full p-2 rounded-lg mt-1 bg-gray-50">
                        <option value="all">Loading members...</option>
                    </select>
                </div>
                <div>
                    <label class="text-sm font-medium text-gray-700">By Type</label>
                    <select id="explorer-type-filter" class="form-select w-full p-2 rounded-lg mt-1 bg-gray-50">
                        <option value="all">All Transactions</option>
                        <option value="SIP">SIP</option>
                        <option value="SIP Withdrawal">SIP Withdrawal</option>
                        <option value="Loan Taken">Loan Taken</option>
                        <option value="Loan Payment">Loan Payment</option>
                        <option value="Extra Payment">Extra Payment</option>
                        <option value="Extra Withdraw">Extra Withdraw</option>
                    </select>
                </div>
                <div>
                    <label class="text-sm font-medium text-gray-700">By Date</label>
                    <input type="date" id="explorer-date-filter" class="form-input w-full p-2 rounded-lg mt-1">
                </div>
            </div>
        </div>
        <div id="explorer-results-container" class="bg-white rounded-xl shadow-md overflow-x-auto min-h-[300px] flex flex-col items-center justify-center">
             <div class="loader border-indigo-600"></div>
             <p class="mt-2 text-gray-500">Fetching Transactions...</p>
        </div>
    `;

    const txRef = ref(db, 'transactions');
    const membersRef = ref(db, 'members');

    if (transactionsListener) off(txRef, 'value', transactionsListener);
    if (membersListener) off(membersRef, 'value', membersListener);

    membersListener = onValue(membersRef, (snapshot) => {
        allMembersData = snapshot.val() || {};
        populateMemberFilter();
    });

    transactionsListener = onValue(txRef, (snapshot) => {
        allTransactions = snapshot.val() || {};
        renderTable();
    });
}

// --- Internal Helper Functions ---

function populateMemberFilter() {
    const select = document.getElementById('explorer-name-filter');
    if (!select) return;

    const approvedMembers = Object.entries(allMembersData)
        .filter(([, m]) => m.status === 'Approved')
        .sort((a, b) => a[1].fullName.localeCompare(b[1].fullName));

    let html = `<option value="all">All Members</option>`;
    approvedMembers.forEach(([id, m]) => {
        html += `<option value="${id}" ${currentFilters.name === id ? 'selected' : ''}>${m.fullName}</option>`;
    });
    select.innerHTML = html;
}

function renderTable() {
    const container = document.getElementById('explorer-results-container');
    if (!container) return;

    // --- FIX 1: Reset Container Classes for Scrolling ---
    container.className = "bg-white rounded-xl shadow-md overflow-x-auto";
    // ----------------------------------------------------

    let filtered = Object.values(allTransactions);

    // Apply Filters
    if (currentFilters.name !== 'all') {
        filtered = filtered.filter(tx => tx.memberId === currentFilters.name);
    }
    if (currentFilters.type !== 'all') {
        filtered = filtered.filter(tx => tx.type === currentFilters.type);
    }
    // Date Filter Logic (Empty string check handles "Show All")
    if (currentFilters.date && currentFilters.date !== '') {
        filtered = filtered.filter(tx => tx.date && new Date(tx.date).toISOString().split('T')[0] === currentFilters.date);
    }

    // Sort by Date (Newest First)
    filtered.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

    if (filtered.length === 0) {
        // Restore centering just for the "No Found" message
        container.className = "bg-white rounded-xl shadow-md overflow-x-auto min-h-[200px] flex flex-col items-center justify-center";
        container.innerHTML = `<p class="text-center text-gray-500 p-8">No matching transactions found.</p>`;
        return;
    }

    // --- FIX 2: Added whitespace-nowrap to cells and min-w-max to table ---
    const tableHTML = `
        <table class="w-full text-sm text-left text-gray-500 min-w-max">
            <thead class="text-xs text-gray-700 uppercase bg-gray-50 sticky top-0 z-10">
                <tr>
                    <th class="px-6 py-3 whitespace-nowrap">Date</th>
                    <th class="px-6 py-3 whitespace-nowrap">Name</th>
                    <th class="px-6 py-3 whitespace-nowrap">Type</th>
                    <th class="px-6 py-3 text-right whitespace-nowrap">Amount</th>
                    <th class="px-6 py-3 text-center whitespace-nowrap">Actions</th>
                </tr>
            </thead>
            <tbody class="divide-y divide-gray-100">
                ${filtered.map(tx => {
                    const memberName = allMembersData[tx.memberId]?.fullName || 'Unknown';
                    let amountHtml = '';
                    let typeDisplay = tx.type;

                    switch(tx.type) {
                        case 'SIP': amountHtml = `<span class="font-bold text-green-600">₹${(tx.amount || 0).toLocaleString('en-IN')}</span>`; break;
                        case 'SIP Withdrawal': amountHtml = `<span class="font-bold text-red-600">- ₹${(tx.amount || 0).toLocaleString('en-IN')}</span>`; break;
                        case 'Loan Taken': 
                            amountHtml = `<span class="font-bold text-red-600">₹${(tx.amount || 0).toLocaleString('en-IN')}</span>`; 
                            typeDisplay = `<span class="text-indigo-600 font-medium">${tx.loanType || 'Loan'}</span>`;
                            break;
                        case 'Loan Payment': 
                            amountHtml = `<div class="flex flex-col text-right">
                                <span class="text-green-600 font-bold">₹${(tx.principalPaid || 0).toLocaleString('en-IN')}</span>
                                <span class="text-xs text-gray-400">Int: ₹${(tx.interestPaid || 0).toLocaleString('en-IN')}</span>
                            </div>`; 
                            break;
                        case 'Extra Payment': amountHtml = `<span class="font-bold text-yellow-600">₹${(tx.amount || 0).toLocaleString('en-IN')}</span>`; break;
                        case 'Extra Withdraw': amountHtml = `<span class="font-bold text-purple-600">₹${(tx.amount || 0).toLocaleString('en-IN')}</span>`; break;
                    }

                    return `
                        <tr class="bg-white hover:bg-gray-50 transition-colors">
                            <td class="px-6 py-4 whitespace-nowrap text-gray-900">${new Date(tx.date).toLocaleDateString('en-GB')}</td>
                            <td class="px-6 py-4 font-medium text-gray-900 whitespace-nowrap">${memberName}</td>
                            <td class="px-6 py-4 whitespace-nowrap">${typeDisplay}</td>
                            <td class="px-6 py-4 text-right whitespace-nowrap">${amountHtml}</td>
                            <td class="px-6 py-4 text-center whitespace-nowrap">
                                <button class="edit-transaction-btn p-2 text-blue-600 hover:bg-blue-50 rounded-full transition-colors" data-tx-id="${tx.transactionId}"><i class="ph-pencil-simple text-lg"></i></button>
                                <button class="delete-transaction-btn p-2 text-red-600 hover:bg-red-50 rounded-full transition-colors" data-tx-id="${tx.transactionId}"><i class="ph-trash text-lg"></i></button>
                            </td>
                        </tr>
                    `;
                }).join('')}
            </tbody>
        </table>
    `;
    container.innerHTML = tableHTML;
}

// --- Action Logic ---

// FIX 3: Defined Locally to avoid Import Error
function renderEditTransactionModal(txId, transaction, allMembersData) {
    const modal = document.getElementById('editTransactionModal');
    if (!modal) {
        console.error("Edit Modal container not found!");
        return;
    }
    const date = new Date(transaction.date).toISOString().split('T')[0];
    const memberName = allMembersData[transaction.memberId]?.fullName || 'Unknown';

    let fieldsHTML = '';

    // Dynamic Fields based on Type
    if (transaction.type === 'Loan Taken' && transaction.loanType === 'Recharge') {
        const rechargeDetails = transaction.rechargeDetails || {};
        fieldsHTML = `
            <div><label class="block text-sm font-medium text-gray-700 mb-1">Loan Amount</label><input type="number" id="edit-tx-amount" class="form-input w-full p-2 rounded-lg" value="${transaction.amount || 0}"></div>
            <div class="grid grid-cols-2 gap-4 mt-2">
                <div><label class="block text-sm font-medium text-gray-700 mb-1">Operator</label><input list="edit-operators" id="edit-tx-operator" class="form-input w-full p-2 rounded-lg" value="${rechargeDetails.operator || ''}"><datalist id="edit-operators"><option value="Jio"><option value="Airtel"><option value="Vi"><option value="BSNL"></datalist></div>
                <div><label class="block text-sm font-medium text-gray-700 mb-1">EMI Amount</label><input type="number" id="edit-tx-emi" class="form-input w-full p-2 rounded-lg" value="${rechargeDetails.rechargeEmi || ''}"></div>
            </div>`;
    } 
    else if (transaction.type === 'Loan Payment') {
        fieldsHTML = `
            <div class="grid grid-cols-2 gap-4">
                <div><label class="block text-sm font-medium text-gray-700 mb-1">Principal Paid</label><input type="number" id="edit-tx-principal" class="form-input w-full p-2 rounded-lg" value="${transaction.principalPaid || 0}"></div>
                <div><label class="block text-sm font-medium text-gray-700 mb-1">Interest Paid</label><input type="number" id="edit-tx-interest" class="form-input w-full p-2 rounded-lg" value="${transaction.interestPaid || 0}"></div>
            </div>`;
    }
    else {
        fieldsHTML = `<div><label class="block text-sm font-medium text-gray-700 mb-1">Amount</label><input type="number" id="edit-tx-amount" class="form-input w-full p-2 rounded-lg" value="${transaction.amount || 0}"></div>`;
    }

    modal.innerHTML = `
        <div class="modal-content bg-white rounded-lg shadow-xl w-full max-w-lg scale-95">
            <form id="edit-transaction-form" data-tx-id="${txId}">
                <div class="p-4 border-b flex justify-between items-center">
                    <h3 class="text-lg font-bold">Edit Transaction: ${memberName}</h3>
                    <button type="button" class="close-modal-btn text-gray-500 hover:text-gray-800 text-2xl" onclick="document.getElementById('editTransactionModal').classList.add('hidden')">&times;</button>
                </div>
                <div class="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
                    <div><label class="block text-sm font-medium text-gray-700 mb-1">Date</label><input type="date" id="edit-tx-date" class="form-input w-full p-2 rounded-lg" value="${date}"></div>
                    ${fieldsHTML}
                    <div><label class="block text-sm font-medium text-gray-700 mb-1">Penalty</label><input type="number" id="edit-tx-penalty" class="form-input w-full p-2 rounded-lg" value="${transaction.penalty || 0}"></div>
                </div>
                <div class="p-4 bg-gray-50 flex justify-end gap-3">
                    <button type="button" class="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-200 rounded-md hover:bg-gray-300" onclick="document.getElementById('editTransactionModal').classList.add('hidden')">Cancel</button>
                    <button type="submit" id="save-tx-btn" class="btn-primary flex items-center justify-center px-4 py-2 text-sm font-medium rounded-md"><span>Save Changes</span><div class="loader hidden"></div></button>
                </div>
            </form>
        </div>
    `;
    openModal(modal);
}

async function handleEditSubmit(e) {
    const btn = document.getElementById('save-tx-btn');
    setButtonState(btn, true);

    const txId = e.target.dataset.txId;
    const originalTx = allTransactions[txId];
    if (!originalTx) {
        showToast('Error: Original transaction not found.', true);
        setButtonState(btn, false, 'Save Changes');
        return;
    }

    const updates = {};
    const newDate = new Date(document.getElementById('edit-tx-date').value).toISOString();
    const newPenalty = parseFloat(document.getElementById('edit-tx-penalty').value) || null;

    updates[`/transactions/${txId}/date`] = newDate;
    updates[`/transactions/${txId}/penalty`] = newPenalty;

    try {
        if (originalTx.type === 'Loan Taken' && originalTx.linkedLoanId) {
            const newAmount = parseFloat(document.getElementById('edit-tx-amount').value);
            updates[`/transactions/${txId}/amount`] = newAmount;

            if (originalTx.loanType === 'Recharge') {
                 const newOperator = document.getElementById('edit-tx-operator').value;
                 const newEmi = parseFloat(document.getElementById('edit-tx-emi').value);
                 updates[`/transactions/${txId}/rechargeDetails/operator`] = newOperator;
                 updates[`/transactions/${txId}/rechargeDetails/rechargeEmi`] = newEmi;
                 updates[`/activeLoans/${originalTx.linkedLoanId}/rechargeDetails/operator`] = newOperator;
                 updates[`/activeLoans/${originalTx.linkedLoanId}/rechargeDetails/rechargeEmi`] = newEmi;
            }

            const loanSnapshot = await get(ref(db, `activeLoans/${originalTx.linkedLoanId}`));
            if (loanSnapshot.exists()) {
                const loan = loanSnapshot.val();
                const diff = newAmount - loan.originalAmount;
                updates[`/activeLoans/${originalTx.linkedLoanId}/originalAmount`] = newAmount;
                updates[`/activeLoans/${originalTx.linkedLoanId}/outstandingAmount`] = loan.outstandingAmount + diff;
                updates[`/activeLoans/${originalTx.linkedLoanId}/loanDate`] = newDate;
            }
        } 
        else if (originalTx.type === 'Loan Payment') {
            const newPrincipal = parseFloat(document.getElementById('edit-tx-principal').value);
            const newInterest = parseFloat(document.getElementById('edit-tx-interest').value);
            updates[`/transactions/${txId}/principalPaid`] = newPrincipal;
            updates[`/transactions/${txId}/interestPaid`] = newInterest;

            const loanSnapshot = await get(ref(db, `activeLoans/${originalTx.paidForLoanId}`));
            if (loanSnapshot.exists()) {
                const loan = loanSnapshot.val();
                const diff = newPrincipal - (originalTx.principalPaid || 0);
                const finalOutstanding = loan.outstandingAmount - diff;
                updates[`/activeLoans/${originalTx.paidForLoanId}/outstandingAmount`] = finalOutstanding;
                updates[`/activeLoans/${originalTx.paidForLoanId}/status`] = finalOutstanding <= 0 ? 'Paid' : 'Active';
            }
        } 
        else {
            if (document.getElementById('edit-tx-amount')) {
                 updates[`/transactions/${txId}/amount`] = parseFloat(document.getElementById('edit-tx-amount').value);
            }
        }

        await update(ref(db), updates);
        showToast('Transaction updated successfully!');
        closeModal(document.getElementById('editTransactionModal'));

    } catch (error) {
        showToast('Error: ' + error.message, true);
    } finally {
        setButtonState(btn, false, 'Save Changes');
    }
}

async function handleDeleteTransaction(txId) {
    const tx = allTransactions[txId];
    if (!tx) return;

    if (await showConfirmation('Delete Transaction?', 'This action is permanent and will affect balances. Are you sure?')) {
        try {
            const updates = {};
            updates[`/transactions/${txId}`] = null;

            if (tx.type === 'Loan Taken' && tx.linkedLoanId) {
                updates[`/activeLoans/${tx.linkedLoanId}`] = null;
            }
            if (tx.type === 'Loan Payment' && tx.paidForLoanId && tx.principalPaid > 0) {
                const loanSnapshot = await get(ref(db, `activeLoans/${tx.paidForLoanId}`));
                if (loanSnapshot.exists()) {
                    const currentLoan = loanSnapshot.val();
                    const reversedAmount = currentLoan.outstandingAmount + tx.principalPaid;
                    updates[`/activeLoans/${tx.paidForLoanId}/outstandingAmount`] = reversedAmount;
                    if (currentLoan.status === 'Paid') {
                        updates[`/activeLoans/${tx.paidForLoanId}/status`] = 'Active';
                    }
                }
            }
            if (tx.penalty || tx.interestPaid > 0) {
                 const penaltyQuery = query(ref(db, 'penaltyWallet/incomes'), orderByChild('originalTxId'), equalTo(txId));
                 const penaltySnapshot = await get(penaltyQuery);
                 if(penaltySnapshot.exists()){
                     penaltySnapshot.forEach(child => {
                         updates[`/penaltyWallet/incomes/${child.key}`] = null;
                     });
                 }
            }

            await update(ref(db), updates);
            showToast('Transaction deleted successfully.');
        } catch (error) {
            showToast('Deletion failed: ' + error.message, true);
        }
    }
}