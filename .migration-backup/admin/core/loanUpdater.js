// core/loanUpdater.js
import { db } from './firebaseConfig.js';
import { ref, get, update } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-database.js";

export async function runAutoInterestReduction() {
    console.log("🔄 Running Auto Interest Reduction Check...");

    try {
        const loansSnap = await get(ref(db, 'activeLoans'));
        const membersSnap = await get(ref(db, 'members'));

        if (!loansSnap.exists() || !membersSnap.exists()) return;

        const activeLoans = loansSnap.val();
        const members = membersSnap.val();
        const updates = {};
        let updateCount = 0;

        for (const [loanId, loan] of Object.entries(activeLoans)) {

            // Filter: Active, High Value, Rate is 0.7%
            if (loan.status === 'Active' && 
                loan.loanCategory === 'High Value' && 
                loan.interestDetails && 
                loan.interestDetails.rate === 0.007) { 

                const memberId = loan.memberId;
                const member = members[memberId];
                const sipBalance = parseFloat(member.accountBalance || 0);

                // Condition: SIP Balance >= 0
                if (sipBalance >= 0) {
                    console.log(`✅ Reducing Interest for ${loan.memberName} (Loan: ${loanId})`);

                    // === UPDATED LOGIC: FLAT RATE 0.5% ===
                    const newRatePerMonth = 0.005; // 0.5%
                    const tenure = parseInt(loan.tenureMonths);
                    const principal = parseFloat(loan.originalAmount);

                    // Logic: Total Interest = Principal * (0.5% * Months)
                    const totalRate = newRatePerMonth * tenure;
                    const totalInterest = principal * totalRate;
                    const totalRepayment = principal + totalInterest;
                    const newEmi = Math.ceil(totalRepayment / tenure);
                    const finalTotalRepayment = newEmi * tenure;

                    // Update Data
                    updates[`/activeLoans/${loanId}/interestDetails/rate`] = 0.005; 
                    updates[`/activeLoans/${loanId}/interestDetails/type`] = "Flat Rate (Reduced via SIP)";
                    updates[`/activeLoans/${loanId}/monthlyEmi`] = newEmi;
                    updates[`/activeLoans/${loanId}/totalRepaymentExpected`] = finalTotalRepayment;

                    updateCount++;
                }
            }
        }

        if (updateCount > 0) {
            await update(ref(db), updates);
            console.log(`🚀 Successfully reduced interest for ${updateCount} loans.`);
        }

    } catch (error) {
        console.error("❌ Auto Interest Error:", error);
    }
}