// loan/js/loan_ui.js
import { loanState } from './loan_core.js';
import { validateMemberKYC, updateKYCUI } from './loan_kyc.js';
import { calculateLimit, calculateEMI } from './loan_calc.js';
import { renderPreviewAndShow } from './loan_pdf.js';

// DOM Elements
const elements = {
    nameSelect: document.getElementById('nameSelect'),
    amountInput: document.getElementById('amount'),
    limitMsg: document.getElementById('limit-msg'),
    walletInfo: document.getElementById('walletInfo'),
    kycContainer: document.getElementById('kycStatusContainer'),
    durationSelect: document.getElementById('durationRateSelect'),
    generateBtn: document.getElementById('generateBtn'),
    appMode: document.getElementById('appMode'),
    btnLoan: document.getElementById('btnModeLoan'),
    btnWithdraw: document.getElementById('btnModeWithdraw'),
    dateBanner: document.getElementById('dateBanner')
};

// 1. Setup Event Listeners
export function setupUIListeners() {
    // Mode Switching
    elements.btnLoan.addEventListener('click', () => switchMode('loan'));
    elements.btnWithdraw.addEventListener('click', () => switchMode('withdrawal'));

    // Member Selection
    elements.nameSelect.addEventListener('change', handleMemberChange);

    // Amount Input
    elements.amountInput.addEventListener('input', handleAmountChange);

    // Generate Button
    document.getElementById('loanForm').addEventListener('submit', handleGenerate);
}

// 2. Handle Mode Switch
function switchMode(mode) {
    loanState.appMode = mode;
    elements.appMode.value = mode;

    // Toggle Buttons Styles
    if (mode === 'loan') {
        elements.btnLoan.className = "flex-1 py-2 text-sm font-bold rounded-md shadow bg-white text-brand-teal transition-all";
        elements.btnWithdraw.className = "flex-1 py-2 text-sm font-bold rounded-md text-gray-500 hover:bg-gray-200 transition-all";

        document.getElementById('portal-subtitle').innerText = "Loan Application Portal";
        document.getElementById('amountLabel').innerText = "Loan Amount (₹)";
        document.getElementById('limitLabel').innerText = "Loan Eligibility";

        document.getElementById('durationWrapper').classList.remove('hidden');
        document.getElementById('withdrawalModeField').classList.add('hidden');
        elements.dateBanner.classList.add('hidden');

        elements.generateBtn.innerHTML = `GENERATE FORM <i class="fas fa-file-export ml-2"></i>`;
    } else {
        elements.btnWithdraw.className = "flex-1 py-2 text-sm font-bold rounded-md shadow bg-white text-brand-teal transition-all";
        elements.btnLoan.className = "flex-1 py-2 text-sm font-bold rounded-md text-gray-500 hover:bg-gray-200 transition-all";

        document.getElementById('portal-subtitle').innerText = "SIP Withdrawal Portal";
        document.getElementById('amountLabel').innerText = "Withdrawal Amount (₹)";
        document.getElementById('limitLabel').innerText = "Withdrawal Limit (50%)";

        document.getElementById('durationWrapper').classList.add('hidden');
        document.getElementById('withdrawalModeField').classList.remove('hidden');

        checkDateAccess(); // Only for withdrawal
        elements.generateBtn.innerHTML = `GENERATE WITHDRAWAL SLIP <i class="fas fa-file-export ml-2"></i>`;
    }

    // Recalculate if member is already selected
    if (loanState.selectedMember) {
        handleMemberChange();
    }
}

// 3. Handle Member Selection (The Main Logic)
function handleMemberChange() {
    const memberId = elements.nameSelect.value;
    const member = loanState.members[memberId];
    loanState.selectedMember = member;

    if (!member) return;

    // A. Wallet Info Update
    const balance = parseFloat(member.accountBalance) || 0;
    document.getElementById('displayWalletBalance').innerText = balance.toLocaleString('en-IN');

    // B. KYC Check (🌟 The Guard)
    const kycStatus = validateMemberKYC(member);
    updateKYCUI(kycStatus); // This will Enable/Disable the button based on Email/Docs

    // C. Limit Calculation
    const limit = calculateLimit(balance, loanState.appMode);
    document.getElementById('displayEligibleLimit').innerText = limit.toLocaleString('en-IN');
    elements.walletInfo.classList.remove('hidden');

    // D. Re-validate Amount (if user typed before selecting)
    handleAmountChange();
}

// 4. Handle Amount Input
function handleAmountChange() {
    const amt = parseFloat(elements.amountInput.value) || 0;
    const balance = parseFloat(loanState.selectedMember?.accountBalance) || 0;
    const limit = calculateLimit(balance, loanState.appMode);

    if (amt > 0) {
        elements.limitMsg.classList.remove('hidden');

        // If KYC failed, button is already disabled. Don't re-enable it here.
        const isKycOk = !elements.generateBtn.disabled || elements.generateBtn.title !== "KYC Failed"; 

        if (amt > limit) {
            elements.limitMsg.innerText = `Exceeds Limit (Max: ₹${limit})`;
            elements.limitMsg.className = "text-xs mt-1 font-semibold text-red-600";
            if(isKycOk) disableBtn(true);
        } else {
            elements.limitMsg.innerText = "Amount is within limit.";
            elements.limitMsg.className = "text-xs mt-1 font-semibold text-green-600";
            // Only enable if KYC was OK and Date check passes
            // We need a way to check KYC state again or trust previous state.
            // Simplified: We assume KYC check ran in handleMemberChange.
            const kycStatus = loanState.selectedMember ? validateMemberKYC(loanState.selectedMember) : {isValid:false};

            if(kycStatus.isValid) {
                 if (loanState.appMode === 'withdrawal' && !elements.dateBanner.classList.contains('hidden')) {
                     disableBtn(true);
                 } else {
                     disableBtn(false);
                 }
            }
        }
    } else {
        elements.limitMsg.classList.add('hidden');
    }

    // Populate Duration Options (Loan Only)
    if (loanState.appMode === 'loan') {
        populateDuration(amt, limit);
    }
}

function populateDuration(amt, limit) {
    elements.durationSelect.innerHTML = '';
    if (amt === 0 || amt > limit) {
        elements.durationSelect.innerHTML = '<option>Enter valid amount first...</option>';
        return;
    }

    let opts = [];
    if (amt < 25000) {
        opts.push({ val: '1-1.0', txt: '1 Month (1% Total Interest)' });
        opts.push({ val: '2-1.5', txt: '2 Months (3% Total Interest)' }); // Logic kept from original
        opts.push({ val: '3-1.666666667', txt: '3 Months (5% Total Interest)' });
        for (let m = 4; m <= 12; m++) opts.push({ val: `${m}-1.0`, txt: `${m} Months (1% Monthly Interest)` });
    } else {
        opts = [
            { val: '6-0.7', txt: '6 Months (0.7% Monthly Interest)' },
            { val: '9-0.7', txt: '9 Months (0.7% Monthly Interest)' },
            { val: '12-0.7', txt: '12 Months (0.7% Monthly Interest)' }
        ];
    }

    opts.forEach(o => {
        const el = document.createElement('option');
        el.value = o.val;
        el.innerText = o.txt;
        elements.durationSelect.appendChild(el);
    });
}

function checkDateAccess() {
    const today = new Date();
    const currentMonth = today.getMonth(); // 5 = June
    const currentDate = today.getDate();
    // Logic: Month must be June (5) AND Date between 23 and 30
    const isOpen = (currentMonth === 5) && (currentDate >= 23 && currentDate <= 30);

    if (!isOpen) {
        elements.dateBanner.classList.remove('hidden');
        disableBtn(true);
    } else {
        elements.dateBanner.classList.add('hidden');
    }
}

function disableBtn(state) {
    elements.generateBtn.disabled = state;
    if(state) elements.generateBtn.classList.add('opacity-50', 'cursor-not-allowed');
    else elements.generateBtn.classList.remove('opacity-50', 'cursor-not-allowed');
}

// 5. Handle Generate Click
function handleGenerate(e) {
    e.preventDefault();
    if (!loanState.selectedMember) return alert("Please select a member");

    const formData = {
        member: loanState.selectedMember,
        amount: parseFloat(elements.amountInput.value),
        mode: loanState.appMode,
        durationString: elements.durationSelect.value,
        manualImage: document.getElementById('imageUpload').files[0]
    };

    renderPreviewAndShow(formData);
}

// Initialize listeners on load
setupUIListeners();
