// ==========================================
// MASTER PROFIT LOGIC (v3.0 - ANTI-CRASH QUEUE)
// Solution: Calculates 1 member -> Waits -> Next member
// Prevents UI Freezing on mobile devices
// ==========================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-app.js";
import { getDatabase, ref, get } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-database.js";

// --- GLOBAL STATE ---
let db;
let rawMembers = {};
let rawTransactions = {};
let rawActiveLoans = {};
let allTransactionsList = []; 
let memberDataMap = new Map(); 

// Optimization Cache
let transactionsByMember = {}; // To speed up filtering

const DEFAULT_IMG = 'https://placehold.co/200x200/E0E7FF/4F46E5?text=User';

// --- INITIALIZATION ---
document.addEventListener("DOMContentLoaded", initDashboard);

async function initDashboard() {
    try {
        const response = await fetch('/api/firebase-config');
        if (!response.ok) throw new Error('Config load failed');
        const config = await response.json();
        
        const app = initializeApp(config);
        db = getDatabase(app);

        await fetchAllData();

    } catch (error) {
        console.error("Init Error:", error);
        document.getElementById('members-grid').innerHTML = `<p class="text-red-500 text-center col-span-3">System Error: ${error.message}</p>`;
        document.getElementById('loader-overlay').classList.add('hidden');
    }
}

async function fetchAllData() {
    try {
        const [membersSnap, txSnap, loansSnap] = await Promise.all([
            get(ref(db, 'members')),
            get(ref(db, 'transactions')),
            get(ref(db, 'activeLoans'))
        ]);

        if (!membersSnap.exists()) throw new Error("No members found.");

        rawMembers = membersSnap.val();
        rawTransactions = txSnap.exists() ? txSnap.val() : {};
        rawActiveLoans = loansSnap.exists() ? loansSnap.val() : {};

        // Start Processing
        processBasicData(); 

    } catch (error) {
        console.error(error);
        document.getElementById('loader-overlay').classList.add('hidden');
    }
}

// --- STEP 1: PREPARE DATA & SHOW SKELETONS ---
function processBasicData() {
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
            // Init optimization array
            transactionsByMember[id] = [];
        }
    }

    // 2. Process Transactions & Group them (Optimization)
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
        
        // Push to grouped array for speed
        if(transactionsByMember[tx.memberId]) {
            transactionsByMember[tx.memberId].push(record);
        }
    }
    allTransactionsList.sort((a, b) => a.date - b.date || a.id - b.id);

    // 3. Render "Waiting" Cards
    const grid = document.getElementById('members-grid');
    grid.innerHTML = '';
    
    let memberIds = [];

    for (const id in rawMembers) {
        const m = rawMembers[id];
        if (m.status !== 'Approved') continue;
        
        memberIds.push(id); 

        const card = document.createElement('div');
        card.id = `card-${id}`;
        card.className = 'glass-card p-5 relative overflow-hidden transition-all opacity-80';
        // Simple Skeleton Layout
        card.innerHTML = `
            <div class="flex items-center gap-4 mb-4">
                <img src="${m.profilePicUrl || DEFAULT_IMG}" class="w-16 h-16 rounded-full object-cover border-2 border-gray-100">
                <div>
                    <h3 class="font-bold text-lg text-[#002366] leading-tight">${m.fullName}</h3>
                    <div class="flex items-center gap-2 text-xs font-semibold mt-1">
                        <span class="text-orange-500 animate-pulse"><i class="fas fa-clock"></i> Waiting...</span>
                    </div>
                </div>
            </div>
        `;
        grid.appendChild(card);
    }

    document.getElementById('loader-overlay').classList.add('hidden');

    // START THE QUEUE
    startSafeQueue(memberIds);
}

// --- STEP 2: THE "SLOW & SAFE" QUEUE ---
let communityStats = {
    totalMembers: 0,
    totalSip: 0,
    totalProfitDistributed: 0,
    totalWalletLiability: 0
};

function startSafeQueue(memberIds) {
    let index = 0;

    function processNext() {
        if (index >= memberIds.length) {
            console.log("✅ All members calculated.");
            return;
        }

        const id = memberIds[index];
        const m = rawMembers[id];

        try {
            // --- HEAVY MATH START ---
            // Use pre-grouped transactions for SIP (Fast)
            const memberTx = transactionsByMember[id] || [];
            const totalSip = memberTx.reduce((sum, t) => sum + t.sipPayment, 0);
            
            let walletData = { total: 0, history: [] };
            let lifetimeProfit = 0;
            let scoreObj = { totalScore: 0 };

            // Calculate complex stats
            walletData = calculateTotalExtraBalance(id, m.fullName);
            lifetimeProfit = calculateTotalProfitForMember(m.fullName);
            
            if (typeof calculatePerformanceScore === 'function') {
                scoreObj = calculatePerformanceScore(m.fullName, new Date(), allTransactionsList, rawActiveLoans);
            }
            // --- HEAVY MATH END ---

            // Update UI
            updateMemberCard(id, m, totalSip, lifetimeProfit, walletData, scoreObj);

            // Update Stats
            communityStats.totalMembers++;
            communityStats.totalSip += totalSip;
            communityStats.totalProfitDistributed += lifetimeProfit;
            communityStats.totalWalletLiability += walletData.total;
            
            // Only update top header every 3 members to save render power
            if (index % 3 === 0 || index === memberIds.length - 1) {
                updateSummaryUI(communityStats);
            }

        } catch (err) {
            console.error(`Error calculating ${m.fullName}:`, err);
            const card = document.getElementById(`card-${id}`);
            if(card) card.innerHTML += `<div class="text-red-500 text-xs">Calc Error</div>`;
        }

        index++;

        // 🛑 CRITICAL PAUSE: Wait 50ms before next loop
        // This gives the phone time to breathe.
        setTimeout(processNext, 50); 
    }

    // Start the first one
    processNext();
}

// --- RENDER CARD FINAL ---
function updateMemberCard(id, m, sip, profit, walletData, scoreObj) {
    const card = document.getElementById(`card-${id}`);
    if (!card) return;

    // Determine Score Color
    let scoreColor = 'text-gray-400';
    let scoreVal = scoreObj.totalScore || 0;
    if(scoreVal >= 80) scoreColor = 'text-green-500';
    else if(scoreVal >= 50) scoreColor = 'text-yellow-500';
    else scoreColor = 'text-red-500';

    // Store data for sort
    card.dataset.name = m.fullName.toLowerCase();
    card.dataset.profit = profit;
    card.dataset.score = scoreVal;
    card.dataset.balance = walletData.total;

    // Attach history
    window[`history_${id}`] = walletData.history;

    // Remove opacity
    card.classList.remove('opacity-80');
    
    card.innerHTML = `
        <div class="flex items-center gap-4 mb-4">
            <img src="${m.profilePicUrl || DEFAULT_IMG}" class="w-16 h-16 rounded-full object-cover border-2 border-gray-100 group-hover:border-[#D4AF37] transition-colors">
            <div>
                <h3 class="font-bold text-lg text-[#002366] leading-tight">${m.fullName}</h3>
                <div class="flex items-center gap-2 text-xs font-semibold mt-1">
                    <span class="${scoreColor}"><i class="fas fa-tachometer-alt"></i> Score: ${scoreVal.toFixed(0)}</span>
                </div>
            </div>
        </div>
        
        <div class="space-y-2 text-sm">
            <div class="flex justify-between border-b border-gray-100 pb-1">
                <span class="text-gray-500">Total SIP</span>
                <span class="font-bold text-[#002366]">${formatCurrency(sip)}</span>
            </div>
            <div class="flex justify-between border-b border-gray-100 pb-1">
                <span class="text-gray-500">Lifetime Profit</span>
                <span class="font-bold text-[#D4AF37]">+ ${formatCurrency(profit)}</span>
            </div>
            <div class="flex justify-between pt-1">
                <span class="text-gray-500">Wallet Bal</span>
                <span class="font-bold ${walletData.total > 0 ? 'text-green-600' : 'text-gray-400'}">
                    ${formatCurrency(walletData.total)}
                </span>
            </div>
        </div>

        <button onclick="showLocalHistory('${id}')" class="mt-4 w-full py-2 rounded-lg bg-gray-50 text-xs font-bold text-gray-500 hover:bg-[#002366] hover:text-white transition-colors uppercase tracking-wide">
            View History
        </button>
    `;
}

// --- UI UPDATERS ---
function updateSummaryUI(stats) {
    document.getElementById('total-members').textContent = stats.totalMembers;
    document.getElementById('total-community-sip').textContent = formatCurrency(stats.totalSip);
    document.getElementById('total-community-profit').textContent = formatCurrency(stats.totalProfitDistributed);
    document.getElementById('total-wallet-liability').textContent = formatCurrency(stats.totalWalletLiability);
}

// --- INTERACTIVITY ---
window.showLocalHistory = (id) => {
    const history = window[`history_${id}`] || [];
    const memberName = document.querySelector(`#card-${id} h3`).innerText;
    
    document.getElementById('modal-member-name').textContent = memberName;
    const list = document.getElementById('modal-history-list');
    list.innerHTML = '';

    if (history.length === 0) {
        list.innerHTML = '<p class="text-center text-gray-400 text-xs italic">No wallet history found.</p>';
    } else {
        [...history].reverse().forEach(h => {
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

// Search & Sort (Updated)
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
    const cards = Array.from(grid.children);

    cards.sort((a, b) => {
        let valA = parseFloat(a.dataset[type] || 0);
        let valB = parseFloat(b.dataset[type] || 0);
        if(type === 'name') return (a.dataset.name || '').localeCompare(b.dataset.name || '');
        return valB - valA; // Descending
    });

    cards.forEach(card => grid.appendChild(card));
});


// ==========================================
// 🔻 COPIED MATH LOGIC (UNCHANGED) 🔻
// ==========================================

function calculateTotalExtraBalance(memberId, memberFullName) {
    const history = [];
    // Using filtered list inside loop is heavy, but necessary for accuracy with this logic structure
    const profitEvents = allTransactionsList.filter(r => r.returnAmount > 0);
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

function formatCurrency(amount) {
    return `₹${amount.toLocaleString('en-IN', {minimumFractionDigits: 0, maximumFractionDigits: 0})}`;
}
