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

    // Update Main Score Card
    setText('analytics-score', s.totalScore.toFixed(1));
    setText('analytics-status', s.totalScore > 50 ? 'Good' : 'Low');

    if (typeof getLoanEligibility === 'function') {
        const elig = getLoanEligibility(state.member.fullName, state.member.totalSip, state.allData);
        setText('analytics-limit', elig.eligible ? `₹${elig.maxAmount.toLocaleString()}` : 'No');
    }

    // Mathematical Breakdown List
    const list = document.getElementById('score-breakdown-list');
    if(list) {
        list.innerHTML = `
            <div class="mb-3 ml-2 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Score Calculation</div>
            
            ${scoreRow('Capital', s.capitalScore, 0.40, 'fas fa-coins')}
            ${scoreRow('Consistency', s.consistencyScore, 0.30, 'fas fa-sync')}
            ${scoreRow('Credit Behavior', s.creditScore, 0.30, 'fas fa-hand-holding-usd')}
            
            <div class="mt-4 p-4 bg-gradient-to-r from-[#001540] to-[#002366] rounded-xl flex justify-between items-center text-white shadow-lg border border-[#D4AF37]/30">
                <span class="font-bold uppercase tracking-widest text-xs text-blue-200">Total Score</span>
                <span class="font-black text-2xl text-[#D4AF37]">${s.totalScore.toFixed(1)}</span>
            </div>
        `;
    }
}

function setText(id, val) { const el = document.getElementById(id); if(el) el.textContent = val; }

// --- UI CARD GENERATOR FOR BREAKDOWN ---
function scoreRow(label, baseScore, weight, icon) { 
    const percentage = weight * 100;
    const finalPoints = baseScore * weight;
    
    return `
    <div class="flex justify-between p-4 bg-white shadow-sm rounded-xl border border-gray-100 items-center mb-2 hover:border-[#D4AF37] transition-colors">
        <div class="flex gap-3 items-center">
            <div class="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center text-[#D4AF37]">
                <i class="${icon} text-lg"></i>
            </div>
            <div>
                <span class="text-sm font-bold text-[#001540] block">${label}</span>
                <span class="text-[10px] text-gray-500 font-bold bg-gray-50 px-2 py-0.5 rounded border border-gray-100 mt-1 inline-block">
                    ${baseScore.toFixed(0)} × ${percentage}%
                </span>
            </div>
        </div>
        <div class="text-right">
            <span class="text-[9px] text-gray-400 font-bold uppercase block mb-0.5">Points</span>
            <span class="font-mono font-bold text-xl text-blue-600">${finalPoints.toFixed(1)}</span>
        </div>
    </div>`; 
}

// --- MODAL & EVENT LISTENERS ---
function setupListeners(state) {
    const container = document.getElementById('app-content');
    
    container.onclick = (e) => {
        const target = e.target;

        // Open Info Modal
        if (target.closest('#score-info-btn')) {
            populateScoreBreakdownModal(state.score);
            const modal = document.getElementById('scoreBreakdownModal');
            if(modal) {
                modal.classList.remove('hidden');
                modal.classList.add('flex');
            }
        }

        // Close Info Modal
        if (target.closest('#close-score-modal') || target.classList.contains('modal-overlay')) {
            const modal = document.getElementById('scoreBreakdownModal');
            if(modal) {
                modal.classList.add('hidden');
                modal.classList.remove('flex');
            }
        }
    };
}

function populateScoreBreakdownModal(scoreResultCache) {
    const contentDiv = document.getElementById('score-breakdown-content');
    if (!scoreResultCache) { contentDiv.innerHTML = "Score pending calculation."; return; }
    
    const { totalScore, capitalScore, consistencyScore, creditScore, isNewMemberRuleApplied, originalCapitalScore, originalConsistencyScore, originalCreditScore } = scoreResultCache;

    const row = (label, baseVal, origBaseVal, weight) => {
        const percentage = weight * 100;
        const finalPoints = baseVal * weight;
        
        return `
        <div class="flex justify-between items-center py-3 border-b border-gray-100 text-sm">
            <div>
                <span class="text-gray-600 font-bold block">${label}</span>
                <span class="text-[9px] text-gray-400 font-mono">${baseVal.toFixed(0)} × ${percentage}%</span>
            </div>
            <div class="text-right flex items-center gap-2">
                ${isNewMemberRuleApplied ? `<span class="text-[10px] text-red-400 line-through">${(origBaseVal * weight).toFixed(1)}</span>` : ''}
                <span class="font-bold text-[#002366] text-lg">${finalPoints.toFixed(1)}</span>
            </div>
        </div>`;
    };

    let html = row("Capital", capitalScore, originalCapitalScore, 0.40) + 
               row("Consistency", consistencyScore, originalConsistencyScore, 0.30) + 
               row("Credit", creditScore, originalCreditScore, 0.30);
    
    if(isNewMemberRuleApplied) {
        html += `<p class="text-[10px] text-red-500 mt-3 text-center bg-red-50 p-2 rounded-lg font-bold border border-red-100"><i class="fas fa-exclamation-circle"></i> New Member Rule Applied (50% Penalty on Base)</p>`;
    }
    
    html += `
        <div class="mt-4 pt-3 border-t-2 border-dashed border-gray-200 flex justify-between items-center bg-gray-50 p-3 rounded-lg">
            <span class="font-bold text-[#001540] uppercase tracking-wide text-xs">Total Score</span>
            <span class="font-extrabold text-2xl text-[#D4AF37] drop-shadow-sm">${totalScore.toFixed(1)}</span>
        </div>`;
        
    contentDiv.innerHTML = html;
}
