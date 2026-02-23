// loan/js/loan_ui.js
import { loanState } from './loan_core.js';
import { validateMemberKYC, updateKYCUI } from './loan_kyc.js';
import { calculateLimit } from './loan_calc.js';
import { renderPreviewAndShow } from './loan_pdf.js'; // Connection to PDF Engine

// DOM Elements
const elements = {
    nameSelect: document.getElementById('nameSelect'),
    amountInput: document.getElementById('amount'),
    limitMsg: document.getElementById('limit-msg'),
    walletInfo: document.getElementById('walletInfo'),
    kycContainer: document.getElementById('kycStatusContainer'),
    durationSelect: document.getElementById('durationRateSelect'),
    generateBtn: document.getElementById('generateBtn'), // The main button
    appMode: document.getElementById('appMode'),
    btnLoan: document.getElementById('btnModeLoan'),
    btnWithdraw: document.getElementById('btnModeWithdraw'),
    dateBanner: document.getElementById('dateBanner'),
    loanForm: document.getElementById('loanForm')
};

// 1. Setup Event Listeners
export function setupUIListeners() {
    console.log("✅ UI Listeners Active");

    // Mode Switching
    elements.btnLoan.addEventListener('click', () => switchMode('loan'));
    elements.btnWithdraw.addEventListener('click', () => switchMode('withdrawal'));

    // Member Selection
    elements.nameSelect.addEventListener('change', handleMemberChange);

    // Amount Input
    elements.amountInput.addEventListener('input', handleAmountChange);

    // 🔥 MAIN FIX: Handle Generate Click Correctly
    elements.loanForm.addEventListener('submit', (e) => {
        e.preventDefault(); // Stop page reload
        console.log("🖱️ Generate Button Clicked"); // Debug Log
        handleGenerate();
    });
}

// ... (switchMode, handleMemberChange, handleAmountChange Logic remains same as before) ...
// (I am skipping those generic functions to save space, paste previous logic here if needed)

// Re-paste these specific helper functions needed for context:
function switchMode(mode) {
    loanState.appMode = mode;
    elements.appMode.value = mode;

    if (mode === 'loan') {
        elements.btnLoan.className = "flex-1 py-2.5 text-xs font-bold rounded-lg shadow-sm bg-white text-teal-700 border border-gray-200 transition-all";
        elements.btnWithdraw.className = "flex-1 py-2.5 text-xs font-bold rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-200 transition-all";
        document.getElementById('portal-subtitle').innerText = "Loan Application Portal";
        document.getElementById('amountLabel').innerText = "Loan Amount (₹)";
        document.getElementById('limitLabel').innerText = "Loan Eligibility";
        document.getElementById('durationWrapper').classList.remove('hidden');
        document.getElementById('withdrawalModeField').classList.add('hidden');
        elements.dateBanner.classList.add('hidden');
        elements.generateBtn.innerHTML = `<span>GENERATE FORM</span> <i class="fas fa-file-export ml-2"></i>`;
    } else {
        elements.btnWithdraw.className = "flex-1 py-2.5 text-xs font-bold rounded-lg shadow-sm bg-white text-teal-700 border border-gray-200 transition-all";
        elements.btnLoan.className = "flex-1 py-2.5 text-xs font-bold rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-200 transition-all";
        document.getElementById('portal-subtitle').innerText = "SIP Withdrawal Portal";
        document.getElementById('amountLabel').innerText = "Withdrawal Amount (₹)";
        document.getElementById('limitLabel').innerText = "Withdrawal Limit (50%)";
        document.getElementById('durationWrapper').classList.add('hidden');
        document.getElementById('withdrawalModeField').classList.remove('hidden');
        elements.generateBtn.innerHTML = `<span>GENERATE WITHDRAWAL</span> <i class="fas fa-file-export ml-2"></i>`;
    }
    if (loanState.selectedMember) handleMemberChange();
}

function handleMemberChange() {
    const memberId = elements.nameSelect.value;
    const member = loanState.members[memberId];
    loanState.selectedMember = member;
    if (!member) return;

    const balance = parseFloat(member.accountBalance) || 0;
    document.getElementById('displayWalletBalance').innerText = balance.toLocaleString('en-IN');

    const kycStatus = validateMemberKYC(member);
    updateKYCUI(kycStatus); 

    const limit = calculateLimit(balance, loanState.appMode);
    document.getElementById('displayEligibleLimit').innerText = limit.toLocaleString('en-IN');
    elements.walletInfo.classList.remove('hidden');
    handleAmountChange();
}

function handleAmountChange() {
    const amt = parseFloat(elements.amountInput.value) || 0;
    const balance = parseFloat(loanState.selectedMember?.accountBalance) || 0;
    const limit = calculateLimit(balance, loanState.appMode);

    // Check KYC First
    const kycStatus = loanState.selectedMember ? validateMemberKYC(loanState.selectedMember) : {isValid:false};
    if (!kycStatus.isValid) { disableBtn(true); return; }

    if (amt > 0) {
        elements.limitMsg.classList.remove('hidden');
        if (limit === 0 || amt > limit) {
            elements.limitMsg.innerText = limit === 0 ? "Not eligible." : `Exceeds Limit (Max: ₹${limit})`;
            elements.limitMsg.className = "text-[10px] mt-1 font-bold text-red-600 ml-1";
            disableBtn(true);
        } else {
            elements.limitMsg.innerText = "Amount is within limit.";
            elements.limitMsg.className = "text-[10px] mt-1 font-bold text-green-600 ml-1";
            disableBtn(false);
        }
        if (loanState.appMode === 'loan') populateDuration(amt, limit);
    } else {
        elements.limitMsg.classList.add('hidden');
        disableBtn(false);
    }
}

function populateDuration(amt, limit) {
    elements.durationSelect.innerHTML = '';
    let opts = [];
    if (amt < 25000) {
        opts.push({ val: '1-1.0', txt: '1 Month (1% Total Interest)' });
        opts.push({ val: '2-1.5', txt: '2 Months (3% Total Interest)' }); 
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

function disableBtn(state) {
    elements.generateBtn.disabled = state;
    if(state) elements.generateBtn.classList.add('opacity-50', 'cursor-not-allowed');
    else elements.generateBtn.classList.remove('opacity-50', 'cursor-not-allowed');
}


// 🔥 5. Handle Generate Click (The Logic that was missing/broken)
function handleGenerate() {
    if (!loanState.selectedMember) return alert("Please select a member");

    // Gather Data
    const formData = {
        member: loanState.selectedMember,
        amount: parseFloat(elements.amountInput.value),
        mode: loanState.appMode,
        durationString: elements.durationSelect.value,
        manualImage: document.getElementById('imageUpload').files[0]
    };

    console.log("📤 Sending data to PDF Engine...", formData);

    // Call the PDF Module
    renderPreviewAndShow(formData);
}

// Initialize listeners on load
setupUIListeners();
