// user-data.js - FINAL VERSION (Data Fetcher)
// RESPONSIBILITY: Fetch All Data (Loans, Members, History) & Cache It

const CACHE_KEY = 'tcf_royal_cache_v5'; // Match with user-main.js
const PRIME_MEMBERS = ["Prince Rama", "Amit kumar", "Mithilesh Sahni"];
const DEFAULT_IMAGE = 'https://i.ibb.co/HTNrbJxD/20250716-222246.png';

/**
 * Fetch all data from Firebase and process it for the UI.
 * Now includes 'loans' for the new Dashboard module.
 */
export async function fetchAndProcessData(database, onUpdate = null) {

    // 1. Instant Cache Load (Offline Support)
    if (onUpdate) {
        try {
            const cachedRaw = localStorage.getItem(CACHE_KEY);
            if (cachedRaw) {
                const parsedData = JSON.parse(cachedRaw);
                onUpdate(parsedData); 
            }
        } catch (e) { console.warn("Cache Read Error"); }
    }

    if (!database) return;

    try {
        // 2. Fetch ALL Data in Parallel (Faster than one big download)
        // We need: Members, Transactions, Admin, Penalty, AND LOANS
        const [membersSnap, txSnap, adminSnap, penaltySnap, loansSnap, notifSnap, autoSnap, prodSnap] = await Promise.all([
            database.ref('members').once('value'),
            database.ref('transactions').once('value'),
            database.ref('admin').once('value'),
            database.ref('penaltyWallet').once('value'),
            database.ref('loans').once('value'), // 🔥 NEW: Fetch Active Loans
            database.ref('notifications').once('value'),
            database.ref('automatedQueue').once('value'),
            database.ref('products').once('value')
        ]);

        const rawMembers = membersSnap.val() || {};
        const rawTx = txSnap.val() || {};
        const rawAdmin = adminSnap.val() || {};
        const rawPenalty = penaltySnap.val() || {};
        const rawLoans = loansSnap.val() || {}; // 🔥 Loan Data
        const rawNotif = notifSnap.val() || {};
        const rawAuto = autoSnap.val() || {};
        const rawProd = prodSnap.val() || {};

        // 3. Process Data
        const processedData = processRawData(
            rawMembers, rawTx, rawAdmin, rawPenalty, rawLoans, rawNotif, rawAuto, rawProd
        );

        // 4. Send to UI
        if (onUpdate) onUpdate(processedData);

    } catch (error) {
        console.error("Data Fetch Error:", error);
    }
}

function processRawData(membersRaw, transactionsRaw, adminSettingsRaw, penaltyWalletRaw, loansRaw, manualNotificationsRaw, automatedQueueRaw, allProductsRaw) {

    // A. Process Transactions
    const allTransactions = Object.values(transactionsRaw || {}).sort((a, b) => new Date(b.date) - new Date(a.date));

    // B. Stats Calculation
    const balanceStats = adminSettingsRaw.balanceStats || {};

    // C. Process Members
    const processedMembers = Object.keys(membersRaw).map(key => {
        const member = membersRaw[key];

        // Calculate SIP Status
        const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM
        let isPaid = false;
        let sipAmount = 0;

        // Check manual SIP record
        if (member.sipHistory && member.sipHistory[currentMonth]) {
            isPaid = true;
            sipAmount = member.sipHistory[currentMonth].amount;
        } 
        // Check automated transaction logs
        else {
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
            ...member,
            name: member.fullName || member.name || 'Unknown',
            balance: parseFloat(member.balance || 0), // Use direct balance
            displayImageUrl: member.profilePicUrl || member.profileImage || DEFAULT_IMAGE,
            isPrime: PRIME_MEMBERS.some(p => p.trim().toLowerCase() === (member.fullName || '').trim().toLowerCase()),
            sipStatus: { paid: isPaid, amount: sipAmount },
            loanCount: member.loanCount || 0,
            totalReturn: member.totalReturn || 0
        };
    }).sort((a, b) => b.balance - a.balance); // Sort by Highest Balance

    // D. Community Stats (Merged with Admin Stats)
    const communityStats = {
        totalSipAmount: parseFloat(balanceStats.totalSIP || 0),
        totalCurrentLoanAmount: parseFloat(balanceStats.totalActiveLoans || 0),
        netReturnAmount: parseFloat(balanceStats.totalReturn || 0),
        availableCommunityBalance: parseFloat(balanceStats.availableBalance || 0),
        totalPenaltyBalance: parseFloat(penaltyWalletRaw.availableBalance || 0),
        totalLoanDisbursed: parseFloat(adminSettingsRaw.lifetimeStats?.totalLoanIssued || 0)
    };

    // E. Return Final Bundle
    return {
        processedMembers,
        allTransactions,
        penaltyWalletData: penaltyWalletRaw,
        adminSettings: adminSettingsRaw,
        communityStats,
        rawActiveLoans: loansRaw, // 🔥 Critical for Loan Dashboard
        manualNotifications: manualNotificationsRaw,
        automatedQueue: automatedQueueRaw,
        allProducts: allProductsRaw,
        headerButtons: adminSettingsRaw.headerButtons || {}
    };
}
