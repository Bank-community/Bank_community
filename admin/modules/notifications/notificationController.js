// modules/notifications/notificationController.js

// 1. Aapki Firebase Config file se DB import kiya
import { db } from '../../core/firebaseConfig.js'; 
import { ref, push, onValue, serverTimestamp, get } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-database.js";
import { showToast, setButtonState } from '../../shared/uiComponents.js';

let manualNotifications = {};

export async function init() {
    console.log("🚀 Notification Controller Loaded");
    const container = document.getElementById('notification-manager-view');

    // 2. Listen for Form Submit (Send Button)
    document.body.addEventListener('submit', async (e) => {
        if (e.target.id === 'manual-notification-form') {
            e.preventDefault();
            await handleSendNotification(e);
        }
    });

    // 3. Load History (Purane messages dikhane ke liye)
    const notifRef = ref(db, 'admin/notifications/manual');
    onValue(notifRef, (snapshot) => {
        manualNotifications = snapshot.val() || {};
        renderHistory();
    });
}

export async function render() {
    const container = document.getElementById('notification-manager-view');
    if (!container) return;

    container.innerHTML = `
        <div class="max-w-2xl mx-auto space-y-6">
            <div class="bg-white p-6 rounded-xl shadow-md border border-gray-100">
                <div class="flex items-center gap-3 mb-4">
                    <div class="p-2 bg-indigo-100 rounded-lg text-indigo-600">
                        <i data-feather="send"></i>
                    </div>
                    <h3 class="text-xl font-bold text-gray-800">Instant Notification</h3>
                </div>
                
                <form id="manual-notification-form" class="space-y-4">
                    <div>
                        <label class="block text-sm font-bold text-gray-700 mb-1">Title</label>
                        <input type="text" id="notif-title" placeholder="e.g. Good Morning TCF" class="w-full p-3 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" required>
                    </div>
                    <div>
                        <label class="block text-sm font-bold text-gray-700 mb-1">Message</label>
                        <textarea id="notif-body" placeholder="Type your message here..." class="w-full p-3 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" rows="3" required></textarea>
                    </div>
                    
                    <button type="submit" id="send-btn" class="w-full bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-bold py-3 rounded-lg hover:shadow-lg transform transition active:scale-95">
                        Send Now 🚀
                    </button>
                </form>
            </div>

            <div class="bg-white p-6 rounded-xl shadow-md">
                <h3 class="font-bold text-gray-800 mb-3 flex items-center gap-2">
                    <i data-feather="clock"></i> History
                </h3>
                <div id="history-list" class="space-y-3 max-h-80 overflow-y-auto pr-2 custom-scrollbar">
                    <p class="text-gray-400 text-sm text-center py-4">Loading history...</p>
                </div>
            </div>
        </div>
    `;
    // Icons refresh karein
    if(window.feather) feather.replace();
}

// --- MAIN LOGIC ---
async function handleSendNotification(e) {
    const btn = document.getElementById('send-btn');
    
    // Button ko disable karo taaki user baar-baar click na kare
    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `<span class="animate-spin inline-block mr-2">↻</span> Sending...`;

    try {
        const title = document.getElementById('notif-title').value;
        const body = document.getElementById('notif-body').value;

        // STEP 1: Firebase DB se Tokens nikalo (Aapki Config file use ho rahi hai)
        // Hum 'members' folder padh rahe hain
        const membersSnap = await get(ref(db, 'members'));
        const members = membersSnap.val() || {};
        let tokens = [];

        // Har member ka token check karo
        Object.values(members).forEach(member => {
            if (member.notificationTokens) {
                // Latest token uthao
                const t = Object.keys(member.notificationTokens);
                if (t.length > 0) tokens.push(t[t.length - 1]);
            }
        });

        if (tokens.length === 0) {
            throw new Error("Koi active user nahi mila (Tokens empty).");
        }

        console.log(`Found ${tokens.length} users. Sending via API...`);

        // STEP 2: API ko call karo (Jo Vercel par hai)
        const res = await fetch('/api/send-notification', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                title: title, 
                body: body, 
                tokens: tokens // Ye list API ko bhej rahe hain
            })
        });

        const result = await res.json();

        if (!result.success) {
            throw new Error(result.error || "Server failed to send.");
        }

        // STEP 3: History Save karo (Admin Panel me dikhane ke liye)
        await push(ref(db, 'admin/notifications/manual'), {
            title,
            body,
            createdAt: serverTimestamp(),
            sentCount: result.count || tokens.length,
            status: 'Success'
        });

        showToast(`✅ Sent to ${result.count} users successfully!`);
        e.target.reset(); // Form clear karo

    } catch (error) {
        console.error("Notification Error:", error);
        showToast("❌ Error: " + error.message, true);
    } finally {
        // Button wapas normal karo
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
}

function renderHistory() {
    const list = document.getElementById('history-list');
    if (!list) return;
    
    const items = Object.entries(manualNotifications).sort((a,b) => b[1].createdAt - a[1].createdAt);
    
    if (items.length === 0) {
        list.innerHTML = '<p class="text-gray-400 text-sm text-center">No messages sent yet.</p>';
        return;
    }

    list.innerHTML = items.map(([id, n]) => `
        <div class="p-3 border-l-4 border-indigo-500 rounded bg-gray-50 shadow-sm">
            <div class="flex justify-between items-start">
                <h4 class="font-bold text-gray-800">${n.title}</h4>
                <span class="text-xs text-gray-400 bg-white px-2 py-1 rounded border">
                    ${new Date(n.createdAt).toLocaleDateString()}
                </span>
            </div>
            <p class="text-sm text-gray-600 mt-1">${n.body}</p>
            <div class="mt-2 text-xs font-semibold text-green-600 flex items-center gap-1">
                <i style="width:12px" data-feather="check-circle"></i> 
                Sent to ${n.sentCount || 0} devices
            </div>
        </div>
    `).join('');

    if(window.feather) feather.replace();
}
