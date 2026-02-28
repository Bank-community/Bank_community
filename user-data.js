// user-data.js - SUPREME LOGIC (Self-Correcting Engine)
// RESPONSIBILITY: Force Calculate Balances from History & Ignore Wrong DB Data

const DEFAULT_IMAGE = 'https://i.ibb.co/HTNrbJxD/20250716-222246.png';
const PRIME_MEMBERS = ["Prince Rama", "Amit kumar", "Mithilesh Sahni"];
const CACHE_KEY = 'tcf_royal_cache_v10'; // Version 10: Force New Logic

export async function fetchAndProcessData(database, onUpdate = null) {
    // 1. Load Cache (Fast View)
    if (onUpdate) {
        try {
            const cachedRaw = localStorage.getItem(CACHE_KEY);
            if (cachedRaw) {
                // Cache data ko bhi wapas re-calculate karke bhejo
                onUpdate(processRawData(JSON.parse(cachedRaw))); 
            }
        } catch (e) { console.warn("Cache Warning"); }
    }

    if (!database) return;

    try {
        // 2. Fetch Fresh Data
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

        // Save Raw Data (Logic will run on this raw data every time)
        localStorage.setItem(CACHE_KEY, JSON.stringify(rawData));
        
        // Process & Calculate
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
    // 🕵️‍♂️ STEP 1: PREPARE TRANSACTIONS (Sabse Pehle History Nikalo)
    // -----------------------------------------------------------
    const allTransactions = Object.values(rawTx).map(tx => {
        // Fix: Agar amount gayab hai (Loan Payment me), to principal+interest jodo
        if (tx.amount === undefined && (tx.principalPaid !== undefined || tx.interestPaid !== undefined)) {
            tx.amount = (parseFloat(tx.principalPaid) || 0) + (parseFloat(tx.interestPaid) || 0);
        }
        return tx;
    }).sort((a, b) => new Date(b.date) - new Date(a.date));

    // -----------------------------------------------------------
    // 🧮 STEP 2: MASTER CALCULATION LOOP (Self-Correction Mode)
    // -----------------------------------------------------------
    
    // Global Counters (Community Fund)
    let calculatedTotalSIP = 0;      
    let calculatedTotalInterest = 0; 

    // Individual Member Wallets (Har member ka hisaab)
    const memberRealWallets = {}; 

    // Loop through EVERY transaction
    allTransactions.forEach(tx => {
        const amt = parseFloat(tx.amount || 0);
        const type = tx.type || '';
        const mId = tx.memberId;

        // Init Member Wallet if needed
        if (!memberRealWallets[mId]) memberRealWallets[mId] = 0;

        // --- Logic A: Member Balance & Total SIP ---
        if (type === 'SIP' || type === 'Extra Payment') {
            memberRealWallets[mId] += amt; // Member ka paisa bada
            calculatedTotalSIP += amt;     // Community ka SIP bada
        } 
        else if (type === 'Extra Withdraw') {
            memberRealWallets[mId] -= amt; // Member ne paisa nikala
            // Note: Community SIP amount usually remains cumulative, but available balance drops.
        }

        // --- Logic B: Interest Earnings ---
        if (type === 'Loan Payment') {
            const interest = parseFloat(tx.interestPaid || 0);
            calculatedTotalInterest += interest; // Ye Community ki kamai hai
        }
    });

    // -----------------------------------------------------------
    // 📉 STEP 3: ACTIVE LOANS (Kitna paisa bahar hai?)
    // -----------------------------------------------------------
    let calculatedActiveLoans = 0;
    let totalLoansDisbursed = parseFloat(rawLifetime.totalLoanIssued || 0);

    Object.values(rawLoans).forEach(loan => {
        if (loan.status === 'Active') {
            // Hum 'amount' (Principal) lenge jo abhi wapas aana baki hai
            calculatedActiveLoans += parseFloat(loan.amount || loan.originalAmount || 0);
        }
    });

    // -----------------------------------------------------------
    // ⚖️ STEP 4: THE MATCHING LOGIC (Available Balance Formula)
    // Available = (Total SIP + Total Interest Earned) - (Active Loan Principal)
    // -----------------------------------------------------------
    let realAvailableBalance = (calculatedTotalSIP + calculatedTotalInterest) - calculatedActiveLoans;
    
    // Safety: Negative nahi hona chahiye
    if (realAvailableBalance < 0) realAvailableBalance = 0;

    // NOTE: Humne Database ki 'admin.balanceStats.availableBalance' ko check bhi nahi kiya.
    // Sidha 'realAvailableBalance' use karenge. Yehi "Update" logic hai.

    // -----------------------------------------------------------
    // 👤 STEP 5: PROCESS MEMBERS (Override Wrong DB Data)
    // -----------------------------------------------------------
    const processedMembers = Object.keys(rawMembers).map(key => {
        const m = rawMembers[key];

        // 🛑 IMPORTANT: Database ka 'accountBalance' IGNORE karo.
        // Humne jo 'memberRealWallets[key]' calculate kiya hai, wahi SACH hai.
        const actualBalance = memberRealWallets[key] || 0;

        // SIP Status Check (Current Month)
        const currentMonth = new Date().toISOString().slice(0, 7);
        let isPaid = false;
        let sipAmount = 0;

        if (m.sipHistory && m.sipHistory[currentMonth]) {
            isPaid = true;
            sipAmount = m.sipHistory[currentMonth].amount;
        } else {
            // Agar profile me flag nahi hai, to Transaction check karo
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
            
            // 🔥 Yahan humne database ki galti sudhar di
            balance: actualBalance, 
            
            displayImageUrl: m.profilePicUrl || m.profileImage || DEFAULT_IMAGE,
            isPrime: PRIME_MEMBERS.some(p => p.toLowerCase() === (m.fullName || '').toLowerCase()),
            sipStatus: { paid: isPaid, amount: sipAmount },
            loanCount: m.loanCount || 0,
            totalReturn: m.totalReturn || 0,
            ...m // Baki details wahi rahengi
        };
    }).sort((a, b) => b.balance - a.balance);

    // -----------------------------------------------------------
    // 📊 STEP 6: COMMUNITY STATS (Final Corrected Data)
    // -----------------------------------------------------------
    const stats = {
        // Ye teeno values ab HISTORY se calculate hokar aayi hain, DB se nahi.
        totalSipAmount: calculatedTotalSIP,              
        totalCurrentLoanAmount: calculatedActiveLoans,   
        netReturnAmount: calculatedTotalInterest,        
        
        // Ye sabse important fix hai
        availableCommunityBalance: realAvailableBalance, 
        
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
