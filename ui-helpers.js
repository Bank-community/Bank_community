// ui-helpers.js - PART 3 of 3 (Logic & Analytics)
// FINAL FIX: Password Check now Auto-Connects to Database if missing.

const DEFAULT_IMAGE = 'https://i.ibb.co/HTNrbJxD/20250716-222246.png';

// --- 🔥 ANALYTICS SYSTEM ---
export const Analytics = {
    sessionStart: Date.now(),
    activityLog: [],

    // 1. Action Track Karein
    logAction: function(actionName) {
        const time = new Date().toLocaleTimeString();
        this.activityLog.push(`[${time}] ${actionName}`);
    },

    // 2. Session Save Karein (Firebase mein)
    saveSession: function(database, memberId) {
        if (!database || !memberId || this.activityLog.length === 0) return;

        const dateKey = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
        const sessionKey = `session_${this.sessionStart}`;
        
        const sessionData = {
            startTime: new Date(this.sessionStart).toLocaleTimeString(),
            endTime: new Date().toLocaleTimeString(),
            duration: Math.floor((Date.now() - this.sessionStart) / 1000) + ' seconds',
            device: navigator.userAgent,
            activities: this.activityLog
        };

        // Background Save
        database.ref(`analytics_logs/${dateKey}/${memberId}/${sessionKey}`).set(sessionData)
            .catch(err => console.warn("Analytics Error:", err));
    }
};

// --- 1. Notification Logic ---
export function processAndShowNotifications(globalData, container) {
    const todayStr = new Date().toISOString().split('T')[0];
    const sessionKey = `royalPopups_${todayStr}`;

    if (sessionStorage.getItem(sessionKey)) return;

    let delay = 500;
    const baseDelay = 4000;

    const todaysTx = globalData.transactions.filter(tx => tx.date && tx.date.startsWith(todayStr));
    
    todaysTx.forEach((tx, i) => {
        setTimeout(() => {
            const member = globalData.members.find(m => m.id === tx.memberId);
            showPopupNotification(container, 'transaction', tx, member);
        }, delay + (i * baseDelay));
    });

    delay += todaysTx.length * baseDelay;
    Object.values(globalData.notifications.manual).forEach((notif, i) => {
        setTimeout(() => {
            showPopupNotification(container, 'manual', notif, null);
        }, delay + (i * baseDelay));
    });

    sessionStorage.setItem(sessionKey, 'true');
}

function showPopupNotification(container, type, data, member) {
    if (!container) return;
    const popup = document.createElement('div');
    popup.className = 'notification-popup';
    
    let content = '', img = DEFAULT_IMAGE, title = 'Notification';

    if (type === 'transaction' && member) {
        title = member.name;
        img = member.displayImageUrl;
        let amount = Math.abs(data.amount || 0).toLocaleString();
        let msg = data.type === 'SIP' ? 'Paid Monthly SIP' : 
                  data.type === 'Loan Taken' ? 'Took a Loan' : 'Transaction';
        let colorClass = data.type === 'Loan Taken' ? 'loan' : 'sip';
        
        content = `<strong>${title}</strong><p>${msg}</p>
                   <span class="notification-popup-amount ${colorClass}">₹${amount}</span>`;
    } else {
        img = data.imageUrl || DEFAULT_IMAGE;
        title = data.title || 'Notice';
        content = `<strong>${title}</strong><p>Click to view details</p>`;
    }

    popup.innerHTML = `
        <img src="${img}" class="notification-popup-img" onerror="this.src='${DEFAULT_IMAGE}'">
        <div class="notification-popup-content">${content}</div>
        <button class="notification-popup-close">&times;</button>`;

    popup.onclick = () => window.location.href = 'notifications.html';
    
    const closeBtn = popup.querySelector('.notification-popup-close');
    closeBtn.onclick = (e) => { e.stopPropagation(); removePopup(popup); };
    setTimeout(() => removePopup(popup), 5000);

    container.appendChild(popup);
}

function removePopup(el) {
    el.classList.add('closing');
    el.addEventListener('animationend', () => el.remove());
}

// --- 2. Modal Data Population ---

export function showMemberProfileModal(memberId, allMembers) {
    const member = allMembers.find(m => m.id === memberId);
    if (!member) return;

    Analytics.logAction(`Viewed Profile: ${member.name}`);

    setText('profileModalName', member.name);
    setText('profileModalJoiningDate', formatDate(member.joiningDate));
    setText('profileModalBalance', formatCurrency(member.balance));
    setText('profileModalReturn', formatCurrency(member.totalReturn));
    setText('profileModalLoanCount', member.loanCount || 0);
    
    const imgEl = document.getElementById('profileModalImage');
    if(imgEl) imgEl.src = member.displayImageUrl;

    const sipContainer = document.getElementById('profileModalSipStatus');
    if (sipContainer) {
        const isPaid = member.sipStatus.paid;
        sipContainer.innerHTML = isPaid 
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
    
    const sorted = [...members].sort((a, b) => (b.sipStatus.paid - a.sipStatus.paid) || a.name.localeCompare(b.name));

    sorted.forEach(m => {
        const div = document.createElement('div');
        div.className = 'sip-status-item';
        div.innerHTML = `
            <img src="${m.displayImageUrl}" onerror="this.src='${DEFAULT_IMAGE}'">
            <span class="sip-status-name">${m.name}</span>
            <span class="sip-status-badge ${m.sipStatus.paid ? 'paid' : 'not-paid'}">
                ${m.sipStatus.paid ? 'Paid' : 'Pending'}
            </span>`;
        container.appendChild(div);
    });
    openModalById('sipStatusModal');
}

export function showPenaltyWalletModal(penaltyData, currentBalance) {
    Analytics.logAction("Opened Penalty Wallet");
    setText('penaltyBalance', formatCurrency(currentBalance));
    
    const list = document.getElementById('penaltyHistoryList');
    if (!list) return;
    list.innerHTML = '';
    
    const history = [
        ...Object.values(penaltyData.incomes || {}).map(i => ({...i, type: 'income'})),
        ...Object.values(penaltyData.expenses || {}).map(e => ({...e, type: 'expense'}))
    ].sort((a, b) => b.timestamp - a.timestamp);

    if (history.length === 0) {
        list.innerHTML = '<li style="text-align:center; padding:10px;">No history found.</li>';
    } else {
        history.forEach(tx => {
            const isInc = tx.type === 'income';
            const date = new Date(tx.timestamp).toLocaleDateString('en-GB');
            list.innerHTML += `
                <li class="luxury-history-item">
                    <div class="history-main">
                        <span class="history-name">${isInc ? tx.from : (tx.reason || 'Expense')}</span>
                        <div class="history-meta">${date}</div>
                    </div>
                    <span class="history-amount ${isInc ? 'green-text' : 'red-text'}">
                        ${isInc ? '+' : '-'} ${formatCurrency(tx.amount)}
                    </span>
                </li>`;
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
    openModalById('balanceModal');
    animateValue('totalSipAmountDisplay', stats.totalSipAmount);
    animateValue('totalCurrentLoanDisplay', stats.totalCurrentLoanAmount);
    animateValue('netReturnAmountDisplay', stats.netReturnAmount);
    animateValue('availableAmountDisplay', stats.availableCommunityBalance);
}

// --- 🔥 FIXED: Auto-Connect Database for Password Check ---
export async function handlePasswordCheck(database, memberId) {
    const input = document.getElementById('passwordInput');
    if (!input || !input.value) return alert('Please enter password.');
    
    // Auto-Connect Logic: Agar database null hai, to global firebase use karo
    let dbInstance = database;
    if (!dbInstance) {
        try {
            if (typeof firebase !== 'undefined') {
                dbInstance = firebase.database();
            } else {
                throw new Error("Firebase SDK missing");
            }
        } catch (e) {
            console.error("Auto-connect failed:", e);
            return alert("Database not connected. Please refresh the page.");
        }
    }

    try {
        const snap = await dbInstance.ref(`members/${memberId}/password`).once('value');
        const correctPassword = snap.val();
        
        if (String(input.value).trim() === String(correctPassword).trim()) {
            Analytics.logAction("Password Verified for Full View");
            window.location.href = `view.html?memberId=${memberId}`;
        } else {
            alert('Wrong Password!');
            input.value = '';
        }
    } catch (e) {
        console.error("Password check error:", e);
        alert('Verification failed. Check internet.');
    }
}

// --- 3. Utilities ---

export function promptForDeviceVerification(members) {
    return new Promise(resolve => {
        const modal = document.getElementById('deviceVerificationModal');
        if(!modal) return resolve(null);
        
        modal.querySelector('.modal-content').innerHTML = `
            <h2>Verify Identity</h2>
            <p>Select your name to continue.</p>
            <select id="memberVerifySelect" style="width:100%; padding:10px; margin:10px 0;">
                <option value="">-- Select Name --</option>
                ${members.sort((a,b)=>a.name.localeCompare(b.name)).map(m=>`<option value="${m.id}">${m.name}</option>`).join('')}
            </select>
            <button id="verifyBtn" class="civil-button" style="width:100%">Confirm</button>
        `;

        modal.classList.add('show');
        
        document.getElementById('verifyBtn').onclick = () => {
            const val = document.getElementById('memberVerifySelect').value;
            if(val) {
                modal.classList.remove('show');
                resolve(val);
            }
        };
    });
}

export function showFullImage(src, alt) {
    const img = document.getElementById('fullImageSrc');
    const modal = document.getElementById('imageModal');
    if (img && modal) {
        img.src = src;
        img.alt = alt;
        modal.classList.add('show');
        Analytics.logAction("Zoomed Image");
    }
}

export function showEmiModal(emi, name, price, modalElement) {
    Analytics.logAction(`Viewed EMI: ${name}`);
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

export async function requestNotificationPermission() {
    if (!('Notification' in window)) return false;
    const p = await Notification.requestPermission();
    return p === 'granted';
}

export function observeElements(elements) {
    const observer = new IntersectionObserver(entries => {
        entries.forEach(e => {
            if (e.isIntersecting) {
                e.target.classList.add('is-visible');
                observer.unobserve(e.target);
            }
        });
    }, { threshold: 0.1 });
    elements.forEach(el => observer.observe(el));
}

function openModalById(id) {
    const m = document.getElementById(id);
    if(m) {
        m.classList.add('show');
        document.body.style.overflow = 'hidden';
    }
}

function setText(id, val) {
    const el = document.getElementById(id);
    if(el) el.textContent = val;
}

function animateValue(id, end) {
    const el = document.getElementById(id);
    if(!el) return;
    const start = 0;
    const duration = 1000;
    let startTime = null;
    
    const step = (ts) => {
        if(!startTime) startTime = ts;
        const progress = Math.min((ts - startTime)/duration, 1);
        el.textContent = formatCurrency(Math.floor(progress * (end - start) + start));
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
