// ==========================================
// TCF SCORING ENGINE (v2.0)
// Shared Logic for User Panel & Profit Dashboard
// ==========================================

// --- ENGINE CONFIGURATION ---
const ENGINE_CONFIG = {
    // Dates & Timeframes
    NEW_LOGIC_START_DATE: new Date('2026-02-15T00:00:00'), // Strict Cutoff
    REVIEW_PERIOD_DAYS: 540, // 18 Months
    
    // Scoring Weights
    CAPITAL_TARGET: 50000,
    WEIGHT_CAPITAL: 0.40,
    WEIGHT_CONSISTENCY: 0.30,
    WEIGHT_CREDIT: 0.30,
    
    // Loan Eligibility
    SIP_SLAB: 25000,
    MULTIPLIER_LOW: 1.5,
    MULTIPLIER_HIGH: 2.0,
    MAX_LOAN_CAP: 50000,
    
    // Payment Rules
    EMI_START_DAY: 1,
    EMI_END_DAY: 10,
    RECHARGE_DEFAULT_TENURE: 3, // Months
    SHORT_TERM_LIMIT_DAYS: 90
};

// ==========================================
// 1. MASTER SCORING FUNCTION
// ==========================================
function calculatePerformanceScore(memberName, untilDate, allData, activeLoansData) {
    // Filter data for member up to current date
    const memberData = allData.filter(r => r.name === memberName && r.date <= untilDate);
    
    if (memberData.length === 0) {
        return { totalScore: 0, capitalScore: 0, consistencyScore: 0, creditScore: 0 };
    }
    
    // --- 1. CAPITAL SCORE (18 Months + Skip 1st SIP) ---
    let capitalScore = calculateCapitalScore(memberName, untilDate, allData);
    
    // --- 2. CONSISTENCY SCORE (18 Months + Skip 1st SIP) ---
    let consistencyScore = calculateConsistencyScore(memberData, untilDate);
    
    // --- 3. CREDIT BEHAVIOR (The Hybrid Logic) ---
    let creditScore = calculateCreditBehaviorScore(memberName, untilDate, allData, activeLoansData);

    // Store Originals before applying penalty
    const originals = {
        capital: capitalScore,
        consistency: consistencyScore,
        credit: creditScore
    };

    // --- PROBATION CHECK (New Member Rule) ---
    // First 180 Days = 50% Score
    const firstTx = memberData[0]?.date;
    const daysSinceJoin = firstTx ? (untilDate - firstTx) / (1000 * 3600 * 24) : 0;
    const isProbation = daysSinceJoin < 180;

    if (isProbation) {
        capitalScore *= 0.50;
        consistencyScore *= 0.50;
        creditScore *= 0.50;
    }

    // Final Weighted Calculation
    const totalScore = (capitalScore * ENGINE_CONFIG.WEIGHT_CAPITAL) + 
                       (consistencyScore * ENGINE_CONFIG.WEIGHT_CONSISTENCY) + 
                       (creditScore * ENGINE_CONFIG.WEIGHT_CREDIT);

    return {
        totalScore,
        capitalScore,
        consistencyScore,
        creditScore,
        isNewMemberRuleApplied: isProbation,
        originalCapitalScore: originals.capital,
        originalConsistencyScore: originals.consistency,
        originalCreditScore: originals.credit
    };
}

// ==========================================
// 2. CAPITAL SCORE LOGIC
// ==========================================
function calculateCapitalScore(memberName, untilDate, allData) {
    const reviewStartDate = new Date(untilDate);
    reviewStartDate.setDate(reviewStartDate.getDate() - ENGINE_CONFIG.REVIEW_PERIOD_DAYS);
    
    const memberData = allData.filter(r => r.name === memberName && r.date <= untilDate);
    const allSips = memberData.filter(r => r.sipPayment > 0);
    
    // RULE: Skip First SIP & Check 18 Months
    const validSips = allSips.slice(1).filter(r => r.date >= reviewStartDate);
    
    const totalSip = validSips.reduce((sum, tx) => sum + tx.sipPayment, 0);
    
    // Formula: (Total / 50,000) * 100
    return Math.min(100, Math.max(0, (totalSip / ENGINE_CONFIG.CAPITAL_TARGET) * 100));
}

// ==========================================
// 3. CONSISTENCY SCORE LOGIC
// ==========================================
function calculateConsistencyScore(memberData, untilDate) {
    const allSips = memberData.filter(r => r.sipPayment > 0);
    
    // Need at least 2 SIPs to judge (since we skip the first)
    if (allSips.length <= 1) return 0;
    
    const validSips = allSips.slice(1); // Skip 1st
    
    // 18 Months Window
    const reviewStartDate = new Date(untilDate);
    reviewStartDate.setDate(reviewStartDate.getDate() - ENGINE_CONFIG.REVIEW_PERIOD_DAYS);
    
    const recentSips = validSips.filter(r => r.date >= reviewStartDate);
    
    if (recentSips.length === 0) return 0;

    const points = recentSips.reduce((acc, r) => {
        // RULE: On Time = 1st to 10th
        const day = r.date.getDate();
        return acc + (day <= 10 ? 10 : 5);
    }, 0);

    const maxPoints = recentSips.length * 10;
    return (points / maxPoints) * 100;
}

// ==========================================
// 4. CREDIT BEHAVIOR SCORE (CORE LOGIC)
// ==========================================
function calculateCreditBehaviorScore(memberName, untilDate, allData, activeLoansData) {
    // 18 Months Window
    const reviewStartDate = new Date(untilDate);
    reviewStartDate.setDate(reviewStartDate.getDate() - ENGINE_CONFIG.REVIEW_PERIOD_DAYS);

    const memberData = allData.filter(r => r.name === memberName && r.date <= untilDate);
    
    // Identify Loans taken in the window
    const loansInWindow = memberData.filter(r => 
        r.loan > 0 && 
        r.loanType === 'Loan' && 
        r.date >= reviewStartDate
    );
    
    // --- CASE A: NO LOANS (Inactivity Gravity) ---
    if (loansInWindow.length === 0) {
        return calculateNoLoanScore(memberData, untilDate);
    }

    // --- CASE B: ACTIVE LOAN HISTORY ---
    let totalLoanPoints = 0;
    let loansCounted = 0;

    for (const loanTx of loansInWindow) {
        loansCounted++;
        
        // Find matching loan details in ActiveLoans DB
        // Matching Logic: MemberID + Original Amount + Approx Date
        const loanDetails = Object.values(activeLoansData).find(l => 
            l.memberId === loanTx.memberId && 
            l.originalAmount === loanTx.loan &&
            Math.abs(new Date(l.loanDate) - loanTx.date) < 86400000 // Within 24 hours
        );

        const loanDate = loanTx.date;

        // SPLIT LOGIC: CHECK DATE
        if (loanDate >= ENGINE_CONFIG.NEW_LOGIC_START_DATE) {
            // >>> NEW LOGIC (Post Feb 15 2026)
            totalLoanPoints += calculateNewLogicPoints(loanTx, loanDetails, memberData, untilDate);
        } else {
            // >>> OLD LOGIC (Pre Feb 15 2026)
            totalLoanPoints += calculateOldLogicPoints(loanTx, loanDetails, memberData, untilDate);
        }
    }

    // Average the points
    return Math.min(100, Math.max(0, (totalLoanPoints / (loansCounted * 25)) * 100));
}

// --- HELPER: NO LOAN SCORE (CAPPED AT 75) ---
function calculateNoLoanScore(memberData, untilDate) {
    const sipData = memberData.filter(r => r.sipPayment > 0);
    
    // Need at least 2 SIPs (First is skipped)
    if (sipData.length < 2) return 60; // Base score

    // Calculate Average SIP Date
    const validSips = sipData.slice(1);
    const totalDays = validSips.reduce((sum, r) => sum + r.date.getDate(), 0);
    const avgDay = totalDays / validSips.length;

    // Formula: Better Score for early SIPs
    // 15 - AvgDay: (e.g., 15 - 5 = 10 * 5 = 50 + 40 = 90)
    let score = (15 - avgDay) * 5 + 40;

    // GRAVITY CAP: Max 75 if no loan taken
    return Math.min(75, Math.max(0, score));
}

// ==========================================
// 5. NEW LOGIC (POST FEB 15, 2026)
// ==========================================
function calculateNewLogicPoints(loanTx, loanDetails, memberData, untilDate) {
    let points = 0;
    const loanDate = loanTx.date;
    const loanAmount = loanTx.loan;
    
    // Determine Tenure & Type
    // If recharge, default 3 months. If details missing, assume short term.
    const tenure = loanDetails ? (loanDetails.tenureMonths || 0) : 0;
    const isRecharge = loanDetails?.loanType === 'Recharge';
    const isLongTerm = tenure >= 4 || isRecharge; // Recharge follows EMI rules
    
    // --- SCENARIO 1: RECHARGE OR LONG TERM LOAN (EMI SYSTEM) ---
    if (isLongTerm) {
        // Effective Tenure for Recharge is 3 Months
        const effectiveTenure = isRecharge ? ENGINE_CONFIG.RECHARGE_DEFAULT_TENURE : tenure;
        
        // Calculate months passed since loan start
        const monthsPassed = monthDiff(loanDate, untilDate);
        
        // Loop through each month to check EMI
        for (let i = 1; i <= monthsPassed; i++) {
            // We only check up to the tenure length (plus buffer if active)
            if (i > effectiveTenure && loanDetails?.status === 'Paid') break;

            // Target: 1st to 10th of the Next Month
            const targetMonthDate = new Date(loanDate);
            targetMonthDate.setMonth(loanDate.getMonth() + i);
            
            // Check if ANY payment received between 1st and 10th of that month
            const paidOnTime = memberData.some(tx => {
                const tDate = tx.date;
                return tDate.getFullYear() === targetMonthDate.getFullYear() &&
                       tDate.getMonth() === targetMonthDate.getMonth() &&
                       tDate.getDate() >= ENGINE_CONFIG.EMI_START_DAY &&
                       tDate.getDate() <= ENGINE_CONFIG.EMI_END_DAY &&
                       (tx.payment > 0 || tx.sipPayment > 0); // SIP counts as payment intent
            });

            if (paidOnTime) {
                points += 5; // Good EMI Behavior
            } else {
                points -= 15; // Missed/Late EMI (Gravity)
            }
        }
        
        // Extra Penalty: If Recharge > 3 months and not paid
        if (isRecharge && monthsPassed > 3 && loanDetails?.status !== 'Paid') {
            points -= 20;
        }
    } 
    
    // --- SCENARIO 2: SHORT TERM LOAN (< 4 MONTHS) ---
    else {
        // Rule: Must be paid within 90 Days
        const daysPassed = (untilDate - loanDate) / (1000 * 3600 * 24);
        
        if (loanDetails && loanDetails.status === 'Paid') {
            // Find when it was fully repaid
            const repaymentTx = memberData.filter(r => r.date > loanDate && r.payment > 0);
            let repaidDate = null; 
            let paidSum = 0;
            
            for (const p of repaymentTx) { 
                paidSum += p.payment; 
                if (paidSum >= loanAmount) { 
                    repaidDate = p.date; 
                    break; 
                } 
            }
            
            // Calculate Days took to repay
            const daysToRepay = repaidDate ? (repaidDate - loanDate) / (1000 * 3600 * 24) : daysPassed;
            
            if (daysToRepay <= ENGINE_CONFIG.SHORT_TERM_LIMIT_DAYS) {
                points += 25; // Clean Repayment
            } else {
                points -= 20; // Late (After 90 days)
            }
        } else {
            // Not Paid Yet
            if (daysPassed > ENGINE_CONFIG.SHORT_TERM_LIMIT_DAYS) {
                points -= 50; // Heavy Penalty (90+ Days Overdue)
            } else {
                // Still within 90 days, no points yet (Neutral)
                points += 0; 
            }
        }
    }

    return points;
}

// ==========================================
// 6. OLD LOGIC (PRE FEB 15, 2026)
// ==========================================
function calculateOldLogicPoints(loanTx, loanDetails, memberData, untilDate) {
    let points = 0;
    const loanAmount = loanTx.loan;
    const loanDate = loanTx.date;
    
    if (loanDetails && loanDetails.loanType === 'Business Loan') {
        const loanStartDate = new Date(loanDetails.loanDate);
        const monthsPassed = monthDiff(loanStartDate, untilDate);
        
        // Check Monthly Interest
        for (let i = 1; i <= monthsPassed; i++) {
            const checkDate = new Date(loanStartDate);
            checkDate.setMonth(checkDate.getMonth() + i);
            
            const interestPaid = memberData.some(tx => 
                tx.returnAmount > 0 && 
                tx.date.getMonth() === checkDate.getMonth() &&
                tx.date.getFullYear() === checkDate.getFullYear()
            );
            
            if (interestPaid) points += 5; else points -= 10;
        }
        
        // Check Duration Limit (1 Year)
        const daysOpen = (untilDate - loanStartDate) / (1000 * 3600 * 24);
        if (daysOpen > 365 && loanDetails.status === 'Active') points -= 50;
    } 
    else if (loanDetails && loanDetails.loanType === '10 Days Credit') {
        if (loanDetails.status === 'Paid') {
            // Find Repayment Date
            const repaymentTx = memberData.filter(r => r.date > loanDate && r.payment > 0);
            let paidSum = 0; let repaidDate = null;
            for (const p of repaymentTx) {
                paidSum += p.payment;
                if (paidSum >= loanAmount) { repaidDate = p.date; break; }
            }
            
            const daysTaken = repaidDate ? (repaidDate - loanDate) / (1000 * 3600 * 24) : 999;
            if (daysTaken <= 25) points += 15; // 10 days + 15 grace
            else points -= 20;
        } else {
            points -= 30; // Not Paid
        }
    } 
    else {
        // Standard Old Loan
        const repaymentTx = memberData.filter(r => r.date > loanDate && (r.payment > 0 || r.sipPayment > 0));
        let paidSum = 0; let repaidDate = null;
        for (const p of repaymentTx) {
            paidSum += (p.payment + p.sipPayment);
            if (paidSum >= loanAmount) { repaidDate = p.date; break; }
        }
        
        if (repaidDate) {
            const days = (repaidDate - loanDate) / (1000 * 3600 * 24);
            if (days <= 30) points += 25;
            else if (days <= 60) points += 20;
            else if (days <= 90) points += 15;
            else points -= 20;
        } else {
            points -= 40;
        }
    }
    return points;
}

// ==========================================
// 7. LOAN ELIGIBILITY FUNCTION
// ==========================================
function getLoanEligibility(memberName, totalSipAmount, allData) {
    const memberData = allData.filter(r => r.name === memberName);
    
    // 1. Check Outstanding Balance
    let totalCapital = memberData.reduce((sum, r) => sum + r.sipPayment + r.payment - r.loan, 0);
    if (totalCapital < 0) return { eligible: false, reason: 'Outstanding Loan' };
    
    // 2. Check Membership Age
    const firstSip = memberData.find(r => r.sipPayment > 0);
    if (!firstSip) return { eligible: false, reason: 'No SIP Found' };
    
    const daysSinceJoin = (new Date() - firstSip.date) / (1000 * 3600 * 24);
    if (daysSinceJoin < 60) {
        return { eligible: false, reason: `${Math.ceil(60 - daysSinceJoin)} days left` };
    }

    // 3. New Slab Logic
    let multiplier = ENGINE_CONFIG.MULTIPLIER_LOW; // 1.5x
    if (totalSipAmount >= ENGINE_CONFIG.SIP_SLAB) {
        multiplier = ENGINE_CONFIG.MULTIPLIER_HIGH; // 2.0x
    }

    // 4. Calculate & Cap
    let limit = totalSipAmount * multiplier;
    if (limit > ENGINE_CONFIG.MAX_LOAN_CAP) limit = ENGINE_CONFIG.MAX_LOAN_CAP;

    return { eligible: true, maxAmount: limit };
}

// --- UTILITY: Month Difference ---
function monthDiff(d1, d2) {
    let months;
    months = (d2.getFullYear() - d1.getFullYear()) * 12;
    months -= d1.getMonth();
    months += d2.getMonth();
    return months <= 0 ? 0 : months;
}
