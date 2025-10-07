// user-data.js
// FINAL & CORRECTED UPDATE: "Available Community Balance" ki calculation ab
// sirf (Total SIP Amount - Total Current Loan Amount) होगी। Extra transactions ka
// is par koi asar nahi hoga.

const DEFAULT_IMAGE = 'https://i.ibb.co/HTNrbJxD/20250716-222246.png';
const PRIME_MEMBERS = ["Prince rama", "Amit kumar", "Mithilesh Sahni"];

/**
 * Firebase se saara data fetch karta hai aur use process karta hai.
 * @param {firebase.database.Database} database - Firebase database ka instance.
 * @returns {Promise<object>} - Processed data ka object.
 */
export async function fetchAndProcessData(database) {
    try {
        const snapshot = await database.ref().once('value');
        const data = snapshot.val();
        if (!data) {
            throw new Error("Database is empty or could not be read.");
        }

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
            
            const displayBalanceOnCard = totalSipAmount - totalOutstandingLoan;

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

    } catch (error) {
        console.error('Data processing failed:', error);
        throw error;
    }
}

/**
 * Poore community ke liye aarthik (financial) stats calculate karta hai.
 */
function calculateCommunityStats(processedMembers, allTransactions, allActiveLoans, penaltyWallet) {
    // === YAHAN FINAL BADLAV KIYA GAYA HAI ===
    let totalPureSipAmount = 0;

    // Sirf 'SIP' transactions ko jodkar 'Total SIP Amount' banaya jayega.
    allTransactions.forEach(tx => {
        if (tx.type === 'SIP') {
            totalPureSipAmount += parseFloat(tx.amount || 0);
        }
    });

    const totalCurrentLoanAmount = Object.values(allActiveLoans)
        .filter(loan => loan.status === 'Active')
        .reduce((sum, loan) => sum + parseFloat(loan.outstandingAmount || 0), 0);

    // 'Available Community Balance' ki calculation ko theek kiya gaya hai.
    const availableCommunityBalance = totalPureSipAmount - totalCurrentLoanAmount;

    // Baaki calculations jaise hain waise hi rahenge.
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
    // === BADLAV SAMAPT ===
}


