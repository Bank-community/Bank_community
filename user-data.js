// user-data.js - FIXED LOAN PATH & BALANCE CALCULATION
// RESPONSIBILITY: Fetch All Data & Calculate Balances Dynamically
// FIX: Separate Raw Cache Key to prevent blank screen on page return

const DEFAULT_IMAGE = 'https://i.ibb.co/HTNrbJxD/20250716-222246.png';
const PRIME_MEMBERS = ["Prince Rama", "Amit kumar", "Mithilesh Sahni"];

// 🔥 NAYA: Humne Raw Data ke liye alag key banayi hai taaki data gayab na ho
const CACHE_KEY_RAW = 'tcf_raw_data_cache'; 
const CACHE_TIME_KEY = 'tcf_cache_timestamp'; 
const CACHE_EXPIRY_MS = 5 * 60 * 1000; // 5 Minutes

export async function fetchAndProcessData(database, onUpdate = null) {
    
    // 1. Pata lagana ki user ne khud Refresh kiya hai ya navigation se aaya hai
    let isManualRefresh = false;
    if (window.performance) {
        const navEntries = performance.getEntriesByType("navigation");
        if (navEntries.length > 0 && navEntries[0].type === "reload") {
            isManualRefresh = true;
        } else if (performance.navigation && performance.navigation.type === 1) {
            isManualRefresh = true;
        }
    }

    const lastFetchTime = localStorage.getItem(CACHE_TIME_KEY) || 0;
    const timeDiff = Date.now() - parseInt(lastFetchTime);
    const cachedRawStr = localStorage.getItem(CACHE_KEY_RAW);

    // 🔥 2. SMART CACHE VALIDATION (5-Minute Blocker)
    if (!isManualRefresh && timeDiff < CACHE_EXPIRY_MS && cachedRawStr) {
        console.log("⚡ [Smart Cache] 5 minute nahi hue. Firebase ko bypass kiya gaya!");
        if (onUpdate) {
            try {
                const rawData = JSON.parse(cachedRawStr);
                onUpdate(processRawData(rawData)); // Cache se data load karke dikhao
            } catch(e) {}
        }
        return; // Yahin rok do, Firebase ko request nahi jayegi
    }

    if (isManualRefresh) {
        console.log("🔄 Manual refresh detected. Fetching fresh data...");
    }

    if (!database) return;

    try {
        // 3. Fetch Data from Firebase
        const [membersSnap, txSnap, adminSnap, penaltySnap, loansSnap, notifSnap, autoSnap, prodSnap, lifetimeSnap] = await Promise.all([
            database.ref('members').once('value'),
            database.ref('transactions').once('value'),
            database.ref('admin').once('value'),
            database.ref('penaltyWallet').once('value'),
            database.ref('activeLoans').once('value'), 
            database.ref('notifications').once('value'),
            database.ref('automatedQueue').once('value'),
            database.ref('products').once('value'),
            database.ref('lifetimeStats').once('value') 
        ]);

        const rawData = {
            members: membersSnap.val() || {},
            transactions: txSnap.val() || {},
            admin: adminSnap.val() || {},
            penaltyWallet: penaltySnap.val() || {},
            activeLoans: loansSnap.val() || {}, 
            notifications: notifSnap.val() || {},
            automatedQueue: autoSnap.val() || {},
            products: prodSnap.val() || {},
            lifetimeStats: lifetimeSnap.val() || {} 
        };

        // 4. Save Raw Data & New Timestamp
        localStorage.setItem(CACHE_KEY_RAW, JSON.stringify(rawData));
        localStorage.setItem(CACHE_TIME_KEY, Date.now().toString()); 
        
        const processed = processRawData(rawData);
        if (onUpdate) onUpdate(processed);

    } catch (error) {
        console.error("Data Fetch Failed:", error);
        // Agar internet band ho jaye, to cache se dikhao
        if (cachedRawStr && onUpdate) {
            onUpdate(processRawData(JSON.parse(cachedRawStr)));
        }
    }
}

// ---------------------------------------------------------
// NEECHE KA CODE AAPKA PURANA WALA HI HAI (Data Processing)
// ---------------------------------------------------------

function processRawData(data) {
    const rawMembers = data.members || {};
    const rawTx = data.transactions || {}; 
    const rawLoans = data.activeLoans || {};
    const rawAdmin = data.admin || {};
    const rawPenalty = data.penaltyWallet || {};
    const rawLifetime = data.lifetimeStats || {}; 

    const allTransactions = Object.values(rawTx).map(tx => {
        if (tx.amount === undefined && (tx.principalPaid !== undefined || tx.interestPaid !== undefined)) {
            tx.amount = (parseFloat(tx.principalPaid) || 0) + (parseFloat(tx.interestPaid) || 0);
        }
        return tx;
    }).sort((a, b) => new Date(b.date) - new Date(a.date));

    const memberBalances = {};

    allTransactions.forEach(tx => {
        if (!memberBalances[tx.memberId]) memberBalances[tx.memberId] = 0;
        const amt = parseFloat(tx.amount || 0);

        if (tx.type === 'SIP' || tx.type === 'Extra Payment') {
            memberBalances[tx.memberId] += amt;
        } else if (tx.type === 'Extra Withdraw') {
            memberBalances[tx.memberId] -= amt;
        }
    });

    const processedMembers = Object.keys(rawMembers).map(key => {
        const m = rawMembers[key];
        let finalBalance = parseFloat(m.accountBalance || 0);
        if (finalBalance === 0 && memberBalances[key]) {
            finalBalance = memberBalances[key]; 
        }

        const currentMonth = new Date().toISOString().slice(0, 7); 
        let isPaid = false;
        let sipAmount = 0;

        if (m.sipHistory && m.sipHistory[currentMonth]) {
            isPaid = true;
            sipAmount = m.sipHistory[currentMonth].amount;
        } else {
            const hasTx = allTransactions.find(t => 
                t.memberId === key && 
                (t.type === 'SIP' || t.type === 'Extra Payment') && 
                t.date.startsWith(currentMonth)
            );
            if (hasTx) {
                isPaid = true;
                sipAmount = hasTx.amount;
            }
        }

        return {
            id: key,
            name: m.fullName || m.name || 'Unknown',
            balance: finalBalance,
            displayImageUrl: m.profilePicUrl || m.profileImage || DEFAULT_IMAGE,
            isPrime: PRIME_MEMBERS.some(p => p.toLowerCase() === (m.fullName || '').toLowerCase()),
            sipStatus: { paid: isPaid, amount: sipAmount },
            loanCount: m.loanCount || 0,
            totalReturn: m.totalReturn || 0,
            ...m
        };
    }).sort((a, b) => b.balance - a.balance);

    const stats = {
        totalSipAmount: parseFloat(rawAdmin.balanceStats?.totalSIP || 0),
        totalCurrentLoanAmount: parseFloat(rawAdmin.balanceStats?.totalActiveLoans || 0),
        netReturnAmount: parseFloat(rawAdmin.balanceStats?.totalReturn || 0),
        availableCommunityBalance: parseFloat(rawAdmin.balanceStats?.availableBalance || 0),
        totalPenaltyBalance: parseFloat(rawPenalty.availableBalance || 0),
        totalLoanDisbursed: parseFloat(rawLifetime.totalLoanIssued || 0) 
    };

    return {
        processedMembers,
        allTransactions,
        penaltyWalletData: rawPenalty,
        communityStats: stats,
        rawActiveLoans: rawLoans, 
        manualNotifications: data.notifications?.manual || {},
        automatedQueue: data.automatedQueue || {},
        allProducts: data.products || {},
        headerButtons: rawAdmin.header_buttons || {}
    };
}
