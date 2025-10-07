// user-data.js
// BADLAV: Ab yah admin panel se header_buttons ka data bhi laayega.

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
        // === YAHAN BADLAV KIYA GAYA HAI: header_buttons ko alag se fetch karna ===
        const headerButtonsRaw = adminSettingsRaw.header_buttons || {};
        // === BADLAV SAMAPT ===

        const processedMembers = {};
        const allTransactions = Object.values(allTransactionsRaw);
        const allActiveLoans = Object.values(allActiveLoansRaw);

        for (const memberId in allMembersRaw) {
            const member = allMembersRaw[memberId];
            if (member.status !== 'Approved' || !member.fullName) continue;

            const memberTransactions = allTransactions.filter(tx => tx.memberId === memberId);
            
            let depositBalance = 0;
            let totalReturn = 0;
            let loanCount = 0;

            memberTransactions.forEach(tx => {
                if (tx.type === 'SIP' || tx.type === 'Extra Payment') {
                    depositBalance += parseFloat(tx.amount || 0);
                } else if (tx.type === 'Extra Withdraw') {
                    depositBalance -= parseFloat(tx.amount || 0);
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
            
            const finalBalance = depositBalance - totalOutstandingLoan;

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
                balance: finalBalance,
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
            // === YAHAN BADLAV KIYA GAYA HAI: header_buttons ko return object mein jodna ===
            headerButtons: headerButtonsRaw,
            // === BADLAV SAMAPT ===
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
    let totalSipAmount = 0;
    allTransactions.forEach(tx => {
        if (tx.type === 'SIP' || tx.type === 'Extra Payment') {
            totalSipAmount += parseFloat(tx.amount || 0);
        } else if (tx.type === 'Extra Withdraw') {
            totalSipAmount -= parseFloat(tx.amount || 0);
        }
    });

    const totalCurrentLoanAmount = Object.values(allActiveLoans)
        .filter(loan => loan.status === 'Active')
        .reduce((sum, loan) => sum + parseFloat(loan.outstandingAmount || 0), 0);

    const totalInterestReceived = allTransactions
        .filter(tx => tx.type === 'Loan Payment')
        .reduce((sum, tx) => sum + parseFloat(tx.interestPaid || 0), 0);
        
    const penaltyFromInterest = totalInterestReceived * 0.10;

    const penaltyIncomes = Object.values(penaltyWallet.incomes || {});
    const penaltyExpenses = Object.values(penaltyWallet.expenses || {});
    const totalPenaltyIncomes = penaltyIncomes.reduce((sum, income) => sum + income.amount, 0);
    const totalPenaltyExpenses = penaltyExpenses.reduce((sum, expense) => sum + expense.amount, 0);

    return {
        totalSipAmount,
        totalCurrentLoanAmount,
        netReturnAmount: totalInterestReceived - penaltyFromInterest,
        availableCommunityBalance: totalSipAmount - totalCurrentLoanAmount,
        totalPenaltyBalance: totalPenaltyIncomes - totalPenaltyExpenses,
        totalLoanDisbursed: allTransactions.filter(tx => tx.type === 'Loan Taken').reduce((sum, tx) => sum + tx.amount, 0)
    };
}


