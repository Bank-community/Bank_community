// File: profit_main.js
// Version 2.1: New Member Score display aur Profit Event Details modal ko theek kiya gaya.
// Yeh file application ka mukhya controller hai.

import { initializeApp } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-auth.js";
import { getDatabase, ref, get } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-database.js";
import * as logic from './profit_logic.js';

// --- GLOBAL VARIABLES ---
let allData = [], memberDataMap = new Map(), memberNames = [], activeLoansData = {};
let distributionChartInstance = null, growthChartInstance = null;
let db, auth;

// --- INITIALIZATION ---
document.addEventListener("DOMContentLoaded", () => initializeAppAndAuth());

async function initializeAppAndAuth() {
    try {
        const response = await fetch('/api/firebase-config');
        if (!response.ok) throw new Error('Configuration failed to load from /api/firebase-config.');
        const firebaseConfig = await response.json();
        
        const app = initializeApp(firebaseConfig);
        auth = getAuth(app);
        db = getDatabase(app);
        
        onAuthStateChanged(auth, user => {
            if (user) {
                document.getElementById('loader').classList.add('hidden');
                setupPasswordPrompt();
            } else {
                window.location.href = `/login.html?redirect=${window.location.pathname}`;
            }
        });

    } catch (error) {
        console.error("Initialization Error:", error);
        document.getElementById('loader').innerHTML = `<p style="color: red;">Application failed to initialize: ${error.message}</p>`;
    }
}

function setupPasswordPrompt() {
    const passwordContainer = document.getElementById('passwordPromptContainer');
    const passwordInput = document.getElementById('passwordInput');
    const passwordSubmit = document.getElementById('passwordSubmit');
    passwordContainer.classList.remove('visually-hidden');
    passwordInput.focus();
    
    const checkPassword = () => {
        if (passwordInput.value === logic.CONFIG.PASSWORD) {
            passwordContainer.classList.add('visually-hidden');
            document.getElementById('loader').classList.remove('hidden');
            loadAndProcessData();
        } else {
            alert("Incorrect PIN");
            passwordInput.value = "";
            passwordInput.focus();
        }
    };
    passwordSubmit.addEventListener('click', checkPassword);
    passwordInput.addEventListener('keydown', (e) => e.key === 'Enter' && checkPassword());
}

// --- DATA FETCHING AND PROCESSING ---
async function loadAndProcessData() {
    document.getElementById('loader').querySelector('span').textContent = 'Loading and processing data...';

    try {
        const membersRef = ref(db, 'members');
        const transactionsRef = ref(db, 'transactions');
        const activeLoansRef = ref(db, 'activeLoans');
        
        const [membersSnapshot, transactionsSnapshot, activeLoansSnapshot] = await Promise.all([
            get(membersRef), 
            get(transactionsRef),
            get(activeLoansRef)
        ]);

        if (!membersSnapshot.exists() || !transactionsSnapshot.exists()) {
            throw new Error('Members ya transactions ka data Firebase mein nahi mila.');
        }

        const members = membersSnapshot.val();
        const transactions = transactionsSnapshot.val();
        activeLoansData = activeLoansSnapshot.exists() ? activeLoansSnapshot.val() : {};
        
        for (const memberId in members) {
            if (members[memberId].status === 'Approved') {
                 memberDataMap.set(memberId, {
                    name: members[memberId].fullName,
                    imageUrl: members[memberId].profilePicUrl,
                });
            }
        }
        
        const processedTransactions = [];
        let idCounter = 0;
        for (const txId in transactions) {
            const tx = transactions[txId];
            const memberInfo = memberDataMap.get(tx.memberId);

            if (!memberInfo) continue;
            
            let record = {
                id: idCounter++, date: new Date(tx.date), name: memberInfo.name,
                imageUrl: memberInfo.imageUrl || logic.CONFIG.DEFAULT_PROFILE_PIC,
                loan: 0, payment: 0, sipPayment: 0, returnAmount: 0,
            };
            
            switch (tx.type) {
                case 'SIP': record.sipPayment = tx.amount || 0; break;
                case 'Loan Taken': record.loan = tx.amount || 0; break;
                case 'Loan Payment':
                    record.payment = (tx.principalPaid || 0) + (tx.interestPaid || 0);
                    record.returnAmount = tx.interestPaid || 0;
                    break;
                case 'Extra Payment': record.payment = tx.amount || 0; break;
                case 'Extra Withdraw': record.loan = tx.amount || 0; break;
                default: continue;
            }
            processedTransactions.push(record);
        }

        allData = processedTransactions.sort((a, b) => a.date - b.date || a.id - b.id);
        memberNames = [...new Set(allData.map(row => row.name))].sort();

        initializeDashboard();

    } catch (error) {
        console.error("Error fetching or processing data:", error);
        document.body.innerHTML = `<div style="text-align:center; padding:50px; color:red;">Failed to load data. Error: ${error.message}</div>`;
    } finally {
        document.getElementById('loader').classList.add('hidden');
    }
}


// --- UI and Display Functions ---

function initializeDashboard() {
    document.getElementById('dashboardContent').classList.remove('visually-hidden');
    document.getElementById('dashboardContent').classList.add('visible');
    populateMemberFilter();
    setupEventListeners();
    updateDisplay();
}

function setupEventListeners() {
    document.getElementById('memberFilter').addEventListener('change', updateDisplay);
    document.querySelectorAll('.modal').forEach(modal => {
        modal.querySelector('.modal-close')?.addEventListener('click', () => modal.classList.add('visually-hidden'));
        modal.addEventListener('click', (e) => { if (e.target === modal) modal.classList.add('visually-hidden') });
    });
    document.getElementById('showReturnRankBtn').addEventListener('click', displayReturnRanking);
    document.getElementById('showScoreRankBtn').addEventListener('click', displayScoreRanking);
    document.getElementById('showEligibilityRankBtn').addEventListener('click', displayEligibilityRanking);
    document.getElementById('profileImage').addEventListener('click', () => {
        const imageModal = document.getElementById('imageModal');
        document.getElementById('fullProfileImage').src = document.getElementById('profileImage').src;
        imageModal.classList.remove('visually-hidden');
    });
}

function populateMemberFilter() {
    const nameFilter = document.getElementById("memberFilter");
    memberNames.forEach(name => {
        const option = document.createElement('option');
        option.value = name;
        option.textContent = name;
        nameFilter.appendChild(option);
    });
}

function updateDisplay() {
    const selectedName = document.getElementById('memberFilter').value;
    const isCommunityView = selectedName === 'all';
    document.getElementById('growthChartSection').classList.toggle('hidden', !isCommunityView);
    document.getElementById('profitLogSection').classList.toggle('hidden', !isCommunityView);
    document.getElementById('memberSpecificStats').classList.toggle('hidden', isCommunityView);
    document.getElementById('memberHistorySection').classList.toggle('hidden', isCommunityView);
    if (isCommunityView) {
        renderGrowthChart();
        populateProfitLog();
    } else {
        populateMemberHistory(selectedName);
    }
    updateProfileCard(selectedName);
}

function updateProfileCard(name) {
    const profileImageEl = document.getElementById('profileImage');
    const profileNameEl = document.getElementById('profileName');
    let totalCapital = 0, totalLoan = 0, totalProfitEarned = 0;

    if (name === 'all') {
        allData.forEach(r => {
            totalCapital += r.sipPayment + r.payment - r.loan;
            totalLoan += r.loan;
        });
        totalProfitEarned = allData.reduce((sum, r) => sum + r.returnAmount, 0);
        profileNameEl.textContent = 'Community Overview';
        profileImageEl.src = logic.CONFIG.DEFAULT_PROFILE_PIC;
    } else {
        const dataToShow = allData.filter(r => r.name === name);
        totalCapital = dataToShow.reduce((sum, r) => sum + r.sipPayment + r.payment - r.loan, 0);
        totalLoan = dataToShow.reduce((sum, r) => sum + r.loan, 0);
        
        totalProfitEarned = logic.calculateTotalProfitForMember(name, allData, activeLoansData);
        const memberScores = logic.calculatePerformanceScore(name, new Date(), allData, activeLoansData);
        const score = memberScores.totalScore;
        const loanEligibility = logic.getLoanEligibility(name, score, allData);

        document.getElementById('profilePerformanceScore').textContent = score.toFixed(2);
        const limitEl = document.getElementById('profileLoanLimit');
        if(loanEligibility.eligible) {
            limitEl.textContent = `${loanEligibility.multiplier.toFixed(2)}x`;
            limitEl.classList.remove('negative');
        } else {
            limitEl.textContent = loanEligibility.reason;
            limitEl.classList.add('negative');
        }
        profileNameEl.textContent = name;
        const lastUserEntryWithImage = [...dataToShow].reverse().find(r => r.imageUrl);
        profileImageEl.src = lastUserEntryWithImage ? lastUserEntryWithImage.imageUrl : logic.CONFIG.DEFAULT_PROFILE_PIC;
    }

    document.getElementById('profileTotalCapital').textContent = `₹${totalCapital.toFixed(2)}`;
    document.getElementById('profileTotalLoan').textContent = `₹${totalLoan.toFixed(2)}`;
    document.getElementById('profileTotalProfit').textContent = `₹${totalProfitEarned.toFixed(2)}`;
}

function populateProfitLog() {
    const tableBody = document.querySelector("#profitLogTable tbody");
    tableBody.innerHTML = '';
    const profitEvents = allData.filter(r => r.returnAmount > 0);
    if (profitEvents.length === 0) {
        tableBody.innerHTML = `<tr class="no-data-row"><td colspan="5">No profit events found.</td></tr>`;
        return;
    }
    profitEvents.forEach(paymentRecord => {
        const result = logic.calculateProfitDistribution(paymentRecord, allData, activeLoansData);
        if (result && result.profit > 0) {
            const row = document.createElement('tr');
            row.innerHTML = `<td>${logic.formatDate(paymentRecord.date)}</td><td>${paymentRecord.name}</td><td>₹${result.relevantLoan.loan.toFixed(2)}</td><td class="profit-value">₹${result.profit.toFixed(2)}</td><td><button class="details-btn">View</button></td>`;
            row.querySelector('.details-btn').addEventListener('click', () => showDistributionModal(result));
            tableBody.appendChild(row);
        }
    });
}

function populateMemberHistory(memberName) {
    const tableBody = document.querySelector("#memberHistoryTable tbody");
    tableBody.innerHTML = '';
    const memberData = allData.filter(r => r.name === memberName);
    let balance = 0;
    if (memberData.length === 0) {
        tableBody.innerHTML = `<tr class="no-data-row"><td colspan="4">No transaction history found.</td></tr>`;
        return;
    }
    memberData.forEach(r => {
        let type = '', amount = 0, sign = '';
        if (r.sipPayment > 0) { type = 'sip'; amount = r.sipPayment; balance += amount; sign = '+'; }
        else if (r.loan > 0) { type = 'loan'; amount = r.loan; balance -= amount; sign = '-'; }
        else if (r.payment > 0) { type = 'payment'; amount = r.payment; balance += amount; sign = '+'; }
        else return;
        const row = document.createElement('tr');
        row.innerHTML = `<td>${logic.formatDate(r.date)}</td><td class="transaction-type ${type}">${type.toUpperCase()}</td><td>${sign} ₹${amount.toFixed(2)}</td><td>₹${balance.toFixed(2)}</td>`;
        tableBody.appendChild(row);
    });
}

function displayReturnRanking() {
    const listEl = document.getElementById('returnRankList');
    let memberProfits = memberNames.map(name => ({ name: name, totalProfit: logic.calculateTotalProfitForMember(name, allData, activeLoansData) }))
        .filter(member => member.totalProfit > 0).sort((a, b) => b.totalProfit - a.totalProfit);
    listEl.innerHTML = '';
    if (memberProfits.length === 0) listEl.innerHTML = '<li>No members have earned a return yet.</li>';
    else memberProfits.forEach((member, index) => {
        const li = document.createElement('li');
        li.innerHTML = `<span class="rank">${index + 1}.</span><span class="name">${member.name}</span><span class="share">+ ₹${member.totalProfit.toFixed(2)}</span><div class="button-group"><button class="btn-details-small">Details</button></div>`;
        li.querySelector('.btn-details-small').addEventListener('click', () => showCalculationDetails({type: 'total_profit', memberName: member.name}));
        listEl.appendChild(li);
    });
    document.getElementById('returnRankModal').classList.remove('visually-hidden');
}

function displayScoreRanking() {
    const tableBody = document.querySelector("#scoreRankTable tbody");
    let memberScores = memberNames.map(name => ({ name, scores: logic.calculatePerformanceScore(name, new Date(), allData, activeLoansData) }))
        .sort((a, b) => b.scores.totalScore - a.scores.totalScore);
    tableBody.innerHTML = '';
    memberScores.forEach((member, index) => {
        const row = document.createElement('tr');
        row.innerHTML = `<td>${index + 1}</td><td>${member.name}</td><td>${member.scores.totalScore.toFixed(2)}</td><td><div class="button-group"><button class="btn-details-small">Details</button></div></td>`;
        row.querySelector('.btn-details-small').addEventListener('click', () => showCalculationDetails({type: 'score', member: member}));
        tableBody.appendChild(row);
    });
    document.getElementById('scoreRankModal').classList.remove('visually-hidden');
}

function displayEligibilityRanking() {
    const tableBody = document.querySelector("#eligibilityRankTable tbody");
    let memberEligibility = memberNames.map(name => {
        const capital = allData.filter(r => r.name === name).reduce((sum, r) => sum + r.sipPayment + r.payment - r.loan, 0);
        const score = logic.calculatePerformanceScore(name, new Date(), allData, activeLoansData).totalScore;
        const eligibility = logic.getLoanEligibility(name, score, allData);
        return { name, capital, score, eligibility, maxLoan: eligibility.eligible ? capital * eligibility.multiplier : 0 };
    }).sort((a, b) => b.maxLoan - a.maxLoan);
    tableBody.innerHTML = '';
    memberEligibility.forEach(member => {
        const row = document.createElement('tr');
        let eligibilityText = member.eligibility.eligible ? `${member.eligibility.multiplier.toFixed(2)}x` : `<span class="negative">${member.eligibility.reason}</span>`;
        row.innerHTML = `<td>${member.name}</td><td>₹${member.capital.toFixed(2)}</td><td>${eligibilityText}</td><td>₹${member.maxLoan.toFixed(2)}</td><td><div class="button-group"><button class="btn-details-small">Details</button></div></td>`;
        row.querySelector('.btn-details-small').addEventListener('click', () => showCalculationDetails({type: 'eligibility', member: member}));
        tableBody.appendChild(row);
    });
    document.getElementById('eligibilityRankModal').classList.remove('visually-hidden');
}

/**
 * *** YAHAN DONO BADLAV KIYE GAYE HAIN ***
 * Sabhi prakar ke "Details" modal ke liye content generate karta hai.
 * @param {object} details - Details object jismein 'type' aur zaroori data ho.
 */
function showCalculationDetails(details) {
    const titleEl = document.getElementById('calculationDetailsTitle');
    const contentEl = document.getElementById('calculationDetailsContent');
    let html = '';

    // --- FIX 1: New Member Capital Score Display ---
    if (details.type === 'score') {
        const { name, scores } = details.member;
        titleEl.textContent = `Score Calculation for ${name}`;
        
        if (scores.isNewMemberRuleApplied) {
            // Naye sadasya ke liye: Base score aur 50% reduction dono dikhao
            html = `<div class="calc-row"><span class="calc-label">Capital Score (Base)</span> <span class="calc-value">${scores.originalCapitalScore.toFixed(2)}</span></div>`;
            html += `<div class="calc-row"><span class="calc-label" style="color:var(--negative-color);">New Member Rule (x50%)</span> <span class="calc-value">${scores.capitalScore.toFixed(2)}</span></div>`;
            
            html += `<div class="calc-row"><span class="calc-label">Consistency Score (Base)</span> <span class="calc-value">${scores.originalConsistencyScore.toFixed(2)}</span></div>`;
            html += `<div class="calc-row"><span class="calc-label" style="color:var(--negative-color);">New Member Rule (x50%)</span> <span class="calc-value">${scores.consistencyScore.toFixed(2)}</span></div>`;

            html += `<div class="calc-row"><span class="calc-label">Credit Behavior (Base)</span> <span class="calc-value">${scores.originalCreditScore.toFixed(2)}</span></div>`;
            html += `<div class="calc-row"><span class="calc-label" style="color:var(--negative-color);">New Member Rule (x50%)</span> <span class="calc-value">${scores.creditScore.toFixed(2)}</span></div>`;

        } else {
            // Purane sadasya ke liye
            html = `<div class="calc-row"><span class="calc-label">Capital Score (SIP Target)</span> <span class="calc-value">${scores.capitalScore.toFixed(2)}</span></div><div class="calc-formula">(Total SIP in 180d / ₹${logic.CONFIG.CAPITAL_SCORE_TARGET_SIP}) * 100</div>`;
            html += `<div class="calc-row"><span class="calc-label">Consistency Score (1-Yr)</span> <span class="calc-value">${scores.consistencyScore.toFixed(2)}</span></div>`;
            html += `<div class="calc-row"><span class="calc-label">Credit Behavior (1-Yr)</span> <span class="calc-value">${scores.creditScore.toFixed(2)}</span></div>`;
        }
        
        html += `<hr><div class="calc-row"><span class="calc-label">Weighted Capital (40%)</span> <span class="calc-value">${(scores.capitalScore * logic.CONFIG.CAPITAL_WEIGHT).toFixed(2)}</span></div><div class="calc-row"><span class="calc-label">Weighted Consistency (30%)</span> <span class="calc-value">${(scores.consistencyScore * logic.CONFIG.CONSISTENCY_WEIGHT).toFixed(2)}</span></div><div class="calc-row"><span class="calc-label">Weighted Credit (30%)</span> <span class="calc-value">${(scores.creditScore * logic.CONFIG.CREDIT_BEHAVIOR_WEIGHT).toFixed(2)}</span></div><div class="calc-final">Total Score: ${scores.totalScore.toFixed(2)}</div>`;
    
    // --- FIX 2: Profit Event Details Display ---
    } else if (details.type === 'profit_event') {
        const { member, profitEvent } = details;
        titleEl.textContent = `Profit Share for ${member.name}`;
        const sharePercentage = (member.totalSnapshotScore > 0) ? (member.snapshotScore / member.totalSnapshotScore) * 100 : 0;
        const initialShare = (sharePercentage / 100) * profitEvent.profit;
        html = `<div class="calc-row"><span class="calc-label">Loan From</span> <span class="calc-value">${profitEvent.relevantLoan.name}</span></div><div class="calc-row"><span class="calc-label">Total Profit from Loan</span> <span class="calc-value">₹${profitEvent.profit.toFixed(2)}</span></div><hr><div class="calc-row"><span class="calc-label">Your Score (at loan time)</span> <span class="calc-value">${member.snapshotScore.toFixed(2)}</span></div><div class="calc-row"><span class="calc-label">Total Community Score</span> <span class="calc-value">${member.totalSnapshotScore.toFixed(2)}</span></div><div class="calc-row"><span class="calc-label">Your Share (%)</span> <span class="calc-value">${sharePercentage.toFixed(2)}%</span></div><div class="calc-formula">(Your Score / Total Score) * 100</div><hr><div class="calc-row"><span class="calc-label">Initial Share</span> <span class="calc-value">₹${initialShare.toFixed(2)}</span></div>${member.multiplier !== 1 ? `<div class="calc-row"><span class="calc-label">Inactive Policy (x${member.multiplier})</span> <span class="calc-value">- ₹${(initialShare - member.share).toFixed(2)}</span></div>` : ''}<div class="calc-final">Final Profit: ₹${member.share.toFixed(2)}</div>`;
    
    } else if (details.type === 'total_profit') {
        titleEl.textContent = `Total Profit for ${details.memberName}`;
        let profitBreakdownHtml = '';
        let totalProfit = 0;
        allData.filter(r => r.returnAmount > 0).forEach(event => {
            const result = logic.calculateProfitDistribution(event, allData, activeLoansData);
            const share = result?.distribution.find(d => d.name === details.memberName);
            if (share) {
                totalProfit += share.share;
                profitBreakdownHtml += `<div class="calc-row"><span class="calc-label">From ${event.name}'s loan (${logic.formatDate(event.date)})</span> <span class="calc-value">+ ₹${share.share.toFixed(2)}</span></div>`;
            }
        });
        if (!profitBreakdownHtml) profitBreakdownHtml = '<div class="calc-row"><span class="calc-label">No profit earned yet.</span></div>';
        html = `${profitBreakdownHtml}<div class="calc-final">Total Profit: ₹${totalProfit.toFixed(2)}</div>`;

    } else if (details.type === 'eligibility') {
        const { name, score, eligibility } = details.member;
        titleEl.textContent = `Eligibility for ${name}`;
        if(eligibility.eligible) {
            html = `<div class="calc-row"><span class="calc-label">Your Performance Score</span> <span class="calc-value">${score.toFixed(2)}</span></div><hr><p style="font-size:0.9em; text-align:center; color: var(--text-light);">Aapka multiplier aapke score ke aadhar par scale hota hai.</p><div class="calc-final">Your Multiplier: ${eligibility.multiplier.toFixed(2)}x</div>`;
        } else {
             html = `<div class="calc-final" style="color:var(--negative-color);">${eligibility.reason}</div>`;
        }
    }
    contentEl.innerHTML = html;
    document.getElementById('calculationDetailsModal').classList.remove('visually-hidden');
}

function renderGrowthChart() {
    const ctx = document.getElementById('growthChart').getContext('2d');
    const { labels, capital, loans, profits } = calculateGrowthData();
    if (growthChartInstance) growthChartInstance.destroy();
    growthChartInstance = new Chart(ctx, { type: 'line', data: { labels, datasets: [ { label: 'Total Capital', data: capital, borderColor: 'rgba(52, 152, 219, 1)', backgroundColor: 'rgba(52, 152, 219, 0.1)', fill: true, tension: 0.1 }, { label: 'Total Loans', data: loans, borderColor: 'rgba(231, 76, 60, 1)', backgroundColor: 'rgba(231, 76, 60, 0.1)', fill: true, tension: 0.1 }, { label: 'Total Profit', data: profits, borderColor: 'rgba(39, 174, 96, 1)', backgroundColor: 'rgba(39, 174, 96, 0.1)', fill: true, tension: 0.1 } ]}, options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true, ticks: { callback: value => `₹${value}` } } }, plugins: { tooltip: { callbacks: { label: context => `${context.dataset.label}: ₹${context.parsed.y.toFixed(2)}` } } } } });
}

function calculateGrowthData() {
    const snapshots = {}; let cumulativeCapital = 0, cumulativeLoan = 0, cumulativeProfit = 0;
    allData.forEach(r => {
        cumulativeCapital += r.sipPayment + r.payment - r.loan; cumulativeLoan += r.loan; cumulativeProfit += r.returnAmount;
        const monthKey = r.date.toLocaleString('en-GB', { month: 'short', year: 'numeric' });
        snapshots[monthKey] = { capital: cumulativeCapital, loans: cumulativeLoan, profits: cumulativeProfit, date: new Date(r.date.getFullYear(), r.date.getMonth(), 1) };
    });
    const sortedKeys = Object.keys(snapshots).sort((a,b) => snapshots[a].date - snapshots[b].date);
    return { labels: sortedKeys, capital: sortedKeys.map(key => snapshots[key].capital), loans: sortedKeys.map(key => snapshots[key].loans), profits: sortedKeys.map(key => snapshots[key].profits) };
}

function showDistributionModal(profitEvent) {
    const modal = document.getElementById('detailsModal'); const listEl = document.getElementById('distributionDetails'); listEl.innerHTML = '';
    const ctx = document.getElementById('distributionChart').getContext('2d');
    if (distributionChartInstance) distributionChartInstance.destroy();
    const { distribution } = profitEvent;
    if (!distribution || distribution.length === 0) { listEl.innerHTML = '<li>No beneficiaries found.</li>'; } 
    else {
        const labels = distribution.map(d => d.name); const data = distribution.map(d => d.share.toFixed(2));
        distribution.forEach((item, index) => {
            const li = document.createElement('li');
            li.innerHTML = `<span class="rank">${index + 1}.</span><span class="name">${item.name}</span><span class="share">+ ₹${item.share.toFixed(2)}</span><div class="button-group"><button class="btn-details-small">Details</button></div>`;
            li.querySelector('.btn-details-small').addEventListener('click', () => showCalculationDetails({type: 'profit_event', member: item, profitEvent: profitEvent}));
            listEl.appendChild(li);
        });
        distributionChartInstance = new Chart(ctx, { type: 'bar', data: { labels, datasets: [{ label: 'Profit Share (₹)', data, backgroundColor: 'rgba(52, 152, 219, 0.7)', borderColor: 'rgba(52, 152, 219, 1)', borderWidth: 1 }] }, options: { responsive: true, indexAxis: 'y', scales: { x: { beginAtZero: true, title: { display: true, text: 'Amount (₹)' } } }, plugins: { legend: { display: false } } } });
    }
    modal.classList.remove('visually-hidden');
}


