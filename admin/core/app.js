// core/app.js
import { signOut } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-auth.js";
import { auth } from './firebaseConfig.js';
import { navigateTo } from './router.js';
import { runAutoInterestReduction } from './loanUpdater.js'; // <--- NEW IMPORT

// --- Initialization ---

async function initApp() {
    // 1. Security Check
    if (sessionStorage.getItem('isAdminLoggedIn') !== 'true') {
        window.location.href = 'login.html';
        return;
    }

    console.log("Admin Panel Initializing...");

    // 2. Setup Global Event Listeners
    setupGlobalListeners();

    // 3. NEW: Run Auto Interest Check (Background Process)
    runAutoInterestReduction(); // <--- CALL HERE

    // 4. Load Default Route
    navigateTo('dashboard');
}

function setupGlobalListeners() {
    // ... (Old code remains same) ...
    document.body.addEventListener('click', (e) => {
        if (e.target.closest('#mobileMenuBtn')) {
            const sidebar = document.getElementById('sidebar');
            if(sidebar) sidebar.classList.add('open');
        }
        if (e.target.closest('#closeMobileMenuBtn')) {
            const sidebar = document.getElementById('sidebar');
            if(sidebar) sidebar.classList.remove('open');
        }
        const sidebar = document.getElementById('sidebar');
        if (sidebar && sidebar.classList.contains('open') && 
            !sidebar.contains(e.target) && 
            !e.target.closest('#mobileMenuBtn')) {
            sidebar.classList.remove('open');
        }
        const sidebarItem = e.target.closest('.sidebar-item[data-view]');
        if (sidebarItem && !sidebarItem.hasAttribute('target')) {
            e.preventDefault();
            const viewId = sidebarItem.dataset.view;
            navigateTo(viewId);
            if(window.innerWidth < 768) {
                 if(sidebar) sidebar.classList.remove('open');
            }
        }
        if (e.target.closest('#home-btn')) navigateTo('dashboard');
        if (e.target.closest('#dashboard-entry-btn')) navigateTo('data-entry');

        const dashboardCard = e.target.closest('.dashboard-stat-card');
        if (dashboardCard) {
            const action = dashboardCard.dataset.action;
            const viewMap = {
                'add-product': 'add-product',
                'view-data-explorer': 'data-explorer',
                'view-approvals': 'approvals',
                'view-all-members': 'all-members'
            };
            if (viewMap[action]) navigateTo(viewMap[action]);
        }
    });

    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
            try {
                await signOut(auth);
            } catch (error) {
                console.error("Sign out error", error);
            } finally {
                sessionStorage.removeItem('isAdminLoggedIn');
                window.location.href = 'login.html';
            }
        });
    }
}

initApp();