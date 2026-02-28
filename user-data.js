// user-data.js - FINAL FORMULA VERSION (Strict SIP - Loans = Available)
// RESPONSIBILITY: Force Calculate Everything from Transaction History

const DEFAULT_IMAGE = 'https://i.ibb.co/HTNrbJxD/20250716-222246.png';
const PRIME_MEMBERS = ["Prince Rama", "Amit kumar", "Mithilesh Sahni"];
const CACHE_KEY = 'tcf_royal_cache_v11'; // Version 11: Fresh Start

export async function fetchAndProcessData(database, onUpdate = null) {
    // 1. Load Cache (Fast View)
    if (onUpdate) {
        try {
            const cachedRaw = localStorage.getItem(CACHE_KEY);
            if (cachedRaw) {
                onUpdate(processRawData(JSON.parse(cachedRaw))); 
            }
        } catch (e) { console.warn("Cache Warning"); }
    }

    if (!database) return;

    try {
        // 2. Fetch Fresh Data from Database
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

        // Update Cache
        localStorage.setItem(CACHE_KEY, JSON.stringify(rawData));
        
        // Process Data
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

    // -----------------------------------------------------------
    // 🧹 STEP 1: CLEAN TRANSACTIONS (History)
    // -----------------------------------------------------------
    const allTransactions = Object.values(rawTx).map(tx => {
        // Agar amount field gayab hai, to usse banao
        if (tx.amount === undefined && (tx.principalPaid !== undefined || tx.interestPaid !== undefined)) {
            tx.amount = (parseFloat(tx.principalPaid) || 0) + (parseFloat(tx.interestPaid) || 0);
        }
        return tx;
    }).sort((a, b) => new Date(b.date) - new Date(a.date));

    // -----------------------------------------------------------
    // 🧮 STEP 2: CALCULATE TOTAL SIP & INTEREST (From History)
    // -----------------------------------------------------------
    let grandTotalSIP = 0;      
    let grandTotalInterest = 0; // Returns
    const memberRealBalances = {}; // Har member ka asli balance

    allTransactions.forEach(tx => {
        const amt = parseFloat(tx.amount || 0);
        const type = tx.type || '';
        const mId = tx.memberId;

        // Member ka wallet initialize karo
        if (!memberRealBalances[mId]) memberRealBalances[mId] = 0;

        // --- Logic: Total SIP ---
        if (type === 'SIP' || type === 'Extra Payment') {
            grandTotalSIP += amt;         // Community SIP badhao
            memberRealBalances[mId] += amt; // Member ka balance badhao
        } 
        else if (type === 'Extra Withdraw') {
            // Withdraw se community SIP kam nahi hota, bas available cash kam hota hai
            // Lekin member ka balance kam hota hai
            memberRealBalances[mId] -= amt; 
            grandTotalSIP -= amt; // Agar aap chahte hain ki withdraw se Total Fund kam dikhe
        }

        // --- Logic: Interest (Returns) ---
        if (type === 'Loan Payment') {
            const interest = parseFloat(tx.interestPaid || 0);
            grandTotalInterest += interest; 
        }
    });

    // -----------------------------------------------------------
    // 📉 STEP 3: CALCULATE ACTIVE LOANS (From ActiveLoans Node)
    // -----------------------------------------------------------
    let grandTotalActiveLoans = 0;
    
    Object.values(rawLoans).forEach(loan => {
        if (loan.status === 'Active') {
            // Hum 'amount' (Principal) lenge
            grandTotalActiveLoans += parseFloat(loan.amount || loan.originalAmount || 0);
        }
    });

    // -----------------------------------------------------------
    // ⚖️ STEP 4: YOUR FORMULA (The Supreme Logic)
    // Formula: Total SIP - Active Loans = Available Balance
    // Note: Hum Interest bhi jod rahe hain kyunki wo bhi Cash In Hand hai
    // -----------------------------------------------------------
    
    // Total Cash In Hand = (SIP Ka Paisa + Byaj Ka Paisa) - (Loan Me Diya Paisa)
    let calculatedAvailableBalance = (grandTotalSIP + grandTotalInterest) - grandTotalActiveLoans;

    // Safety: Negative na ho
    if (calculatedAvailableBalance < 0) calculatedAvailableBalance = 0;

    // -----------------------------------------------------------
    // 👤 STEP 5: FIX MEMBERS (Ignore Database 'accountBalance')
    // -----------------------------------------------------------
    const processedMembers = Object.keys(rawMembers).map(key => {
        const m = rawMembers[key];

        // 🛑 DATABASE VALUE IGNORED
        // Humne jo upar 'memberRealBalances' calculate kiya, wahi use karenge
        const actualBalance = memberRealBalances[key] || 0;

        // SIP Status Logic
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
            
            // 🔥 REAL CALCULATED BALANCE
            balance: actualBalance, 
            
            displayImageUrl: m.profilePicUrl || m.profileImage || DEFAULT_IMAGE,
            isPrime: PRIME_MEMBERS.some(p => p.toLowerCase() === (m.fullName || '').toLowerCase()),
            sipStatus: { paid: isPaid, amount: sipAmount },
            loanCount: m.loanCount || 0,
            totalReturn: m.totalReturn || 0,
            ...m 
        };
    }).sort((a, b) => b.balance - a.balance);

    // -----------------------------------------------------------
    // 📊 STEP 6: FIX TCF CARD (Ignore Database Stats)
    // -----------------------------------------------------------
    const stats = {
        totalSipAmount: grandTotalSIP,               // History se calculated
        totalCurrentLoanAmount: grandTotalActiveLoans, // Active Loan node se calculated
        netReturnAmount: grandTotalInterest,         // History se calculated
        
        availableCommunityBalance: calculatedAvailableBalance, // Formula Result
        
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
