// user-main.js - COMPLETE CODE (With Caching & Speed Optimization)

document.addEventListener('DOMContentLoaded', () => {
    console.log("🚀 App Started...");
    initApp();
});

function initApp() {
    // 1. Sabse pehle Local Data dikhao (Instant Load)
    loadHeaderActions();
    loadCommunityData(); // Members + Loan Totals
    loadProducts();
    loadInfoSliders();
    
    // 2. Global Event Listeners setup karo
    setupGlobalListeners();
}

// ==========================================
// 1. HEADER ACTIONS (Install App, Etc.)
// ==========================================
function loadHeaderActions() {
    const container = document.getElementById('headerActionsContainer');
    const installBtnContainer = document.getElementById('install-button-container');

    // --- CACHE CHECK ---
    const localData = localStorage.getItem('tcf_header_actions');
    if (localData && container) {
        container.innerHTML = localData; // Cache se HTML uthao
    }

    // --- FIREBASE FETCH ---
    const dbRef = firebase.database().ref('admin/settings/headerButtons');
    dbRef.on('value', (snapshot) => {
        const data = snapshot.val();
        let html = '';

        if (data && data.showInstall) {
             // Agar admin ne install button on kiya hai
             // (Install logic alag se handle hota hai PWA ka, ye bas UI hai)
        }

        // Agar koi custom actions hain to yahan add karein
        // Filhal hum "Loading..." hata kar clear kar rahe hain agar data nahi hai
        if (!data) {
            container.innerHTML = ''; 
        } else {
            // Future buttons logic here
        }
        
        // Cache Update (Empty bhi save karo taaki loading na dikhe)
        localStorage.setItem('tcf_header_actions', container.innerHTML);
    });

    // Loading text hatao agar abhi bhi hai
    if(container && container.innerText.includes('Loading')) container.innerHTML = '';
}

// ==========================================
// 2. COMMUNITY MEMBERS & LOAN TOTALS (CORE)
// ==========================================
function loadCommunityData() {
    const memberContainer = document.getElementById('memberContainer');
    const totalMembersEl = document.getElementById('totalMembersValue');
    const totalLoanEl = document.getElementById('totalLoanValue');
    
    // --- STEP A: INSTANT LOAD FROM CACHE ---
    const cached = localStorage.getItem('tcf_members_data');
    if (cached) {
        const parsed = JSON.parse(cached);
        renderMembers(parsed.members);
        updateTotals(parsed.count, parsed.totalLoan);
        console.log("⚡ Members loaded from Cache");
    }

    // --- STEP B: FIREBASE SYNC ---
    firebase.database().ref('members').on('value', (snapshot) => {
        if (snapshot.exists()) {
            const data = snapshot.val();
            const membersList = Object.values(data);

            // Calculation Logic
            let activeLoanTotal = 0;
            membersList.forEach(m => {
                if (m.loans) {
                    Object.values(m.loans).forEach(l => {
                        if (l.status === 'Active') {
                            activeLoanTotal += parseFloat(l.amount || 0);
                        }
                    });
                }
            });

            // Save to Cache
            const cacheObj = {
                members: membersList,
                count: membersList.length,
                totalLoan: activeLoanTotal
            };
            localStorage.setItem('tcf_members_data', JSON.stringify(cacheObj));

            // UI Refresh
            renderMembers(membersList);
            updateTotals(membersList.length, activeLoanTotal);
        } else {
            memberContainer.innerHTML = '<p class="text-white">No members yet.</p>';
        }
    });
}

function renderMembers(list) {
    const container = document.getElementById('memberContainer');
    if (!container) return;

    let html = '';
    list.forEach(member => {
        // Safe Check for Image
        const imgUrl = member.profileImage || 'https://ik.imagekit.io/kdtvm0r78/default-profile.png';
        const name = member.name ? member.name.split(' ')[0] : 'Member'; // Sirf First Name

        html += `
            <div class="member-card" onclick="openMemberModal('${member.id}')">
                <div class="img-wrapper">
                    <img src="${imgUrl}" alt="${name}" loading="lazy">
                </div>
                <p>${name}</p>
                ${member.isPrime ? '<span class="prime-badge">👑</span>' : ''}
            </div>
        `;
    });
    container.innerHTML = html;
}

function updateTotals(count, loan) {
    const totalMembersEl = document.getElementById('totalMembersValue');
    const totalLoanEl = document.getElementById('totalLoanValue');
    
    if(totalMembersEl) totalMembersEl.innerText = count;
    if(totalLoanEl) totalLoanEl.innerText = `₹${loan.toLocaleString('en-IN')}`;
}

// ==========================================
// 3. PRODUCTS ON EMI
// ==========================================
function loadProducts() {
    const container = document.getElementById('productsContainer');
    if (!container) return;

    // Cache Check
    const cached = localStorage.getItem('tcf_products_data');
    if (cached) {
        renderProducts(JSON.parse(cached));
    }

    // Firebase Sync
    firebase.database().ref('products').on('value', (snapshot) => {
        if (snapshot.exists()) {
            const products = Object.values(snapshot.val());
            localStorage.setItem('tcf_products_data', JSON.stringify(products));
            renderProducts(products);
        } else {
            container.innerHTML = '<p style="text-align:center; width:100%; color:#888">No products available.</p>';
        }
    });
}

function renderProducts(list) {
    const container = document.getElementById('productsContainer');
    let html = '';
    list.forEach(p => {
        html += `
            <div class="product-card">
                <img src="${p.image || 'placeholder.jpg'}" alt="${p.name}">
                <div class="p-details">
                    <h4>${p.name}</h4>
                    <p>₹${p.price}</p>
                    <button onclick="window.location.href='https://wa.me/919999999999?text=I want to buy ${p.name}'">Buy on EMI</button>
                </div>
            </div>
        `;
    });
    container.innerHTML = html;
}

// ==========================================
// 4. INFO & LETTER SLIDERS
// ==========================================
function loadInfoSliders() {
    // Logic for Community Letters (Images)
    const letterContainer = document.getElementById('communityLetterSlides');
    if (!letterContainer) return;

    firebase.database().ref('admin/sliders/letters').on('value', (snap) => {
        if (snap.exists()) {
            const images = Object.values(snap.val());
            let html = '';
            images.forEach((img, index) => {
                html += `<div class="slide ${index === 0 ? 'active' : ''}"><img src="${img.url}"></div>`;
            });
            letterContainer.innerHTML = html;
        }
    });
}

// ==========================================
// 5. MODAL & UI LOGIC (Popups)
// ==========================================

// Global function to open member profile
window.openMemberModal = function(memberId) {
    const modal = document.getElementById('memberProfileModal');
    
    // Cache se member dhundo (Fast)
    const cached = localStorage.getItem('tcf_members_data');
    if (!cached) return;
    
    const members = JSON.parse(cached).members;
    const member = members.find(m => m.id === memberId || m.memberId === memberId);

    if (member) {
        document.getElementById('profileModalName').innerText = member.name;
        document.getElementById('profileModalImage').src = member.profileImage || 'default.png';
        document.getElementById('profileModalBalance').innerText = `₹${member.walletBalance || 0}`;
        document.getElementById('profileModalJoiningDate').innerText = member.joiningDate || '--';
        
        // Open Modal
        modal.style.display = 'block';
    }
};

function setupGlobalListeners() {
    // Close Modals on click X
    document.querySelectorAll('.close').forEach(btn => {
        btn.addEventListener('click', function() {
            this.closest('.modal').style.display = 'none';
        });
    });

    // Close Modal on click outside
    window.onclick = function(event) {
        if (event.target.classList.contains('modal')) {
            event.target.style.display = 'none';
        }
    };
}
