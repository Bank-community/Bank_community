// user-data.js - FIXED LOAN PATH & BALANCE CALCULATION
// RESPONSIBILITY: Fetch All Data & Calculate Balances Dynamically

const DEFAULT_IMAGE = 'https://i.ibb.co/HTNrbJxD/20250716-222246.png';
const PRIME_MEMBERS = ["Prince Rama", "Amit kumar", "Mithilesh Sahni"];
const CACHE_KEY = 'tcf_royal_cache_v6'; // Cache Version Updated

export async function fetchAndProcessData(database, onUpdate = null) {
    let cachedDataLoaded = false;

    // 1. Load Cache First
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

    try {
        // 2. Fetch Data (Parallel)
        // 🔥 FIX: Added 'activeLoans' path correctly
        const [membersSnap, txSnap, adminSnap, penaltySnap, loansSnap, notifSnap, autoSnap, prodSnap] = await Promise.all([
            database.ref('members').once('value'),
            database.ref('transactions').once('value'),
            database.ref('admin').once('value'),
            database.ref('penaltyWallet').once('value'),
            database.ref('activeLoans').once('value'), // 🔥 FIXED PATH (Was 'loans')
            database.ref('notifications').once('value'),
            database.ref('automatedQueue').once('value'),
            database.ref('products').once('value')
        ]);

        const rawData = {
            members: membersSnap.val() || {},
            transactions: txSnap.val() || {},
            admin: adminSnap.val() || {},
            penaltyWallet: penaltySnap.val() || {},
            activeLoans: loansSnap.val() || {}, // 🔥 Correct Data
            notifications: notifSnap.val() || {},
            automatedQueue: autoSnap.val() || {},
            products: prodSnap.val() || {}
        };

        // 3. Save & Process
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

       // Convert Transactions to Array (🔥 FIX: Missing amount calculation for Loans)
    const allTransactions = Object.values(rawTx).map(tx => {
        // Agar amount field missing hai (jaise Loan Payment me), to principal aur interest ko jodein
        if (tx.amount === undefined && (tx.principalPaid !== undefined || tx.interestPaid !== undefined)) {
            tx.amount = (parseFloat(tx.principalPaid) || 0) + (parseFloat(tx.interestPaid) || 0);
        }
        return tx;
    }).sort((a, b) => new Date(b.date) - new Date(a.date));

    // A. Calculate Dynamic Balances (Fix for ₹0 issue)
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
        totalLoanDisbursed: parseFloat(rawAdmin.lifetimeStats?.totalLoanIssued || 0)
    };

    return {
        processedMembers,
        allTransactions,
        penaltyWalletData: rawPenalty,
        communityStats: stats,
        rawActiveLoans: rawLoans, // Sending fixed loans to UI
        manualNotifications: data.notifications?.manual || {},
        automatedQueue: data.automatedQueue || {},
        allProducts: data.products || {},
        headerButtons: rawAdmin.header_buttons || {}
    };
}