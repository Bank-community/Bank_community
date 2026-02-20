// ==========================================
// MASTER PROFIT LOGIC (v6.0 - SECURITY + SORTING FIX)
// Features: 
// 1. Hidden Security Layer (3 Taps + Password)
// 2. Auth Guard
// 3. Sorting Fixed
// ==========================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-auth.js";
import { getDatabase, ref, get } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-database.js";

// --- GLOBAL VARIABLES ---
let db, auth;
let rawMembers = {};
let rawTransactions = {};
let rawActiveLoans = {};
let allTransactionsList = [];
let memberDataMap = new Map();
let transactionsByMember = {}; 
let renderedMembersCache = []; // Sorting ke liye data yahan rahega
let securityTaps = 0; // Click counter for security

const DEFAULT_IMG = 'https://i.ibb.co/HTNrbJxD/20250716-222246.png';
const SECURITY_PIN = '74123690'; // Your Set Password

// --- INITIALIZATION ---
// Pehle Security System load hoga, Data nahi.
document.addEventListener("DOMContentLoaded", setupSecuritySystem);

// ==========================================
// 1. SECURITY SYSTEM LOGIC
// ==========================================
function setupSecuritySystem() {
    const sensor = document.getElementById('security-sensor');
    const inputBox = document.getElementById('security-input-box');
    const passInput = document.getElementById('security-pass');
    const verifyBtn = document.getElementById('security-btn');
    const errorMsg = document.getElementById('security-error');

    // 1. Sensor Logic (3 Taps on "Calculating Data")
    if (sensor) {
        sensor.addEventListener('click', () => {
            securityTaps++;
            console.log("Security Tap:", securityTaps);
            if (securityTaps >= 3) {
                // 3rd click par input box dikhayein
                inputBox.classList.add('visible');
            }
        });
    }

    // 2. Verify Password
    if (verifyBtn && passInput) {
        verifyBtn.addEventListener('click', () => {
            if (passInput.value === SECURITY_PIN) {
                // Success: Hide Overlay & Start System
                document.getElementById('loader-overlay').classList.add('hidden');
                checkAuthAndInit(); // Ab asli data load shuru hoga
            } else {
                // Fail
                errorMsg.classList.remove('hidden');
                passInput.value = '';
                passInput.focus();
            }
        });
        
        // Enter key support
        passInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') verifyBtn.click();
        });
    }
}

// ==========================================
// 2. MAIN APP LOGIC (Starts after unlock)
// ==========================================
async function checkAuthAndInit() {
    try {
        // showSystemLoader("Verifying Session..."); // Overlay already removed

        // 1. Fetch Config
        const response = await fetch('/api/firebase-config');
        if (!response.ok) throw new Error('Config load failed');
        const config = await response.json();
        
        // 2. Init Firebase
        const app = initializeApp(config);
        auth = getAuth(app);
        db = getDatabase(app);

        // 3. AUTH GUARD
        onAuthStateChanged(auth, (user) => {
            if (user) {
                console.log("✅ Authenticated as:", user.email);
                fetchAllData(); // Proceed to load data
            } else {
                console.warn("⚠️ Not logged in. Redirecting...");
                window.location.href = 'login.html'; 
            }
        });
        
        // Sorting Listener Attach Karein
        setupSortingListener();

    } catch (error) {
        console.error("Init Error:", error);
        alert("System Error: " + error.message);
    }
}

// --- DATA FETCHING ---
async function fetchAllData() {
    try {
        injectScannerUI(0); // Show initial scanner UI
        document.getElementById('scanner-text').textContent = "Connecting Database...";
        
        const [membersSnap, txSnap, loansSnap] = await Promise.all([
            get(ref(db, 'members')),
            get(ref(db, 'transactions')),
            get(ref(db, 'activeLoans'))
        ]);

        if (!membersSnap.exists()) throw new Error("No members found.");

        rawMembers = membersSnap.val();
        rawTransactions = txSnap.exists() ? txSnap.val() : {};
        rawActiveLoans = loansSnap.exists() ? loansSnap.val() : {};

        prepareAndStartQueue();

    } catch (error) {
        alert("Database Error: " + error.message);
    }
}

// --- STEP 1: PREPARE DATA ---
function prepareAndStartQueue() {
    document.getElementById('scanner-text').textContent = "Organizing Data...";
    
    allTransactionsList = [];
    memberDataMap.clear();
    transactionsByMember = {};

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
        
        if(transactionsByMember[tx.memberId]) {
            transactionsByMember[tx.memberId].push(record);
        }
    }
    allTransactionsList.sort((a, b) => a.date - b.date || a.id - b.id);

    const memberIdsToProcess = Object.keys(rawMembers).filter(id => rawMembers[id].status === 'Approved');
    
    // UI Update
    injectScannerUI(memberIdsToProcess.length);
    startLiveQueue(memberIdsToProcess);
}

// --- STEP 2: LIVE QUEUE (One by One) ---
let communityStats = {
    totalMembers: 0, totalSip: 0, totalProfitDistributed: 0, totalWalletLiability: 0
};

function startLiveQueue(memberIds) {
    let index = 0;
    const total = memberIds.length;

    function processNext() {
        if (index >= total) {
            document.getElementById('scanner-text').textContent = "Dashboard Ready ✅";
            setTimeout(() => {
                const scanner = document.getElementById('live-scanner-status');
                if(scanner) scanner.remove();
            }, 2000);
            return;
        }

        const id = memberIds[index];
        const m = rawMembers[id];

        // Update Scanner UI
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
                // Using External Score Engine
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

                // Update Stats
                communityStats.totalMembers++;
                communityStats.totalSip += totalSip;
                communityStats.totalProfitDistributed += lifetimeProfit;
                communityStats.totalWalletLiability += walletData.total;
                
                updateSummaryUI(communityStats);

            } catch (err) { console.error(`Error calculating ${m.fullName}:`, err); }

            index++;
            setTimeout(processNext, 5); // Fast processing
        }, 5);
    }
    processNext();
}

// --- RENDERING & UI UTILS ---
function injectScannerUI(totalCount) {
    const grid = document.getElementById('members-grid');
    // Agar pehle se scanner hai to use reuse karein ya replace karein
    const existingScanner = document.getElementById('live-scanner-status');
    if (existingScanner) existingScanner.remove();

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
    grid.prepend(scanner); // Top pe lagayein
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
    
    // History Access ke liye Global Variable
    window[`history_${m.id}`] = m.walletHistory;
    
    grid.appendChild(card);
}

// ==========================================
// 3. SORTING LOGIC (The Fix)
// ==========================================
function setupSortingListener() {
    const sortSelect = document.getElementById('sort-select');
    if (sortSelect) {
        sortSelect.addEventListener('change', (e) => {
            handleSort(e.target.value);
        });
    }
}

function handleSort(criteria) {
    if (!renderedMembersCache || renderedMembersCache.length === 0) {
        console.warn("Data not ready for sorting yet.");
        return;
    }

    // Grid Clear
    const grid = document.getElementById('members-grid');
    
    // Scanner ko bacha ke rakhein ya remove kar dein (yahan remove kar rahe hain kyunki calculation done hai)
    grid.innerHTML = '';

    let sortedData = [...renderedMembersCache];

    switch (criteria) {
        case 'profit': sortedData.sort((a, b) => b.profit - a.profit); break;
        case 'score': sortedData.sort((a, b) => b.score - a.score); break;
        case 'balance': sortedData.sort((a, b) => b.walletBalance - a.walletBalance); break;
        case 'name': 
        default: sortedData.sort((a, b) => a.name.localeCompare(b.name)); break;
    }

    sortedData.forEach(member => appendMemberCard(member));
}


// --- UTILS & MATH (SAME AS BEFORE) ---
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

function calculateProfitDistribution(paymentRecord) { 
    const totalInterest = paymentRecord.returnAmount; if (totalInterest <= 0) return null; 
    const distribution = [{ name: paymentRecord.name, share: totalInterest * 0.10, type: 'Self Return (10%)' }];
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
            share *= (days > 365 ? 0.75 : (days > 180 ? 0.90 : 1.0)); 
            if (share > 0) distribution.push({ name, share, type: 'Community Profit' }); 
        } 
    }
    return { distribution }; 
}

function updateSummaryUI(s) { 
    document.getElementById('total-members').textContent = s.totalMembers; 
    document.getElementById('total-community-sip').textContent = formatCurrency(s.totalSip); 
    document.getElementById('total-community-profit').textContent = formatCurrency(s.totalProfitDistributed); 
    document.getElementById('total-wallet-liability').textContent = formatCurrency(s.totalWalletLiability); 
}
function formatCurrency(n) { return `₹${Math.floor(n).toLocaleString('en-IN')}`; }

// Global Scope Export for Modal Button
window.showLocalHistory = function(memberId) {
    const history = window[`history_${memberId}`] || [];
    const modal = document.getElementById('history-modal');
    const list = document.getElementById('modal-history-list');
    const nameEl = document.getElementById('modal-member-name');
    
    // Find name from cache
    const member = renderedMembersCache.find(m => m.id === memberId);
    nameEl.textContent = member ? member.name : 'Member';
    
    list.innerHTML = '';
    if(history.length === 0) {
        list.innerHTML = '<p class="text-center text-gray-400 text-xs py-2">No history found.</p>';
    } else {
        // Reverse for latest first
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
    
    // Close Logic
    document.getElementById('close-modal').onclick = () => modal.classList.add('hidden');
    modal.onclick = (e) => { if(e.target === modal) modal.classList.add('hidden'); };
}
