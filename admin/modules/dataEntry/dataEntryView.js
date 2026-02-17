// modules/dataEntry/dataEntryView.js

export function getEntryFormHTML(membersData, productsData) {
    const today = new Date().toISOString().split('T')[0];

    // Sort Members
    const membersList = Object.entries(membersData)
        .filter(([, m]) => m.status === 'Approved')
        .map(([id, m]) => ({ id, name: m.fullName }))
        .sort((a, b) => a.name.localeCompare(b.name));

    // Products List for Dropdown
    const productOptions = Object.entries(productsData)
        .map(([id, p]) => `<option value="${id}">${p.name} (₹${p.price})</option>`)
        .join('');

    return `
        <div class="max-w-4xl mx-auto space-y-6">

            <div class="bg-indigo-50 p-4 rounded-xl border border-indigo-100 flex flex-col sm:flex-row justify-between items-center gap-4 shadow-sm">
                <div></div>
                <button type="button" id="sync-sip-status-btn" class="w-full sm:w-auto bg-indigo-600 text-white px-5 py-2.5 rounded-lg font-bold text-sm hover:bg-indigo-700 transition shadow-md flex items-center justify-center gap-2">
                    <span>Sync Status Now</span>
                    <div class="loader hidden w-4 h-4 border-2"></div>
                </button>
            </div>

            <form id="data-entry-form" class="bg-white p-6 sm:p-8 rounded-xl shadow-md space-y-6">

                <div class="grid grid-cols-2 gap-4 mb-6">
                    <button type="button" class="category-btn active flex flex-col items-center justify-center p-3 rounded-xl border-2 transition-all duration-200 bg-green-100 border-green-500 text-green-800 shadow-sm hover:shadow-md" data-category="sip">
                        <i class="ph-piggy-bank text-2xl mb-1"></i>
                        <span class="font-bold text-sm">SIP</span>
                    </button>

                    <button type="button" class="category-btn flex flex-col items-center justify-center p-3 rounded-xl border-2 transition-all duration-200 bg-gray-50 border-gray-200 text-gray-500 hover:bg-blue-50 hover:border-blue-300" data-category="loan">
                        <i class="ph-hand-coins text-2xl mb-1"></i>
                        <span class="font-bold text-sm">LOAN</span>
                    </button>
                </div>

                <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">Transaction Type</label>
                        <select id="entry-type" class="form-select w-full p-3 rounded-lg bg-gray-50 border border-gray-300 focus:ring-2 focus:ring-green-500 font-semibold text-gray-700">
                            <option value="sip">SIP Payment (Deposit)</option>
                            <option value="sip_withdrawal" class="text-red-600">SIP Withdrawal (Nikasi)</option>
                        </select>
                    </div>

                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">Date</label>
                        <input type="date" id="entry-date" class="form-input w-full p-3 rounded-lg" value="${today}" required>
                    </div>
                </div>

                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Member Name</label>
                    <select id="entry-name" class="form-select w-full p-3 rounded-lg" required>
                        <option value="">Select a member...</option>
                        ${membersList.map(m => `<option value="${m.id}">${m.name}</option>`).join('')}
                    </select>
                </div>

                <div id="balance-info" class="hidden grid grid-cols-2 gap-4 bg-indigo-50 p-4 rounded-lg border border-indigo-100">
                     <div>
                        <label class="block text-xs font-medium text-gray-500 uppercase">SIP Balance</label>
                        <p id="current-balance" class="font-bold text-lg text-green-600">₹ 0</p>
                    </div>
                    <div class="border-l border-indigo-200 pl-4">
                        <label class="block text-xs font-medium text-gray-500 uppercase">Loan Due</label>
                        <p id="total-loan-due" class="font-bold text-lg text-red-600">₹ 0</p>
                    </div>
                </div>

                <div id="sip-fields" class="space-y-4">
                    <label class="block text-sm font-medium text-gray-700 mb-1">SIP Amount</label>
                    <input type="number" id="sip-payment" placeholder="e.g., 500" class="form-input w-full p-3 rounded-lg" value="500">
                </div>

                <div id="sip-withdrawal-fields" class="hidden space-y-4">
                     <label class="block text-sm font-medium text-gray-700 mb-1 required-label">Withdrawal Amount</label>
                    <input type="number" id="sip-withdrawal-amount" placeholder="e.g., 5000" class="form-input w-full p-3 rounded-lg border-red-300">
                    <p class="text-xs text-red-500">This will deduct from SIP balance.</p>
                </div>

                <div id="loan-fields" class="hidden space-y-6">
                     <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">Loan Category</label>
                        <select id="loan-type" class="form-select w-full p-3 rounded-lg">
                            <option value="Personal Loan" selected>Personal Loan</option>
                            <option value="Product on EMI">Product on EMI</option>
                            <option value="Recharge">Recharge</option>
                            <option value="10 Days Credit">10 Days Credit</option>
                        </select>
                    </div>

                    <div id="generic-loan-amount-fields">
                        <label class="block text-sm font-medium text-gray-700 mb-1">Loan Amount</label>
                        <input type="number" id="loan-amount" placeholder="e.g., 10000" class="form-input w-full p-3 rounded-lg">
                    </div>

                    <div id="loan-duration-section" class="hidden">
                        <label class="block text-sm font-medium text-gray-700 mb-1">Duration (Months)</label>
                        <select id="loan-duration" class="form-select w-full p-3 rounded-lg bg-white">
                            <option value="">Enter Amount First</option>
                        </select>
                    </div>

                    <div id="loan-emi-preview" class="hidden bg-blue-50 p-4 rounded-xl border border-blue-200">
                        <h4 class="text-xs font-bold text-blue-600 uppercase tracking-wider mb-3">Loan Preview</h4>
                        <div class="grid grid-cols-2 gap-4 text-sm">
                            <div>
                                <p class="text-gray-500">Interest Rate</p>
                                <p id="preview-interest-rate" class="font-bold text-gray-800">-</p>
                            </div>
                            <div>
                                <p class="text-gray-500">Monthly EMI</p>
                                <p id="preview-emi-amount" class="font-bold text-indigo-600 text-lg">-</p>
                            </div>
                            <div class="col-span-2 border-t border-blue-200 pt-2 mt-1">
                                <div class="flex justify-between">
                                    <p class="text-gray-500">Total Repayment</p>
                                    <p id="preview-total-amount" class="font-bold text-gray-800">-</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div id="recharge-fields" class="hidden space-y-4 border-t pt-4 border-dashed">
                         <h4 class="font-semibold text-gray-600">Recharge Details</h4>
                         <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                                <label class="block text-sm font-medium text-gray-700 mb-1">Operator</label>
                                <input list="operators" id="recharge-operator" class="form-input w-full p-3 rounded-lg" placeholder="Select or type...">
                                <datalist id="operators"><option value="Jio"><option value="Airtel"><option value="Vi"><option value="BSNL"></datalist>
                            </div>
                            <div>
                                <label class="block text-sm font-medium text-gray-700 mb-1">EMI Amount</label>
                                <input type="number" id="recharge-emi" placeholder="e.g., 299" class="form-input w-full p-3 rounded-lg">
                            </div>
                         </div>
                    </div>

                    <div id="product-emi-fields" class="hidden space-y-4 border-t pt-4 border-dashed">
                        <h4 class="font-semibold text-gray-600">Product Details</h4>
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">Select Product (Optional)</label>
                            <select id="emi-product-select" class="form-select w-full p-3 rounded-lg">
                                <option value="">-- Manual Entry --</option>
                                ${productOptions}
                            </select>
                        </div>
                        <div class="grid grid-cols-2 gap-4">
                             <div><label class="block text-sm font-medium text-gray-700 mb-1">Product Name</label><input type="text" id="emi-product-name" class="form-input w-full p-3 rounded-lg"></div>
                             <div><label class="block text-sm font-medium text-gray-700 mb-1">Price</label><input type="number" id="emi-product-price" class="form-input w-full p-3 rounded-lg"></div>
                        </div>
                         <div><label class="block text-sm font-medium text-gray-700 mb-1">Monthly EMI</label><input type="number" id="emi-monthly-payment" class="form-input w-full p-3 rounded-lg"></div>
                    </div>
                </div>

                <div id="loan-payment-fields" class="hidden space-y-4">
                     <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">Select Loan to Pay</label>
                        <select id="active-loan-select" class="form-select w-full p-3 rounded-lg" disabled>
                            <option value="">Select a member first</option>
                        </select>
                     </div>
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div><label class="block text-sm font-medium text-gray-700 mb-1">Principal (मूलधन)</label><input type="number" id="loan-payment-amount" class="form-input w-full p-3 rounded-lg"></div>
                        <div><label class="block text-sm font-medium text-gray-700 mb-1">Interest (ब्याज)</label><input type="number" id="interest-amount" class="form-input w-full p-3 rounded-lg"></div>
                    </div>
                </div>

                 <div id="extra-payment-fields" class="hidden space-y-4">
                     <label class="block text-sm font-medium text-gray-700 mb-1">Extra Balance Amount</label>
                    <input type="number" id="extra-balance-amount" class="form-input w-full p-3 rounded-lg">
                </div>
                <div id="extra-withdraw-fields" class="hidden space-y-4">
                     <label class="block text-sm font-medium text-gray-700 mb-1">Extra Withdraw Amount</label>
                    <input type="number" id="extra-withdraw-amount" class="form-input w-full p-3 rounded-lg">
                </div>

                <div class="pt-4 border-t border-gray-200">
                    <label class="block text-sm font-medium text-gray-700 mb-1">Penalty / Late Fee (Optional)</label>
                    <input type="number" id="penalty-amount" placeholder="e.g., 50" class="form-input w-full p-3 rounded-lg">
                </div>

                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Document/Receipt (Optional)</label>
                    <input type="file" id="entry-document" class="form-input w-full p-2 border rounded-lg">
                </div>

                <div class="flex justify-end items-center gap-4 pt-6">
                    <button type="submit" id="submit-entry-btn" class="btn-primary flex items-center justify-center text-white font-bold py-3 px-8 rounded-lg shadow-md hover:shadow-lg transition-all">
                        <span>Submit Entry</span>
                        <div class="loader hidden ml-2"></div>
                    </button>
                </div>
            </form>
        </div>
    `;
}

// --- Helper Functions ---

export function updateDropdownOptions(category) {
    const select = document.getElementById('entry-type');
    if(!select) return;
    let options = '';
    if (category === 'sip') {
        options = `
            <option value="sip">SIP Payment (Deposit)</option>
            <option value="sip_withdrawal" class="text-red-600">SIP Withdrawal (Nikasi)</option>
        `;
    } else if (category === 'loan') {
        options = `
            <option value="loan">Loan Given</option>
            <option value="loan_payment">Loan Repayment</option>
            <option value="extra_payment">Extra Payment</option>
            <option value="extra_withdraw">Extra Withdraw</option>
        `;
    } 
    select.innerHTML = options;
}

export function highlightCategoryBtn(category) {
    const buttons = document.querySelectorAll('.category-btn');
    buttons.forEach(btn => {
        btn.classList.remove('bg-green-100', 'border-green-500', 'text-green-800', 'bg-blue-100', 'border-blue-500', 'text-blue-800');
        btn.classList.add('bg-gray-50', 'border-gray-200', 'text-gray-500');
        if (btn.dataset.category === category) {
            btn.classList.remove('bg-gray-50', 'border-gray-200', 'text-gray-500');
            if(category === 'sip') btn.classList.add('bg-green-100', 'border-green-500', 'text-green-800');
            if(category === 'loan') btn.classList.add('bg-blue-100', 'border-blue-500', 'text-blue-800');
        }
    });
}

export function toggleFields(type) {
    const ids = ['sip-fields', 'sip-withdrawal-fields', 'loan-fields', 'loan-payment-fields', 'extra-payment-fields', 'extra-withdraw-fields'];
    ids.forEach(id => {
        const el = document.getElementById(id);
        if(el) el.classList.add('hidden');
    });

    if(!type) return;
    if (type === 'sip') document.getElementById('sip-fields')?.classList.remove('hidden');
    else if (type === 'sip_withdrawal') document.getElementById('sip-withdrawal-fields')?.classList.remove('hidden');

    // Updated Logic here to auto-show Personal Loan fields
    else if (type === 'loan') {
        document.getElementById('loan-fields')?.classList.remove('hidden');
        // Force check current loan type selection
        const loanTypeSelect = document.getElementById('loan-type');
        if(loanTypeSelect) toggleLoanFields(loanTypeSelect.value);
    }

    else if (type === 'loan_payment') document.getElementById('loan-payment-fields')?.classList.remove('hidden');
    else if (type === 'extra_payment') document.getElementById('extra-payment-fields')?.classList.remove('hidden');
    else if (type === 'extra_withdraw') document.getElementById('extra-withdraw-fields')?.classList.remove('hidden');
}

export function toggleLoanFields(loanType) {
    const generic = document.getElementById('generic-loan-amount-fields');
    const product = document.getElementById('product-emi-fields');
    const recharge = document.getElementById('recharge-fields');
    const duration = document.getElementById('loan-duration-section');
    const preview = document.getElementById('loan-emi-preview');

    // Default: Show generic, hide others
    if(generic) generic.classList.remove('hidden');
    if(product) product.classList.add('hidden');
    if(recharge) recharge.classList.add('hidden');
    if(duration) duration.classList.add('hidden');
    if(preview) preview.classList.add('hidden');

    if (loanType === 'Product on EMI') {
        if(generic) generic.classList.add('hidden');
        if(product) product.classList.remove('hidden');
    } else if (loanType === 'Recharge') {
        if(recharge) recharge.classList.remove('hidden');
    } else if (loanType === 'Personal Loan') {
        // Show Duration for Personal Loan
        if(duration) duration.classList.remove('hidden');
        if(preview) preview.classList.remove('hidden');
    }
}

export function updateTenureOptions(amount) {
    const select = document.getElementById('loan-duration');
    if (!select) return;

    if (!amount || amount <= 0) {
        select.innerHTML = '<option value="">Enter Amount First</option>';
        return;
    }

    let options = '<option value="">Select Duration...</option>';

    if (amount > 25000) {
        options += `
            <option value="6">6 Months</option>
            <option value="9">9 Months</option>
            <option value="12">12 Months</option>
        `;
    } else {
        options += `
            <option value="1">1 Month (1% Interest)</option>
            <option value="2">2 Months (3% Total Interest)</option>
            <option value="3">3 Months (5% Total Interest)</option>
            <option value="4">4 Months</option>
            <option value="5">5 Months</option>
            <option value="6">6 Months</option>
            <option value="7">7 Months</option>
            <option value="8">8 Months</option>
            <option value="9">9 Months</option>
            <option value="10">10 Months</option>
            <option value="11">11 Months</option>
            <option value="12">12 Months</option>
        `;
    }
    select.innerHTML = options;
}

export function updateBalanceDisplay(memberId, membersData, activeLoansData) {
    const balanceEl = document.getElementById('current-balance');
    const loanEl = document.getElementById('total-loan-due');
    const container = document.getElementById('balance-info');
    const loanSelect = document.getElementById('active-loan-select');

    if (!memberId || !membersData[memberId]) {
        if(container) container.classList.add('hidden');
        if(loanSelect) { loanSelect.innerHTML = '<option value="">Select a member first</option>'; loanSelect.disabled = true; }
        return;
    }

    if(container) container.classList.remove('hidden');
    const member = membersData[memberId];

    if(balanceEl) balanceEl.textContent = `₹ ${(member.accountBalance || 0).toLocaleString('en-IN')}`;

    const memberLoans = Object.entries(activeLoansData || {}).filter(([lid, l]) => l.memberId === memberId && l.status === 'Active');
    const totalLoanDue = memberLoans.reduce((sum, [lid, loan]) => sum + parseFloat(loan.outstandingAmount || 0), 0);

    if(loanEl) {
        loanEl.textContent = `₹ ${totalLoanDue.toLocaleString('en-IN')}`;
        if(totalLoanDue > 0) {
            loanEl.className = "font-bold text-lg text-red-600";
        } else {
            loanEl.className = "font-bold text-lg text-gray-400";
        }
    }

    if(loanSelect) {
        if (memberLoans.length > 0) {
            loanSelect.innerHTML = memberLoans.map(([lid, l]) => `<option value="${lid}">${l.loanType} - Due: ₹${l.outstandingAmount}</option>`).join('');
            loanSelect.disabled = false;
        } else {
            loanSelect.innerHTML = '<option value="">No active loans</option>';
            loanSelect.disabled = true;
        }
    }
}

export function fillProductDetails(productId, productsData) {
    if (productId && productsData[productId]) {
        const p = productsData[productId];
        document.getElementById('emi-product-name').value = p.name;
        document.getElementById('emi-product-price').value = p.price;
    }
}