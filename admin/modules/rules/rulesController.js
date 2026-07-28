// modules/rules/rulesController.js
import { db } from '../../core/firebaseConfig.js';
import { ref, push, set, update, remove, onValue, off, serverTimestamp } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-database.js";
import { showToast, showConfirmation, openModal, closeModal, setButtonState } from '../../shared/uiComponents.js';
import { uploadImage } from '../../shared/utils.js';

// --- State Variables ---
let rulesListener = null;
let videosListener = null; // New for Videos
let rulesData = {};
let videosData = {}; // New for Videos

export async function init() {
    console.log("Rules & Video Manager Initialized");
    const container = document.getElementById('rules-manager-view');

    // 1. Click Handlers (Delegated)
    container.addEventListener('click', async (e) => {
        // --- IMAGE RULE ACTIONS ---
        if (e.target.closest('.delete-rule-btn')) {
            const btn = e.target.closest('.delete-rule-btn');
            await handleDeleteRule(btn.dataset.key);
        }
        if (e.target.closest('.edit-rule-btn')) {
            const btn = e.target.closest('.edit-rule-btn');
            const ruleKey = btn.dataset.key;
            if (rulesData[ruleKey]) renderEditRuleModal(ruleKey, rulesData[ruleKey]);
        }

        // --- NEW: VIDEO RULE ACTIONS ---
        if (e.target.closest('.delete-video-btn')) {
            const btn = e.target.closest('.delete-video-btn');
            await handleDeleteVideo(btn.dataset.key);
        }
        if (e.target.closest('.edit-video-btn')) {
            const btn = e.target.closest('.edit-video-btn');
            const videoKey = btn.dataset.key;
            if (videosData[videoKey]) renderEditVideoModal(videoKey, videosData[videoKey]);
        }
    });

    // 2. Global Click Listeners (Modals)
    document.body.addEventListener('click', (e) => {
        if (e.target.id === 'new-rule-image-preview') document.getElementById('new-rule-image-file').click();
        if (e.target.id === 'edit-rule-image-preview') document.getElementById('edit-rule-image-file').click();

        if (e.target.closest('.close-modal-btn')) {
            const modal = e.target.closest('.modal-overlay');
            if (modal) closeModal(modal);
        }
    });

    // 3. File Input Change Listeners
    document.body.addEventListener('change', (e) => {
        if (e.target.id === 'new-rule-image-file') handleImagePreview(e.target, 'new-rule-image-preview');
        if (e.target.id === 'edit-rule-image-file') handleImagePreview(e.target, 'edit-rule-image-preview');
    });

    // 4. Form Submit Listeners
    document.body.addEventListener('submit', async (e) => {
        // Image Rules
        if (e.target.id === 'add-rule-form') { e.preventDefault(); await handleAddRule(e); }
        if (e.target.id === 'edit-rule-form') { e.preventDefault(); await handleEditRule(e); }

        // Video Rules
        if (e.target.id === 'add-video-form') { e.preventDefault(); await handleAddVideo(e); }
        if (e.target.id === 'edit-video-form') { e.preventDefault(); await handleEditVideo(e); }
    });
}

export async function render() {
    const container = document.getElementById('rules-manager-view');

    // Updated HTML Structure (Image Section + New Video Section)
    container.innerHTML = `
        <div class="space-y-12">

            <div class="space-y-8">
                <div class="bg-white p-6 rounded-xl shadow-md border border-gray-100">
                    <h2 class="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
                        <i class="ph-image text-indigo-600"></i> Add New Image Rule
                    </h2>
                    <form id="add-rule-form" class="space-y-4">
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                                <label class="block text-sm font-medium text-gray-700 mb-2">Rule Image</label>
                                <div id="new-rule-image-preview" 
                                     class="w-full h-40 border-2 border-dashed border-gray-300 rounded-lg bg-gray-50 flex items-center justify-center cursor-pointer bg-cover bg-center hover:border-indigo-400 transition-colors">
                                    <span class="text-gray-500">Click to upload</span>
                                </div>
                                <input type="file" id="new-rule-image-file" class="hidden" accept="image/*">
                            </div>
                            <div class="flex flex-col justify-center">
                                <label class="block text-sm font-medium text-gray-700 mb-1">Rule Title</label>
                                <input type="text" id="new-rule-title" placeholder="e.g., Late Fee Policy" class="form-input w-full p-3 rounded-lg" required>

                                <button type="submit" id="add-rule-btn" class="mt-4 btn-primary w-full text-white font-bold py-3 px-6 rounded-lg shadow-md hover:bg-indigo-700 transition flex justify-center items-center">
                                    <span>Add Image Rule</span>
                                    <div class="loader hidden ml-2"></div>
                                </button>
                            </div>
                        </div>
                    </form>
                </div>

                <div>
                    <h2 class="text-xl font-bold text-gray-800 mb-4">Existing Image Rules</h2>
                    <div id="rules-grid-container" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        <div class="col-span-full text-center py-8"><div class="loader border-indigo-600"></div> Loading Rules...</div>
                    </div>
                </div>
            </div>

            <hr class="border-gray-300">

            <div class="space-y-8">
                <div class="bg-white p-6 rounded-xl shadow-md border border-gray-100">
                    <h2 class="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
                        <i class="ph-youtube-logo text-red-600"></i> Add New Video Tutorial
                    </h2>
                    <form id="add-video-form" class="space-y-4">
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                                <label class="block text-sm font-medium text-gray-700 mb-1">Video Title</label>
                                <input type="text" id="new-video-title" placeholder="e.g., How to use Loan App" class="form-input w-full p-3 rounded-lg" required>
                            </div>
                            <div>
                                <label class="block text-sm font-medium text-gray-700 mb-1">YouTube Video URL</label>
                                <input type="url" id="new-video-url" placeholder="https://youtube.com/watch?v=..." class="form-input w-full p-3 rounded-lg" required>
                                <p class="text-xs text-gray-500 mt-1">Supports standard and short URLs.</p>
                            </div>
                        </div>
                        <div class="text-right">
                             <button type="submit" id="add-video-btn" class="btn-primary bg-red-600 text-white font-bold py-3 px-6 rounded-lg shadow-md hover:bg-red-700 transition flex justify-center items-center inline-flex">
                                <span>Add Video</span>
                                <div class="loader hidden ml-2"></div>
                            </button>
                        </div>
                    </form>
                </div>

                <div>
                    <h2 class="text-xl font-bold text-gray-800 mb-4">Saved Video Tutorials</h2>
                    <div id="videos-grid-container" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        <div class="col-span-full text-center py-8 text-gray-500">No videos added yet.</div>
                    </div>
                </div>
            </div>

        </div>
    `;

    // 1. Fetch Image Rules
    const rulesRef = ref(db, 'admin/rules');
    if (rulesListener) off(rulesRef, 'value', rulesListener);
    rulesListener = onValue(rulesRef, (snapshot) => {
        rulesData = snapshot.val() || {};
        renderRulesList(rulesData);
    });

    // 2. Fetch Video Rules (NEW)
    const videosRef = ref(db, 'admin/videos');
    if (videosListener) off(videosRef, 'value', videosListener);
    videosListener = onValue(videosRef, (snapshot) => {
        videosData = snapshot.val() || {};
        renderVideosList(videosData);
    });
}

// --- Helper Functions ---

function getYouTubeID(url) {
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
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

// --- RENDER LISTS ---

function renderRulesList(rules) {
    const container = document.getElementById('rules-grid-container');
    if (!container) return;

    const rulesList = Object.entries(rules).filter(([key, val]) => val && val.imageUrl);

    if (rulesList.length === 0) {
        container.innerHTML = `<p class="col-span-full text-center text-gray-500 py-8 bg-gray-50 rounded-lg">No image rules added yet.</p>`;
        return;
    }

    container.innerHTML = rulesList.map(([key, rule]) => `
        <div class="bg-white rounded-xl shadow-md overflow-hidden border hover:shadow-lg transition-shadow">
            <div class="h-48 bg-gray-100 bg-cover bg-center" style="background-image: url('${rule.imageUrl}');"></div>
            <div class="p-4">
                <h3 class="font-bold text-gray-800 mb-2">${rule.title || 'Untitled Rule'}</h3>
                <div class="flex justify-end gap-2 mt-3 pt-3 border-t">
                    <button class="edit-rule-btn px-3 py-1.5 text-sm bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 font-medium transition-colors" data-key="${key}">Edit</button>
                    <button class="delete-rule-btn px-3 py-1.5 text-sm bg-red-50 text-red-600 rounded-lg hover:bg-red-100 font-medium transition-colors" data-key="${key}">Delete</button>
                </div>
            </div>
        </div>
    `).join('');
}

function renderVideosList(videos) {
    const container = document.getElementById('videos-grid-container');
    if (!container) return;

    const videosList = Object.entries(videos);

    if (videosList.length === 0) {
        container.innerHTML = `<p class="col-span-full text-center text-gray-500 py-8 bg-gray-50 rounded-lg">No videos added yet.</p>`;
        return;
    }

    container.innerHTML = videosList.map(([key, video]) => {
        const videoId = getYouTubeID(video.url);
        const thumbnailUrl = videoId ? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg` : '';

        return `
        <div class="bg-white rounded-xl shadow-md overflow-hidden border hover:shadow-lg transition-shadow">
            <div class="relative h-48 bg-black group">
                ${videoId 
                    ? `<iframe class="w-full h-full" src="https://www.youtube.com/embed/${videoId}" frameborder="0" allowfullscreen></iframe>`
                    : `<div class="w-full h-full flex items-center justify-center text-white">Invalid Video URL</div>`
                }
            </div>
            <div class="p-4">
                <h3 class="font-bold text-gray-800 mb-1 line-clamp-1" title="${video.title}">${video.title}</h3>
                <a href="${video.url}" target="_blank" class="text-xs text-blue-500 hover:underline truncate block mb-3">${video.url}</a>
                <div class="flex justify-end gap-2 pt-2 border-t">
                    <button class="edit-video-btn px-3 py-1.5 text-sm bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 font-medium transition-colors" data-key="${key}">Edit</button>
                    <button class="delete-video-btn px-3 py-1.5 text-sm bg-red-50 text-red-600 rounded-lg hover:bg-red-100 font-medium transition-colors" data-key="${key}">Delete</button>
                </div>
            </div>
        </div>
    `}).join('');
}

// --- MODALS ---

function renderEditRuleModal(ruleKey, rule) {
    const modal = document.getElementById('editRuleModal'); // Reuse existing modal container ID in HTML
    if(!modal) return;

    modal.innerHTML = `
        <div class="modal-content bg-white rounded-lg shadow-xl w-full max-w-lg scale-95">
            <form id="edit-rule-form" data-rule-key="${ruleKey}">
                <div class="p-4 border-b flex justify-between items-center">
                    <h3 class="text-lg font-bold">Edit Image Rule</h3>
                    <button type="button" class="close-modal-btn text-2xl text-gray-500 hover:text-gray-800">&times;</button>
                </div>
                <div class="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-2">Rule Image</label>
                        <div id="edit-rule-image-preview" 
                             class="w-full h-40 border-2 border-dashed border-gray-300 rounded-lg bg-gray-50 flex items-center justify-center cursor-pointer bg-cover bg-center"
                             style="background-image: url('${rule.imageUrl || ''}')">
                             ${!rule.imageUrl ? '<span class="text-gray-500">Click to upload</span>' : ''}
                        </div>
                        <input type="file" id="edit-rule-image-file" class="hidden" accept="image/*">
                        <input type="hidden" id="edit-rule-image-url" value="${rule.imageUrl || ''}">
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">Rule Title</label>
                        <input type="text" id="edit-rule-title" value="${rule.title || ''}" class="form-input w-full p-3 rounded-lg" required>
                    </div>
                </div>
                <div class="p-4 bg-gray-50 flex justify-end gap-3">
                    <button type="button" class="close-modal-btn px-4 py-2 text-sm font-medium text-gray-700 bg-gray-200 rounded-md hover:bg-gray-300">Cancel</button>
                    <button type="submit" id="update-rule-btn" class="btn-primary flex items-center justify-center px-4 py-2 text-sm font-medium rounded-md">
                        <span>Update Rule</span>
                        <div class="loader hidden ml-2"></div>
                    </button>
                </div>
            </form>
        </div>
    `;
    openModal(modal);
}

function renderEditVideoModal(videoKey, video) {
    const modal = document.getElementById('editRuleModal'); // Reuse same container
    if(!modal) return;

    modal.innerHTML = `
        <div class="modal-content bg-white rounded-lg shadow-xl w-full max-w-lg scale-95">
            <form id="edit-video-form" data-video-key="${videoKey}">
                <div class="p-4 border-b flex justify-between items-center">
                    <h3 class="text-lg font-bold">Edit Video Tutorial</h3>
                    <button type="button" class="close-modal-btn text-2xl text-gray-500 hover:text-gray-800">&times;</button>
                </div>
                <div class="p-6 space-y-4">
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">Video Title</label>
                        <input type="text" id="edit-video-title" value="${video.title || ''}" class="form-input w-full p-3 rounded-lg" required>
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">YouTube URL</label>
                        <input type="url" id="edit-video-url" value="${video.url || ''}" class="form-input w-full p-3 rounded-lg" required>
                    </div>
                </div>
                <div class="p-4 bg-gray-50 flex justify-end gap-3">
                    <button type="button" class="close-modal-btn px-4 py-2 text-sm font-medium text-gray-700 bg-gray-200 rounded-md hover:bg-gray-300">Cancel</button>
                    <button type="submit" id="update-video-btn" class="btn-primary flex items-center justify-center px-4 py-2 text-sm font-medium rounded-md">
                        <span>Update Video</span>
                        <div class="loader hidden ml-2"></div>
                    </button>
                </div>
            </form>
        </div>
    `;
    openModal(modal);
}

// --- ACTION HANDLERS ---

// 1. Image Actions
async function handleAddRule(e) {
    const btn = document.getElementById('add-rule-btn');
    setButtonState(btn, true);

    try {
        const imageFile = document.getElementById('new-rule-image-file').files[0];
        const title = document.getElementById('new-rule-title').value;

        if (!imageFile) throw new Error('Please upload an image.');
        if (!title) throw new Error('Please enter a title.');

        const imageUrl = await uploadImage(imageFile);
        if (!imageUrl) throw new Error('Image upload failed.');

        await push(ref(db, 'admin/rules'), { title, imageUrl, createdAt: serverTimestamp() });

        showToast('Image rule added successfully!');
        e.target.reset();
        document.getElementById('new-rule-image-preview').innerHTML = '<span class="text-gray-500">Click to upload</span>';
        document.getElementById('new-rule-image-preview').style.backgroundImage = '';

    } catch (error) {
        showToast('Error: ' + error.message, true);
    } finally {
        setButtonState(btn, false, 'Add Image Rule');
    }
}

async function handleEditRule(e) {
    const btn = document.getElementById('update-rule-btn');
    setButtonState(btn, true);
    const ruleKey = e.target.dataset.ruleKey;

    try {
        const imageFile = document.getElementById('edit-rule-image-file').files[0];
        let imageUrl = document.getElementById('edit-rule-image-url').value;
        const title = document.getElementById('edit-rule-title').value;

        if (imageFile) {
            const newUrl = await uploadImage(imageFile);
            if(newUrl) imageUrl = newUrl;
        }

        await update(ref(db, `admin/rules/${ruleKey}`), { title, imageUrl });
        showToast('Rule updated successfully!');
        const modal = document.getElementById('editRuleModal');
        if(modal) closeModal(modal);

    } catch (error) {
        showToast('Error: ' + error.message, true);
    } finally {
        setButtonState(btn, false, 'Update Rule');
    }
}

async function handleDeleteRule(key) {
    if (await showConfirmation('Delete Image Rule?', 'Are you sure?')) {
        await remove(ref(db, `admin/rules/${key}`));
        showToast('Image rule deleted.');
    }
}

// 2. Video Actions (NEW)
async function handleAddVideo(e) {
    const btn = document.getElementById('add-video-btn');
    setButtonState(btn, true);

    try {
        const title = document.getElementById('new-video-title').value;
        const url = document.getElementById('new-video-url').value;

        if (!title || !url) throw new Error('All fields are required.');
        if (!getYouTubeID(url)) throw new Error('Invalid YouTube URL.');

        await push(ref(db, 'admin/videos'), { title, url, createdAt: serverTimestamp() });

        showToast('Video added successfully!');
        e.target.reset();

    } catch (error) {
        showToast('Error: ' + error.message, true);
    } finally {
        setButtonState(btn, false, 'Add Video');
    }
}

async function handleEditVideo(e) {
    const btn = document.getElementById('update-video-btn');
    setButtonState(btn, true);
    const key = e.target.dataset.videoKey;

    try {
        const title = document.getElementById('edit-video-title').value;
        const url = document.getElementById('edit-video-url').value;

        if (!title || !url) throw new Error('All fields are required.');
        if (!getYouTubeID(url)) throw new Error('Invalid YouTube URL.');

        await update(ref(db, `admin/videos/${key}`), { title, url });

        showToast('Video updated successfully!');
        const modal = document.getElementById('editRuleModal');
        if(modal) closeModal(modal);

    } catch (error) {
        showToast('Error: ' + error.message, true);
    } finally {
        setButtonState(btn, false, 'Update Video');
    }
}

async function handleDeleteVideo(key) {
    if (await showConfirmation('Delete Video?', 'Are you sure?')) {
        await remove(ref(db, `admin/videos/${key}`));
        showToast('Video deleted.');
    }
}