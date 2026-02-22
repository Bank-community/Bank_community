// tabs/score/score.js

export function init(app) {
    const state = app.state;

    // 1. Render Score Data
    renderAnalyticsTab(state);

    // 2. Setup Modals & Buttons
    setupListeners(state);
}

function renderAnalyticsTab(state) {
    const s = state.score;
    if (!s) return;

    setText('analytics-score', s.totalScore.toFixed(0));
    setText('analytics-status', s.totalScore > 50 ? 'Good' : 'Low');

    if (typeof getLoanEligibility === 'function') {
        const elig = getLoanEligibility(state.member.fullName, state.member.totalSip, state.allData);
        setText('analytics-limit', elig.eligible ? `₹${elig.maxAmount.toLocaleString()}` : 'No');
    }

    const list = document.getElementById('score-breakdown-list');
    if(list) {
        list.innerHTML = `
            ${scoreRow('Capital', s.capitalScore, 'fas fa-coins')}
            ${scoreRow('Consistency', s.consistencyScore, 'fas fa-sync')}
            ${scoreRow('Credit Behavior', s.creditScore, 'fas fa-hand-holding-usd')}
        `;
    }
}

function setText(id, val) { const el = document.getElementById(id); if(el) el.textContent = val; }

function scoreRow(label, score, icon) { 
    return `
    <div class="flex justify-between p-4 bg-white shadow-sm rounded-xl border border-gray-100 items-center">
        <div class="flex gap-3 items-center">
            <div class="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center text-[#D4AF37]">
                <i class="${icon}"></i>
            </div>
            <span class="text-sm font-bold text-[#001540]">${label}</span>
        </div>
        <span class="font-mono font-bold text-lg text-blue-600">${score.toFixed(0)}</span>
    </div>`; 
}

function setupListeners(state) {
    const container = document.getElementById('app-content');

    container.onclick = (e) => {
        const target = e.target;

        // Open Info Modal
        if (target.closest('#score-info-btn')) {
            populateScoreBreakdownModal(state.score);
            const modal = document.getElementById('scoreBreakdownModal');
            modal.classList.remove('hidden');
            modal.classList.add('flex');
        }

        // Close Info Modal
        if (target.closest('#close-score-modal') || target.classList.contains('modal-overlay')) {
            const modal = document.getElementById('scoreBreakdownModal');
            modal.classList.add('hidden');
            modal.classList.remove('flex');
        }
    };
}

function populateScoreBreakdownModal(scoreResultCache) {
    const contentDiv = document.getElementById('score-breakdown-content');
    if (!scoreResultCache) { contentDiv.innerHTML = "Score pending calculation."; return; }

    const { totalScore, capitalScore, consistencyScore, creditScore, isNewMemberRuleApplied, originalCapitalScore, originalConsistencyScore, originalCreditScore } = scoreResultCache;

    const row = (label, value, baseValue) => `
        <div class="flex justify-between items-center py-3 border-b border-gray-100 text-sm">
            <span class="text-gray-600 font-bold">${label}</span>
            <div class="text-right flex items-center gap-2">
                ${isNewMemberRuleApplied ? `<span class="text-[10px] text-red-400 line-through">${baseValue.toFixed(0)}</span>` : ''}
                <span class="font-bold text-[#002366] text-lg">${value.toFixed(0)}</span>
            </div>
        </div>`;

    let html = row("Capital", capitalScore, originalCapitalScore) + 
               row("Consistency", consistencyScore, originalConsistencyScore) + 
               row("Credit", creditScore, originalCreditScore);

    if(isNewMemberRuleApplied) {
        html += `<p class="text-[10px] text-red-500 mt-3 text-center bg-red-50 p-2 rounded-lg font-bold border border-red-100"><i class="fas fa-exclamation-circle"></i> New Member Rule Applied (50% Score)</p>`;
    }

    html += `
        <div class="mt-4 pt-3 border-t-2 border-dashed border-gray-200 flex justify-between items-center bg-gray-50 p-3 rounded-lg">
            <span class="font-bold text-[#001540] uppercase tracking-wide text-xs">Total Score</span>
            <span class="font-extrabold text-2xl text-[#D4AF37] drop-shadow-sm">${totalScore.toFixed(1)}</span>
        </div>`;

    contentDiv.innerHTML = html;
}
