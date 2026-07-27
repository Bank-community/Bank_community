// modules/dataEntry/dataEntryController.js
import { db } from '../../core/firebaseConfig.js';
import { ref, push, update, serverTimestamp, increment, onValue, off, get } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-database.js";
import { setButtonState, showToast } from '../../shared/uiComponents.js';
import { uploadImage } from '../../shared/utils.js';
import { calculateLoanDetails } from './loanCalculator.js'; 

import { 
    getEntryFormHTML, 
    toggleFields, 
    toggleLoanFields, 
    updateBalanceDisplay, 
    fillProductDetails, 
    updateDropdownOptions, 
    highlightCategoryBtn,
    updateTenureOptions 
} from './dataEntryView.js';

let dataEntryListener = null;
let allMembersData = {};
let allProductsData = {};
let activeLoansData = {};

export async function init() {
    console.log("Data Entry Module Initialized");
    const container = document.getElementById('data-entry-view');

    // === EVENT LISTENERS ===

    container.addEventListener('click', (e) => {
        const btn = e.target.closest('.category-btn');
        if (btn) {
            const category = btn.dataset.category;
            highlightCategoryBtn(category);
            updateDropdownOptions(category);
            const select = document.getElementById('entry-type');
            if(select && select.value) toggleFields(select.value);
        }
        if (e.target.id === 'save-defaults-btn') saveDefaults();
        if (e.target.id === 'reset-defaults-btn') resetDefaults();
        if (e.target.closest('#sync-sip-status-btn')) handleSyncSipStatus();
    });

    container.addEventListener('submit', async (e) => {
        if (e.target.id === 'data-entry-form') {
            e.preventDefault();
            await handleDataEntrySubmission(e);
        }
    });

    // NEW: Live Amount Change Listener (Updates Duration Dropdown)
    container.addEventListener('input', (e) => {
        if (e.target.id === 'loan-amount') {
            const amount = parseFloat(e.target.value);
            updateTenureOptions(amount); // Update dropdown based on 25k limit
            handleLoanPreviewUpdate();   // Recalculate if duration is already selected
        }
    });

    container.addEventListener('change', async (e) => {
        const target = e.target;

        // UI Toggles
        if (target.id === 'entry-type') toggleFields(target.value);
        if (target.id === 'loan-type') toggleLoanFields(target.value);

        // Member Selection & Balance Update
        if (target.id === 'entry-name') {
            updateBalanceDisplay(target.value, allMembersData, activeLoansData);
        }

        // Product & Loan Specifics
        if (target.id === 'emi-product-select') fillProductDetails(target.value, allProductsData);

        // NEW: Duration Change Listener (Updates EMI Preview)
        if (target.id === 'loan-duration') {
            handleLoanPreviewUpdate();
        }

        // Loan Payment Auto-fill
        if (target.id === 'active-loan-select') {
            const loanId = target.value;
            if (loanId && activeLoansData[loanId]) {
                document.getElementById('loan-payment-amount').value = activeLoansData[loanId].outstandingAmount || '';
            }
        }
    });
}

// === HELPER: LIVE LOAN PREVIEW ===
function handleLoanPreviewUpdate() {
    const amount = document.getElementById('loan-amount')?.value;
    const duration = document.getElementById('loan-duration')?.value;

    // UI Elements
    const previewBox = document.getElementById('loan-emi-preview');
    const rateEl = document.getElementById('preview-interest-rate');
    const emiEl = document.getElementById('preview-emi-amount');
    const totalEl = document.getElementById('preview-total-amount');

    if (!amount || !duration) {
        if(previewBox) previewBox.classList.add('hidden');
        return;
    }

    // Calculate Loan Details
    const result = calculateLoanDetails(amount, duration);

    if (result && previewBox) {
        previewBox.classList.remove('hidden');
        rateEl.innerHTML = result.rateDescription;
        emiEl.textContent = `₹ ${result.monthlyEmi.toLocaleString('en-IN')}`;
        totalEl.textContent = `₹ ${result.totalRepayment.toLocaleString('en-IN')}`;
    }
}

export async function render() {
    const container = document.getElementById('data-entry-view');
    container.innerHTML = `<div class="p-8 text-center"><div class="loader border-indigo-600"></div><p>Loading Form...</p></div>`;

    const dbRef = ref(db);
    if (dataEntryListener) off(dbRef, 'value', dataEntryListener);

    dataEntryListener = onValue(dbRef, (snapshot) => {
        const data = snapshot.val() || {};
        allMembersData = data.members || {};
        allProductsData = data.products || {};
        activeLoansData = data.activeLoans || {};

        container.innerHTML = getEntryFormHTML(allMembersData, allProductsData);

        // Restore Defaults logic
        const d = JSON.parse(localStorage.getItem('dataEntryDefaults'));
        if(d && d.category) {
            // Convert 'tcf' to 'sip' for backward compatibility if needed
            if (d.category === 'tcf') d.category = 'sip'; 

            const btn = container.querySelector(`.category-btn[data-category="${d.category}"]`);
            if(btn) btn.click();
            setTimeout(() => applyDefaults(), 50);
        } else {
            const sipBtn = container.querySelector('.category-btn[data-category="sip"]');
            if(sipBtn) sipBtn.click();
        }
    });
}

async function handleSyncSipStatus() {
    const btn = document.getElementById('sync-sip-status-btn');
    setButtonState(btn, true, 'Processing...');
    try {
        const today = new Date();
        const currentMonthKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
        const txSnapshot = await get(ref(db, 'transactions'));
        if (!txSnapshot.exists()) {
            showToast("No transactions found.", true);
            setButtonState(btn, false, 'Sync Status Now');
            return;
        }
        const transactions = txSnapshot.val();
        const memberTotals = {};
        Object.values(transactions).forEach(tx => {
            if (tx.type === 'SIP' && tx.date && tx.date.startsWith(currentMonthKey)) {
                const mid = tx.memberId;
                if (mid) memberTotals[mid] = (memberTotals[mid] || 0) + parseFloat(tx.amount || 0);
            }
        });
        const updates = {};
        Object.keys(allMembersData).forEach(memberId => {
            const totalPaid = memberTotals[memberId] || 0;
            updates[`/members/${memberId}/currentMonthSIPAmount`] = totalPaid;
            updates[`/members/${memberId}/currentMonthSIPStatus`] = totalPaid > 0 ? 'Paid' : 'Pending';
        });
        await update(ref(db), updates);
        showToast(`Sync Complete!`);
    } catch (error) {
        showToast("Sync Failed: " + error.message, true);
    } finally {
        setButtonState(btn, false, 'Sync Status Now');
    }
}

async function handleDataEntrySubmission(e) {
    const btn = document.getElementById('submit-entry-btn');
    setButtonState(btn, true);

    const memberId = document.getElementById('entry-name').value;
    if (!memberId) { showToast("Please select a member.", true); setButtonState(btn, false, "Submit Entry"); return; }

    const date = document.getElementById('entry-date').value;
    const type = document.getElementById('entry-type').value;
    const file = document.getElementById('entry-document').files[0];
    const penalty = parseFloat(document.getElementById('penalty-amount').value) || 0;

    const member = allMembersData[memberId];
    const memberName = member.fullName;
    let currentSip = parseFloat(member.accountBalance || 0);

    try {
        const imageUrl = await uploadImage(file);
        const txId = push(ref(db, 'transactions')).key;
        const updates = {};
        const timestamp = serverTimestamp();

        const baseTx = { transactionId: txId, memberId, memberName, date: new Date(date).toISOString(), imageUrl: imageUrl || "", penalty: penalty > 0 ? penalty : null, timestamp };

        let newSip = currentSip;
        let transactionDetails = {};

        // === 1. SIP DEPOSIT ===
        if (type === 'sip') {
            const amount = parseFloat(document.getElementById('sip-payment').value);
            if(!amount) throw new Error("Enter SIP Amount");
            updates[`/transactions/${txId}`] = { ...baseTx, type: 'SIP', amount };
            newSip += amount;
            updates[`/members/${memberId}/accountBalance`] = newSip;
            transactionDetails = { type: 'SIP', amount };
        } 
        // === 2. SIP WITHDRAWAL ===
        else if (type === 'sip_withdrawal') {
            const amount = parseFloat(document.getElementById('sip-withdrawal-amount').value);
            updates[`/transactions/${txId}`] = { ...baseTx, type: 'SIP Withdrawal', amount };
            newSip -= amount;
            updates[`/members/${memberId}/accountBalance`] = newSip;
            transactionDetails = { type: 'SIP Withdrawal', amount };
        }
        // === 3. LOAN TAKEN (DEDUCT FROM SIP) ===
        else if (type === 'loan') {
            const loanType = document.getElementById('loan-type').value;
            const loanId = push(ref(db, 'activeLoans')).key;
            let amount = 0;
            let loanMeta = {}; 

            if (loanType === 'Personal Loan') {
                // Calculator Logic
                amount = parseFloat(document.getElementById('loan-amount').value);
                const duration = document.getElementById('loan-duration').value;

                if (!amount || !duration) throw new Error("Amount and Duration are required.");

                const calc = calculateLoanDetails(amount, duration);

                loanMeta = {
                    tenureMonths: parseInt(duration),
                    monthlyEmi: calc.monthlyEmi,
                    totalRepaymentExpected: calc.totalRepayment,
                    interestDetails: calc.details, 
                    loanCategory: calc.details.category 
                };

            } else if (loanType === 'Product on EMI') {
                amount = parseFloat(document.getElementById('emi-product-price').value);
                loanMeta.productDetails = { 
                    name: document.getElementById('emi-product-name').value, 
                    monthlyEmi: parseFloat(document.getElementById('emi-monthly-payment').value) 
                };
            } else if (loanType === 'Recharge') {
                amount = parseFloat(document.getElementById('loan-amount').value);
                loanMeta.rechargeDetails = { 
                    operator: document.getElementById('recharge-operator').value, 
                    rechargeEmi: parseFloat(document.getElementById('recharge-emi').value) 
                };
            } else {
                amount = parseFloat(document.getElementById('loan-amount').value);
            }

            // Save Transaction
            updates[`/transactions/${txId}`] = { ...baseTx, type: 'Loan Taken', amount, loanType, linkedLoanId: loanId, ...loanMeta };

            // Save Active Loan
            updates[`/activeLoans/${loanId}`] = { 
                loanId, 
                memberId, 
                memberName, 
                loanType, 
                originalAmount: amount, 
                outstandingAmount: amount, 
                loanDate: new Date(date).toISOString(), 
                status: 'Active', 
                timestamp, 
                ...loanMeta 
            };

            updates['/lifetimeStats/totalLoanIssued'] = increment(amount);

            // === [IMPORTANT UPDATE] ===
            // Deduct Loan Amount from SIP Balance (Logic: Net Balance)
            // Example: 30,500 - 50,000 = -19,500
            newSip -= amount;
            updates[`/members/${memberId}/accountBalance`] = newSip;
            // ==========================

            transactionDetails = { type: 'Loan Taken', amount, loanType };
        }
        // === 4. LOAN PAYMENT (ADD BACK TO SIP) ===
        else if (type === 'loan_payment') {
            const principal = parseFloat(document.getElementById('loan-payment-amount').value) || 0;
            const interest = parseFloat(document.getElementById('interest-amount').value) || 0;
            const loanId = document.getElementById('active-loan-select').value;

            updates[`/transactions/${txId}`] = { ...baseTx, type: 'Loan Payment', principalPaid: principal, interestPaid: interest, paidForLoanId: loanId };

            const currentLoan = activeLoansData[loanId];
            if(currentLoan) {
                const newOut = parseFloat(currentLoan.outstandingAmount) - principal;
                if (newOut <= 0.9) { 
                    updates[`/activeLoans/${loanId}`] = null; // Close Loan
                } else {
                    updates[`/activeLoans/${loanId}/outstandingAmount`] = newOut;
                }
            }

            // === [IMPORTANT UPDATE] ===
            // Add Principal Paid BACK to SIP Balance
            // Example: -19,500 + 5000 = -14,500
            newSip += principal;
            updates[`/members/${memberId}/accountBalance`] = newSip;
            // ==========================

            if(interest > 0) {
                const penaltyId = push(ref(db, 'penaltyWallet/incomes')).key;
                updates[`/penaltyWallet/incomes/${penaltyId}`] = { amount: interest * 0.10, from: memberName, reason: "10% of Return", timestamp: serverTimestamp() };
            }
            transactionDetails = { type: 'Loan Payment', amount: principal + interest };
        }
        // === 5. EXTRAS ===
        else if (type === 'extra_payment') {
            const amount = parseFloat(document.getElementById('extra-balance-amount').value);
            updates[`/transactions/${txId}`] = { ...baseTx, type: 'Extra Payment', amount };
            transactionDetails = { type: 'Extra Payment', amount };
        }
        else if (type === 'extra_withdraw') {
            const amount = parseFloat(document.getElementById('extra-withdraw-amount').value);
            updates[`/transactions/${txId}`] = { ...baseTx, type: 'Extra Withdraw', amount };
            transactionDetails = { type: 'Extra Withdraw', amount };
        }

        if (penalty > 0) {
            const pid = push(ref(db, 'penaltyWallet/incomes')).key;
            updates[`/penaltyWallet/incomes/${pid}`] = { amount: penalty, from: memberName, reason: "Penalty", timestamp, originalTxId: txId };
        }

        await update(ref(db), updates);
        await sendTransactionNotification(memberId, transactionDetails);

        showToast("Transaction Saved Successfully!");
        document.getElementById('data-entry-form').reset();
        if(document.getElementById('loan-emi-preview')) document.getElementById('loan-emi-preview').classList.add('hidden');

    } catch (err) {
        console.error(err);
        showToast("Error: " + err.message, true);
    } finally {
        setButtonState(btn, false, "Submit Entry");
    }
}

async function sendTransactionNotification(memberId, details) {
    try {
        const snapshot = await get(ref(db, `members/${memberId}/notificationTokens`));
        if (!snapshot.exists()) return;

        const tokens = Object.keys(snapshot.val());
        const latestToken = tokens[tokens.length - 1]; 

        let title = "TCF Alert";
        let body = "New transaction update.";
        const amountStr = "₹" + (details.amount || 0).toLocaleString('en-IN');

        switch (details.type) {
            case 'SIP': title = "✅ SIP Received"; body = `Received ${amountStr} for your monthly SIP.`; break;
            case 'Loan Taken': title = "💰 Loan Disbursed"; body = `Your loan of ${amountStr} is active now.`; break;
            case 'Loan Payment': title = "✅ Payment Received"; body = `Received ${amountStr} for loan repayment.`; break;
        }

        await fetch('/api/send-notification', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: latestToken, title, body, url: '/notifications.html' })
        });
    } catch (error) {
        console.error("Notification Failed:", error);
    }
}

function saveDefaults() {
    const activeBtn = document.querySelector('.category-btn.bg-green-100') 
                   || document.querySelector('.category-btn.bg-blue-100');

    const category = activeBtn ? activeBtn.dataset.category : 'sip';

    const defaults = {
        category: category,
        type: document.getElementById('entry-type').value,
        date: document.getElementById('entry-date').value,
        memberId: document.getElementById('entry-name').value
    };
    localStorage.setItem('dataEntryDefaults', JSON.stringify(defaults));
    showToast('Defaults Saved');
}

function applyDefaults() {
    const d = JSON.parse(localStorage.getItem('dataEntryDefaults'));
    if(d) {
        if(d.type) { 
            const el = document.getElementById('entry-type');
            if(el) {
                el.value = d.type; 
                toggleFields(d.type); 
            }
        }
        if(d.date) document.getElementById('entry-date').value = d.date;
        if(d.memberId) {
             const el = document.getElementById('entry-name');
             if(el && el.value !== d.memberId) { 
                 el.value = d.memberId; 
                 updateBalanceDisplay(d.memberId, allMembersData, activeLoansData);
             }
        }
    }
}

function resetDefaults() {
    localStorage.removeItem('dataEntryDefaults');
    showToast("Defaults Reset");
}