// FINAL & CORRECTED UPDATE: "Available Community Balance" logic updated to exclude HIDDEN members.
// DISABLED MEMBER LOGIC ADDED: If disabled AND balance >= 0, hide member & exclude SIP.
// If disabled AND balance < 0 (loan pending), SHOW member.

const DEFAULT_IMAGE = 'https://i.ibb.co/HTNrbJxD/20250716-222246.png';
const PRIME_MEMBERS = ["Prince Rama", "Amit kumar", "Mithilesh Sahni"];
const CACHE_KEY = 'tcf_royal_cache_v1'; // Local Storage Key

/**
 * Data fetch aur process karne ka naya function with Caching Strategy.
 * @param {firebase.database.Database} database - Firebase database instance.
 * @param {Function} onUpdate - Callback function jo UI update karega (do baar call ho sakta hai).
 */
export async function fetchAndProcessData(database, onUpdate = null) {
    let cachedDataLoaded = false;

    // STEP 1: Try to load from Local Storage (INSTANT SPEED)
    if (onUpdate) {
        try {
            const cachedRaw = localStorage.getItem(CACHE_KEY);
            if (cachedRaw) {
                console.log("⚡ Loading from Cache (Instant)...");
                const parsedData = JSON.parse(cachedRaw);
                const processedCache = processRawData(parsedData);
                onUpdate(processedCache); // Turant UI dikhao
                cachedDataLoaded = true;
            }
        } catch (e) {
            console.warn("Cache load failed:", e);
        }
    }

    // STEP 2: Fetch Fresh Data from Firebase (Background)
    try {
        console.log("🌐 Fetching fresh data from Firebase...");
        const snapshot = await database.ref().once('value');
        const data = snapshot.val();
        
        if (!data) {
            throw new Error("Database is empty or could not be read.");
        }

        // Save fresh data to cache for next time
        localStorage.setItem(CACHE_KEY, JSON.stringify(data));

        // Process fresh data
        const processedFresh = processRawData(data);

        // Agar callback hai (new system), to update karo
        if (onUpdate) {
            onUpdate(processedFresh);
        }

        // Return for legacy support (wait karne wale code ke liye)
        return processedFresh;

    } catch (error) {
        console.error('Data processing failed:', error);
        // Agar cache load ho chuka tha aur net fail hua, to error mat phenko, purane data se kaam chalne do
        if (cachedDataLoaded) {
            console.log("⚠️ Network failed, but using cached data.");
            return; 
        }
        throw error;
    }
}

/**
 * Raw Data ko process karne ka logic (Calculation Engine).
 * Ye logic Cache aur Network dono data ke liye same rahega.
 */
function processRawData(data) {
    const allMembersRaw = data.members || {};
    const allTransactionsRaw = data.transactions || {};
    const allActiveLoansRaw = data.activeLoans || {};
    const penaltyWalletRaw = data.penaltyWallet || {};
    const adminSettingsRaw = data.admin || {};
    const notificationsRaw = adminSettingsRaw.notifications || {};
    const manualNotificationsRaw = notificationsRaw.manual || {};
    const automatedQueueRaw = notificationsRaw.automatedQueue || {};
    const allProductsRaw = data.products || {};
    const headerButtonsRaw = adminSettingsRaw.header_buttons || {};

    const processedMembers = {};
    const allTransactions = Object.values(allTransactionsRaw);
    const allActiveLoans = Object.values(allActiveLoansRaw);

    for (const memberId in allMembersRaw) {
        const member = allMembersRaw[memberId];
        // Only skip if status is NOT Approved. isDisabled logic is handled below.
        if (member.status !== 'Approved' || !member.fullName) continue;

        const memberTransactions = allTransactions.filter(tx => tx.memberId === memberId);
        
        let totalSipAmount = 0;
        let totalReturn = 0;
        let loanCount = 0;

        memberTransactions.forEach(tx => {
            if (tx.type === 'SIP') {
                totalSipAmount += parseFloat(tx.amount || 0);
            }
            
            if (tx.type === 'Loan Payment') {
                totalReturn += parseFloat(tx.interestPaid || 0);
            }
            if (tx.type === 'Loan Taken') {
                loanCount++;
            }
        });

        const memberActiveLoans = allActiveLoans.filter(loan => loan.memberId === memberId && loan.status === 'Active');
        const totalOutstandingLoan = memberActiveLoans.reduce((sum, loan) => sum + parseFloat(loan.outstandingAmount || 0), 0);
        
        // Calculate balance for display AND Logic Check
        const displayBalanceOnCard = totalSipAmount - totalOutstandingLoan;

        // --- NEW HIDE LOGIC START ---
        // Requirement: 
        // 1. If Disabled = True AND Balance >= 0 (Positive/Zero) -> HIDE Member (Exclude from processedMembers)
        // 2. If Disabled = True AND Balance < 0 (Negative/Loan) -> SHOW Member
        // 3. If Disabled = False -> SHOW Member
        
        if (member.isDisabled === true && displayBalanceOnCard >= 0) {
            continue; // Skip this iteration, member will effectively be HIDDEN and excluded from stats.
        }
        // --- NEW HIDE LOGIC END ---

        const now = new Date();
        const currentMonthSip = memberTransactions.find(tx => 
            tx.type === 'SIP' &&
            new Date(tx.date).getMonth() === now.getMonth() &&
            new Date(tx.date).getFullYear() === now.getFullYear()
        );

        processedMembers[memberId] = {
            ...member,
            id: memberId,
            name: member.fullName,
            balance: displayBalanceOnCard,
            totalReturn: totalReturn,
            loanCount: loanCount,
            displayImageUrl: member.profilePicUrl || DEFAULT_IMAGE,
            isPrime: PRIME_MEMBERS.some(p => p.trim().toLowerCase() === member.fullName.trim().toLowerCase()),
            sipStatus: { 
                paid: !!currentMonthSip, 
                amount: currentMonthSip ? parseFloat(currentMonthSip.amount) : 0 
            }
        };
    }

    // Pass the list of processedMembers so stats only include visible members
    const communityStats = calculateCommunityStats(Object.values(processedMembers), allTransactions, allActiveLoansRaw, penaltyWalletRaw);

    return {
        processedMembers: Object.values(processedMembers).sort((a, b) => b.balance - a.balance),
        allTransactions,
        penaltyWalletData: penaltyWalletRaw,
        adminSettings: adminSettingsRaw,
        communityStats,
        manualNotifications: manualNotificationsRaw,
        automatedQueue: automatedQueueRaw,
        allProducts: allProductsRaw,
        headerButtons: headerButtonsRaw,
    };
}

/**
 * Poore community ke liye aarthik (financial) stats calculate karta hai.
 * UPDATED: Only calculates SIP for VALID (Visible) members.
 */
function calculateCommunityStats(processedMembers, allTransactions, allActiveLoans, penaltyWallet) {
    // Create a Set of visible Member IDs for fast lookup
    const validMemberIds = new Set(processedMembers.map(m => m.id));

    let totalPureSipAmount = 0;

    // Sirf 'SIP' transactions ko jodkar 'Total SIP Amount' banaya jayega.
    // FILTER: Only include transaction if memberId exists in visible list
    allTransactions.forEach(tx => {
        if (tx.type === 'SIP' && validMemberIds.has(tx.memberId)) {
            totalPureSipAmount += parseFloat(tx.amount || 0);
        }
    });

    // Only include loans for visible members (though usually hidden members won't have active loans per logic)
    const totalCurrentLoanAmount = Object.values(allActiveLoans)
        .filter(loan => loan.status === 'Active' && validMemberIds.has(loan.memberId))
        .reduce((sum, loan) => sum + parseFloat(loan.outstandingAmount || 0), 0);

    // 'Available Community Balance' ki calculation logic.
    const availableCommunityBalance = totalPureSipAmount - totalCurrentLoanAmount;

    const totalInterestReceived = allTransactions
        .filter(tx => tx.type === 'Loan Payment')
        .reduce((sum, tx) => sum + parseFloat(tx.interestPaid || 0), 0);
        
    const penaltyFromInterest = totalInterestReceived * 0.10;

    const penaltyIncomes = Object.values(penaltyWallet.incomes || {});
    const penaltyExpenses = Object.values(penaltyWallet.expenses || {});
    const totalPenaltyIncomes = penaltyIncomes.reduce((sum, income) => sum + income.amount, 0);
    const totalPenaltyExpenses = penaltyExpenses.reduce((sum, expense) => sum + expense.amount, 0);

    return {
        totalSipAmount: totalPureSipAmount, // Modal mein dikhane ke liye
        totalCurrentLoanAmount,
        netReturnAmount: totalInterestReceived - penaltyFromInterest,
        availableCommunityBalance: availableCommunityBalance, // Sahi formula ke saath
        totalPenaltyBalance: totalPenaltyIncomes - totalPenaltyExpenses,
        totalLoanDisbursed: allTransactions.filter(tx => tx.type === 'Loan Taken').reduce((sum, tx) => sum + tx.amount, 0)
    };
}

