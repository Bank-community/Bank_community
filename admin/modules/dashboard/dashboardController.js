import { db } from '../../core/firebaseConfig.js';
import { navigateTo } from '../../core/router.js';
import { ref, onValue, off, push, update, remove, serverTimestamp } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-database.js";
import { closeModal, showConfirmation, showToast, setButtonState } from '../../shared/uiComponents.js';
import * as View from './dashboardView.js';

let dashboardListener = null;
let dashboardData = {};
let chartState = {
    filter: 'thisMonth',
    month: new Date().toISOString().slice(0, 7)
};

export async function init() {
    console.log("Dashboard Module Initialized (MVC + Smart Sync)");
    const container = document.getElementById('dashboard-view');

    // 1. Global Handlers
    document.body.addEventListener('click', async (e) => {
        const statCard = e.target.closest('.dashboard-stat-card');
        if (statCard && statCard.dataset.action) {
            e.preventDefault();
            navigateTo(statCard.dataset.action);
        }

        if (e.target.closest('.close-modal-btn')) {
            const modal = e.target.closest('.modal-overlay');
            if (modal) closeModal(modal);
        }

        if (e.target.closest('#burn-money-btn')) View.renderBurnMoneyModal();

        if (e.target.closest('.delete-penalty-btn')) {
            const btn = e.target.closest('.delete-penalty-btn');
            await handleDeletePenalty(btn.dataset.key, btn.dataset.type);
        }
        if (e.target.closest('.edit-penalty-btn')) {
            const btn = e.target.closest('.edit-penalty-btn');
            View.renderEditPenaltyModal(btn.dataset.key, btn.dataset.type, btn.dataset.amount, btn.dataset.reason);
        }
    });

    // 2. Local Handlers
    container.addEventListener('click', (e) => {
        if (e.target.closest('#penalty-wallet-card')) View.renderPenaltyHistoryModal(dashboardData);
        if (e.target.closest('#add-penalty-money-btn')) View.renderAddPenaltyMoneyModal(dashboardData);

        // Filter Click
        if (e.target.id === 'filter-all-time') {
            chartState.filter = 'allTime';
            View.updateDashboardUI(container, null, dashboardData, chartState);
        }
        if (e.target.id === 'filter-this-month') {
            chartState.filter = 'thisMonth';
            chartState.month = new Date().toISOString().slice(0, 7);
            View.updateDashboardUI(container, null, dashboardData, chartState);
        }
    });

    // 3. Chart Date Change
    container.addEventListener('change', (e) => {
        if (e.target.id === 'filter-custom-month') {
            chartState.filter = 'customMonth';
            chartState.month = e.target.value;
            View.updateDashboardUI(container, null, dashboardData, chartState);
        }
    });

    // 4. Form Submits
    document.body.addEventListener('submit', async (e) => {
        if (e.target.id === 'add-penalty-money-form') { e.preventDefault(); await handleAddPenaltyMoney(e); }
        if (e.target.id === 'burn-money-form') { e.preventDefault(); await handleBurnMoney(e); }
        if (e.target.id === 'edit-penalty-form') { e.preventDefault(); await handleEditPenaltySubmit(e); }
    });
}

export async function render() {
    const container = document.getElementById('dashboard-view');
    const headerStatsContainer = document.getElementById('dashboard-header-stats');

    // 1. Instant Cache Load
    const cachedData = localStorage.getItem('dashboardCache');
    if (cachedData) {
        dashboardData = JSON.parse(cachedData);
        View.updateDashboardUI(container, headerStatsContainer, dashboardData, chartState);
    } else {
        View.renderSkeleton(container);
    }

    // 2. Fetch Fresh Data & Run Smart Sync
    const dbRef = ref(db);
    if (dashboardListener) off(dbRef, 'value', dashboardListener);

    dashboardListener = onValue(dbRef, (snapshot) => {
        const data = snapshot.val() || {};
        dashboardData = data;
        localStorage.setItem('dashboardCache', JSON.stringify(data));

        // --- SMART LISTENER: BACKGROUND CALCULATION ---
        runSmartReconciliation(data);

        View.updateDashboardUI(container, headerStatsContainer, data, chartState);
    });
}

// --- Smart Reconciliation Logic ---
function runSmartReconciliation(data) {
    const transactions = data.transactions || {};
    const activeLoans = data.activeLoans || {};
    const currentStats = data.admin?.balanceStats || {};

    let totalSIP = 0;
    let totalReturn = 0;

    // 1. Calculate SIP & Return from History
    Object.values(transactions).forEach(tx => {
        const amt = parseFloat(tx.amount || 0);
        if (tx.type === 'SIP') totalSIP += amt;
        if (tx.type === 'SIP Withdrawal') totalSIP -= amt;

        // Return Calculation
        if (tx.type === 'Loan Payment' && tx.interestPaid) {
            totalReturn += parseFloat(tx.interestPaid);
        }
    });

    // 2. Calculate Active Loans Outstanding
    let totalOutstanding = 0;
    Object.values(activeLoans).forEach(loan => {
        totalOutstanding += parseFloat(loan.outstandingAmount || 0);
    });

    // 3. FORMULA: Available Balance = Total SIP - Total Active Loans
    // (Note: Total Return is tracked separately as profit)
    const calculatedAvailableBalance = totalSIP - totalOutstanding;

    // 4. Check for Discrepancy & Auto-Fix
    // Use a small tolerance for floating point math
    const isDifferent = 
        Math.abs((currentStats.availableBalance || 0) - calculatedAvailableBalance) > 1 ||
        Math.abs((currentStats.totalSIP || 0) - totalSIP) > 1 ||
        Math.abs((currentStats.totalActiveLoans || 0) - totalOutstanding) > 1 ||
        Math.abs((currentStats.totalReturn || 0) - totalReturn) > 1;

    if (isDifferent) {
        console.log("Smart Listener: Fixing Balance Stats...", { calculatedAvailableBalance, totalSIP, totalOutstanding });
        update(ref(db, 'admin/balanceStats'), {
            availableBalance: calculatedAvailableBalance,
            totalSIP: totalSIP,
            totalActiveLoans: totalOutstanding,
            totalReturn: totalReturn,
            lastUpdated: new Date().toISOString()
        });
    }
}

// --- Action Logic ---
async function handleAddPenaltyMoney(e) {
    const btn = document.getElementById('submit-penalty-btn');
    setButtonState(btn, true);
    const name = document.getElementById('penalty-add-name').value;
    const amount = parseFloat(document.getElementById('penalty-add-amount').value);
    const reason = document.getElementById('penalty-add-reason').value || "Direct Deposit";

    try {
        await push(ref(db, 'penaltyWallet/incomes'), { amount, from: name, reason, timestamp: serverTimestamp() });
        showToast('Funds deposited successfully!');
        closeModal(document.getElementById('addPenaltyMoneyModal'));
    } catch (error) { showToast(error.message, true); } finally { setButtonState(btn, false, 'Deposit'); }
}

async function handleBurnMoney(e) {
    const btn = document.getElementById('submit-burn-btn');
    setButtonState(btn, true);
    const reason = document.getElementById('burn-reason').value;
    const amount = parseFloat(document.getElementById('burn-amount').value);

    try {
        await push(ref(db, 'penaltyWallet/expenses'), { amount, reason, timestamp: serverTimestamp() });
        showToast('Expense recorded!');
        closeModal(document.getElementById('burnMoneyModal'));
        closeModal(document.getElementById('penaltyHistoryModal')); 
    } catch (error) { showToast(error.message, true); } finally { setButtonState(btn, false, 'Record'); }
}

async function handleEditPenaltySubmit(e) {
    const key = e.target.dataset.key;
    const type = e.target.dataset.type;
    const updates = {};
    const path = `penaltyWallet/${type === 'income' ? 'incomes' : 'expenses'}/${key}`;
    updates[`${path}/amount`] = parseFloat(document.getElementById('edit-p-amount').value);
    if(type === 'income') updates[`${path}/from`] = document.getElementById('edit-p-reason').value;
    else updates[`${path}/reason`] = document.getElementById('edit-p-reason').value;
    await update(ref(db), updates);
    showToast('Updated successfully');
    closeModal(document.getElementById('editPenaltyModal'));
    View.renderPenaltyHistoryModal(dashboardData); 
}

async function handleDeletePenalty(key, type) {
    if (await showConfirmation('Delete Record?', 'Irreversible action.')) {
        try {
            await remove(ref(db, `penaltyWallet/${type === 'income' ? 'incomes' : 'expenses'}/${key}`));
            showToast('Deleted.');
            View.renderPenaltyHistoryModal(dashboardData); 
        } catch (error) { showToast(error.message, true); }
    }
}