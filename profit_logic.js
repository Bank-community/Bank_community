// ==========================================
// MASTER PROFIT LOGIC (v13.0 - CACHING + 10-TAP SECURITY)
// Features: 
// 1. 10-Tap Security Lock (Stronger)
// 2. Local Storage Caching (Reduces DB Reads)
// 3. Force Refresh Option
// 4. Monthly Sync Logic Included
// ==========================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-auth.js";
import { getDatabase, ref, get, update, push, child } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-database.js";

// --- GLOBAL VARIABLES ---
let db, auth;
let rawMembers = {}, rawTransactions = {}, rawActiveLoans = {}, rawPenaltyWallet = {}, rawAdmin = {};
let allTransactionsList = [], memberDataMap = new Map(), transactionsByMember = {}, renderedMembersCache = [];

// CALCULATION VARS
let adminTotalReturn = 0;       
let target90Percent = 0;        
let currentlyDistributed = 0;   
let totalLifetimeGap = 0;       
let totalInactiveSentToWallet = 0;

// SYNC FLAGS
let currentMonthTag = "";       
let isSyncedThisMonth = false;  

// SECURITY & CACHE VARS
let securityTaps = 0;
const SECURITY_PIN = '74123690'; 
const CACHE_KEY = 'tcf_profit_dashboard_cache_v1';
const DEFAULT_IMG = 'https://i.ibb.co/HTNrbJxD/20250716-222246.png';

// --- INITIALIZATION ---
// Pehle Security System Load hoga
document.addEventListener("DOMContentLoaded", setupSecuritySystem);

// ==========================================
// 1. SECURITY SYSTEM (10 TAPS)
// ==========================================
function setupSecuritySystem() {
    console.log("🔒 Security Level: High (10 Taps)");
    
    const overlay = document.getElementById('loader-overlay');
    const inputBox = document.getElementById('security-input-box');
    const passInput = document.getElementById('security-pass');
    const verifyBtn = document.getElementById('security-btn');
    const errorMsg = document.getElementById('security-error');
    const dummyText = document.getElementById('dummy-text');

    if (overlay) {
        overlay.addEventListener('click', (e) => {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'BUTTON') return;

            securityTaps++;
            if(navigator.vibrate) navigator.vibrate(30);

            // Trigger at 10 Taps
            if (securityTaps >= 10) {
                if(inputBox) {
                    inputBox.classList.add('visible');
                    setTimeout(() => { if(passInput) passInput.focus(); }, 100);
                }
                if(dummyText) {
                    dummyText.textContent = "SECURE ACCESS REQUIRED";
                    dummyText.style.color = "#D4AF37"; 
                }
            }
        });
    }

    if (verifyBtn && passInput) {
        const verifyAction = () => {
            if (passInput.value === SECURITY_PIN) {
                // SUCCESS
                if(overlay) {
                    overlay.style.transition = "opacity 0.5s ease";
                    overlay.style.opacity = "0";
                    setTimeout(() => overlay.remove(), 500); 
                }
                checkAuthAndInit(); // Start Data Load
            } else {
                // FAIL
                errorMsg.classList.remove('hidden');
                if(navigator.vibrate) navigator.vibrate([100, 50, 100]); 
                passInput.value = '';
            }
        };

        verifyBtn.addEventListener('click', verifyAction);
        passInput.addEventListener('keyup', (e) => { if (e.key === 'Enter') verifyAction(); });
    }
}

// ==========================================
// 2. MAIN APP LOGIC (CACHING ENABLED)
// ==========================================
async function checkAuthAndInit() {
    try {
        const response = await fetch('/api/firebase-config');
        if (!response.ok) throw new Error('Config load failed');
        const config = await response.json();
        
        const app = initializeApp(config);
        auth = getAuth(app);
        db = getDatabase(app);

        // Sorting & Refresh Listeners
        const sortSelect = document.getElementById('sort-select');
        if(sortSelect) sortSelect.addEventListener('change', (e) => handleSort(e.target.value));
        
        const refreshBtn = document.getElementById('force-refresh-btn');
        if(refreshBtn) refreshBtn.addEventListener('click', () => {
            if(confirm("Refresh data from server?")) {
                fetchFreshData(); // Bypass Cache
            }
        });

        onAuthStateChanged(auth, (user) => {
            if (user) {
                initDataLoad(); // Smart Load
            } else {
                window.location.href = 'login.html';
            }
        });

    } catch (error) {
        alert("System Error: " + error.message);
    }
}

// --- SMART DATA LOADING (CACHE FIRST) ---
async function initDataLoad() {
    // 1. Try Local Storage First
    const cached = localStorage.getItem(CACHE_KEY);
    
    if (cached) {
        console.log("⚡ Loading from Local Cache...");
        const data = JSON.parse(cached);
        
        // Restore Variables
        rawMembers = data.members || {};
        rawTransactions = data.transactions || {};
        rawActiveLoans = data.activeLoans || {};
        rawPenaltyWallet = data.penaltyWallet || {};
        rawAdmin = data.admin || {};
        
        // Process UI
        startProcessing();
    } else {
        // 2. If No Cache, Fetch Fresh
        console.log("🌐 No Cache Found. Fetching from Firebase...");
        fetchFreshData();
    }
}

async function fetchFreshData() {
    try {
        const [membersSnap, txSnap, loansSnap, walletSnap, adminSnap] = await Promise.all([
            get(ref(db, 'members')),
            get(ref(db, 'transactions')),
            get(ref(db, 'activeLoans')),
            get(ref(db, 'penaltyWallet')),
            get(ref(db, 'admin'))
        ]);

        if (!membersSnap.exists()) throw new Error("No members found.");

        // Update Variables
        rawMembers = membersSnap.val();
        rawTransactions = txSnap.exists() ? txSnap.val() : {};
        rawActiveLoans = loansSnap.exists() ? loansSnap.val() : {};
        rawPenaltyWallet = walletSnap.exists() ? walletSnap.val() : {};
        rawAdmin = adminSnap.exists() ? adminSnap.val() : {};

        // SAVE TO CACHE
        const cachePayload = {
            members: rawMembers,
            transactions: rawTransactions,
            activeLoans: rawActiveLoans,
            penaltyWallet: rawPenaltyWallet,
            admin: rawAdmin,
            timestamp: Date.now()
        };
        localStorage.setItem(CACHE_KEY, JSON.stringify(cachePayload));
        console.log("💾 Data Saved to Cache");

        startProcessing();

    } catch (error) {
        alert("Database Error: " + error.message);
    }
}

// --- PROCESSING LOGIC ---
function startProcessing() {
    // 1. Get Source of Truth
    adminTotalReturn = (rawAdmin.balanceStats && rawAdmin.balanceStats.totalReturn) || 0;
    
    // 2. Check Sync Status
    analyzeWalletHistory();

    // 3. Prepare Queue
    prepareAndStartQueue();
}

function analyzeWalletHistory() {
    const date = new Date();
    const monthNames = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
    const mName = monthNames[date.getMonth()];
    const yName = date.getFullYear().toString().slice(-2);
    currentMonthTag = `inactive income ${mName}${yName}`;

    totalInactiveSentToWallet = 0;
    isSyncedThisMonth = false;

    if (rawPenaltyWallet.incomes) {
        Object.values(rawPenaltyWallet.incomes).forEach(tx => {
            const reason = (tx.reason || "").toLowerCase();
            if (reason.includes("inactive income")) {
                totalInactiveSentToWallet += parseFloat(tx.amount || 0);
            }
            if (reason.includes(currentMonthTag)) {
                isSyncedThisMonth = true;
            }
        });
    }
}

// --- PREPARE DATA ---
function prepareAndStartQueue() {
    allTransactionsList = [];
    memberDataMap.clear();
    transactionsByMember = {};
    currentlyDistributed = 0;

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
    
    // Hide overlay AFTER logic is ready (if needed visually)
    // Note: Overlay is already hidden by password check, but this ensures safety
    // document.getElementById('loader-overlay').classList.add('hidden'); 
    
    injectScannerUI(memberIdsToProcess.length);
    startLiveQueue(memberIdsToProcess);
}

// --- LIVE QUEUE ---
let communityStats = {
    totalMembers: 0, totalSip: 0, totalProfitDistributed: 0, totalWalletLiability: 0
};

function startLiveQueue(memberIds) {
    let index = 0;
    const total = memberIds.length;

    function processNext() {
        if (index >= total) {
            document.getElementById('scanner-text').textContent = "Dashboard Ready ✅";
            calculateAndShowSyncUI();
            setTimeout(() => {
                const scanner = document.getElementById('live-scanner-status');
                if(scanner) scanner.remove();
            }, 1000);
            return;
        }

        const id = memberIds[index];
        const m = rawMembers[id];

        document.getElementById('scanner-text').textContent = `Checking: ${m.fullName}`;
        document.getElementById('scanner-count').textContent = `${index + 1}/${total}`;
        document.getElementById('scanner-bar').style.width = `${((index + 1) / total) * 100}%`;

        setTimeout(() => {
            try {
                const memberTx = transactionsByMember[id] || [];
                const totalSip = memberTx.reduce((sum, t) => sum + t.sipPayment, 0);
                
                const walletData = calculateTotalExtraBalance(id, m.fullName);
                const lifetimeProfit = calculateTotalProfitForMember(m.fullName);
                
                currentlyDistributed += lifetimeProfit;

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

            } catch (err) { console.error(err); }

            index++;
            setTimeout(processNext, 2); 
        }, 2);
    }
    processNext();
}

// --- FINAL MATH LOGIC ---
function calculateAndShowSyncUI() {
    target90Percent = adminTotalReturn * 0.90;
    totalLifetimeGap = target90Percent - currentlyDistributed;
    
    let pendingToAdd = totalLifetimeGap - totalInactiveSentToWallet;
    pendingToAdd = Math.floor(pendingToAdd); 
    if (pendingToAdd < 0) pendingToAdd = 0;

    const el = document.getElementById('undistributed-amount');
    if (el) el.textContent = formatCurrency(totalLifetimeGap);

    const btn = document.getElementById('sync-wallet-btn');
    const status = document.getElementById('sync-status');
    const dateMsg = document.getElementById('date-lock-msg');

    const today = new Date();
    // const isDate20 = true; // TESTING
    const isDate20 = today.getDate() === 20;

    if (isSyncedThisMonth) {
        if(btn) btn.classList.add('hidden');
        if(status) {
            status.classList.remove('hidden');
            status.innerHTML = `<i class="fas fa-check-circle"></i> All Synced (${currentMonthTag})`;
        }
        if(dateMsg) dateMsg.classList.add('hidden');
    } else {
        if (pendingToAdd > 5) {
            if (isDate20) {
                if(btn) {
                    btn.classList.remove('hidden');
                    btn.innerHTML = `<i class="fas fa-wallet"></i> <span>Sync ₹${pendingToAdd}</span>`;
                    btn.onclick = () => performWalletSync(pendingToAdd);
                }
                if(status) status.classList.add('hidden');
                if(dateMsg) dateMsg.classList.add('hidden');
            } else {
                if(btn) btn.classList.add('hidden');
                if(status) status.classList.add('hidden');
                if(dateMsg) {
                    dateMsg.classList.remove('hidden');
                    dateMsg.innerHTML = `<i class="fas fa-lock"></i> Sync unlocks on 20th. Pending: ₹${pendingToAdd}`;
                }
            }
        } else {
            if(btn) btn.classList.add('hidden');
            if(status) {
                status.classList.remove('hidden');
                status.innerHTML = `<i class="fas fa-check-circle"></i> Up to Date`;
            }
            if(dateMsg) dateMsg.classList.add('hidden');
        }
    }
}

async function performWalletSync(amount) {
    if(!confirm(`CONFIRM SYNC\n\nAdd ₹${amount} to Penalty Wallet?\nTag: ${currentMonthTag}`)) return;

    const btn = document.getElementById('sync-wallet-btn');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> ...';

    try {
        const walletRef = ref(db, 'penaltyWallet');
        const reasonString = `${currentMonthTag} : ${amount}`;
        
        const newTxRef = push(child(walletRef, 'incomes'));
        await update(newTxRef, {
            amount: amount,
            from: "System Profit Engine",
            reason: reasonString,
            type: "income",
            timestamp: Date.now()
        });

        const currentBalance = parseFloat(rawPenaltyWallet.availableBalance || 0);
        await update(walletRef, {
            availableBalance: currentBalance + amount
        });

        // CLEAR CACHE ON SYNC TO FORCE REFRESH NEXT TIME
        localStorage.removeItem(CACHE_KEY);

        alert("✅ Success! Income Added.");
        window.location.reload(); 

    } catch (error) {
        alert("Error: " + error.message);
        btn.disabled = false;
        btn.innerHTML = 'Retry';
    }
}

// --- UTILS ---
function calculateProfitDistribution(paymentRecord) { 
    const totalInterest = paymentRecord.returnAmount; if (totalInterest <= 0) return null; 
    const distribution = [];
    distribution.push({ name: paymentRecord.name, share: totalInterest * 0.10, type: 'Self Return (10%)' });
    const payerMemberInfo = memberDataMap.get(paymentRecord.memberId);
    if (payerMemberInfo?.guarantorName && payerMemberInfo.guarantorName !== 'Xxxxx') {
        distribution.push({ name: payerMemberInfo.guarantorName, share: totalInterest * 0.10, type: 'Guarantor Commission (10%)' });
    }
    const communityPool = totalInterest * 0.70;
    const userLoansBefore = allTransactionsList.filter(r => r.name === paymentRecord.name && r.loan > 0 && r.date < paymentRecord.date && r.loanType === 'Loan'); 
    if (userLoansBefore.length === 0) return { distribution };
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
            let multiplier = 1.0;
            if (days > 365) multiplier = 0.75; else if (days > 180) multiplier = 0.90; 
            share *= multiplier; 
            if (share > 0) distribution.push({ name, share, type: 'Community Profit' }); 
        } 
    }
    return { distribution }; 
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

function updateSummaryUI(s) { 
    document.getElementById('total-members').textContent = s.totalMembers; 
    document.getElementById('total-community-sip').textContent = formatCurrency(s.totalSip); 
    document.getElementById('total-community-profit').textContent = formatCurrency(s.totalProfitDistributed); 
    document.getElementById('total-wallet-liability').textContent = formatCurrency(s.totalWalletLiability); 
}
function formatCurrency(n) { return `₹${Math.floor(n).toLocaleString('en-IN')}`; }

function handleSort(criteria) {
    if (!renderedMembersCache || renderedMembersCache.length === 0) return;
    const grid = document.getElementById('members-grid');
    grid.innerHTML = '';
    let sortedData = [...renderedMembersCache];
    switch (criteria) {
        case 'profit': sortedData.sort((a, b) => b.profit - a.profit); break;
        case 'score': sortedData.sort((a, b) => b.score - a.score); break;
        case 'balance': sortedData.sort((a, b) => b.walletBalance - a.walletBalance); break;
        case 'name': default: sortedData.sort((a, b) => a.name.localeCompare(b.name)); break;
    }
    sortedData.forEach(member => appendMemberCard(member));
}

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
    modal.onclick = (e) => { if(e.target === modal) modal.classList.add('hidden'); };
}
