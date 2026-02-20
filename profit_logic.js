// ==========================================
// MASTER PROFIT LOGIC (v1.0)
// Syncs exactly with User Panel Logic
// ==========================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-app.js";
import { getDatabase, ref, get } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-database.js";

// --- GLOBAL STATE ---
let db;
let rawMembers = {};
let rawTransactions = {};
let rawActiveLoans = {};
let allTransactionsList = []; // Flattened transactions (sorted)
let memberDataMap = new Map(); // Fast lookup
let processedMembersList = []; // Final calculated data for display

const DEFAULT_IMG = 'https://placehold.co/200x200/E0E7FF/4F46E5?text=User';

// --- INITIALIZATION ---
document.addEventListener("DOMContentLoaded", initDashboard);

async function initDashboard() {
    try {
        // 1. Fetch Config
        const response = await fetch('/api/firebase-config');
        if (!response.ok) throw new Error('Config load failed');
        const config = await response.json();
        
        // 2. Init Firebase
        const app = initializeApp(config);
        db = getDatabase(app);

        // 3. Fetch All Data
        await fetchAllData();

    } catch (error) {
        console.error("Init Error:", error);
        showError(error.message);
    }
}

// --- DATA FETCHING ---
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

        processData(); // Start Calculation

    } catch (error) {
        showError(error.message);
    }
}

// --- CORE PROCESSING LOOP (The "Sync" Logic) ---
function processData() {
    // 1. Flatten Transactions (Same logic as view_logic.js)
    allTransactionsList = [];
    memberDataMap.clear();

    // Map Member Basic Info first
    for (const id in rawMembers) {
        if (rawMembers[id].status === 'Approved') {
            memberDataMap.set(id, {
                name: rawMembers[id].fullName,
                imageUrl: rawMembers[id].profilePicUrl,
                guarantorName: rawMembers[id].guarantorName
            });
        }
    }

    // Process Transactions Array
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
    }
    // Sort by Date (Crucial for correct calculation)
    allTransactionsList.sort((a, b) => a.date - b.date || a.id - b.id);


    // 2. MASTER LOOP: Calculate Stats for Every Member
    processedMembersList = [];
    let communityStats = {
        totalMembers: 0,
        totalSip: 0,
        totalProfitDistributed: 0,
        totalWalletLiability: 0
    };

    for (const id in rawMembers) {
        const m = rawMembers[id];
        if (m.status !== 'Approved') continue;

        // A. Calculate SIP
        const memberTx = allTransactionsList.filter(t => t.memberId === id);
        const totalSip = memberTx.reduce((sum, t) => sum + t.sipPayment, 0);

        // B. Calculate Wallet (Extra Balance) - USES COPIED LOGIC
        const walletData = calculateTotalExtraBalance(id, m.fullName);
        
        // C. Calculate Lifetime Profit - USES COPIED LOGIC
        const lifetimeProfit = calculateTotalProfitForMember(m.fullName);

        // D. Calculate Score (Uses score_engine.js)
        let scoreObj = { totalScore: 0 };
        if (typeof calculatePerformanceScore === 'function') {
            scoreObj = calculatePerformanceScore(m.fullName, new Date(), allTransactionsList, rawActiveLoans);
        }

        // Add to List
        processedMembersList.push({
            id: id,
            name: m.fullName,
            img: m.profilePicUrl || DEFAULT_IMG,
            sip: totalSip,
            profit: lifetimeProfit,
            walletBalance: walletData.total,
            walletHistory: walletData.history, // For Modal
            score: scoreObj.totalScore || 0
        });

        // Update Community Stats
        communityStats.totalMembers++;
        communityStats.totalSip += totalSip;
        communityStats.totalProfitDistributed += lifetimeProfit;
        communityStats.totalWalletLiability += walletData.total;
    }

    // 3. Render UI
    updateSummaryUI(communityStats);
    renderMembersGrid(processedMembersList);
    
    // Hide Loader
    document.getElementById('loader-overlay').classList.add('hidden');
}

// --- RENDERING FUNCTIONS ---
function updateSummaryUI(stats) {
    document.getElementById('total-members').textContent = stats.totalMembers;
    document.getElementById('total-community-sip').textContent = formatCurrency(stats.totalSip);
    document.getElementById('total-community-profit').textContent = formatCurrency(stats.totalProfitDistributed);
    document.getElementById('total-wallet-liability').textContent = formatCurrency(stats.totalWalletLiability);
}

function renderMembersGrid(list) {
    const grid = document.getElementById('members-grid');
    grid.innerHTML = '';

    list.forEach(m => {
        const card = document.createElement('div');
        card.className = 'glass-card p-5 relative overflow-hidden group hover:shadow-xl transition-all';
        
        // Dynamic Border color based on Score
        let scoreColor = 'text-gray-400';
        if(m.score >= 80) scoreColor = 'text-green-500';
        else if(m.score >= 50) scoreColor = 'text-yellow-500';
        else scoreColor = 'text-red-500';

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

            <button onclick="openHistoryModal('${m.id}')" class="mt-4 w-full py-2 rounded-lg bg-gray-50 text-xs font-bold text-gray-500 hover:bg-[#002366] hover:text-white transition-colors uppercase tracking-wide">
                View History
            </button>
        `;
        grid.appendChild(card);
    });
}

// --- INTERACTIVITY (Search & Sort) ---
document.getElementById('search-input').addEventListener('input', (e) => {
    const term = e.target.value.toLowerCase();
    const filtered = processedMembersList.filter(m => m.name.toLowerCase().includes(term));
    renderMembersGrid(filtered);
});

document.getElementById('sort-select').addEventListener('change', (e) => {
    const type = e.target.value;
    let sorted = [...processedMembersList];
    
    if (type === 'name') sorted.sort((a, b) => a.name.localeCompare(b.name));
    else if (type === 'profit') sorted.sort((a, b) => b.profit - a.profit);
    else if (type === 'score') sorted.sort((a, b) => b.score - a.score);
    else if (type === 'balance') sorted.sort((a, b) => b.walletBalance - a.walletBalance);
    
    renderMembersGrid(sorted);
});

// --- MODAL LOGIC ---
window.openHistoryModal = (memberId) => {
    const member = processedMembersList.find(m => m.id === memberId);
    if (!member) return;

    document.getElementById('modal-member-name').textContent = member.name;
    const list = document.getElementById('modal-history-list');
    list.innerHTML = '';

    if (member.walletHistory.length === 0) {
        list.innerHTML = '<p class="text-center text-gray-400 text-xs italic">No wallet history found.</p>';
    } else {
        // Reverse to show latest first
        [...member.walletHistory].reverse().forEach(h => {
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

// ==========================================
// 🔻 COPIED LOGIC FROM VIEW_LOGIC.JS 🔻
// (Exact Sync Required)
// ==========================================

// 1. Calculate Wallet (Extra Balance)
function calculateTotalExtraBalance(memberId, memberFullName) {
    const history = [];
    
    // A. Profit Share Logic
    const profitEvents = allTransactionsList.filter(r => r.returnAmount > 0);
    profitEvents.forEach(paymentRecord => {
        const result = calculateProfitDistribution(paymentRecord);
        const memberShare = result?.distribution.find(d => d.name === memberFullName);
        if(memberShare && memberShare.share > 0) {
            history.push({ type: memberShare.type || 'profit', from: paymentRecord.name, date: paymentRecord.date, amount: memberShare.share });
        }
    });

    // B. Manual Adjustments
    const manualAdjustments = allTransactionsList.filter(tx => tx.memberId === memberId && (tx.extraBalance > 0 || tx.extraWithdraw > 0));
    manualAdjustments.forEach(tx => {
        if (tx.extraBalance > 0) history.push({ type: 'manual_credit', from: 'Admin', date: tx.date, amount: tx.extraBalance });
        if (tx.extraWithdraw > 0) history.push({ type: 'withdrawal', from: 'Admin', date: tx.date, amount: -tx.extraWithdraw });
    });

    history.sort((a,b) => a.date - b.date);
    const total = history.reduce((acc, item) => acc + item.amount, 0);
    return { total, history };
}

// 2. Calculate Total Lifetime Profit
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

// 3. The Core Profit Distribution Logic (Complex)
function calculateProfitDistribution(paymentRecord) { 
    const totalInterest = paymentRecord.returnAmount; if (totalInterest <= 0) return null; 
    const distribution = [];
    
    // A. Self 10%
    const selfShare = totalInterest * 0.10;
    distribution.push({ name: paymentRecord.name, share: selfShare, type: 'Self Return (10%)' });
    
    // B. Guarantor 10%
    const payerMemberInfo = memberDataMap.get(paymentRecord.memberId);
    if (payerMemberInfo && payerMemberInfo.guarantorName && payerMemberInfo.guarantorName !== 'Xxxxx') {
            distribution.push({ name: payerMemberInfo.guarantorName, share: totalInterest * 0.10, type: 'Guarantor Commission (10%)' });
    }
    
    // C. Community Pool 70%
    const communityPool = totalInterest * 0.70;
    const userLoansBeforePayment = allTransactionsList.filter(r => r.name === paymentRecord.name && r.loan > 0 && r.date < paymentRecord.date && r.loanType === 'Loan' ); 
    
    if (userLoansBeforePayment.length === 0) return { distribution };
    
    const relevantLoan = userLoansBeforePayment.pop(); 
    const loanDate = relevantLoan.date; 
    
    const snapshotScores = {}; 
    let totalScoreInSnapshot = 0; 
    
    // Get unique members in system at that time
    const membersInSystemAtLoanDate = [...new Set(allTransactionsList.filter(r => r.date <= loanDate).map(r => r.name))]; 
    
    membersInSystemAtLoanDate.forEach(name => { 
        if (name === paymentRecord.name) return; // Exclude Payer
        
        // Call Score Engine
        if (typeof calculatePerformanceScore === 'function') {
            const scoreObject = calculatePerformanceScore(name, loanDate, allTransactionsList, rawActiveLoans); 
            if (scoreObject.totalScore > 0) { 
                snapshotScores[name] = scoreObject; 
                totalScoreInSnapshot += scoreObject.totalScore; 
            } 
        }
    }); 
    
    // Constants for Inactivity (Copied from Config logic usually, hardcoded here to match old file)
    const INACTIVE_DAYS_LEVEL_1 = 180;
    const INACTIVE_MULTIPLIER_1 = 0.90;
    const INACTIVE_DAYS_LEVEL_2 = 365;
    const INACTIVE_MULTIPLIER_2 = 0.75;

    if (totalScoreInSnapshot > 0) {
        for (const memberName in snapshotScores) { 
            let memberShare = (snapshotScores[memberName].totalScore / totalScoreInSnapshot) * communityPool; 
            
            // Inactivity Penalty Check
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

// --- UTILS ---
function formatCurrency(amount) {
    return `₹${amount.toLocaleString('en-IN', {minimumFractionDigits: 0, maximumFractionDigits: 0})}`;
}

function showError(msg) {
    const toast = document.getElementById('error-toast');
    document.getElementById('error-msg').textContent = msg;
    toast.classList.remove('translate-y-20');
    setTimeout(() => toast.classList.add('translate-y-20'), 5000);
}
