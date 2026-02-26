// members.js - Logic for Trust Community Fund Dashboard

// --- Global Variables ---
let allMembers = {};
let allTransactions = [];
let allActiveLoans = [];
let adminStats = {}; 
const DEFAULT_IMG = 'https://i.ibb.co/HTNrbJxD/20250716-222246.png'; // Fallback Image

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
        // alert("System Error: Could not load configuration.");
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
    
    // Adjust padding dynamically whenever view changes
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
    
    let data = [...allTransactions];
    if (memberId !== 'all') {
        data = data.filter(t => t.memberId === memberId);
    }

    // Sort: Oldest to Newest for calc
    data.sort((a, b) => a.dateObj - b.dateObj);

    let runningBalance = 0;
    let totalDebit = 0, totalPrincipal = 0, totalInterest = 0;
    
    const processedRows = data.map(tx => {
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

        return {
            date: tx.dateObj.toLocaleDateString('en-GB'),
            desc: memberId === 'all' ? `${desc} - ${allMembers[tx.memberId]?.fullName.split(' ')[0]}` : desc,
            debit,
            principal,
            interest,
            balance: runningBalance
        };
    }).filter(r => r !== null).reverse(); // Display Newest First

    if (processedRows.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="text-center" style="padding:20px">No transactions found.</td></tr>`;
        tfoot.innerHTML = '';
        return;
    }

    let rowsHTML = '';
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

// --- 4. ADVANCED PDF GENERATOR (Professional Dashboard Look) ---
async function generateSmartPDF() {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    const memberId = document.getElementById('memberFilter').value;
    const isCommunity = memberId === 'all';
    
    // Colors
    const colPrimary = [0, 35, 102];  // Royal Blue
    const colGold = [212, 175, 55];   // Gold
    const colBg = [244, 246, 249];    // Light Gray
    const colRed = [220, 53, 69];
    const colGreen = [40, 167, 69];

    // --- A. TOP HEADER ---
    doc.setFillColor(...colPrimary);
    doc.rect(0, 0, 210, 45, 'F');
    
    // Logo (Simulated or from URL if possible - using fallback for stability)
    // For now we use text, but if you have base64 logo, add here.
    
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(24);
    doc.setFont("helvetica", "bold");
    doc.text("TRUST COMMUNITY FUND", 105, 20, null, null, "center");
    
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...colGold);
    doc.text(isCommunity ? "OFFICIAL COMMUNITY LEDGER" : "MEMBER ACCOUNT STATEMENT", 105, 30, null, null, "center");
    
    doc.setTextColor(200, 200, 200);
    doc.text(`Generated: ${new Date().toLocaleString()}`, 105, 38, null, null, "center");

    let startY = 55;

    // --- B. MEMBER DASHBOARD (If Individual) ---
    if (!isCommunity) {
        // 1. Draw Dashboard Box
        doc.setDrawColor(200, 200, 200);
        doc.setFillColor(255, 255, 255);
        doc.roundedRect(14, 50, 182, 55, 3, 3, 'FD');

        // 2. Fetch Data from UI (HTML Elements)
        const name = document.getElementById('profileName').textContent;
        const join = document.getElementById('joiningDateValue').textContent;
        const vSip = document.getElementById('totalSipValue').textContent;
        const vLoan = document.getElementById('totalLoanValue').textContent;
        const vBal = document.getElementById('netBalanceValue').textContent;
        const vDue = document.getElementById('loanDueValue').textContent;
        const vInt = document.getElementById('interestPaidValue').textContent;

        // 3. Avatar Placeholder (Left)
        doc.setFillColor(230, 230, 230);
        doc.circle(30, 75, 12, 'F'); // Circle Avatar
        doc.setFontSize(16);
        doc.setTextColor(...colPrimary);
        doc.text(name.charAt(0), 30, 78, null, null, "center"); // Initial

        // Name & Join Date
        doc.setFontSize(14);
        doc.setFont("helvetica", "bold");
        doc.text(name, 50, 70);
        
        doc.setFontSize(9);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(100);
        doc.text(`Joined: ${join}`, 50, 76);

        // 4. Stats Grid (2 Rows x 3 Cols) - Right Side
        const gridX = 90;
        const gridY = 60;
        const boxW = 30;
        const boxH = 18;
        const gap = 2;

        const stats = [
            { label: "TOTAL SIP", val: vSip, color: colGreen },
            { label: "TOTAL LOAN", val: vLoan, color: colPrimary },
            { label: "NET BAL", val: vBal, color: colPrimary },
            { label: "LOAN DUE", val: vDue, color: colRed },
            { label: "INT. PAID", val: vInt, color: colPrimary },
            { label: "STATUS", val: "ACTIVE", color: colGold }
        ];

        let i = 0;
        for (let r = 0; r < 2; r++) {
            for (let c = 0; c < 3; c++) {
                const s = stats[i];
                const bx = gridX + (c * (boxW + gap));
                const by = gridY + (r * (boxH + gap));

                // Box
                doc.setDrawColor(220);
                doc.setFillColor(250, 252, 255);
                doc.roundedRect(bx, by, boxW, boxH, 2, 2, 'FD');

                // Label
                doc.setFontSize(6);
                doc.setTextColor(120);
                doc.text(s.label, bx + 15, by + 6, null, null, "center");

                // Value
                doc.setFontSize(9);
                doc.setFont("helvetica", "bold");
                doc.setTextColor(...s.color);
                doc.text(s.val, bx + 15, by + 13, null, null, "center");
                i++;
            }
        }
        startY = 115; // Move Table Down
    }

    // --- C. DATA TABLE ---
    const rows = [];
    const tableRows = document.querySelectorAll('#dataTable tbody tr');
    tableRows.forEach(tr => {
        const tds = tr.querySelectorAll('td');
        if(tds.length > 1) {
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

    doc.autoTable({
        startY: startY,
        head: [['Date', 'Description', 'Debit (-)', 'Principal (+)', 'Interest', 'Balance']],
        body: rows,
        theme: 'grid',
        headStyles: { 
            fillColor: colPrimary, 
            textColor: 255, 
            fontStyle: 'bold',
            halign: 'center'
        },
        styles: { 
            fontSize: 8, 
            cellPadding: 3,
            valign: 'middle' 
        },
        columnStyles: {
            0: { cellWidth: 25 },
            1: { cellWidth: 'auto' }, // Desc fits space
            2: { textColor: colRed, halign: 'right', cellWidth: 25 },
            3: { textColor: colGreen, halign: 'right', cellWidth: 25 },
            4: { textColor: colGreen, halign: 'right', cellWidth: 20 },
            5: { fontStyle: 'bold', halign: 'right', cellWidth: 25 }
        },
        didDrawPage: function (data) {
            // Footer on every page
            const pageSize = doc.internal.pageSize;
            const pageHeight = pageSize.height ? pageSize.height : pageSize.getHeight();
            doc.setFontSize(8);
            doc.setTextColor(150);
            doc.text(`Page ${doc.internal.getNumberOfPages()}`, data.settings.margin.left, pageHeight - 10);
        }
    });

    // --- D. COMMUNITY FOOTER CARD (Only for All Members) ---
    if (isCommunity) {
        let finalY = doc.lastAutoTable.finalY + 10;
        if (finalY > 240) { doc.addPage(); finalY = 20; }

        const gStats = calculateGlobalStats();

        // Big Card
        doc.setDrawColor(...colGold);
        doc.setFillColor(250, 250, 250);
        doc.roundedRect(14, finalY, 182, 50, 2, 2, 'FD');

        // Header Strip
        doc.setFillColor(...colPrimary);
        doc.rect(14, finalY, 182, 10, 'F');
        doc.setTextColor(255);
        doc.setFontSize(10);
        doc.text("COMMUNITY HEALTH SNAPSHOT", 105, finalY + 7, null, null, "center");

        // Content
        const row1 = finalY + 25;
        const row2 = finalY + 40;

        // Total SIP
        doc.setTextColor(100); doc.setFontSize(8);
        doc.text("TOTAL SIP FUND", 40, row1, null, null, "center");
        doc.setTextColor(...colPrimary); doc.setFontSize(14); doc.setFont("helvetica", "bold");
        doc.text(formatMoney(gStats.totalSip), 40, row1 + 7, null, null, "center");

        // Active Loans
        doc.setTextColor(100); doc.setFontSize(8); doc.setFont("helvetica", "normal");
        doc.text("MARKET LOANS", 170, row1, null, null, "center");
        doc.setTextColor(...colRed); doc.setFontSize(14); doc.setFont("helvetica", "bold");
        doc.text(formatMoney(gStats.activeLoansOutstanding), 170, row1 + 7, null, null, "center");

        // Available Balance (Center Big)
        doc.setTextColor(100); doc.setFontSize(9); doc.setFont("helvetica", "normal");
        doc.text("AVAILABLE LIQUIDITY", 105, row2, null, null, "center");
        doc.setTextColor(...colGreen); doc.setFontSize(18); doc.setFont("helvetica", "bold");
        doc.text(formatMoney(gStats.availableBalance), 105, row2 + 8, null, null, "center");
    }

    doc.save(isCommunity ? 'TCF_Community_Ledger.pdf' : `TCF_${memberId}_Statement.pdf`);
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
    return '₹' + parseFloat(amount || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 });
}

function openModal(id, src) {
    const modal = document.getElementById(id);
    if(src) document.getElementById('modalImage').src = src;
    modal.classList.remove('hidden');
}
