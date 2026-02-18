// user-main.js

// 🚀 Ye function Home Page ka data handle karega
async function loadHomeDataWithCache() {
    const memberContainer = document.getElementById('memberContainer'); // Slider wala div
    const totalMembersEl = document.getElementById('totalMembersValue');
    const totalLoanEl = document.getElementById('totalLoanValue');

    // --- STEP 1: CACHE CHECK (Sabse Pehle Ye Chalega) ---
    const localData = localStorage.getItem('tcf_user_home_data');
    
    if (localData) {
        // Agar purana data hai, to turant dikhao (No Loading Spinner)
        const parsed = JSON.parse(localData);
        console.log("⚡ Loaded from Local Cache (Instant)");
        
        // UI Update karo cache wale data se
        renderMembersUI(parsed.members); 
        if(totalMembersEl) totalMembersEl.innerText = parsed.totalMembers;
        if(totalLoanEl) totalLoanEl.innerText = `₹${parsed.totalLoan}`;
    } else {
        // Agar pehli baar khola hai, tabhi loading dikhao
        memberContainer.innerHTML = '<p class="loading-text">Loading Community...</p>';
    }

    // --- STEP 2: FIREBASE FETCH (Background mein) ---
    // Ye check karega ki koi naya member ya loan add hua hai kya
    const membersRef = firebase.database().ref('members');

    membersRef.on('value', (snapshot) => {
        if (snapshot.exists()) {
            const data = snapshot.val();
            const membersArray = Object.values(data);

            // Calculation Logic
            let totalLoan = 0;
            membersArray.forEach(m => {
                if (m.loans) {
                    Object.values(m.loans).forEach(l => {
                        if (l.status === 'Active' || l.status === 'Closed') {
                            totalLoan += parseFloat(l.amount);
                        }
                    });
                }
            });

            // --- STEP 3: UPDATE CACHE (Naya Data Save Karo) ---
            const cachePayload = {
                members: membersArray,
                totalMembers: membersArray.length,
                totalLoan: totalLoan,
                lastUpdated: Date.now()
            };
            
            // Local Storage mein naya data daal do
            localStorage.setItem('tcf_user_home_data', JSON.stringify(cachePayload));

            // UI Update (Real-time)
            renderMembersUI(membersArray);
            if(totalMembersEl) totalMembersEl.innerText = membersArray.length;
            if(totalLoanEl) totalLoanEl.innerText = `₹${totalLoan}`;
            
            console.log("🔄 UI Updated from Firebase");
        }
    });
}

// 🎨 Helper Function: HTML Banane ke liye (Ise apne hisab se adjust karein)
function renderMembersUI(list) {
    const container = document.getElementById('memberContainer');
    if (!container) return;
    
    // Agar list khali hai to kuch mat karo
    if(list.length === 0) {
        container.innerHTML = '<p>No members found.</p>';
        return;
    }

    let html = '';
    list.forEach(member => {
        // Yahan aapka member card ka design aayega
        html += `
            <div class="member-card" onclick="openProfile('${member.id}')">
                <div class="img-wrapper">
                    <img src="${member.profileImage || 'https://via.placeholder.com/100'}" alt="${member.name}" loading="lazy">
                </div>
                <p class="member-name">${member.name}</p>
                <span class="member-id">#${member.memberId || '000'}</span>
            </div>
        `;
    });
    container.innerHTML = html;
}

// 🔥 Is function ko page load hone par call karein
document.addEventListener('DOMContentLoaded', () => {
    loadHomeDataWithCache();
});
