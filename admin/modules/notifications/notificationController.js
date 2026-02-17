import { db } from '../../core/firebaseConfig.js';
import { ref, push, update, remove, onValue, off, serverTimestamp, get } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-database.js";
import { showToast, showConfirmation, openModal, closeModal, setButtonState } from '../../shared/uiComponents.js';
import { uploadImage } from '../../shared/utils.js';

let notificationsListener = null;
let manualNotifications = {};

export async function init() {
    console.log("Notification Module Ready");
    const container = document.getElementById('notification-manager-view');
    
    // Listen for Publish Form
    const form = document.getElementById('manual-notification-form');
    if(form) {
        form.removeEventListener('submit', handlePublish);
        form.addEventListener('submit', handlePublish);
    }
    
    // Listen for History & Delete
    loadHistory();
    container.addEventListener('click', (e) => {
        if(e.target.closest('.delete-manual-notification-btn')) {
            const id = e.target.closest('.delete-manual-notification-btn').dataset.id;
            handleDelete(id);
        }
    });
}

// --- MAIN FUNCTION: PUBLISH ---
async function handlePublish(e) {
    e.preventDefault();
    const btn = document.getElementById('publish-notification-btn');
    setButtonState(btn, true, 'Sending...');

    try {
        const title = document.getElementById('notification-title').value;
        const link = document.getElementById('notification-link').value;
        const fileInput = document.getElementById('notification-image-file');

        // 1. Image Upload
        let imageUrl = '';
        if (fileInput.files.length > 0) {
            imageUrl = await uploadImage(fileInput.files[0]);
        }

        // 2. Collect All User Tokens
        const membersSnap = await get(ref(db, 'members'));
        const members = membersSnap.val() || {};
        let allTokens = [];

        Object.values(members).forEach(m => {
            if (m.notificationTokens) {
                const t = Object.keys(m.notificationTokens);
                if (t.length > 0) allTokens.push(t[t.length - 1]); // Latest token
            }
        });

        if (allTokens.length === 0) throw new Error("No users found to send notification.");

        // 3. Send via Vercel API
        const response = await fetch('/api/send-notification', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                title: title,
                body: "Tap to view details",
                imageUrl: imageUrl,
                url: link,
                tokens: allTokens
            })
        });

        const result = await response.json();
        if (!result.success) throw new Error(result.error || "Failed to send");

        // 4. Save to History
        await push(ref(db, 'admin/notifications/manual'), {
            title, link, imageUrl, createdAt: serverTimestamp(), status: 'sent', count: result.count
        });

        showToast(`Sent to ${result.count} users!`);
        e.target.reset();
        document.getElementById('notification-image-preview').innerHTML = '<span>Click to upload</span>';

    } catch (error) {
        console.error(error);
        showToast(error.message, true);
    } finally {
        setButtonState(btn, false, 'Publish Notification');
    }
}

function loadHistory() {
    const list = document.getElementById('manual-notifications-list');
    onValue(ref(db, 'admin/notifications/manual'), (snap) => {
        const data = snap.val() || {};
        if (!data) { list.innerHTML = '<p class="text-center p-4">No history.</p>'; return; }
        
        list.innerHTML = Object.entries(data).reverse().map(([id, n]) => `
            <div class="flex items-center gap-4 p-3 bg-gray-50 rounded-lg border">
                <img src="${n.imageUrl || 'https://via.placeholder.com/50'}" class="w-12 h-12 rounded object-cover">
                <div class="flex-1">
                    <h4 class="font-bold">${n.title}</h4>
                    <p class="text-xs text-gray-500">${new Date(n.createdAt).toLocaleDateString()}</p>
                </div>
                <button class="delete-manual-notification-btn text-red-500 p-2" data-id="${id}"><i class="ph-trash"></i></button>
            </div>
        `).join('');
    });
}

async function handleDelete(id) {
    if(await showConfirmation("Delete?", "Remove from history?")) {
        await remove(ref(db, `admin/notifications/manual/${id}`));
        showToast("Deleted");
    }
}
