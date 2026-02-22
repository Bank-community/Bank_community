// tabs/pay/pay.js

let html5QrcodeScanner = null;
let allMembers = [];
let showingAll = false;

export function init(app) {
    const state = app.state;
    const myMemberId = state.member.membershipId;

    // Set Profile Pic and SIP ID
    const profileImg = document.getElementById('pay-self-profile');
    if(profileImg) profileImg.src = state.member.profilePicUrl || 'https://placehold.co/100';

    const sipIdEl = document.getElementById('my-sip-id');
    if(sipIdEl) sipIdEl.textContent = myMemberId;

    // Filter members (Exclude self, keep approved only)
    allMembers = Object.values(state.membersData || {}).filter(m => 
        m.status === 'Approved' && m.membershipId !== myMemberId
    );

    // Initial Render (Top 7 + View More)
    renderMembersGrid();

    // Setup Listeners
    setupListeners();
}

function renderMembersGrid(searchQuery = "") {
    const grid = document.getElementById('members-grid');
    if(!grid) return;
    grid.innerHTML = '';

    // Apply Search
    let filteredList = allMembers;
    if (searchQuery.trim() !== "") {
        const lowerQ = searchQuery.toLowerCase();
        filteredList = allMembers.filter(m => 
            m.fullName.toLowerCase().includes(lowerQ) || 
            m.membershipId.toLowerCase().includes(lowerQ)
        );
        showingAll = true; // Automatically show all if searching
    }

    // Determine how many to show
    let displayList = filteredList;
    let needsMoreBtn = false;

    if (!showingAll && filteredList.length > 7) {
        displayList = filteredList.slice(0, 7);
        needsMoreBtn = true;
    }

    let html = '';
    displayList.forEach(m => {
        const initial = m.fullName.charAt(0).toUpperCase();
        let avatarHtml = '';

        if (m.profilePicUrl) {
            avatarHtml = `<img src="${m.profilePicUrl}" class="w-full h-full object-cover" crossorigin="anonymous">`;
        } else {
            // Random Color for Initial
            const colors = ['bg-purple-500', 'bg-blue-500', 'bg-green-500', 'bg-pink-500', 'bg-yellow-500'];
            const bgColor = colors[m.fullName.length % colors.length];
            avatarHtml = `<div class="w-full h-full ${bgColor} text-white flex items-center justify-center text-xl font-bold">${initial}</div>`;
        }

        const shortName = m.fullName.length > 10 ? m.fullName.substring(0, 9) + '...' : m.fullName;

        html += `
        <div class="flex flex-col items-center member-btn cursor-pointer group" data-id="${m.membershipId}">
            <div class="w-14 h-14 rounded-full bg-white shadow-sm border border-gray-100 overflow-hidden mb-1 relative group-active:scale-95 transition-transform">
                ${avatarHtml}
                <div class="absolute top-0 right-0 w-3 h-3 bg-blue-500 border-2 border-white rounded-full"></div>
            </div>
            <span class="text-[10px] font-medium text-gray-700 text-center w-full truncate px-1">${shortName}</span>
        </div>`;
    });

    if (needsMoreBtn) {
        html += `
        <div class="flex flex-col items-center cursor-pointer group" id="view-more-btn">
            <div class="w-14 h-14 rounded-full bg-white shadow-sm border border-gray-200 flex items-center justify-center mb-1 group-active:scale-95 transition-transform">
                <i class="fas fa-chevron-down text-gray-400 text-xl"></i>
            </div>
            <span class="text-[10px] font-medium text-gray-700 text-center">More</span>
        </div>`;
    }

    if (filteredList.length === 0) {
        grid.innerHTML = `<div class="col-span-4 text-center py-6 text-gray-400 text-xs">No members found.</div>`;
        return;
    }

    grid.innerHTML = html;
}

function setupListeners() {
    const container = document.getElementById('app-content');
    if(container._payListener) container.removeEventListener('click', container._payListener);

    container._payListener = (e) => {
        const target = e.target;

        // 1. Copy SIP ID
        if (target.closest('#copy-sip-id-btn')) {
            const sipId = document.getElementById('my-sip-id').textContent;
            navigator.clipboard.writeText(sipId).then(() => {
                const btn = target.closest('#copy-sip-id-btn');
                const originalHtml = btn.innerHTML;
                btn.innerHTML = `<span class="text-xs font-bold text-green-600"><i class="fas fa-check-circle"></i> ID Copied!</span>`;
                setTimeout(() => btn.innerHTML = originalHtml, 2000);
            });
        }

        // 2. View More Members
        if (target.closest('#view-more-btn')) {
            showingAll = true;
            renderMembersGrid(document.getElementById('pay-search-input').value);
        }

        // 3. Open Scanner
        if (target.closest('#scan-qr-btn')) {
            startScanner();
        }

        // 4. Close Scanner
        if (target.closest('#close-scanner-btn')) {
            stopScanner();
        }

        // 5. Select a Member to Pay (To be handled in Step 2)
        const memberBtn = target.closest('.member-btn');
        if (memberBtn) {
            const selectedId = memberBtn.getAttribute('data-id');
            alert(`Step 2: Payment Screen for ID: ${selectedId} will open here.`);
            // Next step: openPaymentScreen(selectedId);
        }
    };
    container.addEventListener('click', container._payListener);

    // Search Input Listener
    const searchInput = document.getElementById('pay-search-input');
    if(searchInput) {
        searchInput.addEventListener('input', (e) => {
            renderMembersGrid(e.target.value);
        });
    }
}

// --- SCANNER LOGIC ---
function startScanner() {
    const modal = document.getElementById('scannerModal');
    modal.classList.remove('hidden');
    modal.classList.add('flex');

    if (!html5QrcodeScanner) {
        html5QrcodeScanner = new Html5Qrcode("reader");
    }

    const config = { fps: 10, qrbox: { width: 250, height: 250 } };

    html5QrcodeScanner.start({ facingMode: "environment" }, config, onScanSuccess)
    .catch(err => {
        console.error("Camera Error: ", err);
        alert("Camera permission denied or not available. Please allow camera access.");
        stopScanner();
    });
}

function stopScanner() {
    const modal = document.getElementById('scannerModal');
    modal.classList.add('hidden');
    modal.classList.remove('flex');

    if (html5QrcodeScanner) {
        html5QrcodeScanner.stop().catch(err => console.error(err));
    }
}

function onScanSuccess(decodedText, decodedResult) {
    stopScanner();
    // Assuming QR contains the SIP ID like: "BCL-123456"
    alert(`QR Scanned! Found SIP ID: ${decodedText}\n\nStep 2: Payment screen will open now.`);
    // Next step: Check if ID exists, then openPaymentScreen(decodedText);
}
