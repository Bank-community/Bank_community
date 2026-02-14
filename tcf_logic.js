// tcf_logic.js

// --- CONFIGURATION & RULES ---
export const CONFIG = {
    WEIGHTS: { CAPITAL: 0.40, CONSISTENCY: 0.30, CREDIT: 0.30 },
    CAPITAL_TARGET_SIP: 30000,
    LOAN_LIMITS: { TIER1_SCORE: 50, TIER1_MAX: 1.0, TIER2_SCORE: 60, TIER2_MAX: 1.5, TIER3_SCORE: 80, TIER3_MAX: 1.8, TIER4_MAX: 2.0 },
    MEMBERSHIP: { MIN_DAYS: 60, MIN_FOR_SCORE: 30, PROBATION: 180 },
    TERMS: { SHORT_MAX: 90, MID_MAX: 180, LONG_MAX: 365 },
    INTEREST: { NORMAL: 0.007, SIP_ZERO: 0.005 },
    INACTIVITY: { LEVEL_1_DAYS: 180, MULTIPLIER_1: 0.90, LEVEL_2_DAYS: 365, MULTIPLIER_2: 0.75 }
};

// --- CORE CALCULATION FUNCTIONS ---

export function calculateCapitalScore(memberName, untilDate, allData) {
    const daysToReview = 180; 
    const startDate = new Date(untilDate.getTime() - daysToReview * 24 * 3600 * 1000);
    const memberTransactions = allData.filter(r => r.name === memberName && r.date >= startDate && r.date <= untilDate);
    const totalSipAmount = memberTransactions.reduce((sum, tx) => sum + (tx.sipPayment || 0), 0);
    return Math.min(100, Math.max(0, (totalSipAmount / CONFIG.CAPITAL_TARGET_SIP) * 100));
}

export function calculateConsistencyScore(memberData, untilDate) {
    const oneYearAgo = new Date(untilDate); oneYearAgo.setFullYear(untilDate.getFullYear() - 1);
    const recentData = memberData.filter(r => r.date >= oneYearAgo);
    if (recentData.length === 0) return 0;
    const sipHistory = {};
    recentData.filter(r => r.sipPayment > 0).forEach(r => {
        const monthKey = `${r.date.getFullYear()}-${r.date.getMonth()}`;
        if (!sipHistory[monthKey]) sipHistory[monthKey] = r.date.getDate() <= 10 ? 10 : 5;
    });
    if (Object.keys(sipHistory).length === 0) return 0;
    const totalPoints = Object.values(sipHistory).reduce((a, b) => a + b, 0);
    return (totalPoints / (Object.keys(sipHistory).length * 10)) * 100;
}

export function calculateCreditBehaviorScore(memberName, untilDate, allData, activeLoansData = {}, currentSipBalance = 0) {
    const memberData = allData.filter(r => r.name === memberName && r.date <= untilDate);
    const oneYearAgo = new Date(untilDate); oneYearAgo.setFullYear(untilDate.getFullYear() - 1);
    const loansInLastYear = memberData.filter(r => r.loan > 0 && r.date >= oneYearAgo);

    if (loansInLastYear.length === 0) {
        const firstTx = memberData[0]?.date; if (!firstTx) return 40;
        const daysMember = (untilDate - firstTx) / (1000 * 3600 * 24);
        if (daysMember < CONFIG.MEMBERSHIP.MIN_FOR_SCORE) return 40; 
        const sipData = memberData.filter(r => r.sipPayment > 0);
        if (sipData.length < 2) return 60; 
        const avgSipDay = sipData.slice(1).reduce((sum, r) => sum + r.date.getDate(), 0) / (sipData.length - 1);
        return Math.min(100, Math.max(0, (15 - avgSipDay) * 5 + 40));
    }

    let totalPoints = 0; let loansProcessed = 0;
    for (const loanTx of loansInLastYear) {
        loansProcessed++;
        let isPaid = false, repaymentDate = null, amountRepaid = 0;
        const payments = memberData.filter(r => r.date > loanTx.date && (r.payment > 0 || r.sipPayment > 0));
        for (const p of payments) {
            amountRepaid += (p.payment || 0) + (p.sipPayment || 0); 
            if (amountRepaid >= loanTx.loan) { isPaid = true; repaymentDate = p.date; break; }
        }
        const daysToRepay = repaymentDate ? (repaymentDate - loanTx.date) / 86400000 : (untilDate - loanTx.date) / 86400000;

        // SIP ZERO LOGIC
        if (currentSipBalance >= loanTx.loan && loanTx.loanType !== 'Business Loan') {
            totalPoints += isPaid ? 5 : 0; continue; 
        }
        // NEUTRAL LOANS
        if (['Business Loan', 'Grocery Credit'].includes(loanTx.loanType)) continue;
        if (loanTx.loanType === '10 Days Credit') {
            if (isPaid) totalPoints += daysToRepay <= 15 ? 0 : -5;
            else totalPoints += daysToRepay > 15 ? -5 : 0;
            continue;
        }
        // TERM LOANS
        if (isPaid) {
            if (daysToRepay <= CONFIG.TERMS.SHORT_MAX) totalPoints += 10; 
            else if (daysToRepay <= CONFIG.TERMS.MID_MAX) totalPoints += 20; 
            else totalPoints += 30; 
        } else {
            const lastPayment = payments[payments.length - 1];
            if ((lastPayment ? (untilDate - lastPayment.date) : (untilDate - loanTx.date)) / 86400000 > 40) totalPoints -= 5;
        }
    }
    if (loansProcessed === 0) return 50;
    return Math.min(100, Math.max(0, 50 + (totalPoints / loansProcessed * 2)));
}

export function calculatePerformanceScore(memberName, untilDate, allData, activeLoansData, currentSipBalance) {
    const memberData = allData.filter(r => r.name === memberName);
    const firstTx = memberData[0]?.date;
    const isProbation = firstTx && ((untilDate - firstTx) / 86400000 < CONFIG.MEMBERSHIP.PROBATION);

    let capScore = calculateCapitalScore(memberName, untilDate, allData);
    let conScore = calculateConsistencyScore(memberData, untilDate);
    let credScore = calculateCreditBehaviorScore(memberName, untilDate, allData, activeLoansData, currentSipBalance);
    const rawScores = { cap: capScore, con: conScore, cred: credScore };
    
    if (isProbation) { capScore *= 0.5; conScore *= 0.5; credScore *= 0.5; }

    const totalScore = (capScore * CONFIG.WEIGHTS.CAPITAL) + (conScore * CONFIG.WEIGHTS.CONSISTENCY) + (credScore * CONFIG.WEIGHTS.CREDIT);
    return { totalScore, components: { capital: capScore, consistency: conScore, credit: credScore }, raw: rawScores, isProbation };
}

// --- RESTORED & FIXED PROFIT DISTRIBUTION ---
export function calculateProfitDistribution(paymentRecord, allData, activeLoansData, currentSipBalance) {
    const totalInterest = paymentRecord.returnAmount;
    if (!totalInterest || totalInterest <= 0) return { distribution: [] };

    const distribution = [];
    const memberName = paymentRecord.name;
    
    // Find Payer's Transaction Record to get Guarantor
    const payerTxRecord = allData.find(r => r.name === memberName); 
    const payerGuarantor = payerTxRecord?.guarantorName || 'Xxxxx';

    let isSipZeroMode = false; // Logic for future activation if needed

    if (isSipZeroMode) {
        distribution.push({ name: memberName, share: totalInterest * 0.50, type: 'Self Return (50%)' });
        distribution.push({ name: 'Bank Wallet', share: totalInterest * 0.50, type: 'Wallet (50%)' });
    } else {
        // 1. Self (10%)
        distribution.push({ name: memberName, share: totalInterest * 0.10, type: 'Self Return (10%)' });

        // 2. Guarantor (10%) - FIXED LOGIC
        if (payerGuarantor && payerGuarantor !== 'Xxxxx' && payerGuarantor !== '-' && payerGuarantor !== 'No Guarantor') {
            distribution.push({ name: payerGuarantor, share: totalInterest * 0.10, type: 'Guarantor Commission (10%)' });
        } else {
            distribution.push({ name: 'Bank Wallet', share: totalInterest * 0.10, type: 'Wallet (No Guarantor)' });
        }

        // 3. Bank Wallet (10%)
        distribution.push({ name: 'Bank Wallet', share: totalInterest * 0.10, type: 'Wallet Fee (10%)' });

        // 4. Community (70%)
        const communityPool = totalInterest * 0.70;
        const loanDate = paymentRecord.date;
        const membersInSystem = [...new Set(allData.filter(r => r.date <= loanDate).map(r => r.name))];
        
        let totalSystemScore = 0;
        const memberScores = {};

        membersInSystem.forEach(name => {
            if (name === memberName) return; 
            const scoreObj = calculatePerformanceScore(name, loanDate, allData, activeLoansData, 0); 
            
            if (scoreObj.totalScore > 0) {
                const lastTx = allData.filter(r => r.name === name && r.date <= loanDate).pop();
                const daysInactive = lastTx ? (loanDate - lastTx.date) / 86400000 : 999;
                let effectiveScore = scoreObj.totalScore;
                if (daysInactive > CONFIG.INACTIVITY.LEVEL_2_DAYS) effectiveScore *= CONFIG.INACTIVITY.MULTIPLIER_2;
                else if (daysInactive > CONFIG.INACTIVITY.LEVEL_1_DAYS) effectiveScore *= CONFIG.INACTIVITY.MULTIPLIER_1;

                memberScores[name] = effectiveScore;
                totalSystemScore += effectiveScore;
            }
        });

        if (totalSystemScore > 0) {
            for (const [mName, mScore] of Object.entries(memberScores)) {
                const share = (mScore / totalSystemScore) * communityPool;
                if (share > 0.01) distribution.push({ name: mName, share: share, type: 'Community Profit' });
            }
        } else {
            distribution.push({ name: 'Bank Wallet', share: communityPool, type: 'Wallet (Unclaimed)' });
        }
    }
    return { distribution }; 
}

export function getLoanEligibility(memberName, score, allData) {
    const memberData = allData.filter(r => r.name === memberName);
    const netValue = memberData.reduce((acc, r) => acc + (r.sipPayment || 0) + (r.payment || 0) - (r.loan || 0), 0);
    if (netValue < 0) return { eligible: false, reason: 'Outstanding Loan' };
    const firstSip = memberData.find(r => r.sipPayment > 0);
    if (!firstSip) return { eligible: false, reason: 'No SIP Start' };
    const daysActive = (new Date() - firstSip.date) / 86400000;
    if (daysActive < CONFIG.MEMBERSHIP.MIN_DAYS) return { eligible: false, reason: `${Math.ceil(CONFIG.MEMBERSHIP.MIN_DAYS - daysActive)} days left` };
    
    const LIMITS = CONFIG.LOAN_LIMITS;
    let multiplier = LIMITS.TIER1_MAX;
    if (score >= LIMITS.TIER3_SCORE) multiplier = LIMITS.TIER4_MAX; 
    else if (score >= LIMITS.TIER2_SCORE) multiplier = LIMITS.TIER3_MAX; 
    else if (score >= LIMITS.TIER1_SCORE) multiplier = LIMITS.TIER2_MAX; 
    return { eligible: true, multiplier };
}
