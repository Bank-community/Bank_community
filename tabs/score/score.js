// tabs/score/score.js

export function init(app) {
    const state = app.state;

    // 1. Render Score Data
    renderAnalyticsTab(state);

    // 2. Setup Events
    setupListeners();
}

function renderAnalyticsTab(state) {
    const s = state.score;
    if (!s) return;

    // Update Main Score Card
    setText('analytics-score', s.totalScore.toFixed(1));
    setText('analytics-status', s.totalScore > 50 ? 'Good' : 'Low');
    setText('final-total-display', s.totalScore.toFixed(1));

    if (typeof getLoanEligibility === 'function') {
        const elig = getLoanEligibility(state.member.fullName, state.member.totalSip, state.allData);
        setText('analytics-limit', elig.eligible ? `₹${elig.maxAmount.toLocaleString()}` : 'No');
    }

    // Mathematical Breakdown List (Accordions)
    const list = document.getElementById('score-breakdown-list');
    if(list) {
        let html = '';

        // 1. Capital Breakdown Math
        const capTotal = state.member.totalSip || 0;
        let capMath = `[कुल जमा: ₹${capTotal.toLocaleString()}] ÷ [टारगेट: ₹50,000] × 100 = <span class="text-green-600 font-bold">${s.originalCapitalScore.toFixed(0)}</span>`;
        if (capTotal >= 50000) capMath = `टारगेट (₹50,000) पूरा हुआ = <span class="text-green-600 font-bold">100</span>`;

        html += scoreAccordion('capital', 'Capital', s.originalCapitalScore, 0.40, 'fas fa-coins', capMath, s.isNewMemberRuleApplied);

        // 2. Consistency Breakdown Math
        let consMath = `[समय पर SIP रेश्यो] + [मेंबरशिप अवधि] = <span class="text-green-600 font-bold">${s.originalConsistencyScore.toFixed(0)}</span>`;
        html += scoreAccordion('consistency', 'Consistency', s.originalConsistencyScore, 0.30, 'fas fa-sync', consMath, s.isNewMemberRuleApplied);

        // 3. Credit Behavior Breakdown Math
        let credMath = `[सही समय पर EMI] - [लेट पेमेंट पेनल्टी] = <span class="text-green-600 font-bold">${s.originalCreditScore.toFixed(0)}</span>`;
        html += scoreAccordion('credit', 'Credit Behavior', s.originalCreditScore, 0.30, 'fas fa-hand-holding-usd', credMath, s.isNewMemberRuleApplied);

        // Warning for New Members (< 180 Days)
        if(s.isNewMemberRuleApplied) {
            html += `<div class="p-3 bg-red-50 rounded-xl border border-red-100 text-[10px] text-red-600 font-bold text-center mt-3"><i class="fas fa-exclamation-triangle"></i> New Member Rule: 180 दिन से कम होने के कारण सभी पॉइंट्स 50% कर दिए गए हैं।</div>`;
        }

        list.innerHTML = html;
    }
}

function setText(id, val) { const el = document.getElementById(id); if(el) el.textContent = val; }

// --- ACCORDION GENERATOR ---
function scoreAccordion(id, label, baseScore, weight, icon, mathDesc, isPenalty) { 
    const percentage = weight * 100;
    let finalPoints = baseScore * weight;
    if (isPenalty) finalPoints = finalPoints * 0.5; // Apply new member 50% rule to display math

    return `
    <div class="bg-white shadow-sm rounded-xl border border-gray-100 overflow-hidden mb-3 hover:border-blue-200 transition-colors">

        <div class="flex justify-between items-center p-4 cursor-pointer accordion-toggle" data-target="acc-${id}">
            <div class="flex gap-3 items-center">
                <div class="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center text-[#D4AF37]">
                    <i class="${icon} text-lg"></i>
                </div>
                <div>
                    <span class="text-sm font-bold text-[#001540] block">${label}</span>
                    <span class="text-[10px] text-gray-500 font-bold mt-0.5 block bg-gray-50 px-2 py-0.5 rounded inline-block border border-gray-100">Base Score: ${baseScore.toFixed(0)}</span>
                </div>
            </div>
            <div class="flex items-center gap-3">
                <div class="text-right">
                    <span class="text-[9px] text-gray-400 font-bold uppercase block mb-0.5">Points</span>
                    <span class="font-mono font-bold text-lg text-blue-600">${finalPoints.toFixed(1)}</span>
                </div>
                <div class="w-6 h-6 rounded-full bg-gray-50 flex items-center justify-center border border-gray-200">
                    <i class="fas fa-chevron-down text-gray-400 text-xs transition-transform duration-300" id="icon-acc-${id}"></i>
                </div>
            </div>
        </div>

        <div id="acc-${id}" class="hidden bg-[#FFFCF5] p-4 border-t border-[#D4AF37]/20 text-xs">

            <p class="font-bold text-[#B8860B] mb-1.5 uppercase tracking-wide text-[9px]"><i class="fas fa-calculator"></i> Step 1: Base Calculation</p>
            <div class="bg-white p-2.5 rounded-lg border border-gray-200 mb-3 font-mono text-gray-600 shadow-inner">
                ${mathDesc}
            </div>

            <p class="font-bold text-[#B8860B] mb-1.5 uppercase tracking-wide text-[9px]"><i class="fas fa-balance-scale-right"></i> Step 2: Weightage Math (${percentage}%)</p>
            <div class="bg-white p-2.5 rounded-lg border border-gray-200 font-mono text-gray-600 shadow-inner flex justify-between items-center">
                <span>${baseScore.toFixed(0)} × ${percentage}% ${isPenalty ? '× 50% (Penalty)' : ''}</span>
                <span class="font-bold text-[#002366] text-sm">${finalPoints.toFixed(1)}</span>
            </div>

        </div>
    </div>`; 
}

// --- EVENT LISTENERS ---
function setupListeners() {
    const container = document.getElementById('app-content');

    // Clear old listener to prevent duplicates
    if (container._scoreListener) container.removeEventListener('click', container._scoreListener);

    container._scoreListener = (e) => {
        const target = e.target;

        // 1. Accordion Toggle
        const toggleBtn = target.closest('.accordion-toggle');
        if (toggleBtn) {
            const targetId = toggleBtn.getAttribute('data-target');
            const content = document.getElementById(targetId);
            const icon = document.getElementById('icon-' + targetId);

            if (content) {
                content.classList.toggle('hidden');
                if(icon) icon.classList.toggle('rotate-180');
            }
        }

        // 2. Open Info Modal (Hindi Guide)
        if (target.closest('#improve-score-btn')) {
            const modal = document.getElementById('improveScoreModal');
            if(modal) { modal.classList.remove('hidden'); modal.classList.add('flex'); }
        }

        // 3. Close Info Modal
        if (target.closest('#close-improve-modal') || target.classList.contains('modal-overlay')) {
            const modal = document.getElementById('improveScoreModal');
            if(modal) { modal.classList.add('hidden'); modal.classList.remove('flex'); }
        }
    };

    container.addEventListener('click', container._scoreListener);
}
