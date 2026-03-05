// user-data.js - FIXED LOAN PATH & BALANCE CALCULATION
// RESPONSIBILITY: Fetch All Data & Calculate Balances Dynamically
// ADDED: Smart Caching to reduce Firebase Reads & Loading Time

const DEFAULT_IMAGE = 'https://i.ibb.co/HTNrbJxD/20250716-222246.png';
const PRIME_MEMBERS = ["Prince Rama", "Amit kumar", "Mithilesh Sahni"];
const CACHE_KEY = 'tcf_royal_cache_v7'; 
const CACHE_TIME_KEY = 'tcf_cache_timestamp'; // 🔥 NAYA: Time track karne ke liye
const CACHE_EXPIRY_MS = 5 * 60 * 1000; // 🔥 NAYA: 5 minutes ki limit (Millisecond mein)

export async function fetchAndProcessData(database, onUpdate = null) {
    let cachedDataLoaded = false;

    // 1. Load Cache First (Instant UI)
    if (onUpdate) {
        try {
            const cachedRaw = localStorage.getItem(CACHE_KEY);
            if (cachedRaw) {
                const parsedData = JSON.parse(cachedRaw);
                onUpdate(processRawData(parsedData)); 
                cachedDataLoaded = true;
            }
        } catch (e) { console.warn("Cache Warning"); }
    }

    if (!database) return;

    // 🔥 NAYA KAMAAL: Pata lagana ki user ne "Refresh" (Swipe Down/F5) kiya hai ya navigation se aaya hai
    let isManualRefresh = false;
    if (window.performance) {
        const navEntries = performance.getEntriesByType("navigation");
        if (navEntries.length > 0 && navEntries[0].type === "reload") {
            isManualRefresh = true; // User ne khud refresh kiya hai
        } else if (performance.navigation && performance.navigation.type === 1) {
            isManualRefresh = true; // Purane browsers ke liye
        }
    }

    // 🔥 SMART CACHE VALIDATION: Agar manual refresh nahi hai aur 5 minute nahi hue hain, to Firebase fetch rok do
    const lastFetchTime = localStorage.getItem(CACHE_TIME_KEY) || 0;
    const timeDiff = Date.now() - parseInt(lastFetchTime);

    if (!isManualRefresh && timeDiff < CACHE_EXPIRY_MS && cachedDataLoaded) {
        console.log("⚡ [Smart Cache] Valid data found. Skipping Firebase Fetch to save database reads!");
        return; // Yahin se code rok do, Firebase ko request nahi jayegi!
    }

    if (isManualRefresh) {
        console.log("🔄 [TCF Update] Manual refresh detected. Fetching fresh data from Firebase...");
    }

    try {
        // 2. Fetch Data (Parallel)
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

        // 3. Save & Process
        localStorage.setItem(CACHE_KEY, JSON.stringify(rawData));
        localStorage.setItem(CACHE_TIME_KEY, Date.now().toString()); // 🔥 NAYA: Naya time save karo
        
        const processed = processRawData(rawData);

        if (onUpdate) onUpdate(processed);

    } catch (error) {
        console.error("Data Fetch Failed:", error);
    }
}

// ---------------------------------------------------------
// NEECHE KA CODE AAPKA PURANA WALA HI HAI (No changes here)
// ---------------------------------------------------------

function processRawData(data) {
    const rawMembers = data.members || {};
    const rawTx = data.transactions || {}; 
    const rawLoans = data.activeLoans || {};
    const rawAdmin = data.admin || {};
    const rawPenalty = data.penaltyWallet || {};
    const rawLifetime = data.lifetimeStats || {}; 

       // Convert Transactions to Array
    const allTransactions = Object.values(rawTx).map(tx => {
        // Agar amount field missing hai (jaise Loan Payment me), to principal aur interest ko jodein
        if (tx.amount === undefined && (tx.principalPaid !== undefined || tx.interestPaid !== undefined)) {
            tx.amount = (parseFloat(tx.principalPaid) || 0) + (parseFloat(tx.interestPaid) || 0);
        }
        return tx;
    }).sort((a, b) => new Date(b.date) - new Date(a.date));

    // A. Calculate Dynamic Balances (Fix for 0 issue)
    const memberBalances = {};

    allTransactions.forEach(tx => {
        if (!memberBalances[tx.memberId]) memberBalances[tx.memberId] = 0;
        const amt = parseFloat(tx.amount || 0);

        // Add Logic: Deposit badhata hai, Withdraw ghatata hai
        if (tx.type === 'SIP' || tx.type === 'Extra Payment') {
            memberBalances[tx.memberId] += amt;
        } else if (tx.type === 'Extra Withdraw') {
            memberBalances[tx.memberId] -= amt;
        }
        // Loan len-den balance ko affect nahi karta (community fund logic)
    });

    // B. Process Members
    const processedMembers = Object.keys(rawMembers).map(key => {
        const m = rawMembers[key];

        // Balance Priority: Database > Calculated > 0
        let finalBalance = parseFloat(m.accountBalance || 0);
        if (finalBalance === 0 && memberBalances[key]) {
            finalBalance = memberBalances[key]; // Fallback to calculation
        }

        // SIP Status Logic
        const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM
        let isPaid = false;
        let sipAmount = 0;

        if (m.sipHistory && m.sipHistory[currentMonth]) {
            isPaid = true;
            sipAmount = m.sipHistory[currentMonth].amount;
        } else {
            // Check transactions if manual flag missing
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

    // C. Community Stats
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
