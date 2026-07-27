// core/router.js
import { showToast } from '../shared/uiComponents.js';

// Route configuration: Link View ID to Module File Path
const routes = {
    'dashboard': { path: '../modules/dashboard/dashboardController.js' },
    'view-balance': { path: '../modules/balance/balanceController.js' },

    // NEW: Return Profit Module
    'return-profit': { path: '../modules/returnProfit/returnProfitController.js' },

    // TCF Dashboard
    'tcf-page': { path: '../modules/tcf/tcfController.js' },

    // TCF Entry Form
    'tcf-entry': { path: '../modules/tcf/tcfEntryController.js' },

    'rules-manager': { path: '../modules/rules/rulesController.js' },
    'approvals': { path: '../modules/approvals/approvalsController.js' },
    'all-members': { path: '../modules/members/membersController.js' },
    'data-entry': { path: '../modules/dataEntry/dataEntryController.js' },
    'data-explorer': { path: '../modules/explorer/explorerController.js' },
    'add-product': { path: '../modules/products/productAddController.js' },
    'all-products': { path: '../modules/products/productListController.js' },
    'notification-manager': { path: '../modules/notifications/notificationController.js' },
    'manage-cards': { path: '../modules/cards/cardsController.js' },
    'page-settings': { path: '../modules/settings/buttonController.js' },
    'new-registration': { path: '../modules/registration/registrationController.js' }
};

// Loaded modules cache
const loadedModules = {};

export async function navigateTo(viewId) {
    // 1. Sidebar UI Update
    document.querySelectorAll('.sidebar-item').forEach(item => {
        item.classList.toggle('active', item.dataset.view === viewId);
    });

    // 2. Hide all Views
    document.querySelectorAll('.view').forEach(view => {
        view.classList.remove('active');
        view.style.display = 'none';
    });

    // 3. Show Skeleton/Loading State
    let viewContainer = document.getElementById(`${viewId}-view`);

    if (!viewContainer) {
        const main = document.querySelector('main');
        if(main) {
            viewContainer = document.createElement('div');
            viewContainer.id = `${viewId}-view`;
            viewContainer.className = 'view';
            main.appendChild(viewContainer);
        }
    }

    if (viewContainer) {
        viewContainer.style.display = 'block';
    }

    // 4. Update Header Title
    let displayTitle = viewId ? viewId.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) : 'Dashboard';
    if(viewId === 'page-settings') displayTitle = "App Button Manager";

    const titleEl = document.getElementById('view-title');
    if (titleEl) titleEl.textContent = displayTitle;

    // 5. Handle Header Buttons
    const homeBtn = document.getElementById('home-btn');
    const dashboardStats = document.getElementById('dashboard-header-stats');
    const dashboardEntryBtn = document.getElementById('dashboard-entry-btn');

    if (viewId === 'dashboard') {
        if(homeBtn) homeBtn.classList.add('hidden');
        if(dashboardStats) dashboardStats.classList.remove('hidden');
        if(dashboardEntryBtn) dashboardEntryBtn.style.display = 'flex';
    } else {
        if(homeBtn) homeBtn.classList.remove('hidden');
        if(dashboardStats) dashboardStats.classList.add('hidden');
        if(dashboardEntryBtn) dashboardEntryBtn.style.display = 'none';
    }

    // 6. Lazy Load Module Logic
    const route = routes[viewId];
    if (route) {
        try {
            if (!loadedModules[viewId]) {
                console.log(`Loading module: ${viewId}...`);
                const module = await import(route.path);
                loadedModules[viewId] = module;
                if (module.init) await module.init();
            }

            const module = loadedModules[viewId];
            if (module.render) {
                viewContainer.classList.add('active'); 
                await module.render(); 
            }

        } catch (error) {
            console.error(`Error loading module ${viewId}:`, error);
            if (viewContainer) {
                viewContainer.innerHTML = `<div class="p-8 text-center text-gray-500">
                    <p>Module <strong>${viewId}</strong> is under construction.</p>
                    <p class="text-xs mt-2 text-red-400">${error.message}</p>
                    <p class="text-xs text-gray-400">Check console for details.</p>
                </div>`;
                viewContainer.classList.add('active');
            }
        }
    } else {
        console.warn(`No route defined for view: ${viewId}`);
    }

    const sidebar = document.getElementById('sidebar');
    if (sidebar && sidebar.classList.contains('open')) {
        sidebar.classList.remove('open');
    }
}