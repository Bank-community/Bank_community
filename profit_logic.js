// File: profit_logic.js
// Version 2.2: Profit distribution ab sirf asli "Loan" transactions ko dekhega.
// Yeh file system ka "dimag" hai. Ismein sabhi core calculation aur business logic hain.

// --- CONFIGURATION & NIYAM (RULES) ---
export const CONFIG = {
    PASSWORD: "7536",
    DEFAULT_PROFILE_PIC: 'https://i.postimg.cc/XNpR3cN1/20241030-065157.png',
    
    // Performance Score Weights
    CAPITAL_WEIGHT: 0.40, 
    CONSISTENCY_WEIGHT: 0.30, 
    CREDIT_BEHAVIOR_WEIGHT: 0.30,

    // Capital Score Target
    CAPITAL_SCORE_TARGET_SIP: 30000, 

    // Loan Eligibility Tiers
    LOAN_LIMIT_TIER1_SCORE: 50, LOAN_LIMIT_TIER2_SCORE: 60, LOAN_LIMIT_TIER3_SCORE: 80,
    LOAN_LIMIT_TIER1_MAX: 1.0, LOAN_LIMIT_TIER2_MAX: 1.5, LOAN_LIMIT_TIER3_MAX: 1.8, LOAN_LIMIT_TIER4_MAX: 2.0,
    
    // Credit Behavior & Membership Rules
    MINIMUM_MEMBERSHIP_DAYS: 60,
    MINIMUM_MEMBERSHIP_FOR_CREDIT_SCORE: 30,
    SIP_ON_TIME_LIMIT: 10,
    LOAN_TERM_BEST: 30, 
    LOAN_TERM_BETTER: 60, 
    LOAN_TERM_GOOD: 90,
    TEN_DAY_CREDIT_GRACE_DAYS: 15,
    BUSINESS_LOAN_TERM_DAYS: 365,

    // New member probation period
    NEW_MEMBER_PROBATION_DAYS: 180,

    // Inactive Policy Tiers
    INACTIVE_DAYS_LEVEL_1: 180,
    INACTIVE_PROFIT_MULTIPLIER_LEVEL_1: 0.90, // 10% penalty
    INACTIVE_DAYS_LEVEL_2: 365,
    INACTIVE_PROFIT_MULTIPLIER_LEVEL_2: 0.75, // 25% penalty
};


// --- CORE SCORE CALCULATION ENGINE ---

/**
 * Member ka poora performance score calculate karta hai.
 * @param {string} memberName - Member ka naam.
 * @param {Date} untilDate - Kis tarikh tak ka score nikalna hai.
 * @param {Array} allData - Sabhi transactions ka data.
 * @param {object} activeLoansData - Firebase se /activeLoans ka poora data.
 * @returns {object} Score aur uske components ka object.
 */
export function calculatePerformanceScore(memberName, untilDate, allData, activeLoansData) {
    const memberData = allData.filter(r => r.name === memberName);
    if (memberData.length === 0) {
        return { totalScore: 0, capitalScore: 0, consistencyScore: 0, creditScore: 0, isNewMemberRuleApplied: false, originalCapitalScore: 0, originalConsistencyScore: 0, originalCreditScore: 0 };
    }
    
    const firstTransactionDate = memberData[0]?.date;
    const membershipDays = firstTransactionDate ? (untilDate - firstTransactionDate) / (1000 * 3600 * 24) : 0;
    const isNewMemberRuleApplied = membershipDays < CONFIG.NEW_MEMBER_PROBATION_DAYS;

    // Pehle base scores calculate karo
    let capitalScore = calculateCapitalScore(memberName, untilDate, allData);
    let consistencyScore = calculateConsistencyScore(memberData, untilDate);
    let creditScore = calculateCreditBehaviorScore(memberName, untilDate, allData, activeLoansData);

    // Niyam lagoo karne se pehle original scores store karo
    const originalCapitalScore = capitalScore;
    const originalConsistencyScore = consistencyScore;
    const originalCreditScore = creditScore;

    // Agar member naya hai, to sabhi scores ka prabhav 50% kam kar do
    if (isNewMemberRuleApplied) {
        capitalScore *= 0.50;
        consistencyScore *= 0.50;
        creditScore *= 0.50;
    }

    // Weighted total score calculate karo
    const totalScore = (capitalScore * CONFIG.CAPITAL_WEIGHT) + 
                       (consistencyScore * CONFIG.CONSISTENCY_WEIGHT) + 
                       (creditScore * CONFIG.CREDIT_BEHAVIOR_WEIGHT);

    return { 
        totalScore, 
        capitalScore, 
        consistencyScore, 
        creditScore, 
        isNewMemberRuleApplied, 
        originalCapitalScore,
        originalConsistencyScore, 
        originalCreditScore 
    };
}

/**
 * Capital score ab pichhle 180 dinon mein jama kiye gaye kul SIP amount par aadharit hai.
 * @param {string} memberName - Member ka naam.
 * @param {Date} untilDate - Kis tarikh tak ka score nikalna hai.
 * @param {Array} allData - Sabhi transactions ka data.
 * @returns {number} Capital score (0-100).
 */
function calculateCapitalScore(memberName, untilDate, allData) {
    const daysToReview = 180;
    const startDate = new Date(untilDate.getTime() - daysToReview * 24 * 3600 * 1000);
    
    const memberTransactions = allData.filter(r => 
        r.name === memberName && 
        r.date >= startDate && 
        r.date <= untilDate
    );

    const totalSipAmount = memberTransactions.reduce((sum, tx) => sum + tx.sipPayment, 0);

    const normalizedScore = (totalSipAmount / CONFIG.CAPITAL_SCORE_TARGET_SIP) * 100;
    
    return Math.min(100, Math.max(0, normalizedScore));
}


/**
 * Consistency score calculate karta hai (is mein koi badlav nahi).
 * @param {Array} memberData - Ek member ka transaction data.
 * @param {Date} untilDate - Kis tarikh tak ka score nikalna hai.
 * @returns {number} Consistency score (0-100).
 */
function calculateConsistencyScore(memberData, untilDate) {
    const oneYearAgo = new Date(untilDate);
    oneYearAgo.setFullYear(untilDate.getFullYear() - 1);
    
    const recentMemberData = memberData.filter(r => r.date >= oneYearAgo);
    if (recentMemberData.length === 0) return 0;

    const sipHistory = {};
    recentMemberData.filter(r => r.sipPayment > 0).forEach(r => {
        const monthKey = `${r.date.getFullYear()}-${r.date.getMonth()}`;
        if (!sipHistory[monthKey]) {
            sipHistory[monthKey] = r.date.getDate() <= CONFIG.SIP_ON_TIME_LIMIT ? 10 : 5;
        }
    });

    if (Object.keys(sipHistory).length === 0) return 0;

    const consistencyPoints = Object.values(sipHistory).reduce((a, b) => a + b, 0);
    const monthsConsidered = Math.max(1, Object.keys(sipHistory).length);
    return (consistencyPoints / (monthsConsidered * 10)) * 100;
}

/**
 * Credit Behavior score Business Loan aur 10 Days Credit ko bhi handle karta hai.
 * @param {string} memberName - Member ka naam.
 * @param {Date} untilDate - Kis tarikh tak ka score nikalna hai.
 * @param {Array} allData - Sabhi transactions ka data.
 * @param {object} activeLoansData - Firebase se /activeLoans ka poora data.
 * @returns {number} Credit score (0-100).
 */
function calculateCreditBehaviorScore(memberName, untilDate, allData, activeLoansData = {}) {
    const memberData = allData.filter(r => r.name === memberName && r.date <= untilDate);
    
    const oneYearAgo = new Date(untilDate);
    oneYearAgo.setFullYear(untilDate.getFullYear() - 1);

    const memberActiveLoans = Object.values(activeLoansData).filter(loan => loan.memberName === memberName);
    const loansInLastYear = memberData.filter(r => r.loan > 0 && r.date >= oneYearAgo);

    if (loansInLastYear.length === 0) {
        const firstTransactionDate = memberData[0]?.date;
        if (!firstTransactionDate) return 40;
        const membershipDays = (untilDate - firstTransactionDate) / (1000 * 3600 * 24);
        if (membershipDays < CONFIG.MINIMUM_MEMBERSHIP_FOR_CREDIT_SCORE) return 40; 
        
        const sipData = memberData.filter(r => r.sipPayment > 0);
        if (sipData.length < 2) return 60;
        
        const avgSipDay = sipData.slice(1).reduce((sum, r) => sum + r.date.getDate(), 0) / (sipData.length - 1);
        const dayScore = Math.max(0, (15 - avgSipDay) * 5 + 40);
        return Math.min(100, dayScore);
    }
    
    let totalPoints = 0;
    let loansProcessed = 0;

    for (const loanRecord of loansInLastYear) {
        loansProcessed++;
        
        const loanDetails = memberActiveLoans.find(l => new Date(l.loanDate).getTime() === loanRecord.date.getTime() && l.originalAmount === loanRecord.loan);

        if (loanDetails && loanDetails.loanType === 'Business Loan') {
            const loanStartDate = new Date(loanDetails.loanDate);
            const monthsPassed = (untilDate.getFullYear() - loanStartDate.getFullYear()) * 12 + (untilDate.getMonth() - loanStartDate.getMonth());
            
            for (let i = 1; i <= monthsPassed; i++) {
                const checkMonth = new Date(loanStartDate);
                checkMonth.setMonth(checkMonth.getMonth() + i);
                
                const hasPaidInterest = memberData.some(tx => 
                    tx.returnAmount > 0 &&
                    new Date(tx.date).getFullYear() === checkMonth.getFullYear() &&
                    new Date(tx.date).getMonth() === checkMonth.getMonth()
                );
                if (hasPaidInterest) {
                    totalPoints += 5;
                } else {
                    totalPoints -= 10;
                }
            }
            if ((untilDate - loanStartDate) / (1000 * 3600 * 24) > CONFIG.BUSINESS_LOAN_TERM_DAYS && loanDetails.status === 'Active') {
                totalPoints -= 50;
            }
        } 
        else if (loanDetails && loanDetails.loanType === '10 Days Credit') {
            if (loanDetails.status === 'Paid') {
                const payments = memberData.filter(r => r.date > loanRecord.date && r.payment > 0);
                let repaidDate = null;
                let amountRepaid = 0;
                for (const p of payments) {
                    amountRepaid += p.payment;
                    if (amountRepaid >= loanRecord.loan) {
                        repaidDate = p.date;
                        break;
                    }
                }
                const daysToRepay = repaidDate ? (repaidDate - loanRecord.date) / (1000 * 3600 * 24) : Infinity;
                if (daysToRepay <= CONFIG.TEN_DAY_CREDIT_GRACE_DAYS) {
                    totalPoints += 15;
                } else {
                    totalPoints -= 20;
                }
            } else {
                totalPoints -= 30;
            }
        }
        else {
            let amountRepaid = 0;
            let repaymentDate = null;
            const paymentsAfterLoan = memberData.filter(r => r.date > loanRecord.date && (r.payment > 0 || r.sipPayment > 0));
            for (const p of paymentsAfterLoan) {
                amountRepaid += p.payment + p.sipPayment;
                if (amountRepaid >= loanRecord.loan) {
                    repaymentDate = p.date;
                    break;
                }
            }
            if (repaymentDate) {
                const daysToRepay = (repaymentDate - loanRecord.date) / (1000 * 3600 * 24);
                if (daysToRepay <= CONFIG.LOAN_TERM_BEST) totalPoints += 25; 
                else if (daysToRepay <= CONFIG.LOAN_TERM_BETTER) totalPoints += 20;
                else if (daysToRepay <= CONFIG.LOAN_TERM_GOOD) totalPoints += 15;
                else totalPoints -= 20;
            } else {
                totalPoints -= 40;
            }
        }
    }

    if (loansProcessed === 0) return 40;
    
    const maxPossiblePoints = loansProcessed * 25; 
    const normalizedScore = (totalPoints / maxPossiblePoints) * 100;
    
    return Math.max(0, Math.min(100, normalizedScore));
}


// --- OTHER CORE LOGIC FUNCTIONS ---

export function getLoanEligibility(memberName, score, allData) {
    const memberData = allData.filter(r => r.name === memberName);
    let totalCapital = memberData.reduce((sum, r) => sum + r.sipPayment + r.payment - r.loan, 0);
    if (totalCapital < 0) return { eligible: false, reason: 'Outstanding Loan' };

    const firstSip = memberData.find(r => r.sipPayment > 0);
    if (!firstSip) return { eligible: false, reason: 'No SIP yet' };
    const daysSinceFirstSip = (new Date() - firstSip.date) / (1000 * 3600 * 24);
    if (daysSinceFirstSip < CONFIG.MINIMUM_MEMBERSHIP_DAYS) {
        const daysLeft = Math.ceil(CONFIG.MINIMUM_MEMBERSHIP_DAYS - daysSinceFirstSip);
        return { eligible: false, reason: `${daysLeft} days left` };
    }
    const { LOAN_LIMIT_TIER1_SCORE, LOAN_LIMIT_TIER2_SCORE, LOAN_LIMIT_TIER3_SCORE, LOAN_LIMIT_TIER1_MAX, LOAN_LIMIT_TIER2_MAX, LOAN_LIMIT_TIER3_MAX, LOAN_LIMIT_TIER4_MAX } = CONFIG;
    let multiplier = LOAN_LIMIT_TIER1_MAX;
    if (score < LOAN_LIMIT_TIER1_SCORE) multiplier = LOAN_LIMIT_TIER1_MAX;
    else if (score < LOAN_LIMIT_TIER2_SCORE) multiplier = LOAN_LIMIT_TIER1_MAX + ((score - LOAN_LIMIT_TIER1_SCORE) / (LOAN_LIMIT_TIER2_SCORE - LOAN_LIMIT_TIER1_SCORE)) * (LOAN_LIMIT_TIER2_MAX - LOAN_LIMIT_TIER1_MAX);
    else if (score < LOAN_LIMIT_TIER3_SCORE) multiplier = LOAN_LIMIT_TIER2_MAX + ((score - LOAN_LIMIT_TIER2_SCORE) / (LOAN_LIMIT_TIER3_SCORE - LOAN_LIMIT_TIER2_SCORE)) * (LOAN_LIMIT_TIEP3_MAX - LOAN_LIMIT_TIER2_MAX);
    else multiplier = LOAN_LIMIT_TIER3_MAX + ((score - LOAN_LIMIT_TIER3_SCORE) / (100 - LOAN_LIMIT_TIER3_SCORE)) * (LOAN_LIMIT_TIER4_MAX - LOAN_LIMIT_TIER3_MAX);
    return { eligible: true, multiplier: Math.max(LOAN_LIMIT_TIER1_MAX, multiplier) };
}

export function calculateProfitDistribution(paymentRecord, allData, activeLoansData) {
    const profit = paymentRecord.returnAmount * 0.90; 
    if (profit <= 0) return null;

    // <-- BADLAV YAHAN: Ab sirf 'Loan' type ke transactions ko dhoondhega, 'Extra' ko ignore karega.
    const userLoansBeforePayment = allData.filter(r => 
        r.name === paymentRecord.name && 
        r.loan > 0 && 
        r.date < paymentRecord.date &&
        r.loanType === 'Loan' // Yeh line 'Extra Withdraw' ko filter kar degi
    );

    if (userLoansBeforePayment.length === 0) return null; 
    const relevantLoan = userLoansBeforePayment[userLoansBeforePayment.length - 1];
    const loanDate = relevantLoan.date;
    const snapshotScores = {};
    let totalScoreInSnapshot = 0;
    const membersInSystemAtLoanDate = [...new Set(allData.filter(r => r.date <= loanDate).map(r => r.name))];
    
    membersInSystemAtLoanDate.forEach(name => {
        const scoreObject = calculatePerformanceScore(name, loanDate, allData, activeLoansData);
        if (scoreObject.totalScore > 0) {
            snapshotScores[name] = scoreObject;
            totalScoreInSnapshot += scoreObject.totalScore;
        }
    });

    if (totalScoreInSnapshot <= 0) return null;
    const distribution = [];
    for (const memberName in snapshotScores) {
        let memberShare = (snapshotScores[memberName].totalScore / totalScoreInSnapshot) * profit;
        
        const lastLoanDate = allData.filter(r => r.name === memberName && r.loan > 0 && r.date <= loanDate).pop()?.date;
        const daysSinceLastLoan = lastLoanDate ? (loanDate - lastLoanDate) / (1000 * 3600 * 24) : Infinity;
        
        let appliedMultiplier = 1.0;
        if (daysSinceLastLoan > CONFIG.INACTIVE_DAYS_LEVEL_2) {
            appliedMultiplier = CONFIG.INACTIVE_PROFIT_MULTIPLIER_LEVEL_2;
        } else if (daysSinceLastLoan > CONFIG.INACTIVE_DAYS_LEVEL_1) {
            appliedMultiplier = CONFIG.INACTIVE_PROFIT_MULTIPLIER_LEVEL_1;
        }
        memberShare *= appliedMultiplier;

        if (memberShare > 0) distribution.push({ 
            name: memberName, share: memberShare,
            snapshotScore: snapshotScores[memberName].totalScore,
            totalSnapshotScore: totalScoreInSnapshot,
            multiplier: appliedMultiplier
        });
    }
    return { profit, relevantLoan, distribution: distribution.sort((a,b) => b.share - a.share) };
}

export function calculateTotalProfitForMember(memberName, allData, activeLoansData) {
    return allData.reduce((totalProfit, transaction) => {
        if (transaction.returnAmount > 0) {
            const result = calculateProfitDistribution(transaction, allData, activeLoansData);
            const memberShare = result?.distribution.find(d => d.name === memberName);
            if (memberShare) totalProfit += memberShare.share;
        }
        return totalProfit;
    }, 0);
}

export function formatDate(date) { 
    if (!(date instanceof Date) || isNaN(date)) return "N/A"; 
    return date.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }); 
}

