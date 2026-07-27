// modules/dataEntry/loanCalculator.js

/**
 * Calculates Loan EMI based on TCF Rules (FLAT RATE LOGIC).
 * * Logic Updated:
 * Total Interest % = Monthly Rate * Duration (Months)
 * Total Repayment = Principal + (Principal * Total Interest %)
 * Monthly EMI = Total Repayment / Duration
 * * 1. High Value (> 25,000):
 * - Rate: 0.7% per month.
 * * 2. Small Value (<= 25,000):
 * - 1 Month: 1% Flat.
 * - 2 Months: 3% Flat (Total).
 * - 3 Months: 5% Flat (Total).
 * - 4-12 Months: 1% per month Flat.
 */
export function calculateLoanDetails(amount, tenure) {
    amount = parseFloat(amount);
    tenure = parseInt(tenure);

    if (!amount || amount <= 0 || !tenure) {
        return null;
    }

    let result = {
        monthlyEmi: 0,
        totalInterest: 0,
        totalRepayment: 0,
        rateDescription: '',
        details: {} 
    };

    // === SCENARIO A: HIGH VALUE LOAN (> 25,000) ===
    if (amount > 25000) {
        // FLAT RATE LOGIC
        // Example: 50,000 * 12 Months * 0.7%
        // Total Rate = 0.7 * 12 = 8.4%
        // Interest = 50000 * 8.4% = 4200
        // Total = 54200
        // EMI = 54200 / 12 = 4516.66 -> 4517

        const monthlyRate = 0.007; // 0.7%
        const totalRatePercentage = monthlyRate * tenure; 

        const totalInterest = amount * totalRatePercentage;
        const totalRepayment = amount + totalInterest;
        const monthlyEmi = totalRepayment / tenure;

        result.monthlyEmi = Math.ceil(monthlyEmi);
        result.totalRepayment = result.monthlyEmi * tenure; // Recalculate based on rounded EMI
        result.totalInterest = result.totalRepayment - amount;

        const totalPercentDisplay = (totalRatePercentage * 100).toFixed(1);

        result.rateDescription = `<span class="text-indigo-700 font-bold">0.7% / month</span> (Total ${totalPercentDisplay}%)`;

        result.details = {
            category: 'High Value',
            type: 'Flat Rate',
            rate: 0.007,
            tenure: tenure
        };
    } 

    // === SCENARIO B: SMALL VALUE LOAN (<= 25,000) ===
    else {
        let totalRate = 0;
        let desc = '';

        if (tenure === 1) {
            totalRate = 0.01; // 1% Total
            desc = '1% Flat';
        } else if (tenure === 2) {
            totalRate = 0.03; // 3% Total
            desc = '3% Flat';
        } else if (tenure === 3) {
            totalRate = 0.05; // 5% Total
            desc = '5% Flat';
        } else {
            // 4+ Months: 1% per month FLAT
            totalRate = 0.01 * tenure;
            desc = '1% / month';
        }

        const totalInterest = amount * totalRate;
        const totalRepayment = amount + totalInterest;
        const monthlyEmi = totalRepayment / tenure;

        result.monthlyEmi = Math.ceil(monthlyEmi);
        result.totalRepayment = result.monthlyEmi * tenure;
        result.totalInterest = result.totalRepayment - amount;

        result.rateDescription = `<span class="text-blue-600 font-bold">${desc}</span>`;
        result.details = { category: 'Small Value', type: 'Flat', rate: totalRate / tenure };
    }

    return result;
}