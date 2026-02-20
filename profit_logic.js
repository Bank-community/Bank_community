// ==========================================
// MASTER PROFIT LOGIC (v4.0 - LIVE SCANNER MODE)
// Feature: Processes one member, appends card immediately, then moves to next.
// keeps user engaged with "Processing..." status.
// ==========================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-app.js";
import { getDatabase, ref, get } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-database.js";

// --- GLOBAL VARIABLES ---
let db;
let rawMembers = {};
let rawTransactions = {};
let rawActiveLoans = {};
let allTransactionsList = [];
let memberDataMap = new Map();
let transactionsByMember = {}; // Optimization Cache

// Default Image
const DEFAULT_IMG = 'https://placehold.co/200x200/E0E7FF/4F46E5?text=User';

// --- INITIALIZATION ---
document.addEventListener("DOMContentLoaded", initDashboard);

async function initDashboard() {
    try {
        // 1. Setup UI for "Loading"
        showSystemLoader("Connecting to Database...");

        // 2. Fetch Config
        const response = await fetch('/api/firebase-config');
        if (!response.ok) throw new Error('Config load failed');
        const config = await response.json();
        
        // 3. Init Firebase
        const app = initializeApp(config);
        db = getDatabase(app);

        // 4. Fetch Data
        await fetchAllData();

    } catch (error) {
        console.error("Init Error:", error);
        showError("System Error: " + error.message);
    }
}

async function fetchAllData() {
    try {
        showSystemLoader("Downloading Transactions...");
        
        const [membersSnap, txSnap, loansSnap] = await Promise.all([
            get(ref(db, 'members')),
            get(ref(db, 'transactions')),
            get(ref(db, 'activeLoans'))
        ]);

        if (!membersSnap.exists()) throw new Error("No members found.");

        rawMembers = membersSnap.val();
        rawTransactions = txSnap.exists() ? txSnap.val() : {};
        rawActiveLoans = loansSnap.exists() ? loansSnap.val() : {};

        // Start the Processing Pipeline
        prepareAndStartQueue();

    } catch (error) {
        showError(error.message);
    }
}

// --- STEP 1: PREPARE DATA ---
function prepareAndStartQueue() {
    showSystemLoader("Organizing Data...");
    
    // Clear Previous Data
    allTransactionsList = [];
    memberDataMap.clear();
    transactionsByMember = {};

    // 1. Map Basic Info
    for (const id in rawMembers) {
        if (rawMembers[id].status === 'Approved') {
            memberDataMap.set(id, {
                name: rawMembers[id].fullName,
                imageUrl: rawMembers[id].profilePicUrl,
                guarantorName: rawMembers[id].guarantorName
            });
            transactionsByMember[id] = [];
        }
    }

    // 2. Process Transactions
    let idCounter = 0;
    for (const txId in rawTransactions) {
        const tx = rawTransactions[txId];
        const memberInfo = memberDataMap.get(tx.memberId);
        if (!memberInfo) continue;

        let record = {
            id: idCounter++,
            date: new Date(tx.date),
            name: memberInfo.name,
            imageUrl: memberInfo.imageUrl || DEFAULT_IMG,
            memberId: tx.memberId,
            loan: 0, payment: 0, sipPayment: 0, returnAmount: 0,
            extraBalance: 0, extraWithdraw: 0, loanType: null,
            transactionId: txId
        };

        switch (tx.type) {
            case 'SIP': record.sipPayment = tx.amount || 0; break;
            case 'Loan Taken': record.loan = tx.amount || 0; record.loanType = 'Loan'; break;
            case 'Loan Payment':
                record.payment = (tx.principalPaid || 0) + (tx.interestPaid || 0);
                record.returnAmount = tx.interestPaid || 0;
                break;
            case 'Extra Payment': record.extraBalance = tx.amount || 0; break;
            case 'Extra Withdraw': record.extraWithdraw = tx.amount || 0; break;
            default: continue;
        }
        allTransactionsList.push(record);
        
        if(transactionsByMember[tx.memberId]) {
            transactionsByMember[tx.memberId].push(record);
        }
    }
    // Sort globally for correct calculation order
    allTransactionsList.sort((a, b) => a.date - b.date || a.id - b.id);

    // 3. Get List of Member IDs to Process
    const memberIdsToProcess = Object.keys(rawMembers).filter(id => rawMembers[id].status === 'Approved');

    // Hide Full Screen Loader
    document.getElementById('loader-overlay').classList.add('hidden');
    
    // Inject "Scanner/Progress Bar" into the Grid area
    injectScannerUI(memberIdsToProcess.length);

    // Start Queue
    startLiveQueue(memberIdsToProcess);
}

// --- UI HELPER: SCANNER BAR ---
function injectScannerUI(totalCount) {
    const grid = document.getElementById('members-grid');
    grid.innerHTML = ''; // Clear everything
    
    // Create a status bar at the top of the grid
    const scanner = document.createElement('div');
    scanner.id = 'live-scanner-status';
    scanner.className = 'col-span-1 md:col-span-2 lg:col-span-3 mb-6 bg-white p-4 rounded-xl border border-blue-100 shadow-sm flex flex-col gap-2';
    scanner.innerHTML = `
        <div class="flex justify-between items-center">
            <div class="flex items-center gap-3">
                <div class="animate-spin h-5 w-5 border-2 border-blue-600 border-t-transparent rounded-full"></div>
                <span class="font-bold text-[#002366] text-sm" id="scanner-text">Initializing...</span>
            </div>
            <span class="text-xs font-bold text-gray-500" id="scanner-count">0/${totalCount}</span>
        </div>
        <div class="w-full bg-gray-200 rounded-full h-1.5 mt-1">
            <div id="scanner-bar" class="bg-[#D4AF37] h-1.5 rounded-full transition-all duration-300" style="width: 0%"></div>
        </div>
    `;
    grid.appendChild(scanner);
}

// --- STEP 2: LIVE QUEUE (The Curiosity Engine) ---
let communityStats = {
    totalMembers: 0,
    totalSip: 0,
    totalProfitDistributed: 0,
    totalWalletLiability: 0
};

// Global list for sorting later
let renderedMembersCache = [];

function startLiveQueue(memberIds) {
    let index = 0;
    const total = memberIds.length;

    function processNext() {
        if (index >= total) {
            // FINISHED
            document.getElementById('scanner-text').textContent = "Analysis Complete ✅";
            document.getElementById('scanner-text').classList.add('text-green-600');
            document.querySelector('.animate-spin').classList.remove('animate-spin');
            
            // Remove scanner after 2 seconds
            setTimeout(() => {
                const scanner = document.getElementById('live-scanner-status');
                if(scanner) scanner.remove();
            }, 2000);
            return;
        }

        const id = memberIds[index];
        const m = rawMembers[id];

        // 1. Update UI to show who we are processing (Creating Curiosity)
        document.getElementById('scanner-text').textContent = `Analysing: ${m.fullName}...`;
        document.getElementById('scanner-count').textContent = `${index + 1}/${total}`;
        document.getElementById('scanner-bar').style.width = `${((index + 1) / total) * 100}%`;

        // Small delay to let UI render the text change (Essential for "Visual" feel)
        setTimeout(() => {
            try {
                // --- CALCULATION START ---
                const memberTx = transactionsByMember[id] || [];
                const totalSip = memberTx.reduce((sum, t) => sum + t.sipPayment, 0);
                
                // Heavy Math Functions
                const walletData = calculateTotalExtraBalance(id, m.fullName);
                const lifetimeProfit = calculateTotalProfitForMember(m.fullName);
                
                let scoreObj = { totalScore: 0 };
                if (typeof calculatePerformanceScore === 'function') {
                    scoreObj = calculatePerformanceScore(m.fullName, new Date(), allTransactionsList, rawActiveLoans);
                }
                // --- CALCULATION END ---

                // Create Data Object
                const memberObj = {
                    id: id,
                    name: m.fullName,
                    img: m.profilePicUrl || DEFAULT_IMG,
                    sip: totalSip,
                    profit: lifetimeProfit,
                    walletBalance: walletData.total,
                    walletHistory: walletData.history,
                    score: scoreObj.totalScore || 0
                };

                // Add to Cache
                renderedMembersCache.push(memberObj);

                // --- APPEND CARD IMMEDIATELY ---
                appendMemberCard(memberObj);

                // Update Stats Live
                communityStats.totalMembers++;
                communityStats.totalSip += totalSip;
                communityStats.totalProfitDistributed += lifetimeProfit;
                communityStats.totalWalletLiability += walletData.total;
                
                // Update Top Header every 1 member (Live feel)
                updateSummaryUI(communityStats);

            } catch (err) {
                console.error(`Error on ${m.fullName}:`, err);
            }

            // Move to next
            index++;
            
            // Speed Control: 30ms is fast enough to look cool, slow enough to not freeze
            setTimeout(processNext, 30); 

        }, 10); // Tiny delay for DOM paint
    }

    processNext();
}

// --- DOM APPEND FUNCTION ---
function appendMemberCard(m) {
    const grid = document.getElementById('members-grid');
    
    // Determine Score Color
    let scoreColor = 'text-gray-400';
    if(m.score >= 80) scoreColor = 'text-green-500';
    else if(m.score >= 50) scoreColor = 'text-yellow-500';
    else scoreColor = 'text-red-500';

    const card = document.createElement('div');
    card.className = 'glass-card p-5 relative overflow-hidden group hover:shadow-xl transition-all animate-fade-in-up';
    card.id = `card-${m.id}`;
    
    // Store data attributes for Sorting later
    card.dataset.name = m.name.toLowerCase();
    card.dataset.profit = m.profit;
    card.dataset.score = m.score;
    card.dataset.balance = m.walletBalance;

    // Attach History to Window
    window[`history_${m.id}`] = m.walletHistory;

    card.innerHTML = `
        <div class="flex items-center gap-4 mb-4">
            <img src="${m.img}" class="w-16 h-16 rounded-full object-cover border-2 border-gray-100 group-hover:border-[#D4AF37] transition-colors">
            <div>
                <h3 class="font-bold text-lg text-[#002366] leading-tight">${m.name}</h3>
                <div class="flex items-center gap-2 text-xs font-semibold mt-1">
                    <span class="${scoreColor}"><i class="fas fa-tachometer-alt"></i> Score: ${m.score.toFixed(0)}</span>
                </div>
            </div>
        </div>
        
        <div class="space-y-2 text-sm">
            <div class="flex justify-between border-b border-gray-100 pb-1">
                <span class="text-gray-500">Total SIP</span>
                <span class="font-bold text-[#002366]">${formatCurrency(m.sip)}</span>
            </div>
            <div class="flex justify-between border-b border-gray-100 pb-1">
                <span class="text-gray-500">Lifetime Profit</span>
                <span class="font-bold text-[#D4AF37]">+ ${formatCurrency(m.profit)}</span>
            </div>
            <div class="flex justify-between pt-1">
                <span class="text-gray-500">Wallet Bal</span>
                <span class="font-bold ${m.walletBalance > 0 ? 'text-green-600' : 'text-gray-400'}">
                    ${formatCurrency(m.walletBalance)}
                </span>
            </div>
        </div>

        <button onclick="showLocalHistory('${m.id}')" class="mt-4 w-full py-2 rounded-lg bg-gray-50 text-xs font-bold text-gray-500 hover:bg-[#002366] hover:text-white transition-colors uppercase tracking-wide">
            View History
        </button>
    `;

    // Append at the end (User sees list growing)
    grid.appendChild(card);
}

// --- UI UTILS ---
function showSystemLoader(msg) {
    const loader = document.getElementById('loader-overlay');
    const text = loader.querySelector('h2');
    if(text) text.textContent = msg;
    loader.classList.remove('hidden');
}

function updateSummaryUI(stats) {
    document.getElementById('total-members').textContent = stats.totalMembers;
    document.getElementById('total-community-sip').textContent = formatCurrency(stats.totalSip);
    document.getElementById('total-community-profit').textContent = formatCurrency(stats.totalProfitDistributed);
    document.getElementById('total-wallet-liability').textContent = formatCurrency(stats.totalWalletLiability);
}

function formatCurrency(amount) {
    return `₹${amount.toLocaleString('en-IN', {minimumFractionDigits: 0, maximumFractionDigits: 0})}`;
}

function showError(msg) {
    document.getElementById('loader-overlay').classList.add('hidden');
    const toast = document.getElementById('error-toast');
    document.getElementById('error-msg').textContent = msg;
    toast.classList.remove('translate-y-20');
}

// --- INTERACTIVITY (Modal & Search) ---
window.showLocalHistory = (id) => {
    const history = window[`history_${id}`] || [];
    // If not found in window, try cache
    const cachedMember = renderedMembersCache.find(m => m.id === id);
    const dataToShow = history.length ? history : (cachedMember ? cachedMember.walletHistory : []);

    // Get Name
    const cardTitle = document.querySelector(`#card-${id} h3`);
    const name = cardTitle ? cardTitle.innerText : "Member";

    document.getElementById('modal-member-name').textContent = name;
    const list = document.getElementById('modal-history-list');
    list.innerHTML = '';

    if (!dataToShow || dataToShow.length === 0) {
        list.innerHTML = '<p class="text-center text-gray-400 text-xs italic">No wallet history found.</p>';
    } else {
        [...dataToShow].reverse().forEach(h => {
            const isCredit = h.amount > 0;
            const row = document.createElement('div');
            row.className = 'flex justify-between items-center p-3 bg-gray-50 rounded-lg border border-gray-100';
            row.innerHTML = `
                <div>
                    <p class="font-bold text-xs text-gray-700 capitalize">${h.type.replace(/_/g, ' ')}</p>
                    <p class="text-[10px] text-gray-400">${new Date(h.date).toLocaleDateString('en-GB')}</p>
                </div>
                <span class="font-bold text-sm ${isCredit ? 'text-green-600' : 'text-red-500'}">
                    ${isCredit ? '+' : ''}${formatCurrency(h.amount)}
                </span>
            `;
            list.appendChild(row);
        });
    }
    document.getElementById('history-modal').classList.remove('hidden');
};

document.getElementById('close-modal').addEventListener('click', () => {
    document.getElementById('history-modal').classList.add('hidden');
});

// Search & Sort (Live filtering)
document.getElementById('search-input').addEventListener('input', (e) => {
    const term = e.target.value.toLowerCase();
    document.querySelectorAll('[id^="card-"]').forEach(card => {
        const name = card.dataset.name || "";
        card.style.display = name.includes(term) ? "block" : "none";
    });
});

document.getElementById('sort-select').addEventListener('change', (e) => {
    const type = e.target.value;
    const grid = document.getElementById('members-grid');
    
    // Convert HTMLCollection to Array, EXCLUDING the scanner
    const cards = Array.from(grid.children).filter(child => child.id.startsWith('card-'));
    const scanner = document.getElementById('live-scanner-status');

    cards.sort((a, b) => {
        let valA = parseFloat(a.dataset[type] || 0);
        let valB = parseFloat(b.dataset[type] || 0);
        if(type === 'name') return (a.dataset.name || '').localeCompare(b.dataset.name || '');
        return valB - valA; 
    });

    // Re-append in order (Scanner stays top if exists)
    if(scanner) grid.appendChild(scanner);
    cards.forEach(card => grid.appendChild(card));
});


// ==========================================
// 🔻 COPIED MATH LOGIC (EXACT SYNC) 🔻
// ==========================================

function calculateTotalExtraBalance(memberId, memberFullName) {
    const history = [];
    const profitEvents = allTransactionsList.filter(r => r.returnAmount > 0);
    
    // Heavy Loop - but optimized by running inside queue
    profitEvents.forEach(paymentRecord => {
        const result = calculateProfitDistribution(paymentRecord);
        const memberShare = result?.distribution.find(d => d.name === memberFullName);
        if(memberShare && memberShare.share > 0) {
            history.push({ type: memberShare.type || 'profit', from: paymentRecord.name, date: paymentRecord.date, amount: memberShare.share });
        }
    });

    const manualAdjustments = allTransactionsList.filter(tx => tx.memberId === memberId && (tx.extraBalance > 0 || tx.extraWithdraw > 0));
    manualAdjustments.forEach(tx => {
        if (tx.extraBalance > 0) history.push({ type: 'manual_credit', from: 'Admin', date: tx.date, amount: tx.extraBalance });
        if (tx.extraWithdraw > 0) history.push({ type: 'withdrawal', from: 'Admin', date: tx.date, amount: -tx.extraWithdraw });
    });

    history.sort((a,b) => a.date - b.date);
    const total = history.reduce((acc, item) => acc + item.amount, 0);
    return { total, history };
}

function calculateTotalProfitForMember(memberName) { 
    return allTransactionsList.reduce((totalProfit, transaction) => { 
        if (transaction.returnAmount > 0) { 
            const result = calculateProfitDistribution(transaction); 
            const memberShare = result?.distribution.find(d => d.name === memberName); 
            if (memberShare) totalProfit += memberShare.share; 
        } 
        return totalProfit; 
    }, 0); 
}

function calculateProfitDistribution(paymentRecord) { 
    const totalInterest = paymentRecord.returnAmount; if (totalInterest <= 0) return null; 
    const distribution = [];
    
    const selfShare = totalInterest * 0.10;
    distribution.push({ name: paymentRecord.name, share: selfShare, type: 'Self Return (10%)' });
    
    const payerMemberInfo = memberDataMap.get(paymentRecord.memberId);
    if (payerMemberInfo && payerMemberInfo.guarantorName && payerMemberInfo.guarantorName !== 'Xxxxx') {
            distribution.push({ name: payerMemberInfo.guarantorName, share: totalInterest * 0.10, type: 'Guarantor Commission (10%)' });
    }
    
    const communityPool = totalInterest * 0.70;
    const userLoansBeforePayment = allTransactionsList.filter(r => r.name === paymentRecord.name && r.loan > 0 && r.date < paymentRecord.date && r.loanType === 'Loan' ); 
    
    if (userLoansBeforePayment.length === 0) return { distribution };
    
    const relevantLoan = userLoansBeforePayment.pop(); 
    const loanDate = relevantLoan.date; 
    
    const snapshotScores = {}; 
    let totalScoreInSnapshot = 0; 
    
    // Performance Optimization: Only filter relevant transactions once
    const membersInSystemAtLoanDate = [...new Set(allTransactionsList.filter(r => r.date <= loanDate).map(r => r.name))]; 
    
    membersInSystemAtLoanDate.forEach(name => { 
        if (name === paymentRecord.name) return; 
        if (typeof calculatePerformanceScore === 'function') {
            const scoreObject = calculatePerformanceScore(name, loanDate, allTransactionsList, rawActiveLoans); 
            if (scoreObject.totalScore > 0) { 
                snapshotScores[name] = scoreObject; 
                totalScoreInSnapshot += scoreObject.totalScore; 
            } 
        }
    }); 
    
    const INACTIVE_DAYS_LEVEL_1 = 180;
    const INACTIVE_MULTIPLIER_1 = 0.90;
    const INACTIVE_DAYS_LEVEL_2 = 365;
    const INACTIVE_MULTIPLIER_2 = 0.75;

    if (totalScoreInSnapshot > 0) {
        for (const memberName in snapshotScores) { 
            let memberShare = (snapshotScores[memberName].totalScore / totalScoreInSnapshot) * communityPool; 
            const lastLoanDate = allTransactionsList.filter(r => r.name === memberName && r.loan > 0 && r.date <= loanDate && r.loanType === 'Loan').pop()?.date;
            const daysSinceLastLoan = lastLoanDate ? (loanDate - lastLoanDate) / (1000 * 3600 * 24) : Infinity; 
            let appliedMultiplier = 1.0; 
            if (daysSinceLastLoan > INACTIVE_DAYS_LEVEL_2) appliedMultiplier = INACTIVE_MULTIPLIER_2; 
            else if (daysSinceLastLoan > INACTIVE_DAYS_LEVEL_1) appliedMultiplier = INACTIVE_MULTIPLIER_1; 
            memberShare *= appliedMultiplier; 
            if (memberShare > 0) distribution.push({ name: memberName, share: memberShare, type: 'Community Profit' }); 
        } 
    }
    return { distribution }; 
}
