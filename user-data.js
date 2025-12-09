// FINAL & CORRECTED UPDATE: OFFLINE FIRST & INSTANT LOAD
// 1. Instant Cache Load: Displays data immediately even if database connection is pending.
// 2. All Time Loan: Reads directly from 'lifetimeStats.totalLoanIssued'.
// 3. Community Funds: Reads directly from 'admin.balanceStats'.
// 4. Penalty Wallet: Reads directly from 'penaltyWallet.availableBalance'.

const DEFAULT_IMAGE = 'https://i.ibb.co/HTNrbJxD/20250716-222246.png';
const PRIME_MEMBERS = ["Prince Rama", "Amit kumar", "Mithilesh Sahni"];
const CACHE_KEY = 'tcf_royal_cache_v5'; // Incremented Cache Key

/**
 * Data fetch aur process karne ka function.
 * @param {firebase.database.Database} database - Firebase DB instance (Can be null for cache-only load).
 * @param {Function} onUpdate - Callback function for UI update.
 */
export async function fetchAndProcessData(database, onUpdate = null) {
    let cachedDataLoaded = false;

    // STEP 1: LOAD FROM CACHE INSTANTLY (Offline Mode)
    // Yeh bina database connection ke bhi chalega
    if (onUpdate) {
        try {
            const cachedRaw = localStorage.getItem(CACHE_KEY);
            if (cachedRaw) {
                // console.log("⚡ Loading from Cache (Instant)...");
                const parsedData = JSON.parse(cachedRaw);
                const processedCache = processRawData(parsedData);
                onUpdate(processedCache); 
                cachedDataLoaded = true;
            }
        } catch (e) {
            console.warn("Cache load failed:", e);
        }
    }

    // Agar database instance nahi diya gaya hai (sirf cache load karna tha), to yahin ruk jao.
    if (!database) return;

    // STEP 2: FETCH FRESH DATA FROM FIREBASE (Background Mode)
    try {
        // console.log("🌐 Fetching fresh data from Firebase...");
        const snapshot = await database.ref().once('value');
        const data = snapshot.val();
        
        if (!data) {
            throw new Error("Database is empty or could not be read.");
        }

        localStorage.setItem(CACHE_KEY, JSON.stringify(data));
        const processedFresh = processRawData(data);

        if (onUpdate) {
            onUpdate(processedFresh);
        }

        return processedFresh;

    } catch (error) {
        console.error('Data processing failed:', error);
        // Agar cache load ho chuka tha, to error mat dikhao, user ko purane data se chalne do
        if (cachedDataLoaded) {
            console.log("⚠️ Network failed, staying on cached data.");
            return; 
        }
        throw error;
    }
}

/**
 * Raw Data Processing Logic (Zero Calculation - Direct DB Read)
 */
function processRawData(data) {
    const allMembersRaw = data.members || {};
    const allTransactionsRaw = data.transactions || {}; 
    const penaltyWalletRaw = data.penaltyWallet || {};
    const adminSettingsRaw = data.admin || {};
    const lifetimeStatsRaw = data.lifetimeStats || {}; 
    
    // --- DIRECT STATS READ ---
    const balanceStats = adminSettingsRaw.balanceStats || {};
    
    const notificationsRaw = adminSettingsRaw.notifications || {};
    const manualNotificationsRaw = notificationsRaw.manual || {};
    const automatedQueueRaw = notificationsRaw.automatedQueue || {};
    const allProductsRaw = data.products || {};
    const headerButtonsRaw = adminSettingsRaw.header_buttons || {};

    const processedMembers = {};
    const allTransactions = Object.values(allTransactionsRaw);

    for (const memberId in allMembersRaw) {
        const member = allMembersRaw[memberId];
        if (member.status !== 'Approved' || !member.fullName) continue;

        // Direct DB Read
        const displayBalanceOnCard = parseFloat(member.accountBalance || 0);
        
        // HIDE Logic
        if (member.isDisabled === true && displayBalanceOnCard >= 0) {
            continue; 
        }

        const isPaid = (member.currentMonthSIPStatus === 'Paid');
        const sipAmount = parseFloat(member.currentMonthSIPAmount || 0);

        processedMembers[memberId] = {
            ...member,
            id: memberId,
            name: member.fullName,
            balance: displayBalanceOnCard,
            totalOutstandingLoan: parseFloat(member.totalLoanDue || 0),
            totalReturn: 0, 
            loanCount: 0,
            displayImageUrl: member.profilePicUrl || DEFAULT_IMAGE,
            isPrime: PRIME_MEMBERS.some(p => p.trim().toLowerCase() === member.fullName.trim().toLowerCase()),
            sipStatus: { 
                paid: isPaid, 
                amount: sipAmount
            }
        };
    }

    // --- COMMUNITY STATS (DIRECT ASSIGNMENT) ---
    const communityStats = {
        totalSipAmount: parseFloat(balanceStats.totalSIP || 0),
        totalCurrentLoanAmount: parseFloat(balanceStats.totalActiveLoans || 0),
        netReturnAmount: parseFloat(balanceStats.totalReturn || 0),
        availableCommunityBalance: parseFloat(balanceStats.availableBalance || 0),
        totalPenaltyBalance: parseFloat(penaltyWalletRaw.availableBalance || 0),
        totalLoanDisbursed: parseFloat(lifetimeStatsRaw.totalLoanIssued || 0) // Lifetime Stats
    };

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


