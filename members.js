// members.js - TRUST COMMUNITY FUND (Fixed PDF Layout)

// --- Global Variables ---
let allMembers = {};
let allTransactions = [];
let allActiveLoans = [];
let adminStats = {}; 
const DEFAULT_IMG = 'https://i.ibb.co/HTNrbJxD/20250716-222246.png'; 

// --- Initialization ---
document.addEventListener("DOMContentLoaded", () => {
    initializeApp();
    
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
        setupPasswordPrompt(); 
    } catch (error) {
        console.error(error);
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
            const snap = await firebase.database().ref('members').once('value');
            const members = snap.val() || {};
            const isValid = Object.values(members).some(m => m.password === pin);

            if (isValid) {
                ui.prompt.classList.add('hidden');
                ui.loader.classList.remove('hidden');
                fetchDashboardData(); 
            } else {
                throw new Error("Incorrect PIN");
            }
        } catch (e) {
            ui.error.textContent = "Wrong PIN";
            ui.input.value = "";
            ui.btn.disabled = false;
            ui.btn.textContent = "UNLOCK";
        }
    };

    ui.btn.onclick = verify;
    ui.input.onkeydown = (e) => { if (e.key === 'Enter') verify(); };
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
        allTransactions = Object.values(txSnap.val() || {})
            .map(t => ({...t, dateObj: new Date(t.date || 0)}))
            .sort((a, b) => b.dateObj - a.dateObj); 

        allActiveLoans = Object.values(loansSnap.val() || {});
        adminStats = adminSnap.val() || {};

        initUI();
    } catch (e) {
        console.error("Data Load Error:", e);
    }
}

// --- 3. UI Rendering ---
function initUI() {
    document.getElementById('loader').classList.add('hidden');
    document.getElementById('dashboardContent').classList.remove('hidden');
    
    populateMemberDropdown();
    
    document.getElementById('memberFilter').addEventListener('change', updateView);
    document.getElementById('typeFilter').addEventListener('change', updateView);

    updateView();
    
    // Auto Adjust Padding
    setTimeout(() => {
        const headerHeight = document.getElementById('profileSection').offsetHeight;
        document.body.style.paddingTop = (headerHeight + 160) + 'px';
    }, 500);
}

function populateMemberDropdown() {
    const select = document.getElementById('memberFilter');
    select.innerHTML = '<option value="all">All Members (Community View)</option>';
    
    Object.values(allMembers)
        .filter(m => m.status === 'Approved')
        .sort((a, b) => a.fullName.localeCompare(b.fullName))
        .forEach(m => {
            const opt = document.createElement('option');
            opt.value = m.membershipId; 
            opt.textContent = m.fullName;
            select.appendChild(opt);
        });
}

function updateView() {
    const memberId = document.getElementById('memberFilter').value;
    const filterType = document.getElementById('typeFilter').value;

    updateProfileCard(memberId);
    renderTable(memberId, filterType);
    
    setTimeout(() => {
        const headerHeight = document.getElementById('profileSection').offsetHeight;
        document.body.style.paddingTop = (headerHeight + 160) + 'px';
    }, 100);
}

function updateProfileCard(memberId) {
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
        els.name.textContent = "Community Overview";
        els.pic.innerHTML = `<img src="${DEFAULT_IMG}" style="border-color:var(--accent-gold)">`;
        
        const stats = calculateGlobalStats();
        els.sip.textContent = formatMoney(stats.totalSip);
        els.loan.textContent = formatMoney(stats.totalLoanGiven);
        els.balance.textContent = formatMoney(stats.availableBalance);
        els.due.textContent = formatMoney(stats.activeLoansOutstanding);
        els.int.textContent = formatMoney(stats.totalInterest);
        els.join.textContent = "EST 2024";

    } else {
        const member = Object.values(allMembers).find(m => m.membershipId === memberId);
        if(!member) return;

        els.name.textContent = member.fullName;
        els.pic.innerHTML = `<img src="${member.profilePicUrl || DEFAULT_IMG}" onclick="openModal('imageModal', this.src)">`;
        els.join.textContent = new Date(member.joiningDate || Date.now()).toLocaleDateString('en-GB');

        const myTxns = allTransactions.filter(t => t.memberId === memberId);
        let sip = 0, loanTaken = 0, intPaid = 0;
        
        myTxns.forEach(t => {
            if(t.type === 'SIP') sip += parseFloat(t.amount || 0);
            if(t.type === 'Loan Taken') loanTaken += parseFloat(t.amount || 0);
            if(t.type === 'Loan Payment') intPaid += parseFloat(t.interestPaid || 0);
        });

        const myLoans = allActiveLoans.filter(l => l.memberId === memberId && l.status === 'Active');
        const due = myLoans.reduce((sum, l) => sum + parseFloat(l.outstandingAmount||0), 0);
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
    
    // Use the logic to get data arrays
    const { rows, totals } = getProcessedData(memberId, type);

    // Reverse for UI display (Newest First)
    const uiRows = [...rows].reverse();

    if (uiRows.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="text-center" style="padding:20px">No transactions found.</td></tr>`;
        tfoot.innerHTML = '';
        return;
    }

    let rowsHTML = '';
    uiRows.forEach(row => {
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
    tfoot.innerHTML = `
        <tr>
            <td colspan="2" class="text-right">TOTALS</td>
            <td class="text-right val-debit">${formatMoney(totals.debit)}</td>
            <td class="text-right val-credit">${formatMoney(totals.principal)}</td>
            <td class="text-right val-credit">${formatMoney(totals.interest)}</td>
            <td></td>
        </tr>
    `;
}

// Helper to get clean data for both Table and PDF
function getProcessedData(memberId, type) {
    let data = [...allTransactions];
    if (memberId !== 'all') {
        data = data.filter(t => t.memberId === memberId);
    }
    
    // Sort Oldest to Newest for math
    data.sort((a, b) => a.dateObj - b.dateObj);

    let runningBalance = 0;
    let totalDebit = 0, totalPrincipal = 0, totalInterest = 0;

    const rows = data.map(tx => {
        const amt = parseFloat(tx.amount || 0);
        let desc = '', debit = 0, principal = 0, interest = 0;
        let isRelevant = true;

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
            isRelevant = false; 
        }

        if (!isRelevant) return null;
        if (type === 'sip' && tx.type !== 'SIP') return null;
        if (type === 'loan' && tx.type !== 'Loan Taken') return null;
        if (type === 'payment' && tx.type !== 'Loan Payment') return null;

        totalDebit += debit;
        totalPrincipal += principal;
        totalInterest += interest;

        // Append Name if All Members view
        let finalDesc = desc;
        if (memberId === 'all') {
             const mName = allMembers[tx.memberId]?.fullName.split(' ')[0] || 'Unknown';
             finalDesc = `${desc} - ${mName}`;
        }

        return {
            date: tx.dateObj.toLocaleDateString('en-GB'),
            desc: finalDesc,
            debit,
            principal,
            interest,
            balance: runningBalance
        };
    }).filter(r => r !== null);

    return { rows, totals: { debit: totalDebit, principal: totalPrincipal, interest: totalInterest } };
}


// --- 4. BRAHMASTRA PDF GENERATOR (Updated with Password & Footer Totals) ---
async function generateSmartPDF() {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    const memberId = document.getElementById('memberFilter').value;
    const isCommunity = memberId === 'all';
    
    // --- 🔒 PASSWORD LOGIC FOR ALL MEMBERS ---
    if (isCommunity) {
        const now = new Date();
        const dd = String(now.getDate()).padStart(2, '0');
        const mm = String(now.getMonth() + 1).padStart(2, '0'); // Jan is 0
        const yy = String(now.getFullYear()).slice(-2);
        
        const todayPass = `${dd}${mm}${yy}`; // Example: 280226
        
        const userPass = prompt(`🔒 Protected File\nEnter Today's Date (DDMMYY) to Download:\n(Hint: ${todayPass})`);
        
        if (userPass !== todayPass) {
            alert("❌ Incorrect Password! Download Cancelled.");
            return;
        }
    }

    // === Colors ===
    const colPrimary = [0, 35, 102];  // Royal Blue
    const colGold = [212, 175, 55];   // Gold
    const colRed = [220, 53, 69];
    const colGreen = [40, 167, 69];

    // === A. HEADER SECTION ===
    doc.setFillColor(...colPrimary);
    doc.rect(0, 0, 210, 40, 'F');
    
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(22);
    doc.setFont("helvetica", "bold");
    doc.text("TRUST COMMUNITY FUND", 105, 18, null, null, "center");
    
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...colGold);
    doc.text(isCommunity ? "OFFICIAL COMMUNITY LEDGER" : "MEMBER ACCOUNT STATEMENT", 105, 26, null, null, "center");
    
    doc.setTextColor(200, 200, 200);
    doc.text(`Generated On: ${new Date().toLocaleString('en-GB')}`, 105, 34, null, null, "center");

    let startY = 50;

    // === B. MEMBER DASHBOARD (Stats Boxes) ===
    if (!isCommunity) {
        const member = Object.values(allMembers).find(m => m.membershipId === memberId);
        const name = member.fullName;
        const joinDate = new Date(member.joiningDate || Date.now()).toLocaleDateString('en-GB');
        
        // Grab values from DOM for consistency
        const domSip = document.getElementById('totalSipValue').innerText;
        const domLoan = document.getElementById('totalLoanValue').innerText;
        const domBal = document.getElementById('netBalanceValue').innerText;
        const domDue = document.getElementById('loanDueValue').innerText;
        const domInt = document.getElementById('interestPaidValue').innerText;

        // Draw Name & Info
        doc.setTextColor(0, 0, 0);
        doc.setFontSize(16);
        doc.setFont("helvetica", "bold");
        doc.text(name, 14, 55);
        
        doc.setFontSize(10);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(100);
        doc.text(`Member ID: ${memberId} | Joined: ${joinDate}`, 14, 61);

        // Draw 6 Stats Boxes
        const boxW = 30; const boxH = 16; const gap = 4;
        const startX = 14; const statsY = 70;

        const statsData = [
            { label: "Total SIP", val: domSip, col: colGreen },
            { label: "Total Loan", val: domLoan, col: colPrimary },
            { label: "Net Bal", val: domBal, col: colPrimary },
            { label: "Loan Due", val: domDue, col: colRed },
            { label: "Int. Paid", val: domInt, col: colPrimary },
            { label: "Status", val: "ACTIVE", col: colGold }
        ];

        statsData.forEach((s, i) => {
            const x = startX + (i * (boxW + gap));
            doc.setDrawColor(200);
            doc.setFillColor(252, 252, 252);
            doc.roundedRect(x, statsY, boxW, boxH, 2, 2, 'FD');
            
            doc.setFontSize(7); doc.setTextColor(100);
            doc.text(s.label, x + (boxW/2), statsY + 5, null, null, "center");
            
            doc.setFontSize(9); doc.setFont("helvetica", "bold");
            doc.setTextColor(...s.col);
            doc.text(s.val, x + (boxW/2), statsY + 12, null, null, "center");
        });

        startY = 95;
    }

    // === C. THE TABLE (WITH FOOTER TOTALS) ===
    // Get Data AND Totals
    const { rows, totals } = getProcessedData(memberId, document.getElementById('typeFilter').value);
    
    // Prepare Body Data
    const tableData = rows.reverse().map(r => [
        r.date,
        r.desc,
        r.debit > 0 ? formatMoney(r.debit) : '-',
        r.principal > 0 ? formatMoney(r.principal) : '-',
        r.interest > 0 ? formatMoney(r.interest) : '-',
        formatMoney(r.balance)
    ]);

    // Prepare Footer Row (Totals)
    // Calculating final balance for footer (Using the latest balance from the first row of reversed data)
    const closingBalance = rows.length > 0 ? rows[0].balance : 0;

    const footerRow = [
        "TOTALS", 
        "", 
        formatMoney(totals.debit), 
        formatMoney(totals.principal), 
        formatMoney(totals.interest), 
        formatMoney(closingBalance)
    ];

    // Render Table
    doc.autoTable({
        startY: startY,
        head: [['Date', 'Description', 'Debit', 'Principal', 'Interest', 'Balance']],
        body: tableData,
        foot: [footerRow], // 🔥 Footer Added Here
        theme: 'grid',
        styles: {
            fontSize: 8, cellPadding: 3, valign: 'middle',
            lineColor: [220, 220, 220], lineWidth: 0.1,
        },
        headStyles: {
            fillColor: colPrimary, textColor: 255, fontStyle: 'bold', halign: 'center'
        },
        footStyles: { // 🔥 Footer Styling
            fillColor: [240, 240, 240], textColor: colPrimary, fontStyle: 'bold', halign: 'right'
        },
        columnStyles: {
            0: { cellWidth: 22 }, 
            1: { cellWidth: 'auto' }, 
            2: { cellWidth: 22, halign: 'right', textColor: colRed }, 
            3: { cellWidth: 22, halign: 'right', textColor: colGreen }, 
            4: { cellWidth: 20, halign: 'right', textColor: colGreen }, 
            5: { cellWidth: 25, halign: 'right', fontStyle: 'bold' }
        },
        didDrawPage: function (data) {
            const pageSize = doc.internal.pageSize;
            doc.setFontSize(8); doc.setTextColor(150);
            doc.text(`Page ${doc.internal.getNumberOfPages()}`, data.settings.margin.left, pageSize.height - 10);
        }
    });

    // === D. COMMUNITY FOOTER (For All Members) ===
    if (isCommunity) {
        let finalY = doc.lastAutoTable.finalY + 10;
        if (finalY > 240) { doc.addPage(); finalY = 20; }
        const gStats = calculateGlobalStats();

        doc.setDrawColor(...colGold); doc.setLineWidth(0.5); doc.setFillColor(248, 250, 252);
        doc.roundedRect(14, finalY, 182, 45, 3, 3, 'FD');

        doc.setFillColor(...colPrimary); doc.rect(14, finalY, 182, 10, 'F');
        doc.setTextColor(255); doc.setFontSize(10); doc.setFont("helvetica", "bold");
        doc.text("CURRENT COMMUNITY FUND STATUS", 105, finalY + 7, null, null, "center");

        const yRow = finalY + 25;
        
        doc.setTextColor(100); doc.setFontSize(9);
        doc.text("Total SIP Fund", 40, yRow, null, null, "center");
        doc.setTextColor(...colPrimary); doc.setFontSize(12); doc.setFont("helvetica", "bold");
        doc.text(formatMoney(gStats.totalSip), 40, yRow + 6, null, null, "center");

        doc.setTextColor(100); doc.setFontSize(9); doc.setFont("helvetica", "normal");
        doc.text("Market Loans", 105, yRow, null, null, "center");
        doc.setTextColor(...colRed); doc.setFontSize(12); doc.setFont("helvetica", "bold");
        doc.text(formatMoney(gStats.activeLoansOutstanding), 105, yRow + 6, null, null, "center");

        doc.setTextColor(100); doc.setFontSize(9); doc.setFont("helvetica", "normal");
        doc.text("Available Cash", 170, yRow, null, null, "center");
        doc.setTextColor(...colGreen); doc.setFontSize(12); doc.setFont("helvetica", "bold");
        doc.text(formatMoney(gStats.availableBalance), 170, yRow + 6, null, null, "center");
    }

    doc.save(isCommunity ? 'TCF_Community_Report.pdf' : `TCF_${memberId}.pdf`);
}


// --- Utilities ---
function calculateGlobalStats() {
    let totalSip = 0, totalLoanGiven = 0, totalRepay = 0, totalInterest = 0;
    
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

    let availableBalance = 0;
    if (adminStats && adminStats.balanceStats && adminStats.balanceStats.availableBalance) {
        availableBalance = parseFloat(adminStats.balanceStats.availableBalance);
    } else {
        availableBalance = (totalSip + totalRepay + totalInterest) - totalLoanGiven;
    }

    return { totalSip, totalLoanGiven, activeLoansOutstanding, availableBalance, totalInterest };
}

function formatMoney(amount) {
    return 'Rs. ' + parseFloat(amount || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 });
}

function openModal(id, src) {
    const modal = document.getElementById(id);
    if(src) document.getElementById('modalImage').src = src;
    modal.classList.remove('hidden');
}