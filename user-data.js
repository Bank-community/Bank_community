// FINAL & CORRECTED UPDATE: ULTIMATE SPEED (100% Direct DB Read)
// 1. All Time Loan: Now reads directly from 'lifetimeStats.totalLoanIssued'.
// 2. Community Funds: Reads directly from 'admin.balanceStats'.
// 3. Penalty Wallet: Reads directly from 'penaltyWallet.availableBalance'.
// 4. Member Profile: Reads directly from member node (No Transaction Loops).

const DEFAULT_IMAGE = 'https://i.ibb.co/HTNrbJxD/20250716-222246.png';
const PRIME_MEMBERS = ["Prince Rama", "Amit kumar", "Mithilesh Sahni"];
const CACHE_KEY = 'tcf_royal_cache_v4'; // Incremented Cache Key for Lifetime Stats

/**
 * Data fetch aur process karne ka naya function with Caching Strategy.
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
                onUpdate(processedCache); 
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

        localStorage.setItem(CACHE_KEY, JSON.stringify(data));
        const processedFresh = processRawData(data);

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
 * Raw Data ko process karne ka logic.
 * ULTIMATE SPEED: All Stats are Direct DB Reads.
 */
function processRawData(data) {
    const allMembersRaw = data.members || {};
    const allTransactionsRaw = data.transactions || {}; // Still kept for Notification Popups only
    const penaltyWalletRaw = data.penaltyWallet || {};
    const adminSettingsRaw = data.admin || {};
    const lifetimeStatsRaw = data.lifetimeStats || {}; // NEW: Direct Lifetime Stats
    
    // --- DIRECT STATS READ (NO CALCULATION) ---
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

        // --- DIRECT DB READ (MEMBER STATS) ---
        const displayBalanceOnCard = parseFloat(member.accountBalance || 0);
        
        // HIDE Logic: If Disabled AND Balance >= 0 -> HIDE
        if (member.isDisabled === true && displayBalanceOnCard >= 0) {
            continue; 
        }

        // --- DIRECT DB READ (SIP & LOAN) ---
        const isPaid = (member.currentMonthSIPStatus === 'Paid');
        const sipAmount = parseFloat(member.currentMonthSIPAmount || 0);

        processedMembers[memberId] = {
            ...member,
            id: memberId,
            name: member.fullName,
            balance: displayBalanceOnCard,
            totalOutstandingLoan: parseFloat(member.totalLoanDue || 0),
            totalReturn: 0, // Zero as requested (Logic removed for speed)
            loanCount: 0,   // Zero as requested (Logic removed for speed)
            displayImageUrl: member.profilePicUrl || DEFAULT_IMAGE,
            isPrime: PRIME_MEMBERS.some(p => p.trim().toLowerCase() === member.fullName.trim().toLowerCase()),
            sipStatus: { 
                paid: isPaid, 
                amount: sipAmount
            }
        };
    }

    // --- COMMUNITY STATS (DIRECT ASSIGNMENT) ---
    // Ab hum yahan koi calculation nahi kar rahe, seedha DB values bhej rahe hain.
    const communityStats = {
        totalSipAmount: parseFloat(balanceStats.totalSIP || 0),
        totalCurrentLoanAmount: parseFloat(balanceStats.totalActiveLoans || 0),
        netReturnAmount: parseFloat(balanceStats.totalReturn || 0),
        availableCommunityBalance: parseFloat(balanceStats.availableBalance || 0),
        
        // Penalty Wallet Direct Read
        totalPenaltyBalance: parseFloat(penaltyWalletRaw.availableBalance || 0),
        
        // NEW: Lifetime Loan Issued (All Time Loan) - Direct DB Read
        totalLoanDisbursed: parseFloat(lifetimeStatsRaw.totalLoanIssued || 0)
    };

    return {
        processedMembers: Object.values(processedMembers).sort((a, b) => b.balance - a.balance),
        allTransactions, // Kept for Notification Popups only
        penaltyWalletData: penaltyWalletRaw,
        adminSettings: adminSettingsRaw,
        communityStats, // Contains the Direct DB Values
        manualNotifications: manualNotificationsRaw,
        automatedQueue: automatedQueueRaw,
        allProducts: allProductsRaw,
        headerButtons: headerButtonsRaw,
    };
}


