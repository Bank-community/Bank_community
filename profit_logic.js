// ==========================================
// MASTER PROFIT LOGIC (v6.0 - SMART WALLET SYNC)
// Features: Tracks undistributed profit and syncs to Penalty Wallet.
// ==========================================

// 1. UPDATED IMPORTS (Added update, push, child)
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-auth.js";
import { getDatabase, ref, get, update, push, child } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-database.js";

// --- GLOBAL VARIABLES ---
let db, auth;
let rawMembers = {}, rawTransactions = {}, rawActiveLoans = {}, rawPenaltyWallet = {};
let allTransactionsList = [], memberDataMap = new Map(), transactionsByMember = {}, renderedMembersCache = [];

// NEW: Tracking Variables
let totalUndistributedCalculated = 0; // Total calculated from history
let totalAlreadySynced = 0;           // What is already in DB

const DEFAULT_IMG = 'https://i.ibb.co/HTNrbJxD/20250716-222246.png';

// --- INITIALIZATION ---
document.addEventListener("DOMContentLoaded", checkAuthAndInit);

async function checkAuthAndInit() {
    try {
        showSystemLoader("Verifying Session...");
        const response = await fetch('/api/firebase-config');
        if (!response.ok) throw new Error('Config load failed');
        const config = await response.json();
        
        const app = initializeApp(config);
        auth = getAuth(app);
        db = getDatabase(app);

        onAuthStateChanged(auth, (user) => {
            if (user) {
                console.log("✅ Authenticated");
                fetchAllData();
            } else {
                window.location.href = 'login.html';
            }
        });
    } catch (error) {
        showError("System Error: " + error.message);
    }
}

// --- DATA FETCHING ---
async function fetchAllData() {
    try {
        showSystemLoader("Loading Database...");
        
        // NEW: Also fetching penaltyWallet to check sync history
        const [membersSnap, txSnap, loansSnap, walletSnap] = await Promise.all([
            get(ref(db, 'members')),
            get(ref(db, 'transactions')),
            get(ref(db, 'activeLoans')),
            get(ref(db, 'penaltyWallet'))
        ]);

        if (!membersSnap.exists()) throw new Error("No members found.");

        rawMembers = membersSnap.val();
        rawTransactions = txSnap.exists() ? txSnap.val() : {};
        rawActiveLoans = loansSnap.exists() ? loansSnap.val() : {};
        rawPenaltyWallet = walletSnap.exists() ? walletSnap.val() : {};

        // Get the marker of how much we already synced
        totalAlreadySynced = (rawPenaltyWallet.metadata && rawPenaltyWallet.metadata.totalUndistributedSynced) || 0;

        prepareAndStartQueue();

    } catch (error) {
        showError("Database Error: " + error.message);
    }
}

// --- STEP 1: PREPARE DATA ---
function prepareAndStartQueue() {
    showSystemLoader("Analyzing Records...");
    
    allTransactionsList = [];
    memberDataMap.clear();
    transactionsByMember = {};
    totalUndistributedCalculated = 0; // Reset counter

    // Map Basic Info
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

    // Process Transactions
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
        if(transactionsByMember[tx.memberId]) transactionsByMember[tx.memberId].push(record);
    }
    allTransactionsList.sort((a, b) => a.date - b.date || a.id - b.id);

    const memberIdsToProcess = Object.keys(rawMembers).filter(id => rawMembers[id].status === 'Approved');
    document.getElementById('loader-overlay').classList.add('hidden');
    
    injectScannerUI(memberIdsToProcess.length);
    startLiveQueue(memberIdsToProcess);
}

// --- STEP 2: LIVE QUEUE ---
let communityStats = {
    totalMembers: 0, totalSip: 0, totalProfitDistributed: 0, totalWalletLiability: 0
};

function startLiveQueue(memberIds) {
    let index = 0;
    const total = memberIds.length;

    function processNext() {
        if (index >= total) {
            document.getElementById('scanner-text').textContent = "Dashboard Ready ✅";
            
            // NEW: Initialize Wallet Sync UI after calculation is done
            initWalletSyncUI();

            setTimeout(() => {
                const scanner = document.getElementById('live-scanner-status');
                if(scanner) scanner.remove();
            }, 2000);
            return;
        }

        const id = memberIds[index];
        const m = rawMembers[id];

        document.getElementById('scanner-text').textContent = `Calculating: ${m.fullName}...`;
        document.getElementById('scanner-count').textContent = `${index + 1}/${total}`;
        document.getElementById('scanner-bar').style.width = `${((index + 1) / total) * 100}%`;

        setTimeout(() => {
            try {
                const memberTx = transactionsByMember[id] || [];
                const totalSip = memberTx.reduce((sum, t) => sum + t.sipPayment, 0);
                
                const walletData = calculateTotalExtraBalance(id, m.fullName);
                const lifetimeProfit = calculateTotalProfitForMember(m.fullName);
                
                let scoreObj = { totalScore: 0 };
                if (typeof calculatePerformanceScore === 'function') {
                    scoreObj = calculatePerformanceScore(m.fullName, new Date(), allTransactionsList, rawActiveLoans);
                }

                const memberObj = {
                    id: id, name: m.fullName, img: m.profilePicUrl || DEFAULT_IMG,
                    sip: totalSip, profit: lifetimeProfit, walletBalance: walletData.total,
                    walletHistory: walletData.history, score: scoreObj.totalScore || 0
                };

                renderedMembersCache.push(memberObj);
                appendMemberCard(memberObj);

                communityStats.totalMembers++;
                communityStats.totalSip += totalSip;
                communityStats.totalProfitDistributed += lifetimeProfit;
                communityStats.totalWalletLiability += walletData.total;
                
                updateSummaryUI(communityStats);

            } catch (err) { console.error(`Error:`, err); }

            index++;
            setTimeout(processNext, 5); // Fast processing
        }, 5);
    }
    processNext();
}

// --- NEW: WALLET SYNC LOGIC ---
function initWalletSyncUI() {
    const el = document.getElementById('undistributed-amount');
    const btn = document.getElementById('sync-wallet-btn');
    const status = document.getElementById('sync-status');
    
    // Round to avoid float errors
    const calculated = Math.floor(totalUndistributedCalculated);
    const synced = Math.floor(totalAlreadySynced);
    const pending = calculated - synced;

    if (el) el.textContent = formatCurrency(calculated);

    // If there is new money to sync
    if (pending > 5) { // Threshold of 5 rupees to ignore micro-decimals
        if(btn) {
            btn.classList.remove('hidden');
            btn.querySelector('span').textContent = `Add ₹${pending} to Wallet`;
            btn.onclick = () => performWalletSync(pending, calculated);
        }
        if(status) status.classList.add('hidden');
    } else {
        if(btn) btn.classList.add('hidden');
        if(status) status.classList.remove('hidden');
    }
}

async function performWalletSync(amount, newTotalSynced) {
    if(!confirm(`Are you sure you want to add ₹${amount} to the Bank Wallet?\n\nThis represents the undistributed profit collected from missing guarantors and penalties.`)) return;

    const btn = document.getElementById('sync-wallet-btn');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...';

    try {
        // 1. Get reference to penaltyWallet
        const walletRef = ref(db, 'penaltyWallet');
        
        // 2. Add Income Transaction
        const newTxRef = push(child(walletRef, 'incomes'));
        await update(newTxRef, {
            amount: amount,
            from: "System Profit Engine",
            reason: "Undistributed Profit (Guarantor/Penalty)",
            type: "income",
            timestamp: Date.now()
        });

        // 3. Update Available Balance (Atomic Increment logic is better, but simple update here)
        const currentBalance = parseFloat(rawPenaltyWallet.availableBalance || 0);
        await update(walletRef, {
            availableBalance: currentBalance + amount
        });

        // 4. Update Metadata (High Water Mark) so we don't add it again
        await update(child(walletRef, 'metadata'), {
            totalUndistributedSynced: newTotalSynced
        });

        alert("✅ Success! Amount added to Bank Wallet.");
        window.location.reload(); // Reload to reflect changes

    } catch (error) {
        console.error(error);
        alert("Sync Failed: " + error.message);
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-exclamation-triangle"></i> Retry';
    }
}


// --- UTILS (Profit Calculation Updated to Track Leaks) ---

function calculateProfitDistribution(paymentRecord) { 
    const totalInterest = paymentRecord.returnAmount; 
    if (totalInterest <= 0) return null; 
    
    const distribution = [{ name: paymentRecord.name, share: totalInterest * 0.10, type: 'Self Return (10%)' }];
    const payerMemberInfo = memberDataMap.get(paymentRecord.memberId);
    
    // --- TRACK LEAK 1: Guarantor ---
    if (payerMemberInfo?.guarantorName && payerMemberInfo.guarantorName !== 'Xxxxx') {
        distribution.push({ name: payerMemberInfo.guarantorName, share: totalInterest * 0.10, type: 'Guarantor Commission (10%)' });
    } else {
        // Guarantor Missing -> Money goes to Bank
        totalUndistributedCalculated += (totalInterest * 0.10);
    }

    const communityPool = totalInterest * 0.70;
    const userLoansBefore = allTransactionsList.filter(r => r.name === paymentRecord.name && r.loan > 0 && r.date < paymentRecord.date && r.loanType === 'Loan'); 
    
    if (userLoansBefore.length === 0) {
        // Edge case: Interest paid but no loan found? Consider entire pool undistributed
        totalUndistributedCalculated += communityPool;
        return { distribution };
    }

    const loanDate = userLoansBefore.pop().date; 
    const snapshotScores = {}; let totalScore = 0; 
    
    [...new Set(allTransactionsList.filter(r => r.date <= loanDate).map(r => r.name))].forEach(name => { 
        if (name === paymentRecord.name) return;
        const scoreObj = (typeof calculatePerformanceScore === 'function') ? calculatePerformanceScore(name, loanDate, allTransactionsList, rawActiveLoans) : { totalScore: 0 };
        if (scoreObj.totalScore > 0) { snapshotScores[name] = scoreObj; totalScore += scoreObj.totalScore; } 
    }); 
    
    if (totalScore > 0) {
        for (const name in snapshotScores) { 
            let share = (snapshotScores[name].totalScore / totalScore) * communityPool; 
            const lastLoan = allTransactionsList.filter(r => r.name === name && r.loan > 0 && r.date <= loanDate).pop()?.date;
            const days = lastLoan ? (loanDate - lastLoan) / 86400000 : Infinity; 
            
            // --- TRACK LEAK 2: Inactivity Penalty ---
            let penaltyMultiplier = 1.0;
            if (days > 365) penaltyMultiplier = 0.75; // 25% penalty
            else if (days > 180) penaltyMultiplier = 0.90; // 10% penalty
            
            const actualShare = share * penaltyMultiplier;
            const lostShare = share - actualShare;
            
            if(lostShare > 0) totalUndistributedCalculated += lostShare; // Add penalty to bank

            if (actualShare > 0) distribution.push({ name, share: actualShare, type: 'Community Profit' }); 
        } 
    } else {
        // No valid members to distribute to? All goes to bank
        totalUndistributedCalculated += communityPool;
    }
    
    return { distribution }; 
}

function calculateTotalExtraBalance(memberId, memberFullName) {
    const history = [];
    allTransactionsList.filter(r => r.returnAmount > 0).forEach(paymentRecord => {
        const result = calculateProfitDistribution(paymentRecord);
        const memberShare = result?.distribution.find(d => d.name === memberFullName);
        if(memberShare && memberShare.share > 0) {
            history.push({ type: memberShare.type || 'profit', date: paymentRecord.date, amount: memberShare.share });
        }
    });
    allTransactionsList.filter(tx => tx.memberId === memberId && (tx.extraBalance > 0 || tx.extraWithdraw > 0)).forEach(tx => {
        if (tx.extraBalance > 0) history.push({ type: 'manual_credit', date: tx.date, amount: tx.extraBalance });
        if (tx.extraWithdraw > 0) history.push({ type: 'withdrawal', date: tx.date, amount: -tx.extraWithdraw });
    });
    history.sort((a,b) => a.date - b.date);
    return { total: history.reduce((acc, item) => acc + item.amount, 0), history };
}

function calculateTotalProfitForMember(memberName) { 
    return allTransactionsList.reduce((total, tx) => { 
        if (tx.returnAmount > 0) { 
            const share = calculateProfitDistribution(tx)?.distribution.find(d => d.name === memberName)?.share;
            if (share) total += share; 
        } 
        return total; 
    }, 0); 
}

// UI Functions
function injectScannerUI(totalCount) {
    const grid = document.getElementById('members-grid');
    grid.innerHTML = '';
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
        </div>`;
    grid.appendChild(scanner);
}

function appendMemberCard(m) {
    const grid = document.getElementById('members-grid');
    let scoreColor = m.score >= 80 ? 'text-green-500' : (m.score >= 50 ? 'text-yellow-500' : 'text-red-500');

    const card = document.createElement('div');
    card.className = 'glass-card p-5 relative overflow-hidden group hover:shadow-xl transition-all';
    card.innerHTML = `
        <div class="flex items-center gap-4 mb-4">
            <img src="${m.img}" class="w-16 h-16 rounded-full object-cover border-2 border-gray-100">
            <div>
                <h3 class="font-bold text-lg text-[#002366] leading-tight">${m.name}</h3>
                <div class="flex items-center gap-2 text-xs font-semibold mt-1">
                    <span class="${scoreColor}"><i class="fas fa-tachometer-alt"></i> Score: ${m.score.toFixed(0)}</span>
                </div>
            </div>
        </div>
        <div class="space-y-2 text-sm">
            <div class="flex justify-between border-b border-gray-100 pb-1">
                <span class="text-gray-500 text-xs">SIP Fund</span>
                <span class="font-bold text-[#002366]">${formatCurrency(m.sip)}</span>
            </div>
            <div class="flex justify-between border-b border-gray-100 pb-1">
                <span class="text-gray-500 text-xs">Total Profit</span>
                <span class="font-bold text-[#D4AF37]">+ ${formatCurrency(m.profit)}</span>
            </div>
            <div class="flex justify-between pt-1">
                <span class="text-gray-500 text-xs">Wallet</span>
                <span class="font-bold ${m.walletBalance > 0 ? 'text-green-600' : 'text-gray-400'}">${formatCurrency(m.walletBalance)}</span>
            </div>
        </div>
        <button onclick="showLocalHistory('${m.id}')" class="mt-4 w-full py-2 rounded-lg bg-gray-50 text-[10px] font-bold text-gray-500 hover:bg-[#002366] hover:text-white transition-colors uppercase tracking-wide">
            View History
        </button>`;
    
    window[`history_${m.id}`] = m.walletHistory;
    grid.appendChild(card);
}

function updateSummaryUI(s) { 
    document.getElementById('total-members').textContent = s.totalMembers; 
    document.getElementById('total-community-sip').textContent = formatCurrency(s.totalSip); 
    document.getElementById('total-community-profit').textContent = formatCurrency(s.totalProfitDistributed); 
    document.getElementById('total-wallet-liability').textContent = formatCurrency(s.totalWalletLiability); 
}
function formatCurrency(n) { return `₹${Math.floor(n).toLocaleString('en-IN')}`; }
function showError(m) { alert(m); document.getElementById('loader-overlay').classList.add('hidden'); }
function showSystemLoader(msg) { document.querySelector('#loader-overlay h2').textContent = msg; document.getElementById('loader-overlay').classList.remove('hidden'); }

// Global Scope for History Modal
window.showLocalHistory = function(memberId) {
    const history = window[`history_${memberId}`] || [];
    const modal = document.getElementById('history-modal');
    const list = document.getElementById('modal-history-list');
    const nameEl = document.getElementById('modal-member-name');
    
    const member = renderedMembersCache.find(m => m.id === memberId);
    nameEl.textContent = member ? member.name : 'Member';
    
    list.innerHTML = '';
    if(history.length === 0) {
        list.innerHTML = '<p class="text-center text-gray-400 text-xs py-2">No history found.</p>';
    } else {
        [...history].reverse().forEach(h => {
            const isPos = h.amount > 0;
            const dateStr = new Date(h.date).toLocaleDateString('en-GB');
            list.innerHTML += `
                <div class="flex justify-between items-center py-2 border-b border-gray-100 last:border-0">
                    <div>
                        <p class="text-xs font-bold text-gray-700 capitalize">${h.type.replace('_', ' ')}</p>
                        <p class="text-[10px] text-gray-400">${dateStr}</p>
                    </div>
                    <span class="font-bold text-sm ${isPos ? 'text-green-600' : 'text-red-500'}">
                        ${isPos ? '+' : ''}${formatCurrency(h.amount)}
                    </span>
                </div>`;
        });
    }
    
    modal.classList.remove('hidden');
    document.getElementById('close-modal').onclick = () => modal.classList.add('hidden');
}
