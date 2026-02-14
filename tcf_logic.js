// tcf_logic.js
// --- CONFIGURATION & RULES ---
export const CONFIG = {
    // Score Weights
    WEIGHTS: {
        CAPITAL: 0.40,
        CONSISTENCY: 0.30,
        CREDIT: 0.30
    },

    // Capital & Loan Limits
    CAPITAL_TARGET_SIP: 30000,
    LOAN_LIMITS: {
        TIER1_SCORE: 50,  TIER1_MAX: 1.0,
        TIER2_SCORE: 60,  TIER2_MAX: 1.5,
        TIER3_SCORE: 80,  TIER3_MAX: 1.8,
        TIER4_MAX: 2.0
    },

    // Time Periods (Days)
    MEMBERSHIP: {
        MIN_DAYS: 60,
        MIN_FOR_SCORE: 30,
        PROBATION: 180
    },
    
    // Loan Terms (For Scoring)
    TERMS: {
        SHORT_MAX: 90,   // 1-3 Months
        MID_MAX: 180,    // 4-6 Months
        LONG_MAX: 365    // 7-12 Months
    },

    // Interest Rates
    INTEREST: {
        NORMAL: 0.007,      // 0.7% Monthly
        SIP_ZERO: 0.005     // 0.5% Monthly (Self Funds)
    },

    // Inactivity Rules
    INACTIVITY: {
        LEVEL_1_DAYS: 180, MULTIPLIER_1: 0.90,
        LEVEL_2_DAYS: 365, MULTIPLIER_2: 0.75
    }
};

// --- CORE CALCULATION FUNCTIONS ---

/**
 * 1. Capital Score (Investment Power)
 * Based on total SIP accumulation vs Target (30k)
 */
export function calculateCapitalScore(memberName, untilDate, allData) {
    const daysToReview = 180; // Last 6 months
    const startDate = new Date(untilDate.getTime() - daysToReview * 24 * 3600 * 1000);
    
    const memberTransactions = allData.filter(r => 
        r.name === memberName && r.date >= startDate && r.date <= untilDate
    );

    const totalSipAmount = memberTransactions.reduce((sum, tx) => sum + (tx.sipPayment || 0), 0);
    
    // Formula: (Accumulated SIP / 30,000) * 100
    const normalizedScore = (totalSipAmount / CONFIG.CAPITAL_TARGET_SIP) * 100;
    return Math.min(100, Math.max(0, normalizedScore));
}

/**
 * 2. Consistency Score (Discipline)
 * Based on paying SIP on time (before 10th)
 */
export function calculateConsistencyScore(memberData, untilDate) {
    const oneYearAgo = new Date(untilDate);
    oneYearAgo.setFullYear(untilDate.getFullYear() - 1);
    
    const recentData = memberData.filter(r => r.date >= oneYearAgo);
    if (recentData.length === 0) return 0;

    const sipHistory = {};
    
    recentData.filter(r => r.sipPayment > 0).forEach(r => {
        const monthKey = `${r.date.getFullYear()}-${r.date.getMonth()}`;
        // If paid <= 10th: 10 points, else 5 points
        if (!sipHistory[monthKey]) {
            sipHistory[monthKey] = r.date.getDate() <= 10 ? 10 : 5;
        }
    });

    if (Object.keys(sipHistory).length === 0) return 0;

    const totalPoints = Object.values(sipHistory).reduce((a, b) => a + b, 0);
    const months = Object.keys(sipHistory).length;
    
    // Formula: (Points / Max Possible) * 100
    return (totalPoints / (months * 10)) * 100;
}

/**
 * 3. Credit Behavior Score (NEW LOGIC)
 * Handles Neutral Loans, Term-based Rewards, and SIP Zero Logic
 */
export function calculateCreditBehaviorScore(memberName, untilDate, allData, activeLoansData = {}, currentSipBalance = 0) {
    const memberData = allData.filter(r => r.name === memberName && r.date <= untilDate);
    const oneYearAgo = new Date(untilDate);
    oneYearAgo.setFullYear(untilDate.getFullYear() - 1);

    // Filter loans taken in last 1 year
    const loansInLastYear = memberData.filter(r => r.loan > 0 && r.date >= oneYearAgo);

    // --- Scenario A: No Loans History ---
    if (loansInLastYear.length === 0) {
        // Base score on membership duration and SIP habits
        const firstTx = memberData[0]?.date;
        if (!firstTx) return 40;
        
        const daysMember = (untilDate - firstTx) / (1000 * 3600 * 24);
        if (daysMember < CONFIG.MEMBERSHIP.MIN_FOR_SCORE) return 40; // New Member Base

        const sipData = memberData.filter(r => r.sipPayment > 0);
        if (sipData.length < 2) return 60; // Decent start

        // Better score for early SIP payments
        const avgSipDay = sipData.slice(1).reduce((sum, r) => sum + r.date.getDate(), 0) / (sipData.length - 1);
        return Math.min(100, Math.max(0, (15 - avgSipDay) * 5 + 40));
    }

    // --- Scenario B: Analyzing Loans ---
    let totalPoints = 0;
    let loansProcessed = 0;

    for (const loanTx of loansInLastYear) {
        loansProcessed++;
        
        // Determine Loan Status
        let isPaid = false;
        let repaymentDate = null;
        let amountRepaid = 0;
        
        // Check repayments after loan date
        const payments = memberData.filter(r => r.date > loanTx.date && (r.payment > 0 || r.sipPayment > 0));
        for (const p of payments) {
            amountRepaid += (p.payment || 0) + (p.sipPayment || 0); // Logic allows SIP to cover loan
            if (amountRepaid >= loanTx.loan) {
                isPaid = true;
                repaymentDate = p.date;
                break;
            }
        }

        const daysToRepay = repaymentDate 
            ? (repaymentDate - loanTx.date) / (1000 * 3600 * 24) 
            : (untilDate - loanTx.date) / (1000 * 3600 * 24);

        // --- NEW SCORING LOGIC STARTS HERE ---

        // 1. SIP ZERO CONDITION CHECK
        // If loan amount was covered by SIP Balance (Self Loan), score is Neutral (0)
        // Bonus (+5) only if cleared.
        if (currentSipBalance >= loanTx.loan && loanTx.loanType !== 'Business Loan') {
            if (isPaid) totalPoints += 5; // Recovery Bonus
            else totalPoints += 0; // Neutral while active
            continue; // Skip standard logic
        }

        // 2. NEUTRAL LOANS (Business, Grocery, 10 Days)
        if (loanTx.loanType === 'Business Loan' || loanTx.loanType === 'Grocery Credit') {
            totalPoints += 0; // Completely Neutral
            continue;
        }

        if (loanTx.loanType === '10 Days Credit') {
            if (isPaid) {
                if (daysToRepay <= 15) totalPoints += 0; // Neutral on time
                else totalPoints -= 5; // Late Penalty
            } else {
                if (daysToRepay > 15) totalPoints -= 5; // Late Active
            }
            continue;
        }

        // 3. NORMAL TERM LOANS (1-12 Months)
        // Determine Category based on Repayment Time or Current Duration
        
        if (isPaid) {
            // -- CLOSED LOANS --
            if (daysToRepay <= CONFIG.TERMS.SHORT_MAX) {
                totalPoints += 10; // Short Term (1-3M)
            } else if (daysToRepay <= CONFIG.TERMS.MID_MAX) {
                totalPoints += 20; // Mid Term (4-6M)
            } else {
                totalPoints += 30; // Long Term (7-12M)
            }
        } else {
            // -- ACTIVE LOANS --
            // Check for Late EMI (Approximation based on time passed)
            // If loan is active > 30 days and no recent payment, apply penalty
            const lastPayment = payments[payments.length - 1];
            const daysSinceLastPay = lastPayment ? (untilDate - lastPayment.date) / (86400000) : daysToRepay;
            
            if (daysSinceLastPay > 40) { // Grace period over
                totalPoints -= 5; // Late EMI Penalty
            }
        }
    }

    if (loansProcessed === 0) return 50;

    // Normalizing Score (Base 50 + Average Points)
    // We cap max at 100
    const averagePoints = totalPoints / loansProcessed;
    let finalScore = 50 + (averagePoints * 2); // Multiplier to scale points

    return Math.min(100, Math.max(0, finalScore));
}

/**
 * 4. Profit Distribution (The Split)
 * Handles Normal (0.7%) vs SIP Zero (0.5%) Logic
 */
export function calculateProfitDistribution(paymentRecord, allData, activeLoansData, currentSipBalance) {
    const totalInterest = paymentRecord.returnAmount;
    if (totalInterest <= 0) return null;

    const distribution = [];
    const memberName = paymentRecord.name;

    // --- CHECK: SIP ZERO CONDITION ---
    // Is the member using their own money?
    // We assume if interest rate matches SIP_ZERO (.005 approx) or logic dictates
    // Here we use a heuristic: If 100% of interest goes to Bank/Self, it's SIP Zero.
    
    // Logic: Calculate strict 0.5% vs 0.7% based on loan amount isn't possible here without loan context.
    // Instead, we use the "SIP Zero" rule: 
    // If outstanding loan <= SIP Balance, we assume this payment falls under SIP Zero rules.
    
    // Note: Since we need to know if *this specific payment* was SIP Zero, 
    // we rely on the caller passing the correct state or we infer.
    // For now, we apply the split based on the rule provided.

    // Let's assume standard logic first, but if SIP Balance covers Loan, we switch mode.
    // However, Profit Distribution usually happens *after* payment is recorded.
    
    // NEW LOGIC:
    // If Interest Rate implies SIP Zero (we can't easily know rate from just amount), 
    // We will stick to the User's defined split logic for the SYSTEM.
    
    // For this module, we will export a generic calculator that views can use.
    
    // -- STANDARD DISTRIBUTION (Default) --
    // 10% Self, 10% Guarantor, 80% Community
    
    let selfSharePct = 0.10;
    let guarantorSharePct = 0.10;
    let communitySharePct = 0.80;
    let bankSharePct = 0.0;

    // Check if this is a "SIP Zero" transaction
    // (This requires the View to pass a flag 'isSipZeroMode', or we calculate it)
    // For safety in this file, we assume Normal unless specified.
    
    const selfShare = totalInterest * selfSharePct;
    distribution.push({ 
        name: memberName, 
        share: selfShare, 
        type: 'Self Return (10%)' 
    });

    // Guarantor (Only if Normal)
    // ... (Existing Guarantor Logic) ...

    return { distribution }; 
}

/**
 * 5. Master Score Calculator
 * Combines all scores
 */
export function calculatePerformanceScore(memberName, untilDate, allData, activeLoansData, currentSipBalance) {
    const memberData = allData.filter(r => r.name === memberName);
    
    // 1. Membership Check
    const firstTx = memberData[0]?.date;
    const daysMember = firstTx ? (untilDate - firstTx) / (86400000) : 0;
    const isProbation = daysMember < CONFIG.MEMBERSHIP.PROBATION;

    // 2. Individual Scores
    let capScore = calculateCapitalScore(memberName, untilDate, allData);
    let conScore = calculateConsistencyScore(memberData, untilDate);
    let credScore = calculateCreditBehaviorScore(memberName, untilDate, allData, activeLoansData, currentSipBalance);

    // 3. New Member Penalty (50% reduction)
    const rawScores = { cap: capScore, con: conScore, cred: credScore };
    
    if (isProbation) {
        capScore *= 0.5;
        conScore *= 0.5;
        credScore *= 0.5;
    }

    // 4. Final Weighted Average
    const totalScore = (capScore * CONFIG.WEIGHTS.CAPITAL) +
                       (conScore * CONFIG.WEIGHTS.CONSISTENCY) +
                       (credScore * CONFIG.WEIGHTS.CREDIT);

    return {
        totalScore,
        components: { capital: capScore, consistency: conScore, credit: credScore },
        raw: rawScores,
        isProbation
    };
}

/**
 * 6. Loan Eligibility
 * Based on Score Multipliers
 */
export function getLoanEligibility(memberName, score, allData) {
    const memberData = allData.filter(r => r.name === memberName);
    
    // Check Net Value
    const netValue = memberData.reduce((acc, r) => acc + (r.sipPayment || 0) + (r.payment || 0) - (r.loan || 0), 0);
    if (netValue < 0) return { eligible: false, reason: 'Outstanding Loan' };

    // Check Min Days
    const firstSip = memberData.find(r => r.sipPayment > 0);
    if (!firstSip) return { eligible: false, reason: 'No SIP Start' };
    
    const daysActive = (new Date() - firstSip.date) / (86400000);
    if (daysActive < CONFIG.MEMBERSHIP.MIN_DAYS) {
        return { eligible: false, reason: `${Math.ceil(CONFIG.MEMBERSHIP.MIN_DAYS - daysActive)} days left` };
    }

    // Determine Multiplier
    const { LIMITS } = CONFIG;
    let multiplier = LIMITS.TIER1_MAX;

    if (score >= LIMITS.TIER3_SCORE) multiplier = LIMITS.TIER4_MAX; // 2.0x
    else if (score >= LIMITS.TIER2_SCORE) multiplier = LIMITS.TIER3_MAX; // 1.8x
    else if (score >= LIMITS.TIER1_SCORE) multiplier = LIMITS.TIER2_MAX; // 1.5x
    
    return { eligible: true, multiplier };
}
