// ui-helpers.js - FINAL FULL VERSION (Helper Functions)
// RESPONSIBILITY: Modals, Formatters, Analytics & Verification Logic

const DEFAULT_IMAGE = 'https://i.ibb.co/HTNrbJxD/20250716-222246.png';

// --- 🌟 ANALYTICS ENGINE (SAFE & CRASH-PROOF) ---
export const Analytics = {
    sessionStart: Date.now(),
    activityLog: [],
    memberId: 'Guest',
    dbRef: null,

    init: function(database) {
        if (database) this.dbRef = database;
        const storedId = localStorage.getItem('verifiedMemberId');
        if (storedId) this.memberId = storedId;
    },

    identifyUser: function(id) {
        if (id) {
            this.memberId = id;
            localStorage.setItem('verifiedMemberId', id);
        }
    },

    logAction: function(action, details = {}) {
        const now = new Date();
        const dateStr = now.getFullYear() + '-' + 
                       String(now.getMonth() + 1).padStart(2, '0') + '-' + 
                       String(now.getDate()).padStart(2, '0');
        const timeStr = now.toTimeString().split(' ')[0];

        const logData = {
            memberId: this.memberId,
            action: action,
            details: details,
            time: timeStr,
            timestamp: Date.now()
        };

        this.activityLog.push(logData);

        // 🔥 FIREBASE SAFE SAVE LOGIC (App crash nahi hoga)
        try {
            let activeDb = this.dbRef;

            // SAFE CHECK: Ensure Firebase is fully initialized before calling database()
            if (!activeDb && typeof firebase !== 'undefined' && firebase.apps && firebase.apps.length > 0) {
                activeDb = firebase.database(); 
            }

            if (activeDb) {
                activeDb.ref(`activity_logs/${dateStr}`).push(logData);
            }
        } catch (error) {
            // Error ko silently ignore karenge taaki website na atke
            console.warn("Activity Save Deferred:", error.message);
        }
    }
};


// --- 🔔 NOTIFICATIONS ---
export function processAndShowNotifications(globalData, container) {
    if (!container) return;

    // Safety check to prevent crash if data is missing
    const transactions = globalData.transactions || [];
    const manualNotifs = globalData.notifications?.manual || {};

    const todayStr = new Date().toISOString().split('T')[0];
    const sessionKey = `royalPopups_${todayStr}`;

    if (sessionStorage.getItem(sessionKey)) return;

    let delay = 500;
    const baseDelay = 4000;

    // Show Today's Transactions
    const todaysTx = transactions.filter(tx => tx.date && tx.date.startsWith(todayStr));

    todaysTx.forEach((tx, i) => {
        setTimeout(() => {
            const member = globalData.members.find(m => m.id === tx.memberId);
            showPopupNotification(container, 'transaction', tx, member);
        }, delay + (i * baseDelay));
    });

    delay += todaysTx.length * baseDelay;

    // Show Manual Notices
    Object.values(manualNotifs).forEach((notif, i) => {
        setTimeout(() => {
            showPopupNotification(container, 'manual', notif, null);
        }, delay + (i * baseDelay));
    });

    sessionStorage.setItem(sessionKey, 'true');
}

function showPopupNotification(container, type, data, member) {
    const popup = document.createElement('div');
    popup.className = 'notification-popup';

    let content = '', img = DEFAULT_IMAGE, title = 'Notification';

    if (type === 'transaction' && member) {
        title = member.name;
        img = member.displayImageUrl;
        let amountVal = parseFloat(data.amount) || 0;
        let msg = data.type || 'Transaction';

        if (data.type === 'Loan Payment') msg = 'Loan Repayment';
        else if (data.type === 'Loan Taken') msg = 'Took a Loan';
        else if (data.type === 'SIP') msg = 'Paid Monthly SIP';

        content = `<strong>${title}</strong><p>${msg}</p><span class="notification-popup-amount">₹${amountVal.toLocaleString('en-IN')}</span>`;
    } else {
        img = data.imageUrl || DEFAULT_IMAGE;
        title = data.title || 'Notice';
        content = `<strong>${title}</strong><p>Tap to view</p>`;
    }

    popup.innerHTML = `
        <img src="${img}" class="notification-popup-img" onerror="this.src='${DEFAULT_IMAGE}'">
        <div class="notification-popup-content">${content}</div>
        <button class="notification-popup-close">&times;</button>`;

    // Click logic
    popup.onclick = () => {
        // Use the new tab router if available
        const historyTabBtn = document.querySelector('.nav-item[data-target="tab-history"]');
        if(historyTabBtn) historyTabBtn.click();
        else window.location.href = 'notifications.html';
    };

    const closeBtn = popup.querySelector('.notification-popup-close');
    closeBtn.onclick = (e) => { e.stopPropagation(); removePopup(popup); };
    setTimeout(() => removePopup(popup), 5000);

    container.appendChild(popup);
}

function removePopup(el) {
    if(el && el.parentNode) {
        el.classList.add('closing');
        el.addEventListener('animationend', () => el.remove());
    }
}

export async function requestNotificationPermission() {
    if (!('Notification' in window)) return false;
    try {
        const p = await Notification.requestPermission();
        return p === 'granted';
    } catch (e) { return false; }
}

// --- 🖼️ UI MODAL FUNCTIONS ---

export function showMemberProfileModal(memberId, allMembers) {
    const member = allMembers.find(m => m.id === memberId);
    if (!member) return;

    Analytics.logAction(`Opened Profile: ${member.name}`);

    setTextContent('profileModalName', member.name);
    setTextContent('profileModalJoiningDate', formatDate(member.joiningDate));
    setTextContent('profileModalBalance', formatCurrency(member.balance));
    setTextContent('profileModalReturn', formatCurrency(member.totalReturn));
    setTextContent('profileModalLoanCount', member.loanCount || 0);

    const imgEl = document.getElementById('profileModalImage');
    if(imgEl) imgEl.src = member.displayImageUrl;

    const sipContainer = document.getElementById('profileModalSipStatus');
    if (sipContainer) {
        sipContainer.innerHTML = member.sipStatus.paid 
            ? `<span class="sip-status-icon paid">✔</span> Paid`
            : `<span class="sip-status-icon not-paid">✖</span> Not Paid`;
    }

    const balEl = document.getElementById('profileModalBalance');
    if(balEl) balEl.className = `stat-value ${member.balance >= 0 ? 'positive' : 'negative'}`;

    const modal = document.getElementById('memberProfileModal');
    if(modal) {
        modal.classList.toggle('prime-modal', member.isPrime);
        const tag = document.getElementById('profileModalPrimeTag');
        if(tag) tag.style.display = member.isPrime ? 'block' : 'none';
        openModalById('memberProfileModal');
    }
}

export function showSipStatusModal(members) {
    Analytics.logAction("Opened SIP Status List");
    const container = document.getElementById('sipStatusListContainer');
    if (!container) return;
    container.innerHTML = '';

    if(!members || members.length === 0) return;

    const sorted = [...members].sort((a, b) => (b.sipStatus.paid - a.sipStatus.paid) || a.name.localeCompare(b.name));
    sorted.forEach(m => {
        const div = document.createElement('div');
        div.className = 'sip-status-item';
        div.innerHTML = `<img src="${m.displayImageUrl}" onerror="this.src='${DEFAULT_IMAGE}'"><span class="sip-status-name">${m.name}</span><span class="sip-status-badge ${m.sipStatus.paid ? 'paid' : 'not-paid'}">${m.sipStatus.paid ? 'Paid' : 'Pending'}</span>`;
        container.appendChild(div);
    });
    openModalById('sipStatusModal');
}

export function showPenaltyWalletModal(penaltyData, currentBalance) {
    Analytics.logAction("Opened Penalty Wallet");
    setTextContent('penaltyBalance', formatCurrency(currentBalance));
    const list = document.getElementById('penaltyHistoryList');
    if (!list) return;

    list.innerHTML = '';
    const incomes = penaltyData?.incomes || {};
    const expenses = penaltyData?.expenses || {};

    const history = [...Object.values(incomes).map(i => ({...i, type: 'income'})), ...Object.values(expenses).map(e => ({...e, type: 'expense'}))].sort((a, b) => b.timestamp - a.timestamp);

    if (history.length === 0) {
        list.innerHTML = '<li style="text-align:center; padding:10px;">No history found.</li>';
    } else {
        history.forEach(tx => {
            const isInc = tx.type === 'income';
            list.innerHTML += `<li class="luxury-history-item"><div class="history-main"><span class="history-name">${isInc ? tx.from : (tx.reason || 'Expense')}</span><div class="history-meta">${new Date(tx.timestamp).toLocaleDateString('en-GB')}</div></div><span class="history-amount ${isInc ? 'green-text' : 'red-text'}">${isInc ? '+' : '-'} ${formatCurrency(tx.amount)}</span></li>`;
        });
    }
    openModalById('penaltyWalletModal');
}

export function showAllMembersModal(members, onItemClick, onZoomClick) {
    Analytics.logAction("Opened All Members Grid");
    const container = document.getElementById('allMembersListContainer');
    if(!container) return;
    container.innerHTML = '';
    container.className = 'all-members-grid';
    [...members].sort((a, b) => a.name.localeCompare(b.name)).forEach(m => {
        const div = document.createElement('div');
        div.className = 'small-member-card';
        div.onclick = () => onItemClick(m.id);
        const img = document.createElement('img');
        img.src = m.displayImageUrl;
        img.onerror = function(){ this.src = DEFAULT_IMAGE };
        img.onclick = (e) => { e.stopPropagation(); onZoomClick(m.displayImageUrl, m.name); };
        div.append(img, Object.assign(document.createElement('span'), { textContent: m.name }));
        container.appendChild(div);
    });
    openModalById('allMembersModal');
}

export function showBalanceModal(stats) {
    Analytics.logAction("Viewed Community Balance");
    if(!stats) return;
    openModalById('balanceModal');
    animateValue('totalSipAmountDisplay', stats.totalSipAmount);
    animateValue('totalCurrentLoanDisplay', stats.totalCurrentLoanAmount);
    animateValue('netReturnAmountDisplay', stats.netReturnAmount);
    animateValue('availableAmountDisplay', stats.availableCommunityBalance);
}

// --- PASSWORD & VERIFICATION ---
export async function handlePasswordCheck(database, memberId) {
    const input = document.getElementById('passwordInput');
    if (!input || !input.value) return alert('Please enter password.');

    // Auto-Connect if DB missing
    let dbInstance = database;
    if (!dbInstance && typeof firebase !== 'undefined') {
        dbInstance = firebase.database(); 
    }

    try {
        const snap = await dbInstance.ref(`members/${memberId}/password`).once('value');
        if (String(input.value).trim() === String(snap.val()).trim()) {
            Analytics.logAction("Password Verified for Full View");
            window.location.href = `view.html?memberId=${memberId}`;
        } else { 
            alert('Wrong Password!'); 
            input.value = ''; 
        }
    } catch (e) { 
        console.error(e);
        alert('Verification failed. Check internet.'); 
    }
}

// --- DEVICE VERIFICATION (UPDATED FOR GATEKEEPER) ---
export function promptForDeviceVerification(members) {
    return new Promise(resolve => {
        const modal = document.getElementById('deviceVerificationModal');
        if(!modal) return resolve(null);

        const content = modal.querySelector('.modal-content');
        if(content) {
            content.innerHTML = `
                <h2>Verify Identity</h2>
                <p>Select your name to continue.</p>
                <select id="memberVerifySelect" style="width:100%; padding:10px; margin:10px 0;">
                    <option value="">-- Select Name --</option>
                    ${members.sort((a,b)=>a.name.localeCompare(b.name)).map(m=>`<option value="${m.id}">${m.name}</option>`).join('')}
                </select>
                <button id="verifyBtn" class="civil-button" style="width:100%">Confirm</button>
            `;
        }

        modal.classList.add('show');

        // Use event delegation or direct attachment safely
        const btn = document.getElementById('verifyBtn');
        if(btn) {
            btn.onclick = () => {
                const val = document.getElementById('memberVerifySelect').value;
                if(val) { 
                    modal.classList.remove('show'); 
                    Analytics.identifyUser(val); 
                    resolve(val); 
                }
            };
        }
    });
}

export function showFullImage(src, alt) {
    const img = document.getElementById('fullImageSrc');
    const modal = document.getElementById('imageModal');
    if (img && modal) { 
        img.src = src; 
        img.alt = alt || 'Image'; 
        modal.classList.add('show'); 
        Analytics.logAction("Zoomed Image"); 
    }
}

export function showEmiModal(emi, name, price, modalElement) {
    Analytics.logAction(`Viewed EMI: ${name}`);
    if(!modalElement) return;
    document.getElementById('emiModalTitle').textContent = `EMI: ${name}`;
    const list = document.getElementById('emiDetailsList');
    list.innerHTML = '';
    Object.entries(emi).forEach(([months, rate]) => {
        const total = price * (1 + parseFloat(rate)/100);
        const monthly = Math.ceil(total / parseInt(months));
        list.innerHTML += `<li>${months} Months @ ${rate}% = ₹${monthly}/mo</li>`;
    });
    modalElement.classList.add('show');
}

export function observeElements(elements) {
    if(!elements || elements.length === 0) return;
    const observer = new IntersectionObserver(entries => {
        entries.forEach(e => {
            if (e.isIntersecting) { e.target.classList.add('is-visible'); observer.unobserve(e.target); }
        });
    }, { threshold: 0.1 });
    elements.forEach(el => observer.observe(el));
}

// --- UTILITIES ---
function openModalById(id) { 
    const m = document.getElementById(id); 
    if(m) { m.classList.add('show'); document.body.style.overflow = 'hidden'; } 
}

// Exported assetTextContent but also accessible as setText internally
export function setTextContent(id, val) { 
    const el = document.getElementById(id); 
    if(el) el.textContent = val; 
}

function animateValue(id, end) { 
    const el = document.getElementById(id); 
    if(!el) return; 
    const start = 0, duration = 1000; 
    let startTime = null; 
    const step = (ts) => { 
        if(!startTime) startTime = ts; 
        const progress = Math.min((ts - startTime)/duration, 1); 
        el.textContent = formatCurrency(Math.floor(progress * ((end || 0) - start) + start)); 
        if(progress < 1) requestAnimationFrame(step); 
    }; 
    requestAnimationFrame(step); 
}

function formatCurrency(amount) { 
    return (amount || 0).toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }); 
}

function formatDate(str) { 
    return str ? new Date(str).toLocaleDateString('en-GB') : 'N/A'; 
}