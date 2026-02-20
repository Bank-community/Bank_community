// ==========================================
// MASTER PROFIT LOGIC (v8.0 - STEALTH 5-TAP SECURITY)
// Features: 5 Taps Unlock, Hidden Counter, Numeric Keypad Support
// ==========================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-auth.js";
import { getDatabase, ref, get } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-database.js";

// --- GLOBAL VARIABLES ---
let db, auth;
let rawMembers = {}, rawTransactions = {}, rawActiveLoans = {};
let allTransactionsList = [], memberDataMap = new Map(), transactionsByMember = {}, renderedMembersCache = [];
let securityTaps = 0; 

const DEFAULT_IMG = 'https://i.ibb.co/HTNrbJxD/20250716-222246.png';
const SECURITY_PIN = '74123690'; 

// --- INITIALIZATION ---
// Code load hote hi Security System activate karein
setupStealthSecurity(); 

// ==========================================
// 1. STEALTH SECURITY SYSTEM (5 Taps, No Visuals)
// ==========================================
function setupStealthSecurity() {
    console.log("🔒 Stealth Security Mode: Active");
    
    const overlay = document.getElementById('loader-overlay');
    const inputBox = document.getElementById('security-input-box');
    const passInput = document.getElementById('security-pass');
    const verifyBtn = document.getElementById('security-btn');
    const errorMsg = document.getElementById('security-error');
    const dummyText = document.getElementById('dummy-text');

    // 1. Sensor Logic (Full Screen Tap)
    if (overlay) {
        overlay.addEventListener('click', (e) => {
            // Agar input box ya button pe click kiya to count mat badhao
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'BUTTON') return;

            securityTaps++;
            // console.log("Tap:", securityTaps); // Testing ke liye console me dikhega

            // FEEDBACK: Sirf Vibration (Stealth Mode) - Text change nahi hoga
            if (navigator.vibrate) navigator.vibrate(30); 

            // 5th Click par Box Dikhana
            if (securityTaps >= 5) {
                if(inputBox) {
                    inputBox.classList.add('visible');
                    // Focus taaki keyboard khul jaye
                    setTimeout(() => {
                        if(passInput) passInput.focus();
                    }, 100);
                }
                if(dummyText) {
                    dummyText.textContent = "AUTHENTICATION REQUIRED";
                    dummyText.style.color = "#D4AF37"; // Gold Color
                }
            }
        });
    }

    // 2. Verify Password Logic
    if (verifyBtn && passInput) {
        const verifyAction = () => {
            if (passInput.value === SECURITY_PIN) {
                // SUCCESS
                if(overlay) {
                    overlay.style.transition = "opacity 0.5s ease";
                    overlay.style.opacity = "0";
                    setTimeout(() => overlay.remove(), 500); 
                }
                checkAuthAndInit(); // Data Load Start
            } else {
                // FAIL
                errorMsg.classList.remove('hidden');
                if(navigator.vibrate) navigator.vibrate([100, 50, 100]); // Error Vibrate
                passInput.value = '';
            }
        };

        verifyBtn.addEventListener('click', verifyAction);

        // Enter Key Support
        passInput.addEventListener('keyup', (e) => {
            if (e.key === 'Enter') verifyAction();
        });
    }
}

// ==========================================
// 2. MAIN APP LOGIC (Starts after unlock)
// ==========================================
async function checkAuthAndInit() {
    try {
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
                fetchAllData(); 
            } else {
                window.location.href = 'login.html'; 
            }
        });
        
        setupSortingListener();

    } catch (error) {
        alert("System Error: " + error.message);
    }
}

// --- DATA FETCHING ---
async function fetchAllData() {
    try {
        injectScannerUI(0);
        const scannerText = document.getElementById('scanner-text');
        if(scannerText) scannerText.textContent = "Connecting Database...";
        
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
        console.error(error);
        alert("Data Error: " + error.message);
    }
}

// --- PREPARE DATA ---
function prepareAndStartQueue() {
    const scannerText = document.getElementById('scanner-text');
    if(scannerText) scannerText.textContent = "Processing Records...";
    
    allTransactionsList = [];
    memberDataMap.clear();
    transactionsByMember = {};

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
    injectScannerUI(memberIdsToProcess.length);
    startLiveQueue(memberIdsToProcess);
}

// --- LIVE QUEUE ---
let communityStats = { totalMembers: 0, totalSip: 0, totalProfitDistributed: 0, totalWalletLiability: 0 };

function startLiveQueue(memberIds) {
    let index = 0;
    const total = memberIds.length;

    function processNext() {
        if (index >= total) {
            const scannerText = document.getElementById('scanner-text');
            if(scannerText) scannerText.textContent = "Dashboard Ready ✅";
            setTimeout(() => {
                const scanner = document.getElementById('live-scanner-status');
                if(scanner) scanner.remove();
            }, 1000);
            return;
        }

        const id = memberIds[index];
        const m = rawMembers[id];

        const scannerText = document.getElementById('scanner-text');
        const scannerCount = document.getElementById('scanner-count');
        const scannerBar = document.getElementById('scanner-bar');

        if(scannerText) scannerText.textContent = `Analyzing: ${m.fullName}`;
        if(scannerCount) scannerCount.textContent = `${index + 1}/${total}`;
        if(scannerBar) scannerBar.style.width = `${((index + 1) / total) * 100}%`;

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
            } catch (err) { console.error(err); }

            index++;
            setTimeout(processNext, 2);
        }, 2);
    }
    processNext();
}

// --- UI & SORTING ---
function injectScannerUI(totalCount) {
    const grid = document.getElementById('members-grid');
    if(!grid) return;
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
    grid.prepend(scanner);
}

function appendMemberCard(m) {
    const grid = document.getElementById('members-grid');
    if(!grid) return;
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

function setupSortingListener() {
    const sortSelect = document.getElementById('sort-select');
    if (sortSelect) {
        sortSelect.addEventListener('change', (e) => handleSort(e.target.value));
    }
}

function handleSort(criteria) {
    if (!renderedMembersCache || renderedMembersCache.length === 0) return;
    const grid = document.getElementById('members-grid');
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
    const els = {
        'total-members': s.totalMembers,
        'total-community-sip': formatCurrency(s.totalSip),
        'total-community-profit': formatCurrency(s.totalProfitDistributed),
        'total-wallet-liability': formatCurrency(s.totalWalletLiability)
    };
    for(const id in els) {
        const el = document.getElementById(id);
        if(el) el.textContent = els[id];
    }
}
function formatCurrency(n) { return `₹${Math.floor(n).toLocaleString('en-IN')}`; }

window.showLocalHistory = function(memberId) {
    const history = window[`history_${memberId}`] || [];
    const modal = document.getElementById('history-modal');
    const list = document.getElementById('modal-history-list');
    const nameEl = document.getElementById('modal-member-name');
    
    if(!modal || !list) return;

    const member = renderedMembersCache.find(m => m.id === memberId);
    if(nameEl) nameEl.textContent = member ? member.name : 'Member';
    
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
    const closeBtn = document.getElementById('close-modal');
    if(closeBtn) closeBtn.onclick = () => modal.classList.add('hidden');
    modal.onclick = (e) => { if(e.target === modal) modal.classList.add('hidden'); };
}
