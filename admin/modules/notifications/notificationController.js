// modules/notifications/notificationController.js
import { db } from '../../core/firebaseConfig.js';
import { ref, push, update, remove, onValue, off, serverTimestamp } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-database.js";
import { showToast, showConfirmation, openModal, closeModal, setButtonState } from '../../shared/uiComponents.js';
import { uploadImage } from '../../shared/utils.js';

let notificationsListener = null;
let membersListener = null;
let notificationSettings = {};
let manualNotifications = {};
let automatedQueue = {};
let allMembersData = {};

export async function init() {
    console.log("Notification Module Initialized");
    const container = document.getElementById('notification-manager-view');

    // 1. Click Handlers (Delete, Edit, Toggles)
    container.addEventListener('click', async (e) => {
        // Delete Manual Notification
        if (e.target.closest('.delete-manual-notification-btn')) {
            const btn = e.target.closest('.delete-manual-notification-btn');
            const notifId = btn.dataset.id;
            await handleDeleteManualNotification(notifId);
        }

        // Edit Manual Notification
        if (e.target.closest('.edit-manual-notification-btn')) {
            const btn = e.target.closest('.edit-manual-notification-btn');
            const notifId = btn.dataset.id;
            const notifData = manualNotifications[notifId];
            if (notifData) {
                renderEditNotificationModal(notifId, notifData);
            }
        }

        // System Toggle (Enable/Disable All)
        if (e.target.id === 'notification-system-toggle') {
            const isEnabled = e.target.checked;
            await handleSystemToggle(isEnabled, e.target);
        }

        // Automated Queue Item Toggle
        if (e.target.classList.contains('automated-notification-toggle')) {
            const queueId = e.target.dataset.id;
            const isChecked = e.target.checked;
            await handleQueueToggle(queueId, isChecked, e.target);
        }

        // Image Preview Click (Create Form)
        if (e.target.closest('#notification-image-preview')) {
            document.getElementById('notification-image-file').click();
        }
    });

    // 2. File Input Change (Create Form)
    container.addEventListener('change', (e) => {
        if (e.target.id === 'notification-image-file') {
            handleImagePreview(e.target, 'notification-image-preview');
        }
    });

    // 3. Create Form Submit
    document.body.addEventListener('submit', async (e) => {
        if (e.target.id === 'manual-notification-form') {
            e.preventDefault();
            await handleCreateNotification(e);
        }
        if (e.target.id === 'edit-notification-form') {
            e.preventDefault();
            await handleEditSubmit(e);
        }
    });

    // 4. Edit Modal specific listeners (Delegated to body)
    document.body.addEventListener('click', (e) => {
         if (e.target.closest('#edit-notification-image-preview')) {
            document.getElementById('edit-notification-image-file').click();
        }
        if (e.target.closest('.close-modal-btn')) {
            const modal = e.target.closest('.modal-overlay');
            if(modal) closeModal(modal);
        }
    });

    document.body.addEventListener('change', (e) => {
        if (e.target.id === 'edit-notification-image-file') {
            handleImagePreview(e.target, 'edit-notification-image-preview');
        }
    });
}

export async function render() {
    const container = document.getElementById('notification-manager-view');

    // Skeleton UI
    container.innerHTML = `
        <div class="space-y-8">
            <div class="bg-white p-6 rounded-xl shadow-md">
                <h3 class="text-xl font-bold text-gray-800 mb-4">System Status</h3>
                <div class="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                    <div><p class="font-semibold text-gray-700">Notification System</p><p class="text-sm text-gray-500">Enable or disable all automated and manual notifications.</p></div>
                    <div class="h-6 w-12 bg-gray-200 rounded-full animate-pulse"></div>
                </div>
            </div>
            <div class="text-center py-10"><div class="loader border-indigo-600"></div> Loading Notifications...</div>
        </div>
    `;

    const notifRef = ref(db, 'admin/notifications');
    const membersRef = ref(db, 'members');

    if (notificationsListener) off(notifRef, 'value', notificationsListener);
    if (membersListener) off(membersRef, 'value', membersListener);

    // Members data chahiye taaki Queue me naam dikha sakein
    membersListener = onValue(membersRef, (snap) => {
        allMembersData = snap.val() || {};
        // Agar notifications data pehle se hai to UI refresh karein
        if(Object.keys(notificationSettings).length > 0) renderUI();
    });

    notificationsListener = onValue(notifRef, (snapshot) => {
        const data = snapshot.val() || {};
        notificationSettings = data;
        manualNotifications = data.manual || {};
        automatedQueue = data.automatedQueue || {};
        renderUI();
    });
}

// --- Internal Helper Functions ---

function renderUI() {
    const container = document.getElementById('notification-manager-view');
    if (!container) return;

    const isSystemEnabled = notificationSettings.systemEnabled !== false; // Default true

    container.innerHTML = `
        <div class="space-y-8">
            <div class="bg-white p-6 rounded-xl shadow-md">
                <h3 class="text-xl font-bold text-gray-800 mb-4">System Status</h3>
                <div class="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                    <div>
                        <p class="font-semibold text-gray-700">Notification System</p>
                        <p class="text-sm text-gray-500">Enable or disable all automated and manual notifications.</p>
                    </div>
                    <label class="toggle-switch">
                        <input type="checkbox" id="notification-system-toggle" ${isSystemEnabled ? 'checked' : ''}>
                        <span class="slider"></span>
                    </label>
                </div>
            </div>

            <div class="bg-white p-6 rounded-xl shadow-md">
                <h3 class="text-xl font-bold text-gray-800 mb-4">Create Manual Notification</h3>
                <form id="manual-notification-form" class="space-y-4">
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-2 required-label">Notification Image</label>
                        <div id="notification-image-preview" class="w-full h-40 border-2 border-dashed border-gray-300 rounded-lg bg-gray-50 flex items-center justify-center cursor-pointer bg-cover bg-center hover:border-indigo-400 transition-colors">
                            <span class="text-gray-500">Click to upload (16:9 ratio recommended)</span>
                        </div>
                        <input type="file" id="notification-image-file" class="hidden" accept="image/*" required>
                    </div>
                    <div>
                        <label for="notification-title" class="block text-sm font-medium text-gray-700 mb-1 required-label">Title</label>
                        <input type="text" id="notification-title" placeholder="e.g., Special Diwali Offer!" class="form-input w-full p-3 rounded-lg" required>
                    </div>
                    <div>
                        <label for="notification-link" class="block text-sm font-medium text-gray-700 mb-1">Explore Link (Optional)</label>
                        <input type="url" id="notification-link" placeholder="https://example.com/offer" class="form-input w-full p-3 rounded-lg">
                    </div>
                    <div class="text-right">
                        <button type="submit" id="publish-notification-btn" class="btn-primary flex items-center justify-center text-white font-bold py-2 px-6 rounded-lg ml-auto">
                            <span>Publish Notification</span>
                            <div class="loader hidden ml-2"></div>
                        </button>
                    </div>
                </form>
            </div>

            <div class="bg-white p-6 rounded-xl shadow-md">
                <h3 class="text-xl font-bold text-gray-800 mb-4">Active Manual Notifications</h3>
                <div id="manual-notifications-list" class="space-y-3">
                    ${renderManualList()}
                </div>
            </div>

            <div class="bg-white p-6 rounded-xl shadow-md">
                <h3 class="text-xl font-bold text-gray-800 mb-4">Scheduled Automated Notifications</h3>
                <div id="automated-notifications-queue" class="space-y-3">
                    ${renderAutomatedQueue()}
                </div>
            </div>
        </div>
    `;
}

function renderManualList() {
    const list = Object.entries(manualNotifications);
    if (list.length === 0) return `<p class="text-gray-500 text-center py-4 bg-gray-50 rounded-lg">No manual notifications active.</p>`;

    return list.map(([id, notif]) => `
        <div class="flex items-center gap-4 p-3 bg-gray-50 rounded-lg border border-gray-200">
            <img src="${notif.imageUrl}" class="w-20 h-12 object-cover rounded-md bg-gray-200">
            <div class="flex-grow">
                <p class="font-semibold text-gray-800">${notif.title}</p>
                <p class="text-xs text-gray-500">${new Date(notif.createdAt).toLocaleDateString()}</p>
            </div>
            <div class="flex items-center gap-2">
                <button class="edit-manual-notification-btn p-2 bg-white rounded-full text-blue-600 shadow-sm hover:bg-blue-50" data-id="${id}" title="Edit">
                    <i class="ph-pencil-simple text-lg"></i>
                </button>
                <button class="delete-manual-notification-btn p-2 bg-white rounded-full text-red-600 shadow-sm hover:bg-red-50" data-id="${id}" title="Delete">
                    <i class="ph-trash text-lg"></i>
                </button>
            </div>
        </div>
    `).join('');
}

function renderAutomatedQueue() {
    // Filter out archived/sent items if you want, or show only active/disabled
    const queue = Object.entries(automatedQueue).filter(([id, item]) => item.status !== 'archived');

    if (queue.length === 0) return `<p class="text-gray-500 text-center py-4 bg-gray-50 rounded-lg">No scheduled notifications in queue.</p>`;

    return queue.map(([id, item]) => {
        const memberName = allMembersData[item.memberId]?.fullName || 'Unknown Member';
        const isActive = item.status === 'active';
        return `
            <div class="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200">
                <div>
                    <p class="font-semibold text-gray-800">${memberName}</p>
                    <p class="text-sm text-gray-600">${item.type}</p>
                </div>
                <div class="flex items-center gap-3">
                    <span class="text-xs font-medium px-2 py-1 rounded ${isActive ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-600'}">
                        ${isActive ? 'Active' : 'Disabled'}
                    </span>
                    <label class="toggle-switch">
                        <input type="checkbox" class="automated-notification-toggle" data-id="${id}" ${isActive ? 'checked' : ''}>
                        <span class="slider"></span>
                    </label>
                </div>
            </div>
        `;
    }).join('');
}

function handleImagePreview(input, previewId) {
    const file = input.files[0];
    const preview = document.getElementById(previewId);
    if (file && preview) {
        const reader = new FileReader();
        reader.onload = (event) => {
            preview.style.backgroundImage = `url(${event.target.result})`;
            preview.innerHTML = '';
        };
        reader.readAsDataURL(file);
    }
}

// --- Modals (Self-contained) ---

function renderEditNotificationModal(notifId, notifData) {
    const modal = document.getElementById('editNotificationModal');
    if (!modal) return;

    modal.innerHTML = `
        <div class="modal-content bg-white rounded-lg shadow-xl w-full max-w-lg scale-95">
            <form id="edit-notification-form" data-notif-id="${notifId}">
                <div class="p-4 border-b flex justify-between items-center">
                    <h3 class="text-lg font-bold">Edit Manual Notification</h3>
                    <button type="button" class="close-modal-btn text-2xl text-gray-500 hover:text-gray-800">&times;</button>
                </div>
                <div class="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-2">Notification Image</label>
                        <div id="edit-notification-image-preview" 
                             class="w-full h-40 border-2 border-dashed rounded-lg bg-cover bg-center bg-gray-100 cursor-pointer" 
                             style="background-image: url(${notifData.imageUrl})">
                        </div>
                        <input type="file" id="edit-notification-image-file" class="hidden" accept="image/*">
                        <input type="hidden" id="edit-notification-image-url" value="${notifData.imageUrl}">
                         <p class="text-xs text-center text-gray-500 mt-1">Click image to upload a new one</p>
                    </div>
                    <div>
                        <label for="edit-notification-title" class="block text-sm font-medium text-gray-700 mb-1 required-label">Title</label>
                        <input type="text" id="edit-notification-title" value="${notifData.title}" class="form-input w-full p-3 rounded-lg" required>
                    </div>
                    <div>
                        <label for="edit-notification-link" class="block text-sm font-medium text-gray-700 mb-1">Explore Link (Optional)</label>
                        <input type="url" id="edit-notification-link" value="${notifData.link || ''}" class="form-input w-full p-3 rounded-lg">
                    </div>
                </div>
                <div class="p-4 bg-gray-50 flex justify-end gap-3">
                    <button type="button" class="close-modal-btn px-4 py-2 text-sm font-medium text-gray-700 bg-gray-200 rounded-md hover:bg-gray-300">Cancel</button>
                    <button type="submit" id="update-notification-btn" class="btn-primary flex items-center justify-center px-4 py-2 text-sm font-medium rounded-md">
                        <span>Save Changes</span>
                        <div class="loader hidden ml-2"></div>
                    </button>
                </div>
            </form>
        </div>
    `;
    openModal(modal);
}

// --- Action Handlers ---

async function handleCreateNotification(e) {
    const btn = document.getElementById('publish-notification-btn');
    setButtonState(btn, true);

    try {
        const imageFile = document.getElementById('notification-image-file').files[0];
        const title = document.getElementById('notification-title').value;
        const link = document.getElementById('notification-link').value;

        if (!imageFile || !title) throw new Error('Image and Title are required.');

        const imageUrl = await uploadImage(imageFile);
        if (!imageUrl) throw new Error('Image upload failed.');

        const notificationData = {
            title: title,
            link: link || "",
            imageUrl: imageUrl,
            createdAt: serverTimestamp()
        };

        await push(ref(db, 'admin/notifications/manual'), notificationData);
        showToast('Manual notification published successfully!');

        // Reset form
        e.target.reset();
        const preview = document.getElementById('notification-image-preview');
        preview.style.backgroundImage = '';
        preview.innerHTML = '<span class="text-gray-500">Click to upload (16:9 ratio recommended)</span>';

    } catch (error) {
        showToast(`Error: ${error.message}`, true);
    } finally {
        setButtonState(btn, false, 'Publish Notification');
    }
}

async function handleEditSubmit(e) {
    const btn = document.getElementById('update-notification-btn');
    setButtonState(btn, true);
    const notifId = e.target.dataset.notifId;

    try {
        const imageFile = document.getElementById('edit-notification-image-file').files[0];
        let imageUrl = document.getElementById('edit-notification-image-url').value;

        if (imageFile) {
            const newImageUrl = await uploadImage(imageFile);
            if (newImageUrl) {
                imageUrl = newImageUrl;
            } else {
                throw new Error('New image upload failed.');
            }
        }

        const updates = {
            title: document.getElementById('edit-notification-title').value,
            link: document.getElementById('edit-notification-link').value || "",
            imageUrl: imageUrl
        };

        await update(ref(db, `admin/notifications/manual/${notifId}`), updates);
        showToast('Notification updated successfully!');
        const modal = document.getElementById('editNotificationModal');
        if(modal) closeModal(modal);

    } catch (error) {
        showToast('Error updating notification: ' + error.message, true);
    } finally {
        setButtonState(btn, false, 'Save Changes');
    }
}

async function handleDeleteManualNotification(notifId) {
    if (await showConfirmation('Delete Notification?', 'Are you sure you want to delete this notification?')) {
        try {
            await remove(ref(db, `admin/notifications/manual/${notifId}`));
            showToast('Notification deleted successfully.');
        } catch (error) {
            showToast('Failed to delete: ' + error.message, true);
        }
    }
}

async function handleSystemToggle(isEnabled, toggleElement) {
    try {
        await update(ref(db, 'admin/notifications'), { systemEnabled: isEnabled });
        showToast(`Notification system ${isEnabled ? 'enabled' : 'disabled'}.`);
    } catch (error) {
        showToast('Failed to update system status: ' + error.message, true);
        toggleElement.checked = !isEnabled; // Revert UI on failure
    }
}

async function handleQueueToggle(queueId, isChecked, toggleElement) {
    const newStatus = isChecked ? 'active' : 'disabled';
    try {
        await update(ref(db, `admin/notifications/automatedQueue/${queueId}`), { status: newStatus });
        showToast(`Notification ${isChecked ? 'enabled' : 'disabled'}.`);
    } catch (error) {
        showToast('Failed to update status: ' + error.message, true);
        toggleElement.checked = !isChecked; // Revert UI
    }
}