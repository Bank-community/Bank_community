import { db } from '../../core/firebaseConfig.js';
import { ref, push, update, remove, onValue, off, serverTimestamp, get } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-database.js";
import { showToast, showConfirmation, openModal, closeModal, setButtonState } from '../../shared/uiComponents.js';
import { uploadImage } from '../../shared/utils.js';

let notificationsListener = null;
let membersListener = null;
let notificationSettings = {};
let manualNotifications = {};
let automatedQueue = {};
let allMembersData = {};

// 1. INIT FUNCTION (Listeners)
export async function init() {
    console.log("🔔 Notification Module Initialized");
    
    // Ham 'document' par listener lagayenge (Event Delegation) 
    // taaki agar HTML baad me bhi load ho to buttons kaam karein.
    
    document.body.addEventListener('click', async (e) => {
        // Sirf tab react karein jab hum notification view me hon
        const container = document.getElementById('notification-manager-view');
        if (!container || container.classList.contains('hidden')) return;

        // Delete Button
        if (e.target.closest('.delete-manual-notification-btn')) {
            const btn = e.target.closest('.delete-manual-notification-btn');
            await handleDeleteManualNotification(btn.dataset.id);
        }

        // System Toggle
        if (e.target.id === 'notification-system-toggle') {
            await handleSystemToggle(e.target.checked, e.target);
        }

        // Automated Queue Toggle
        if (e.target.classList.contains('automated-notification-toggle')) {
            await handleQueueToggle(e.target.dataset.id, e.target.checked, e.target);
        }

        // Image Preview Click
        if (e.target.closest('#notification-image-preview')) {
            document.getElementById('notification-image-file').click();
        }
    });

    // Form Change Listener
    document.body.addEventListener('change', (e) => {
        if (e.target.id === 'notification-image-file') {
            handleImagePreview(e.target);
        }
    });

    // Form Submit Listener
    document.body.addEventListener('submit', async (e) => {
        if (e.target.id === 'manual-notification-form') {
            e.preventDefault();
            await handleCreateNotification(e);
        }
    });
}

// 2. RENDER FUNCTION (Display UI)
export async function render() {
    const container = document.getElementById('notification-manager-view');
    
    // ERROR FIX: Agar HTML me ID nahi mili to error dikhao
    if (!container) {
        console.error("❌ Error: 'notification-manager-view' ID not found in admin.html");
        alert("Setup Error: admin.html me notification container missing hai.");
        return;
    }

    // Skeleton UI (Loading State)
    container.innerHTML = `
        <div class="space-y-6 animate-pulse">
            <div class="h-32 bg-gray-200 rounded-xl"></div>
            <div class="h-64 bg-gray-200 rounded-xl"></div>
        </div>
    `;

    // Firebase Data Fetch
    const notifRef = ref(db, 'admin/notifications');
    const membersRef = ref(db, 'members');

    // Remove Old Listeners
    if (notificationsListener) off(notifRef, 'value', notificationsListener);
    if (membersListener) off(membersRef, 'value', membersListener);

    // Load Data
    membersListener = onValue(membersRef, (snap) => {
        allMembersData = snap.val() || {};
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

// 3. UI GENERATOR
function renderUI() {
    const container = document.getElementById('notification-manager-view');
    if (!container) return;

    const isSystemEnabled = notificationSettings.systemEnabled !== false;

    container.innerHTML = `
        <div class="max-w-5xl mx-auto space-y-8">
            <div class="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex flex-col md:flex-row justify-between items-center gap-4">
                <div>
                    <h2 class="text-2xl font-bold text-gray-800">📢 Notification Center</h2>
                    <p class="text-sm text-gray-500">Manage alerts and automated reminders</p>
                </div>
                <div class="flex items-center gap-3 bg-gray-50 px-4 py-2 rounded-lg border">
                    <span class="text-sm font-semibold text-gray-700">System Status:</span>
                    <label class="toggle-switch relative inline-flex items-center cursor-pointer">
                        <input type="checkbox" id="notification-system-toggle" class="sr-only peer" ${isSystemEnabled ? 'checked' : ''}>
                        <div class="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                    </label>
                </div>
            </div>

            <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div class="bg-white p-6 rounded-xl shadow-md border border-gray-100">
                    <h3 class="text-lg font-bold text-gray-800 mb-4 border-b pb-2">✨ Send New Update</h3>
                    <form id="manual-notification-form" class="space-y-4">
                        <div>
                            <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Banner Image</label>
                            <div id="notification-image-preview" class="w-full h-32 border-2 border-dashed border-indigo-100 rounded-lg bg-indigo-50 flex flex-col items-center justify-center cursor-pointer hover:bg-indigo-100 transition-colors bg-cover bg-center">
                                <i class="ph-image text-2xl text-indigo-300 mb-1"></i>
                                <span class="text-xs text-indigo-500 font-medium">Click to upload</span>
                            </div>
                            <input type="file" id="notification-image-file" class="hidden" accept="image/*" required>
                        </div>

                        <div>
                            <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Title</label>
                            <input type="text" id="notification-title" placeholder="e.g. Loan Interest Updated" class="w-full p-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition" required>
                        </div>
                        <div>
                            <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Link (Optional)</label>
                            <input type="url" id="notification-link" placeholder="https://..." class="w-full p-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-indigo-500 outline-none transition">
                        </div>

                        <button type="submit" id="publish-notification-btn" class="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-4 rounded-lg shadow-lg hover:shadow-xl transition-all transform hover:-translate-y-0.5 flex justify-center items-center gap-2">
                            <i class="ph-paper-plane-right text-lg"></i>
                            <span>Publish to All Members</span>
                            <div class="loader hidden w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                        </button>
                    </form>
                </div>

                <div class="bg-white p-6 rounded-xl shadow-md border border-gray-100 flex flex-col h-[500px]">
                    <h3 class="text-lg font-bold text-gray-800 mb-4 border-b pb-2">📜 Sent History</h3>
                    <div id="manual-notifications-list" class="flex-1 overflow-y-auto space-y-3 pr-1 custom-scrollbar">
                        ${renderManualList()}
                    </div>
                </div>
            </div>

            <div class="bg-white p-6 rounded-xl shadow-md border border-gray-100">
                <h3 class="text-lg font-bold text-gray-800 mb-4 border-b pb-2">🤖 Scheduled Auto-Reminders</h3>
                <div id="automated-notifications-queue" class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    ${renderAutomatedQueue()}
                </div>
            </div>
        </div>
    `;
}

// Helper: Render Lists
function renderManualList() {
    const list = Object.entries(manualNotifications).sort((a,b) => b[1].createdAt - a[1].createdAt);
    if (list.length === 0) return `<div class="flex flex-col items-center justify-center h-full text-gray-400"><i class="ph-bell-slash text-4xl mb-2"></i><p>No notifications sent yet</p></div>`;

    return list.map(([id, notif]) => `
        <div class="flex gap-3 p-3 bg-gray-50 rounded-lg border hover:shadow-sm transition-shadow group">
            <img src="${notif.imageUrl || 'https://via.placeholder.com/50'}" class="w-16 h-12 object-cover rounded bg-gray-200">
            <div class="flex-1 min-w-0">
                <h4 class="font-bold text-gray-800 truncate text-sm">${notif.title}</h4>
                <div class="flex justify-between items-center mt-1">
                    <span class="text-xs text-gray-500">${new Date(notif.createdAt).toLocaleDateString()}</span>
                    <span class="text-xs font-medium bg-green-100 text-green-700 px-2 py-0.5 rounded-full">Sent: ${notif.count || 'All'}</span>
                </div>
            </div>
            <button class="delete-manual-notification-btn text-gray-400 hover:text-red-600 p-2 opacity-0 group-hover:opacity-100 transition-opacity" data-id="${id}">
                <i class="ph-trash text-lg"></i>
            </button>
        </div>
    `).join('');
}

function renderAutomatedQueue() {
    const list = Object.entries(automatedQueue);
    if (list.length === 0) return `<p class="text-gray-500 col-span-2 text-center py-4">No active schedule.</p>`;
    
    return list.map(([id, item]) => {
        const isActive = item.status === 'active';
        return `
        <div class="flex items-center justify-between p-4 bg-gray-50 rounded-lg border border-gray-200">
            <div class="flex items-center gap-3">
                <div class="w-10 h-10 rounded-full flex items-center justify-center ${isActive ? 'bg-indigo-100 text-indigo-600' : 'bg-gray-200 text-gray-500'}">
                    <i class="ph-clock text-xl"></i>
                </div>
                <div>
                    <p class="font-bold text-gray-800 text-sm">${item.type || 'System Task'}</p>
                    <p class="text-xs text-gray-500">Target: ${item.target || 'All Users'}</p>
                </div>
            </div>
            <label class="toggle-switch relative inline-flex items-center cursor-pointer">
                <input type="checkbox" class="automated-notification-toggle sr-only peer" data-id="${id}" ${isActive ? 'checked' : ''}>
                <div class="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600"></div>
            </label>
        </div>`;
    }).join('');
}

// Handlers
function handleImagePreview(input) {
    const file = input.files[0];
    const preview = document.getElementById('notification-image-preview');
    if (file && preview) {
        const reader = new FileReader();
        reader.onload = (e) => {
            preview.style.backgroundImage = `url(${e.target.result})`;
            preview.innerHTML = ''; 
        };
        reader.readAsDataURL(file);
    }
}

async function handleCreateNotification(e) {
    const btn = document.getElementById('publish-notification-btn');
    setButtonState(btn, true, 'Sending...');

    try {
        const title = document.getElementById('notification-title').value;
        const link = document.getElementById('notification-link').value;
        const fileInput = document.getElementById('notification-image-file');

        let imageUrl = '';
        if (fileInput.files.length > 0) {
            imageUrl = await uploadImage(fileInput.files[0]);
        }

        // Token Collection
        const membersSnap = await get(ref(db, 'members'));
        const members = membersSnap.val() || {};
        let allTokens = [];
        Object.values(members).forEach(m => {
            if (m.notificationTokens) {
                const t = Object.keys(m.notificationTokens);
                if (t.length > 0) allTokens.push(t[t.length - 1]);
            }
        });

        if (allTokens.length === 0) throw new Error("No active users found.");

        // API Call
        const response = await fetch('/api/send-notification', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title, body: "New Update", imageUrl, url: link, tokens: allTokens })
        });

        const result = await response.json();
        if (!result.success) throw new Error(result.error || "Failed");

        // Save History
        await push(ref(db, 'admin/notifications/manual'), {
            title, link, imageUrl, createdAt: serverTimestamp(), status: 'sent', count: result.count
        });

        showToast(`Sent to ${result.count} users!`);
        e.target.reset();
        document.getElementById('notification-image-preview').innerHTML = '<i class="ph-image text-2xl text-indigo-300 mb-1"></i><span class="text-xs text-indigo-500 font-medium">Click to upload</span>';
        document.getElementById('notification-image-preview').style.backgroundImage = 'none';

    } catch (error) {
        showToast(error.message, true);
    } finally {
        setButtonState(btn, false, 'Publish to All Members');
    }
}

async function handleDeleteManualNotification(id) {
    if (await showConfirmation("Delete?", "Remove from history?")) {
        await remove(ref(db, `admin/notifications/manual/${id}`));
        showToast("Deleted");
    }
}

async function handleSystemToggle(checked, el) {
    try { await update(ref(db, 'admin/notifications'), { systemEnabled: checked }); }
    catch(e) { el.checked = !checked; showToast(e.message, true); }
}

async function handleQueueToggle(id, checked, el) {
    try { await update(ref(db, `admin/notifications/automatedQueue/${id}`), { status: checked ? 'active' : 'disabled' }); }
    catch(e) { el.checked = !checked; showToast(e.message, true); }
}
