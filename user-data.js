// user-data.js - MASTER LOGIC VERSION (Auto-Calculation)
// RESPONSIBILITY: Fetch All Data & Calculate Balances Dynamically using Client-Side Logic

const DEFAULT_IMAGE = 'https://i.ibb.co/HTNrbJxD/20250716-222246.png';
const PRIME_MEMBERS = ["Prince Rama", "Amit kumar", "Mithilesh Sahni"];
const CACHE_KEY = 'tcf_royal_cache_v8'; // Cache Version Updated for new logic

export async function fetchAndProcessData(database, onUpdate = null) {
    let cachedDataLoaded = false;

    // 1. Load Cache First
    if (onUpdate) {
        try {
            const cachedRaw = localStorage.getItem(CACHE_KEY);
            if (cachedRaw) {
                const parsedData = JSON.parse(cachedRaw);
                // Cache se bhi master logic run karke hi bhejo
                onUpdate(processRawData(parsedData)); 
                cachedDataLoaded = true;
            }
        } catch (e) { console.warn("Cache Warning"); }
    }

    if (!database) return;

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
        // Raw data save karo, processed nahi, taaki logic change ho to cache purana na lage
        localStorage.setItem(CACHE_KEY, JSON.stringify(rawData));
        
        const processed = processRawData(rawData);
        if (onUpdate) onUpdate(processed);

    } catch (error) {
        console.error("Data Fetch Failed:", error);
    }
}

function processRawData(data) {
    const rawMembers = data.members || {};
    const rawTx = data.transactions || {}; 
    const rawLoans = data.activeLoans || {};
    const rawAdmin = data.admin || {};
    const rawPenalty = data.penaltyWallet || {};
    const rawLifetime = data.lifetimeStats || {};

    // Convert Transactions to Array
    const allTransactions = Object.values(rawTx).map(tx => {
        if (tx.amount === undefined && (tx.principalPaid !== undefined || tx.interestPaid !== undefined)) {
            tx.amount = (parseFloat(tx.principalPaid) || 0) + (parseFloat(tx.interestPaid) || 0);
        }
        return tx;
    }).sort((a, b) => new Date(b.date) - new Date(a.date));

    // ==================================================================
    // 🧠 MASTER LOGIC: LIVE CALCULATION (Saves Bandwidth)
    // ==================================================================
    
    // 1. Calculate Total Inflow (SIP & Interest) from History
    let calculatedTotalSIP = 0;
    let calculatedTotalInterest = 0;

    allTransactions.forEach(tx => {
        const amt = parseFloat(tx.amount || 0);
        // SIP Logic
        if (tx.type === 'SIP' || tx.type === 'Extra Payment') {
            calculatedTotalSIP += amt;
        }
        // Interest Logic (Optional: Balance badhane ke liye zaroori hai)
        if (tx.type === 'Loan Payment') {
            calculatedTotalInterest += parseFloat(tx.interestPaid || 0);
        }
    });

    // 2. Calculate Total Active Loans (Money Currently Out)
    let calculatedActiveLoans = 0;
    let totalLoansDisbursed = parseFloat(rawLifetime.totalLoanIssued || 0);

    Object.values(rawLoans).forEach(loan => {
        if (loan.status === 'Active') {
            // Hum 'originalAmount' ya 'amount' lenge jo market me diya gaya hai
            calculatedActiveLoans += parseFloat(loan.amount || loan.originalAmount || 0);
        }
    });

    // 3. Final Formula: Available = (SIP + Interest) - Active Loans
    // Note: Isme Penalty Wallet alag rakha gaya hai jaisa aapne pehle design kiya tha
    let calculatedAvailableBalance = (calculatedTotalSIP + calculatedTotalInterest) - calculatedActiveLoans;

    // Safety check: Negative na dikhaye
    if (calculatedAvailableBalance < 0) calculatedAvailableBalance = 0;

    // ==================================================================
    // 🧠 END MASTER LOGIC
    // ==================================================================

    // A. Dynamic Member Balances
    const memberBalances = {};
    allTransactions.forEach(tx => {
        if (!memberBalances[tx.memberId]) memberBalances[tx.memberId] = 0;
        const amt = parseFloat(tx.amount || 0);
        if (tx.type === 'SIP' || tx.type === 'Extra Payment') memberBalances[tx.memberId] += amt;
        else if (tx.type === 'Extra Withdraw') memberBalances[tx.memberId] -= amt;
    });

    // B. Process Members
    const processedMembers = Object.keys(rawMembers).map(key => {
        const m = rawMembers[key];
        let finalBalance = parseFloat(m.accountBalance || 0);
        if (finalBalance === 0 && memberBalances[key]) finalBalance = memberBalances[key];

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
            if (hasTx) { isPaid = true; sipAmount = hasTx.amount; }
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

    // C. Community Stats (OVERRIDDEN BY MASTER LOGIC)
    const stats = {
        totalSipAmount: calculatedTotalSIP,              // 🔥 Calculated
        totalCurrentLoanAmount: calculatedActiveLoans,   // 🔥 Calculated
        netReturnAmount: calculatedTotalInterest,        // 🔥 Calculated
        availableCommunityBalance: calculatedAvailableBalance, // 🔥 Calculated Result
        totalPenaltyBalance: parseFloat(rawPenalty.availableBalance || 0),
        totalLoanDisbursed: totalLoansDisbursed
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
