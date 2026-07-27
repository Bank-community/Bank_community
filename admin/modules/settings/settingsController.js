// modules/settings/settingsController.js
import { db } from '../../core/firebaseConfig.js';
import { ref, push, set, remove, onValue, off } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-database.js";
import { showToast, showConfirmation, openModal, closeModal, setButtonState } from '../../shared/uiComponents.js';

let settingsListener = null;
let dashboardButtons = {};

export async function init() {
    console.log("Settings Module Initialized");
    const container = document.getElementById('page-settings-view');

    // 1. Click Handlers
    container.addEventListener('click', async (e) => {
        // Add New Button
        if (e.target.closest('#add-new-button-btn')) {
            renderDashboardButtonModal();
        }

        // Edit Button
        if (e.target.closest('.edit-button-btn')) {
            const btnKey = e.target.closest('.edit-button-btn').dataset.key;
            const btnData = dashboardButtons[btnKey];
            if (btnData) {
                renderDashboardButtonModal(btnKey, btnData);
            }
        }

        // Delete Button
        if (e.target.closest('.delete-button-btn')) {
            const btnKey = e.target.closest('.delete-button-btn').dataset.key;
            await handleDeleteButton(btnKey);
        }
    });

    // 2. Modal Form Submit Listener (Delegated to body)
    document.body.addEventListener('submit', async (e) => {
        if (e.target.id === 'dashboard-button-form') {
            e.preventDefault();
            await handleButtonSubmit(e);
        }
    });

    // 3. Modal Close Listener
    document.body.addEventListener('click', (e) => {
         if (e.target.closest('.close-modal-btn')) {
            const modal = e.target.closest('.modal-overlay');
            if(modal) closeModal(modal);
        }
    });
}

export async function render() {
    const container = document.getElementById('page-settings-view');

    // Skeleton UI
    container.innerHTML = `
        <div class="space-y-8">
            <div class="bg-white p-6 rounded-xl shadow-md">
                <div class="flex justify-between items-center mb-4">
                    <h3 class="text-xl font-bold text-gray-800">Manage Dashboard Buttons</h3>
                    <button id="add-new-button-btn" class="btn-primary flex items-center gap-2 text-white font-bold py-2 px-4 rounded-lg shadow hover:shadow-lg transition-transform hover:-translate-y-0.5">
                        <i class="ph-plus-circle text-xl"></i> Add New Button
                    </button>
                </div>
                <div id="dashboard-buttons-list" class="space-y-3 mt-4">
                     <div class="text-center py-6"><div class="loader border-indigo-600"></div> Loading buttons...</div>
                </div>
            </div>
        </div>
    `;

    // Fetch Data
    const buttonsRef = ref(db, 'admin/dashboard_buttons');
    if (settingsListener) off(buttonsRef, 'value', settingsListener);

    settingsListener = onValue(buttonsRef, (snapshot) => {
        dashboardButtons = snapshot.val() || {};
        renderButtonsList();
    });
}

// --- Internal Helper Functions ---

function renderButtonsList() {
    const listContainer = document.getElementById('dashboard-buttons-list');
    if (!listContainer) return;

    if (Object.keys(dashboardButtons).length === 0) {
        listContainer.innerHTML = '<p class="text-center text-gray-500 py-4 bg-gray-50 rounded-lg">No dashboard buttons created yet.</p>';
        return;
    }

    listContainer.innerHTML = Object.entries(dashboardButtons).map(([key, btn]) => `
        <div class="flex justify-between items-center p-4 bg-gray-50 rounded-lg border border-gray-200 hover:border-indigo-200 transition-colors">
            <div class="flex items-center gap-4">
                <div class="w-10 h-10 rounded-lg flex items-center justify-center text-white shadow-sm" style="background-color: ${btn.color || '#ccc'};">
                    ${btn.icon ? btn.icon : '<i class="ph-arrow-square-out text-xl"></i>'}
                </div>
                <div>
                    <p class="font-bold text-gray-800 text-lg">${btn.name}</p>
                    <a href="${btn.url}" target="_blank" class="text-xs text-indigo-500 hover:underline flex items-center gap-1">
                        ${btn.url} <i class="ph-arrow-up-right"></i>
                    </a>
                </div>
            </div>
            <div class="flex items-center gap-2">
                <button class="edit-button-btn p-2 text-gray-500 hover:text-indigo-600 hover:bg-white rounded-full transition-all shadow-sm" data-key="${key}" title="Edit">
                    <i class="ph-pencil-simple text-xl"></i>
                </button>
                <button class="delete-button-btn p-2 text-gray-500 hover:text-red-600 hover:bg-white rounded-full transition-all shadow-sm" data-key="${key}" title="Delete">
                    <i class="ph-trash text-xl"></i>
                </button>
            </div>
        </div>
    `).join('');
}

function renderDashboardButtonModal(key = null, btnData = {}) {
    const modal = document.getElementById('dashboardButtonModal');
    const isEditing = key !== null;

    modal.innerHTML = `
        <div class="modal-content bg-white rounded-lg shadow-xl w-full max-w-md scale-95 transition-all">
            <form id="dashboard-button-form" data-key="${isEditing ? key : ''}">
                <div class="p-4 border-b flex justify-between items-center bg-gray-50 rounded-t-lg">
                    <h3 class="text-lg font-bold text-gray-800">${isEditing ? 'Edit' : 'Add'} Dashboard Button</h3>
                    <button type="button" class="close-modal-btn text-gray-400 hover:text-gray-800 text-2xl leading-none">&times;</button>
                </div>
                <div class="p-6 space-y-4">
                    <div>
                        <label for="btn-name" class="block text-sm font-medium text-gray-700 mb-1">Button Name</label>
                        <input type="text" id="btn-name" class="form-input w-full p-2 rounded-lg focus:ring-2 focus:ring-indigo-500" placeholder="e.g., Pay EMI" value="${btnData.name || ''}" required>
                    </div>
                    <div>
                        <label for="btn-url" class="block text-sm font-medium text-gray-700 mb-1">Button URL</label>
                        <input type="text" id="btn-url" class="form-input w-full p-2 rounded-lg" placeholder="https://... or page.html" value="${btnData.url || ''}" required>
                    </div>
                    <div>
                        <label for="btn-color" class="block text-sm font-medium text-gray-700 mb-1">Button Color</label>
                        <div class="flex items-center gap-2">
                            <input type="color" id="btn-color" class="h-10 w-14 rounded cursor-pointer border-0 p-0" value="${btnData.color || '#4f46e5'}">
                            <span class="text-xs text-gray-500">Pick a background color</span>
                        </div>
                    </div>
                    <div>
                        <label for="btn-icon" class="block text-sm font-medium text-gray-700 mb-1">Button Icon (SVG Code)</label>
                        <textarea id="btn-icon" class="form-input w-full p-2 rounded-lg font-mono text-xs" rows="3" placeholder='<svg>...</svg>'>${btnData.icon || ''}</textarea>
                        <p class="text-xs text-gray-500 mt-1">Paste full SVG code. Use white stroke/fill for best results.</p>
                    </div>
                </div>
                <div class="p-4 bg-gray-50 border-t flex justify-end gap-3 rounded-b-lg">
                    <button type="button" class="close-modal-btn px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 shadow-sm">Cancel</button>
                    <button type="submit" id="save-btn-btn" class="btn-primary flex items-center justify-center px-4 py-2 text-sm font-medium rounded-lg shadow-md">
                        <span>Save Button</span>
                        <div class="loader hidden ml-2"></div>
                    </button>
                </div>
            </form>
        </div>
    `;
    openModal(modal);
}

// --- Action Handlers ---

async function handleButtonSubmit(e) {
    const btn = document.getElementById('save-btn-btn');
    setButtonState(btn, true);

    const key = e.target.dataset.key; // Empty if adding new
    const btnData = { 
        name: document.getElementById('btn-name').value, 
        url: document.getElementById('btn-url').value, 
        color: document.getElementById('btn-color').value, 
        icon: document.getElementById('btn-icon').value, 
    };

    try {
        const dbRef = key ? ref(db, `admin/dashboard_buttons/${key}`) : push(ref(db, 'admin/dashboard_buttons'));
        await set(dbRef, btnData);

        showToast(`Button ${key ? 'updated' : 'added'} successfully!`);
        closeModal(document.getElementById('dashboardButtonModal'));
    } catch (error) {
        showToast('Error saving button: ' + error.message, true);
    } finally {
        setButtonState(btn, false, 'Save Button');
    }
}

async function handleDeleteButton(key) {
    const btnName = dashboardButtons[key]?.name || 'this button';
    if (await showConfirmation('Delete Button?', `Are you sure you want to delete "${btnName}"?`)) {
        try {
            await remove(ref(db, `admin/dashboard_buttons/${key}`));
            showToast('Button deleted successfully.');
        } catch (error) {
            showToast('Error deleting button: ' + error.message, true);
        }
    }
}