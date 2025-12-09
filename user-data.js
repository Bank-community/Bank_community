// FINAL & CORRECTED UPDATE: ULTIMATE SPEED (100% DB Read)
// 1. Transaction Loop Removed Completely from Member Processing.
// 2. SIP Status & Amount read directly from 'currentMonthSIPStatus' & 'currentMonthSIPAmount'.
// 3. 'Loan Return Pay' set to 0 as requested to boost speed.
// 4. 'Available Community Balance' uses summed Member Data for super-fast calculation.

const DEFAULT_IMAGE = 'https://i.ibb.co/HTNrbJxD/20250716-222246.png';
const PRIME_MEMBERS = ["Prince Rama", "Amit kumar", "Mithilesh Sahni"];
const CACHE_KEY = 'tcf_royal_cache_v2'; // Updated Cache Key

/**
 * Data fetch aur process karne ka naya function with Caching Strategy.
 * @param {firebase.database.Database} database - Firebase database instance.
 * @param {Function} onUpdate - Callback function jo UI update karega.
 */
export async function fetchAndProcessData(database, onUpdate = null) {
    let cachedDataLoaded = false;

    // STEP 1: Try to load from Local Storage (INSTANT SPEED)
    if (onUpdate) {
        try {
            const cachedRaw = localStorage.getItem(CACHE_KEY);
            if (cachedRaw) {
                // console.log("⚡ Loading from Cache (Instant)...");
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
        // console.log("🌐 Fetching fresh data from Firebase...");
        const snapshot = await database.ref().once('value');
        const data = snapshot.val();
        
        if (!data) {
            throw new Error("Database is empty or could not be read.");
        }

        // Save fresh data to cache for next time
        localStorage.setItem(CACHE_KEY, JSON.stringify(data));

        // Process fresh data
        const processedFresh = processRawData(data);

        // Agar callback hai, to update karo
        if (onUpdate) {
            onUpdate(processedFresh);
        }

        return processedFresh;

    } catch (error) {
        console.error('Data processing failed:', error);
        if (cachedDataLoaded) {
            console.log("⚠️ Network failed, but using cached data.");
            return; 
        }
        throw error;
    }
}

/**
 * Raw Data ko process karne ka logic (Calculation Engine).
 * ULTIMATE SPEED UPDATE: No Loops, Just Reads.
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
    const allTransactions = Object.values(allTransactionsRaw); // Used only for Global Stats now

    for (const memberId in allMembersRaw) {
        const member = allMembersRaw[memberId];
        // Only skip if status is NOT Approved.
        if (member.status !== 'Approved' || !member.fullName) continue;

        // --- DIRECT DB READ (ULTIMATE SPEED LOGIC) ---
        // 1. Balance & Loan (Existing Logic)
        const displayBalanceOnCard = parseFloat(member.accountBalance || 0);
        const totalOutstandingLoan = parseFloat(member.totalLoanDue || 0);
        
        // --- NEW HIDE LOGIC ---
        // 1. If Disabled = True AND Balance >= 0 -> HIDE
        // 2. If Disabled = True AND Balance < 0 (Loan pending) -> SHOW
        if (member.isDisabled === true && displayBalanceOnCard >= 0) {
            continue; 
        }

        // --- NEW SIP & RETURN LOGIC (DIRECT READ) ---
        // Transaction Loop Hataya Gaya Hai. 
        // Ab Seedha DB field se utha rahe hain.
        
        const isPaid = (member.currentMonthSIPStatus === 'Paid');
        const sipAmount = parseFloat(member.currentMonthSIPAmount || 0);

        processedMembers[memberId] = {
            ...member,
            id: memberId,
            name: member.fullName,
            balance: displayBalanceOnCard, // Direct form DB
            totalOutstandingLoan: totalOutstandingLoan, // Direct from DB
            totalReturn: 0, // Requested: Set to 0 (No Logic)
            loanCount: 0, // Set to 0 (No Logic, saves processing)
            displayImageUrl: member.profilePicUrl || DEFAULT_IMAGE,
            isPrime: PRIME_MEMBERS.some(p => p.trim().toLowerCase() === member.fullName.trim().toLowerCase()),
            sipStatus: { 
                paid: isPaid, 
                amount: sipAmount
            }
        };
    }

    // Community Stats
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
 * Poore community ke liye stats calculate karta hai.
 */
function calculateCommunityStats(processedMembers, allTransactions, allActiveLoans, penaltyWallet) {
    const validMemberIds = new Set(processedMembers.map(m => m.id));

    let totalPureSipAmount = 0;

    // Global Stats ke liye hum abhi bhi loop use kar sakte hain kyunki ye ek baar hi run hota hai.
    // Lekin member list generation ab instant hai.
    allTransactions.forEach(tx => {
        if (tx.type === 'SIP' && validMemberIds.has(tx.memberId)) {
            totalPureSipAmount += parseFloat(tx.amount || 0);
        }
    });

    // Direct Sum from processed members for speed consistency
    const totalCurrentLoanAmount = processedMembers.reduce((sum, m) => sum + (m.totalOutstandingLoan || 0), 0);

    // 'Available Community Balance' logic
    const availableCommunityBalance = totalPureSipAmount - totalCurrentLoanAmount;

    // Net Return Calculation
    const totalInterestReceived = allTransactions
        .filter(tx => tx.type === 'Loan Payment')
        .reduce((sum, tx) => sum + parseFloat(tx.interestPaid || 0), 0);
        
    const penaltyFromInterest = totalInterestReceived * 0.10;

    const penaltyIncomes = Object.values(penaltyWallet.incomes || {});
    const penaltyExpenses = Object.values(penaltyWallet.expenses || {});
    const totalPenaltyIncomes = penaltyIncomes.reduce((sum, income) => sum + income.amount, 0);
    const totalPenaltyExpenses = penaltyExpenses.reduce((sum, expense) => sum + expense.amount, 0);

    return {
        totalSipAmount: totalPureSipAmount,
        totalCurrentLoanAmount,
        netReturnAmount: totalInterestReceived - penaltyFromInterest,
        availableCommunityBalance: availableCommunityBalance,
        totalPenaltyBalance: totalPenaltyIncomes - totalPenaltyExpenses,
        totalLoanDisbursed: allTransactions.filter(tx => tx.type === 'Loan Taken').reduce((sum, tx) => sum + tx.amount, 0)
    };
}

