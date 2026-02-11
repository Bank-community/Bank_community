// core/app.js
import { signOut } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-auth.js";
import { auth } from './firebaseConfig.js';
import { navigateTo } from './router.js';

// --- Initialization ---

async function initApp() {
    // 1. Security Check
    if (sessionStorage.getItem('isAdminLoggedIn') !== 'true') {
        window.location.href = 'login.html';
        return;
    }

    console.log("Admin Panel Initializing...");

    // 2. Setup Global Event Listeners (Sidebar, Logout, Navigation)
    setupGlobalListeners();

    // 3. Load Default Route (Dashboard)
    navigateTo('dashboard');
}

function setupGlobalListeners() {
    // Global Click Handler
    document.body.addEventListener('click', (e) => {

        // --- 1. Mobile Menu Handling (Priority) ---

        // Open Menu
        if (e.target.closest('#mobileMenuBtn')) {
            const sidebar = document.getElementById('sidebar');
            if(sidebar) sidebar.classList.add('open');
        }

        // Close Menu
        if (e.target.closest('#closeMobileMenuBtn')) {
            const sidebar = document.getElementById('sidebar');
            if(sidebar) {
                sidebar.classList.remove('open');
            }
        }

        // Close Menu agar user Sidebar ke bahar click kare
        const sidebar = document.getElementById('sidebar');
        if (sidebar && sidebar.classList.contains('open') && 
            !sidebar.contains(e.target) && 
            !e.target.closest('#mobileMenuBtn')) {
            sidebar.classList.remove('open');
        }

        // --- 2. Sidebar Navigation Links ---
        const sidebarItem = e.target.closest('.sidebar-item[data-view]');
        if (sidebarItem && !sidebarItem.hasAttribute('target')) {
            e.preventDefault();
            const viewId = sidebarItem.dataset.view;
            navigateTo(viewId);

            // Link click karne par bhi menu band hona chahiye mobile mein
            if(window.innerWidth < 768) {
                 if(sidebar) sidebar.classList.remove('open');
            }
        }

        // --- 3. Header Buttons ---
        if (e.target.closest('#home-btn')) {
            navigateTo('dashboard');
        }

        if (e.target.closest('#dashboard-entry-btn')) {
            navigateTo('data-entry');
        }

        // --- 4. Dashboard Shortcut Cards ---
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

    // Logout Handler
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

// Start the App
initApp();