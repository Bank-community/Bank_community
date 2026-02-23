// loan/js/loan_calc.js

/**
 * Calculates max eligible limit based on balance and mode.
 */
export function calculateLimit(balance, mode) {
    let limit = 0;
    const safeBalance = parseFloat(balance) || 0;

    if (mode === 'loan') {
        // LOAN LOGIC
        if (safeBalance < 0) {
            limit = 0;
        } else if (safeBalance < 25000) {
            limit = safeBalance * 1.5; // 1.5x Logic
        } else {
            limit = safeBalance * 2.0; // 2x Logic
        }
        // Hard Cap
        if (limit > 50000) limit = 50000;

    } else {
        // WITHDRAWAL LOGIC
        limit = safeBalance > 0 ? safeBalance * 0.5 : 0; // 50% Logic
    }

    return Math.floor(limit);
}

/**
 * Calculates EMI and Total Repayment.
 * @param {number} amount - Loan Amount
 * @param {string} rateString - Format "Months-Rate-Zero" (e.g., "6-0.7-0")
 */
export function calculateEMI(amount, rateString) {
    if (!amount || !rateString) return null;

    // Expected format: "Months-Rate-Zero"
    const parts = rateString.split('-');
    const months = parseInt(parts[0]);
    const rateVal = parseFloat(parts[1]);

    // Interest Logic: Total Interest = Principal * (Rate / 100) * Months (Simple Interest approx per month)
    // Note: Based on previous logic, rate is monthly %

    let monthlyInterestAmount = amount * (rateVal / 100);
    let totalInterest = monthlyInterestAmount * months;

    const totalPayable = amount + totalInterest;
    const emi = Math.ceil(totalPayable / months);

    // Calculate End Date
    const endDate = new Date();
    endDate.setMonth(endDate.getMonth() + months);

    return {
        months,
        rate: rateVal,
        monthlyInterest: monthlyInterestAmount,
        totalPayable,
        emi,
        endDate
    };
}
