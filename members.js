// members.js - Logic for Trust Community Fund Dashboard

// --- Global Variables ---
let allMembers = {};
let allTransactions = [];
let allActiveLoans = [];
let adminStats = {}; // To store community balance stats
let currentUser = null; // Currently selected member for view
const DEFAULT_IMG = 'https://i.ibb.co/HTNrbJxD/20250716-222246.png';

// --- Initialization ---
document.addEventListener("DOMContentLoaded", () => {
    initializeApp();
    
    // PDF Trigger (Hidden on Logo)
    const pdfBtn = document.getElementById('downloadPdfBtn');
    if(pdfBtn) {
        pdfBtn.addEventListener('click', generateSmartPDF);
    }
});

async function initializeApp() {
    try {
        const response = await fetch('/api/firebase-config');
        if (!response.ok) throw new Error('Config load failed');
        const config = await response.json();

        if (!firebase.apps.length) firebase.initializeApp(config);
        
        setupPasswordPrompt(); // Step 1: Security
    } catch (error) {
        console.error(error);
        alert("System Error: Could not load configuration.");
    }
}

// --- 1. Security & PIN Logic ---
function setupPasswordPrompt() {
    const ui = {
        prompt: document.getElementById('passwordPromptContainer'),
        input: document.getElementById('passwordInput'),
        btn: document.getElementById('passwordSubmit'),
        error: document.getElementById('passwordError'),
        loader: document.getElementById('loader')
    };

    ui.loader.classList.add('hidden');
    ui.prompt.classList.remove('hidden');
    ui.input.focus();

    const verify = async () => {
        const pin = ui.input.value.trim();
        if (!pin) return;

        ui.btn.disabled = true;
        ui.btn.textContent = "Verifying...";
        ui.error.textContent = "";

        try {
            // Fetch only members first to verify PIN
            const snap = await firebase.database().ref('members').once('value');
            const members = snap.val() || {};
            
            // Check if ANY member has this password (simple admin check)
            const isValid = Object.values(members).some(m => m.password === pin);

            if (isValid) {
                ui.prompt.classList.add('hidden');
                ui.loader.classList.remove('hidden');
                fetchDashboardData(); // Step 2: Load Data
            } else {
                throw new Error("Incorrect PIN");
            }
        } catch (e) {
            ui.error.textContent = "Access Denied: Wrong PIN";
            ui.input.value = "";
            ui.btn.disabled = false;
            ui.btn.textContent = "UNLOCK";
        }
    };

    ui.btn.onclick = verify;
    ui.input.onkeydown = (e) => e.key === 'Enter' && verify();
}

// --- 2. Data Fetching ---
async function fetchDashboardData() {
    try {
        const db = firebase.database();
        const [membersSnap, txSnap, loansSnap, adminSnap] = await Promise.all([
            db.ref('members').once('value'),
            db.ref('transactions').once('value'),
            db.ref('activeLoans').once('value'),
            db.ref('admin').once('value')
        ]);

        allMembers = membersSnap.val() || {};
        // Convert transactions object to array
        allTransactions = Object.values(txSnap.val() || {})
            .map(t => ({...t, dateObj: new Date(t.date || 0)}))
            .sort((a, b) => b.dateObj - a.dateObj); // Newest first

        allActiveLoans = Object.values(loansSnap.val() || {});
        adminStats = adminSnap.val() || {};

        initUI();
    } catch (e) {
        console.error("Data Load Error:", e);
        alert("Failed to load dashboard data. Please refresh.");
    }
}

// --- 3. UI Rendering ---
function initUI() {
    document.getElementById('loader').classList.add('hidden');
    document.getElementById('dashboardContent').classList.remove('hidden');
    
    populateMemberDropdown();
    
    // Event Listeners for Filters
    document.getElementById('memberFilter').addEventListener('change', updateView);
    document.getElementById('typeFilter').addEventListener('change', updateView);

    // Initial Render
    updateView();
    
    // Adjust padding for fixed header
    const headerHeight = document.getElementById('profileSection').offsetHeight;
    document.body.style.paddingTop = (headerHeight + 140) + 'px';
}

function populateMemberDropdown() {
    const select = document.getElementById('memberFilter');
    select.innerHTML = '<option value="all">All Members (Community View)</option>';
    
    Object.values(allMembers)
        .filter(m => m.status === 'Approved')
        .sort((a, b) => a.fullName.localeCompare(b.fullName))
        .forEach(m => {
            const opt = document.createElement('option');
            opt.value = m.membershipId; // Using membershipId as key
            opt.textContent = m.fullName;
            select.appendChild(opt);
        });
}

function updateView() {
    const memberId = document.getElementById('memberFilter').value;
    const filterType = document.getElementById('typeFilter').value;

    updateProfileCard(memberId);
    renderTable(memberId, filterType);
}

function updateProfileCard(memberId) {
    // DOM Elements
    const els = {
        name: document.getElementById('profileName'),
        pic: document.getElementById('profilePictureContainer'),
        sip: document.getElementById('totalSipValue'),
        loan: document.getElementById('totalLoanValue'),
        balance: document.getElementById('netBalanceValue'),
        due: document.getElementById('loanDueValue'),
        int: document.getElementById('interestPaidValue'),
        join: document.getElementById('joiningDateValue')
    };

    if (memberId === 'all') {
        // Community View Stats
        els.name.textContent = "Community Overview";
        els.pic.innerHTML = `<img src="${DEFAULT_IMG}" style="border-color:var(--accent-gold)">`;
        
        // Calculate Totals
        const stats = calculateGlobalStats();
        els.sip.textContent = formatMoney(stats.totalSip);
        els.loan.textContent = formatMoney(stats.totalLoanGiven);
        els.balance.textContent = formatMoney(stats.availableBalance);
        els.due.textContent = formatMoney(stats.activeLoansOutstanding);
        els.int.textContent = formatMoney(stats.totalInterest);
        els.join.textContent = "EST 2024";

    } else {
        // Individual Member Stats
        const member = Object.values(allMembers).find(m => m.membershipId === memberId);
        if(!member) return;

        els.name.textContent = member.fullName;
        els.pic.innerHTML = `<img src="${member.profilePicUrl || DEFAULT_IMG}" onclick="openModal('imageModal', this.src)">`;
        els.join.textContent = new Date(member.joiningDate || Date.now()).toLocaleDateString('en-GB');

        // Personal Calcs
        const myTxns = allTransactions.filter(t => t.memberId === memberId);
        let sip = 0, loanTaken = 0, intPaid = 0;
        
        myTxns.forEach(t => {
            if(t.type === 'SIP') sip += parseFloat(t.amount || 0);
            if(t.type === 'Loan Taken') loanTaken += parseFloat(t.amount || 0);
            if(t.type === 'Loan Payment') intPaid += parseFloat(t.interestPaid || 0);
        });

        const myLoans = allActiveLoans.filter(l => l.memberId === memberId && l.status === 'Active');
        const due = myLoans.reduce((sum, l) => sum + parseFloat(l.outstandingAmount||0), 0);

        // Net Balance = SIP - Due
        const netBal = sip - due;

        els.sip.textContent = formatMoney(sip);
        els.loan.textContent = formatMoney(loanTaken);
        els.balance.textContent = formatMoney(netBal);
        els.due.textContent = formatMoney(due);
        els.int.textContent = formatMoney(intPaid);
    }
}

function renderTable(memberId, type) {
    const tbody = document.querySelector('#dataTable tbody');
    const tfoot = document.querySelector('#dataTable tfoot');
    tbody.innerHTML = '';
    
    // 1. Filter Data
    let data = [...allTransactions];
    if (memberId !== 'all') {
        data = data.filter(t => t.memberId === memberId);
    }

    // 2. Sort Oldest to Newest for Running Balance
    data.sort((a, b) => a.dateObj - b.dateObj);

    // 3. Process Rows & Balance
    let runningBalance = 0;
    let totalDebit = 0, totalPrincipal = 0, totalInterest = 0;
    let rowsHTML = '';

    // Reverse array later to show Newest First, but calculate balance first
    const processedRows = data.map(tx => {
        const amt = parseFloat(tx.amount || 0);
        let desc = '', debit = 0, principal = 0, interest = 0;
        let isRelevant = true;

        // Balance Logic: SIP (+), Loan (-), Repayment Principal (+)
        if (tx.type === 'SIP') {
            desc = 'SIP Deposit';
            principal = amt;
            runningBalance += amt;
        } 
        else if (tx.type === 'Loan Taken') {
            desc = `Loan Disbursed (${tx.loanType || 'Personal'})`;
            debit = amt;
            runningBalance -= amt;
        }
        else if (tx.type === 'Loan Payment') {
            desc = 'Loan Repayment';
            principal = parseFloat(tx.principalPaid || 0);
            interest = parseFloat(tx.interestPaid || 0);
            runningBalance += principal;
        } 
        else {
            isRelevant = false; // Ignore Extra/Penalty for main ledger balance
        }

        if (!isRelevant) return null;

        // Apply Type Filter
        if (type === 'sip' && tx.type !== 'SIP') return null;
        if (type === 'loan' && tx.type !== 'Loan Taken') return null;
        if (type === 'payment' && tx.type !== 'Loan Payment') return null;

        // Totals
        totalDebit += debit;
        totalPrincipal += principal;
        totalInterest += interest;

        return {
            date: tx.dateObj.toLocaleDateString('en-GB'),
            desc: memberId === 'all' ? `${desc} - ${allMembers[tx.memberId]?.fullName.split(' ')[0]}` : desc,
            debit,
            principal,
            interest,
            balance: runningBalance,
            isDebit: debit > 0
        };
    }).filter(r => r !== null).reverse(); // Show Newest First

    // 4. Generate HTML
    if (processedRows.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="text-center" style="padding:20px">No transactions found.</td></tr>`;
        tfoot.innerHTML = '';
        return;
    }

    processedRows.forEach(row => {
        rowsHTML += `
            <tr>
                <td>${row.date}</td>
                <td style="font-weight:500">${row.desc}</td>
                <td class="text-right ${row.debit > 0 ? 'val-debit' : ''}">${row.debit ? formatMoney(row.debit) : '-'}</td>
                <td class="text-right val-credit">${row.principal ? formatMoney(row.principal) : '-'}</td>
                <td class="text-right val-credit">${row.interest ? formatMoney(row.interest) : '-'}</td>
                <td class="text-right val-balance">${formatMoney(row.balance)}</td>
            </tr>
        `;
    });

    tbody.innerHTML = rowsHTML;
    
    // Footer Totals
    tfoot.innerHTML = `
        <tr>
            <td colspan="2" class="text-right">TOTALS</td>
            <td class="text-right val-debit">${formatMoney(totalDebit)}</td>
            <td class="text-right val-credit">${formatMoney(totalPrincipal)}</td>
            <td class="text-right val-credit">${formatMoney(totalInterest)}</td>
            <td></td>
        </tr>
    `;
}

// --- 4. PDF GENERATOR (The Requested Feature) ---
function generateSmartPDF() {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    const memberId = document.getElementById('memberFilter').value;
    const isCommunity = memberId === 'all';
    
    // Theme Colors
    const primary = [0, 35, 102]; // #002366
    const gold = [212, 175, 55]; // #D4AF37

    // 1. Header
    doc.setFillColor(...primary);
    doc.rect(0, 0, 210, 40, 'F');
    
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(22);
    doc.setFont("helvetica", "bold");
    doc.text("TRUST COMMUNITY FUND", 105, 15, null, null, "center");
    
    doc.setFontSize(12);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...gold);
    doc.text(isCommunity ? "OFFICIAL COMMUNITY LEDGER" : "MEMBER STATEMENT", 105, 25, null, null, "center");
    
    doc.setTextColor(200, 200, 200);
    doc.setFontSize(10);
    doc.text(`Generated On: ${new Date().toLocaleString()}`, 105, 33, null, null, "center");

    // 2. Info Block
    let startY = 50;
    if (!isCommunity) {
        const m = Object.values(allMembers).find(x => x.membershipId === memberId);
        doc.setTextColor(0, 0, 0);
        doc.setFontSize(12);
        doc.text(`Member Name: ${m.fullName}`, 14, 50);
        doc.text(`Joining Date: ${new Date(m.joiningDate).toLocaleDateString()}`, 14, 56);
        startY = 65;
    }

    // 3. Prepare Table Data
    const rows = [];
    const tableRows = document.querySelectorAll('#dataTable tbody tr');
    tableRows.forEach(tr => {
        const tds = tr.querySelectorAll('td');
        if(tds.length > 1) { // Skip "No data" row
            rows.push([
                tds[0].innerText, // Date
                tds[1].innerText, // Desc
                tds[2].innerText, // Debit
                tds[3].innerText, // Principal
                tds[4].innerText, // Interest
                tds[5].innerText  // Balance
            ]);
        }
    });

    // 4. Generate AutoTable
    doc.autoTable({
        startY: startY,
        head: [['Date', 'Description', 'Debit', 'Principal', 'Interest', 'Balance']],
        body: rows,
        theme: 'grid',
        headStyles: { fillColor: primary, textColor: [255, 255, 255] },
        styles: { fontSize: 8, cellPadding: 2 },
        columnStyles: {
            2: { textColor: [220, 53, 69], halign: 'right' }, // Debit Red
            3: { textColor: [40, 167, 69], halign: 'right' }, // Credit Green
            4: { textColor: [40, 167, 69], halign: 'right' }, // Int Green
            5: { fontStyle: 'bold', halign: 'right' }
        }
    });

    // 5. THE COMMUNITY HEALTH CARD (Last Page Footer)
    // Only if "All Members" is selected
    if (isCommunity) {
        let finalY = doc.lastAutoTable.finalY + 10;
        
        // Check if new page needed
        if (finalY > 240) {
            doc.addPage();
            finalY = 20;
        }

        const stats = calculateGlobalStats();

        // Draw Card Box
        doc.setDrawColor(...gold);
        doc.setLineWidth(1);
        doc.setFillColor(248, 249, 250); // Light Grey Bg
        doc.roundedRect(14, finalY, 182, 50, 3, 3, 'FD');

        // Card Header
        doc.setFillColor(...primary);
        doc.rect(14, finalY, 182, 12, 'F'); // Top Strip
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(10);
        doc.setFont("helvetica", "bold");
        doc.text("CURRENT COMMUNITY HEALTH STATUS", 105, finalY + 8, null, null, "center");

        // Data Columns
        doc.setTextColor(0, 0, 0);
        const col1 = 30;
        const col2 = 120;
        const row1 = finalY + 25;
        const row2 = finalY + 40;

        // Metric 1: Total SIP
        doc.setFontSize(9); doc.setTextColor(100);
        doc.text("TOTAL SIP COLLECTED", col1, row1);
        doc.setFontSize(14); doc.setTextColor(...primary);
        doc.text(formatMoney(stats.totalSip), col1, row1 + 6);

        // Metric 2: Active Loans
        doc.setFontSize(9); doc.setTextColor(100);
        doc.text("ACTIVE LOANS (MARKET)", col2, row1);
        doc.setFontSize(14); doc.setTextColor(220, 53, 69); // Red
        doc.text(formatMoney(stats.activeLoansOutstanding), col2, row1 + 6);

        // Divider
        doc.setDrawColor(200);
        doc.line(20, row1 + 10, 190, row1 + 10);

        // Metric 3: Available Balance (Center Big)
        doc.setFontSize(10); doc.setTextColor(100);
        doc.text("AVAILABLE FUNDS (LIQUIDITY)", 105, row2, null, null, "center");
        doc.setFontSize(18); doc.setTextColor(40, 167, 69); // Green
        doc.text(formatMoney(stats.availableBalance), 105, row2 + 8, null, null, "center");
    }

    doc.save(isCommunity ? 'TCF_Community_Report.pdf' : `TCF_Member_${memberId}.pdf`);
}

// --- Helper Utilities ---

function calculateGlobalStats() {
    let totalSip = 0;
    let totalLoanGiven = 0;
    let totalRepay = 0;
    let totalInterest = 0;

    allTransactions.forEach(t => {
        const amt = parseFloat(t.amount || 0);
        if(t.type === 'SIP') totalSip += amt;
        if(t.type === 'Loan Taken') totalLoanGiven += amt;
        if(t.type === 'Loan Payment') {
            totalRepay += parseFloat(t.principalPaid || 0);
            totalInterest += parseFloat(t.interestPaid || 0);
        }
    });

    let activeLoansOutstanding = 0;
    allActiveLoans.forEach(l => {
        if(l.status === 'Active') activeLoansOutstanding += parseFloat(l.outstandingAmount || 0);
    });

    // Available Balance = (Total In) - (Total Out)
    // In = SIP + Repay + Interest + Extra
    // Out = Loan Given + Expenses
    // NOTE: This is a rough calc. Ideally use admin.balanceStats.availableBalance from DB if reliable.
    // We will trust transaction math for now or fallback to Admin node.
    
    let availableBalance = 0;
    if (adminStats && adminStats.balanceStats && adminStats.balanceStats.availableBalance) {
        availableBalance = parseFloat(adminStats.balanceStats.availableBalance);
    } else {
        // Fallback Calc
        availableBalance = (totalSip + totalRepay + totalInterest) - totalLoanGiven;
    }

    return { totalSip, totalLoanGiven, activeLoansOutstanding, availableBalance, totalInterest };
}

function formatMoney(amount) {
    return '₹' + parseFloat(amount || 0).toLocaleString('en-IN', {
        maximumFractionDigits: 0
    });
}

function openModal(id, src) {
    const modal = document.getElementById(id);
    if(src) document.getElementById('modalImage').src = src;
    modal.classList.remove('hidden');
}
