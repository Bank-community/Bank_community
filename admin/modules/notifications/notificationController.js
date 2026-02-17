// modules/notifications/notificationController.js
import { db } from '../../core/firebaseConfig.js';
import { ref, push, update, remove, onValue, off, serverTimestamp } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-database.js";
import { showToast, showConfirmation, openModal, closeModal, setButtonState } from '../../shared/uiComponents.js';
import { uploadImage } from '../../shared/utils.js';

let notificationsListener = null;
let manualNotifications = {};

export async function init() {
    console.log("Notification Module Initialized");
    const container = document.getElementById('notification-manager-view');

    // 1. Listen for Form Submit (PUBLISH BUTTON)
    const form = document.getElementById('manual-notification-form');
    if (form) {
        form.removeEventListener('submit', handlePublish); // Remove old listeners
        form.addEventListener('submit', handlePublish);
    }

    // 2. Listen for Deletes (History)
    container.addEventListener('click', async (e) => {
        if (e.target.closest('.delete-manual-notification-btn')) {
            const btn = e.target.closest('.delete-manual-notification-btn');
            const notifId = btn.dataset.id;
            await handleDeleteManualNotification(notifId);
        }
    });

    // 3. Load History
    loadNotificationHistory();
}

// --- MAIN FUNCTION: PUBLISH NOTIFICATION ---
async function handlePublish(e) {
    e.preventDefault();
    const btn = document.getElementById('publish-notification-btn');
    setButtonState(btn, true, 'Sending...');

    try {
        // 1. Get Form Data
        const title = document.getElementById('notification-title').value;
        const link = document.getElementById('notification-link').value;
        const fileInput = document.getElementById('notification-image-file');
        
        // 2. Image Upload (Optional)
        let imageUrl = '';
        if (fileInput.files.length > 0) {
            imageUrl = await uploadImage(fileInput.files[0]);
            if (!imageUrl) throw new Error("Image upload failed");
        }

        // 3. Save to Database (History ke liye)
        const newNotifRef = await push(ref(db, 'admin/notifications/manual'), {
            title,
            imageUrl,
            link,
            createdAt: serverTimestamp(),
            status: 'sent'
        });

        // 4. CALL VERCEL API (Send to All)
        // Note: Hum 'topic' use nahi kar rahe, hum loop lagayenge ya logic server pe hai.
        // Vercel function me humne filhal 'token' manga hai, par mass sending ke liye logic 
        // thoda alag hota hai. Hum abhi ke liye maan ke chalte hain ki aap testing kar rahe hain.
        // PROD FIX: Server side pe sab tokens fetch karke loop lagana behtar hai.
        
        // Lekin abhi ke liye, hum ek simple fetch request bhejenge:
        
        // Sabhi members ke token fetch karte hain
        const membersSnapshot = await get(ref(db, 'members'));
        const members = membersSnapshot.val();
        
        // Client side loop (Chhote users base ke liye theek hai)
        const sendPromises = [];
        
        Object.values(members).forEach(member => {
            if(member.notificationTokens) {
                const tokens = Object.keys(member.notificationTokens);
                const lastToken = tokens[tokens.length - 1];
                
                const payload = {
                    token: lastToken,
                    title: title,
                    body: "Tap to view details",
                    imageUrl: imageUrl,
                    url: link
                };

                // Call your Vercel API
                sendPromises.push(
                    fetch('/api/send-notification', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload)
                    })
                );
            }
        });

        await Promise.all(sendPromises);

        showToast('Notification Sent Successfully!');
        e.target.reset();
        document.getElementById('notification-image-preview').innerHTML = '<span>Click to upload</span>';

    } catch (error) {
        console.error(error);
        showToast('Error: ' + error.message, true);
    } finally {
        setButtonState(btn, false, 'Publish Notification');
    }
}

// --- HELPER: Load History ---
function loadNotificationHistory() {
    const listContainer = document.getElementById('manual-notifications-list');
    const notifRef = ref(db, 'admin/notifications/manual');

    onValue(notifRef, (snapshot) => {
        const data = snapshot.val();
        if (!data) {
            listContainer.innerHTML = '<p class="text-gray-500 text-center py-4">No history found.</p>';
            return;
        }

        listContainer.innerHTML = Object.entries(data).reverse().map(([id, n]) => `
            <div class="flex items-center gap-4 p-3 bg-gray-50 rounded-lg border">
                <img src="${n.imageUrl || 'https://via.placeholder.com/50'}" class="w-12 h-12 rounded object-cover">
                <div class="flex-1">
                    <h4 class="font-bold text-gray-800">${n.title}</h4>
                    <p class="text-xs text-gray-500">${new Date(n.createdAt).toLocaleDateString()}</p>
                </div>
                <button class="delete-manual-notification-btn text-red-500 hover:bg-red-50 p-2 rounded" data-id="${id}">
                    <i class="ph-trash"></i>
                </button>
            </div>
        `).join('');
    });
}

// --- HELPER: Delete ---
async function handleDeleteManualNotification(id) {
    if (await showConfirmation("Delete?", "Remove from history?")) {
        await remove(ref(db, `admin/notifications/manual/${id}`));
        showToast("Deleted");
    }
}
