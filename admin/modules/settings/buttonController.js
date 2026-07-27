import { db } from '../../core/firebaseConfig.js';
import { ref, onValue, set, push, remove, off } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-database.js";
import { showToast, setButtonState } from '../../shared/uiComponents.js';

let buttonsListener = null;
let currentEditKey = null;

// --- CSS Styles ---
const styles = `
    <style>
        /* Modern Inputs */
        .royal-input { 
            background-color: #f8fafc; 
            border: 1px solid #cbd5e1; 
            border-radius: 8px;
            transition: all 0.2s ease; 
            font-size: 0.9rem;
            color: #334155;
        }
        .royal-input:focus { 
            background-color: #fff;
            border-color: #4f46e5; 
            box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.1); 
            outline: none;
        }

        /* Color Picker Group */
        .color-group { 
            display: flex; 
            align-items: center; 
            border: 1px solid #cbd5e1; 
            border-radius: 8px; 
            padding: 3px;
            background: #fff;
        }
        .color-group input[type="color"] { 
            width: 32px; height: 32px; 
            border: none; 
            background: none; 
            cursor: pointer; 
            border-radius: 6px;
        }
        .color-group input[type="text"] { 
            border: none; 
            flex-grow: 1; 
            font-family: monospace; 
            font-size: 0.85rem;
            color: #475569;
            padding-left: 8px;
            outline: none;
            text-transform: uppercase;
        }

        /* Preview Container */
        .preview-container {
            transition: background 0.3s ease;
            position: sticky;
            top: 20px;
            overflow: hidden;
        }
        .preview-bg-light { 
            background-color: #f3f4f6; 
            background-image: radial-gradient(#cbd5e1 1px, transparent 1px);
            background-size: 20px 20px;
        }
        .preview-bg-dark { 
            background-color: #0f172a; 
            background-image: radial-gradient(#334155 1px, transparent 1px);
            background-size: 20px 20px;
        }

        /* The Button Being Previewed */
        .preview-btn {
            display: inline-flex; 
            align-items: center; 
            justify-content: center;
            gap: 8px; 
            text-decoration: none; 
            cursor: default;
            transition: all 0.3s ease;
            box-sizing: border-box; 
            overflow: hidden; /* Ensures radius clips content */
            white-space: nowrap;
        }
        .preview-btn svg { width: 22px; height: 22px; flex-shrink: 0; }

        .btn-glossy {
            background-image: linear-gradient(to top, rgba(0,0,0,0.1), rgba(255,255,255,0.25));
            box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), inset 0 1px 0 rgba(255,255,255,0.3);
        }
    </style>
`;

export async function init() {
    console.log("Button Manager Pro Initialized");
    const container = document.getElementById('page-settings-view');

    // 1. Event Delegation
    container.addEventListener('click', async (e) => {
        // Add New
        if (e.target.closest('#add-new-button-btn')) {
            showEditor(true);
        }

        // Edit
        if (e.target.closest('.edit-btn')) {
            const btn = e.target.closest('.edit-btn');
            const key = btn.dataset.key;
            const btnRef = ref(db, `admin/header_buttons/${key}`);
            onValue(btnRef, (snapshot) => {
                showEditor(false, snapshot.val(), key);
            }, { onlyOnce: true });
        }

        // Delete
        if (e.target.closest('.delete-btn')) {
            const btn = e.target.closest('.delete-btn');
            const key = btn.dataset.key;
            if (confirm(`Delete this button?`)) {
                await remove(ref(db, `admin/header_buttons/${key}`));
                showToast('Button deleted successfully.');
                hideEditor();
            }
        }

        // Cancel
        if (e.target.id === 'cancel-edit-btn') hideEditor();

        // Background Toggle for Preview
        if (e.target.id === 'toggle-preview-bg') {
            const wrapper = document.getElementById('preview-wrapper');
            const isDark = wrapper.classList.contains('preview-bg-dark');
            if (isDark) {
                wrapper.classList.remove('preview-bg-dark');
                wrapper.classList.add('preview-bg-light');
                e.target.innerHTML = '<i class="ph-moon"></i> Dark BG';
            } else {
                wrapper.classList.remove('preview-bg-light');
                wrapper.classList.add('preview-bg-dark');
                e.target.innerHTML = '<i class="ph-sun"></i> Light BG';
            }
        }
    });

    // 2. Form Submit
    container.addEventListener('submit', async (e) => {
        if (e.target.id === 'button-form') {
            e.preventDefault();
            await handleSaveButton();
        }
    });

    // 3. Live Preview & Sync
    container.addEventListener('input', (e) => {
        if (e.target.closest('#button-form')) {
            updateButtonPreview();
        }
        // Color Picker Sync
        if (e.target.type === 'color') {
            const textInput = e.target.nextElementSibling;
            if(textInput) textInput.value = e.target.value;
        }
        if (e.target.type === 'text' && e.target.classList.contains('color-hex')) {
            const picker = e.target.previousElementSibling;
            if(picker) picker.value = e.target.value;
        }
    });
}

export async function render() {
    const container = document.getElementById('page-settings-view');

    // Inject Styles & HTML
    container.innerHTML = `
        ${styles}
        <div class="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <!-- Left: Button List (4 cols) -->
            <div class="lg:col-span-4 bg-white p-5 rounded-2xl shadow-sm border border-gray-100 h-fit">
                <div class="flex justify-between items-center mb-4">
                    <div>
                        <h2 class="text-lg font-bold text-gray-800">App Buttons</h2>
                        <p class="text-xs text-gray-500">Manage Home Screen Actions</p>
                    </div>
                    <button id="add-new-button-btn" class="bg-indigo-600 text-white w-10 h-10 rounded-xl shadow-lg shadow-indigo-200 hover:bg-indigo-700 transition flex items-center justify-center">
                        <i class="ph-plus text-xl"></i>
                    </button>
                </div>
                <div id="buttons-list" class="space-y-3 max-h-[70vh] overflow-y-auto custom-scrollbar">
                    <div class="loader border-indigo-600 mx-auto"></div>
                </div>
            </div>

            <!-- Right: Editor & Preview (8 cols) -->
            <div id="editor-column" class="lg:col-span-8 hidden space-y-6">

                <!-- PREVIEW CARD -->
                <div class="bg-white p-6 rounded-2xl shadow-md border-l-4 border-indigo-600">
                    <div class="flex justify-between items-center mb-4">
                        <h3 class="text-xs font-bold text-gray-400 uppercase tracking-wide">Live Preview</h3>
                        <button id="toggle-preview-bg" class="text-xs font-bold bg-gray-100 text-gray-600 px-3 py-1.5 rounded-lg border hover:bg-gray-200 transition">
                            <i class="ph-moon"></i> Dark BG
                        </button>
                    </div>
                    <div id="preview-wrapper" class="preview-container preview-bg-light rounded-xl p-10 flex items-center justify-center min-h-[160px] border-2 border-dashed border-gray-300">
                        <button id="button-preview" class="preview-btn text-sm font-bold">Button</button>
                    </div>
                    <p class="text-xs text-center text-gray-400 mt-2">Adjust 'Dimensions' to 50px x 50px for a perfect circle.</p>
                </div>

                <!-- EDITOR FORM -->
                <div class="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                    <div class="flex justify-between items-center mb-6 border-b pb-2">
                        <h2 id="editor-title" class="text-lg font-bold text-gray-800">Edit Button</h2>
                        <span class="text-xs text-gray-400">All fields are optional except ID</span>
                    </div>

                    <form id="button-form">

                        <!-- 1. Basic Info -->
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-5 mb-6">
                            <div class="md:col-span-2">
                                <label class="block text-xs font-bold text-gray-600 mb-1">Button Label (Text)</label>
                                <input type="text" id="btn-name" class="royal-input w-full p-3" placeholder="e.g. SIP Status">
                            </div>
                            <div>
                                <label class="block text-xs font-bold text-gray-600 mb-1">Action ID</label>
                                <input type="text" id="btn-id" class="royal-input w-full p-3" placeholder="e.g. sipBtn">
                            </div>
                            <div>
                                <label class="block text-xs font-bold text-gray-600 mb-1">Target URL</label>
                                <input type="text" id="btn-url" class="royal-input w-full p-3" placeholder="page.html">
                            </div>
                        </div>

                        <!-- 2. SVG Icon -->
                        <div class="mb-6">
                            <label class="block text-xs font-bold text-gray-600 mb-1">SVG Icon Code</label>
                            <textarea id="btn-icon" class="royal-input w-full p-3 font-mono text-xs h-20" placeholder='<svg xmlns="http://www.w3.org/2000/svg" ... ></svg>'></textarea>
                        </div>

                        <!-- 3. Styling -->
                        <div class="mb-6">
                            <h4 class="text-xs font-bold text-indigo-600 uppercase mb-3">Design & Colors</h4>
                            <div class="grid grid-cols-2 md:grid-cols-3 gap-4">
                                <!-- Colors -->
                                <div>
                                    <label class="block text-xs font-bold text-gray-600 mb-1">Background</label>
                                    <div class="color-group">
                                        <input type="color" id="btn-color-picker" value="#4f46e5">
                                        <input type="text" id="btn-color-hex" class="color-hex" value="#4f46e5">
                                    </div>
                                </div>
                                <div>
                                    <label class="block text-xs font-bold text-gray-600 mb-1">Text Color</label>
                                    <div class="color-group">
                                        <input type="color" id="btn-text-color-picker" value="#ffffff">
                                        <input type="text" id="btn-text-color-hex" class="color-hex" value="#ffffff">
                                    </div>
                                </div>
                                <div>
                                    <label class="block text-xs font-bold text-gray-600 mb-1">Border Color</label>
                                    <div class="color-group">
                                        <input type="color" id="btn-border-color-picker" value="#ffffff">
                                        <input type="text" id="btn-border-color-hex" class="color-hex" value="#ffffff">
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- 4. Dimensions & Shape -->
                        <div class="mb-6">
                            <h4 class="text-xs font-bold text-indigo-600 uppercase mb-3">Shape & Size (Crucial for Circles)</h4>
                            <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
                                <div>
                                    <label class="block text-xs font-bold text-gray-600 mb-1">Width</label>
                                    <input type="text" id="btn-width" class="royal-input w-full p-2" placeholder="e.g. 50px">
                                </div>
                                <div>
                                    <label class="block text-xs font-bold text-gray-600 mb-1">Height</label>
                                    <input type="text" id="btn-height" class="royal-input w-full p-2" placeholder="e.g. 50px">
                                </div>
                                <div>
                                    <label class="block text-xs font-bold text-gray-600 mb-1">Radius</label>
                                    <input type="text" id="btn-border-radius" class="royal-input w-full p-2" value="50px">
                                </div>
                                <div>
                                    <label class="block text-xs font-bold text-gray-600 mb-1">Padding</label>
                                    <input type="text" id="btn-padding" class="royal-input w-full p-2" placeholder="10px 20px">
                                </div>
                            </div>
                            <p class="text-[10px] text-gray-400 mt-2"><b>Tip:</b> For a perfect circle button, set Width=50px, Height=50px, Radius=50%, Padding=0.</p>
                        </div>

                        <!-- 5. Misc -->
                        <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6 items-end">
                            <div>
                                <label class="block text-xs font-bold text-gray-600 mb-1">Border Width</label>
                                <select id="btn-border-width" class="royal-input w-full p-2">
                                    <option value="0px">None</option>
                                    <option value="1px">1px</option>
                                    <option value="2px">2px</option>
                                    <option value="3px">3px</option>
                                </select>
                            </div>
                            <div>
                                <label class="block text-xs font-bold text-gray-600 mb-1">Order</label>
                                <input type="number" id="btn-order" class="royal-input w-full p-2" value="0">
                            </div>
                            <div class="col-span-2 flex gap-4 pb-2">
                                <label class="flex items-center gap-2 cursor-pointer">
                                    <input type="checkbox" id="btn-transparent-bg" class="w-4 h-4 text-indigo-600 rounded">
                                    <span class="text-sm font-medium text-gray-600">Transparent</span>
                                </label>
                                <label class="flex items-center gap-2 cursor-pointer">
                                    <input type="checkbox" id="btn-glossy-effect" class="w-4 h-4 text-indigo-600 rounded">
                                    <span class="text-sm font-medium text-gray-600">Glossy</span>
                                </label>
                            </div>
                        </div>

                        <!-- Actions -->
                        <div class="flex justify-end gap-3 pt-4 border-t">
                            <button type="button" id="cancel-edit-btn" class="px-5 py-2.5 text-sm font-bold text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200 transition">Cancel</button>
                            <button type="submit" id="save-button-btn" class="px-6 py-2.5 text-sm font-bold text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 shadow-lg shadow-indigo-200 flex items-center gap-2 transition transform active:scale-95">
                                <span>Save Changes</span> <div class="loader hidden w-4 h-4"></div>
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    `;

    // Initialize Listener
    const buttonsRef = ref(db, 'admin/header_buttons');
    if(buttonsListener) off(ref(db), 'value', buttonsListener);

    buttonsListener = onValue(buttonsRef, (snapshot) => {
        const listContainer = document.getElementById('buttons-list');
        if(!listContainer) return;

        const data = snapshot.val();
        listContainer.innerHTML = '';

        if (!data) {
            listContainer.innerHTML = '<p class="text-center text-gray-400 py-6 text-sm">No buttons found.</p>';
            return;
        }

        const sortedButtons = Object.entries(data).sort(([,a],[,b]) => (a.order || 0) - (b.order || 0));

        sortedButtons.forEach(([key, btn]) => {
            const div = document.createElement('div');
            div.className = "flex justify-between items-center p-3 bg-white rounded-xl border border-gray-100 hover:border-indigo-200 hover:shadow-md transition-all group cursor-pointer";

            // Thumbnail Styles
            const thumbBg = btn.transparent ? 'transparent' : (btn.color || '#4f46e5');
            const thumbBorder = btn.borderWidth && btn.borderWidth !== '0px' ? `1px solid ${btn.borderColor || '#000'}` : '1px solid #f0f0f0';
            const thumbRadius = btn.borderRadius || '8px'; // Show approximate shape

            div.innerHTML = `
                <div class="flex items-center gap-3 overflow-hidden" onclick="document.querySelector('.edit-btn[data-key=\\'${key}\\']').click()">
                    <div class="w-10 h-10 flex items-center justify-center flex-shrink-0 shadow-sm transition-transform group-hover:scale-105 overflow-hidden" 
                         style="background: ${thumbBg}; color: ${btn.textColor || '#fff'}; border: ${thumbBorder}; border-radius: ${thumbRadius}">
                        ${btn.icon_svg ? '<div style="width:18px;height:18px">' + btn.icon_svg + '</div>' : '<i class="ph-circle"></i>'}
                    </div>
                    <div>
                        <p class="font-bold text-gray-800 text-sm">${btn.name || 'Untitled'}</p>
                        <p class="text-[10px] text-gray-400 font-mono">ID: ${btn.id}</p>
                    </div>
                </div>
                <div class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button class="edit-btn p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg" data-key="${key}"><i class="ph-pencil-simple text-lg"></i></button>
                    <button class="delete-btn p-2 text-red-500 hover:bg-red-50 rounded-lg" data-key="${key}"><i class="ph-trash text-lg"></i></button>
                </div>
            `;
            listContainer.appendChild(div);
        });
    });
}

// --- Helpers ---

function showEditor(isNew = true, data = {}, key = null) {
    currentEditKey = isNew ? null : key;
    const form = document.getElementById('button-form');
    if(!form) return;
    form.reset();

    document.getElementById('editor-title').textContent = isNew ? 'Add New Button' : 'Edit Button';

    // Fill Fields
    document.getElementById('btn-name').value = data.name || '';
    document.getElementById('btn-url').value = data.url || '';
    document.getElementById('btn-id').value = data.id || '';
    document.getElementById('btn-icon').value = data.icon_svg || '';
    document.getElementById('btn-order').value = data.order || 0;

    // Styles
    document.getElementById('btn-color-hex').value = data.color || '#4f46e5';
    document.getElementById('btn-text-color-hex').value = data.textColor || '#ffffff';
    document.getElementById('btn-border-color-hex').value = data.borderColor || '#ffffff';

    document.getElementById('btn-border-width').value = data.borderWidth || '0px';
    document.getElementById('btn-border-radius').value = data.borderRadius || '50px';

    // New Dimensions Inputs
    document.getElementById('btn-width').value = data.width || '';
    document.getElementById('btn-height').value = data.height || '';
    document.getElementById('btn-padding').value = data.padding || '';

    document.getElementById('btn-transparent-bg').checked = data.transparent || false;
    document.getElementById('btn-glossy-effect').checked = (data.style_preset === 'btn-glossy');

    // Sync Pickers
    ['btn-color', 'btn-text-color', 'btn-border-color'].forEach(id => {
        const hex = document.getElementById(`${id}-hex`);
        const picker = document.getElementById(`${id}-picker`);
        if(hex && picker) picker.value = hex.value;
    });

    updateButtonPreview();

    const editorCol = document.getElementById('editor-column');
    editorCol.classList.remove('hidden');

    if(window.innerWidth < 1024) editorCol.scrollIntoView({ behavior: 'smooth' });
}

function hideEditor() {
    document.getElementById('editor-column').classList.add('hidden');
    currentEditKey = null;
}

function updateButtonPreview() {
    const preview = document.getElementById('button-preview');
    if (!preview) return;

    const name = document.getElementById('btn-name').value;
    const icon = document.getElementById('btn-icon').value;

    const bgColor = document.getElementById('btn-color-hex').value;
    const textColor = document.getElementById('btn-text-color-hex').value;
    const borderColor = document.getElementById('btn-border-color-hex').value;
    const borderWidth = document.getElementById('btn-border-width').value;
    const borderRadius = document.getElementById('btn-border-radius').value;

    // New Dimensions logic
    const width = document.getElementById('btn-width').value;
    const height = document.getElementById('btn-height').value;
    const padding = document.getElementById('btn-padding').value;

    const isTransparent = document.getElementById('btn-transparent-bg').checked;
    const isGlossy = document.getElementById('btn-glossy-effect').checked;

    // Apply Styles
    preview.style.backgroundColor = isTransparent ? 'transparent' : bgColor;
    preview.style.color = textColor;
    preview.style.borderColor = borderColor;
    preview.style.borderWidth = borderWidth;
    preview.style.borderStyle = (borderWidth !== '0px') ? 'solid' : 'none';
    preview.style.borderRadius = borderRadius;

    // Dimensions Logic
    if (width) preview.style.width = width; else preview.style.width = 'auto';
    if (height) preview.style.height = height; else preview.style.height = 'auto';

    // Padding Logic
    if (padding) {
        preview.style.padding = padding;
    } else if (width && height) {
        // If fixed dimensions, remove padding to center perfectly
        preview.style.padding = '0';
    } else {
        // Default padding if no dimensions set
        preview.style.padding = "10px 24px";
    }

    // Glossy Logic
    if (isGlossy && !isTransparent) {
        preview.classList.add('btn-glossy');
        preview.style.backgroundImage = 'linear-gradient(to top, rgba(0,0,0,0.1), rgba(255,255,255,0.25))';
    } else {
        preview.classList.remove('btn-glossy');
        preview.style.backgroundImage = 'none';
    }

    // Render Content
    preview.innerHTML = `${icon} <span>${name}</span>`;
}

async function handleSaveButton() {
    const saveBtn = document.getElementById('save-button-btn');
    setButtonState(saveBtn, true);

    const btnData = {
        name: document.getElementById('btn-name').value,
        url: document.getElementById('btn-url').value,
        id: document.getElementById('btn-id').value,
        icon_svg: document.getElementById('btn-icon').value,
        order: parseInt(document.getElementById('btn-order').value) || 0,

        color: document.getElementById('btn-color-hex').value,
        textColor: document.getElementById('btn-text-color-hex').value,
        borderColor: document.getElementById('btn-border-color-hex').value,
        borderWidth: document.getElementById('btn-border-width').value,
        borderRadius: document.getElementById('btn-border-radius').value,

        width: document.getElementById('btn-width').value,
        height: document.getElementById('btn-height').value,
        padding: document.getElementById('btn-padding').value,

        transparent: document.getElementById('btn-transparent-bg').checked,
        style_preset: document.getElementById('btn-glossy-effect').checked ? 'btn-glossy' : 'custom',
        base_class: 'civil-button'
    };

    // Keep special IDs logic if needed for legacy support
    if (['notificationBtn', 'installAppBtn', 'viewBalanceBtn', 'viewPenaltyWalletBtn'].includes(btnData.id)) {
        btnData.base_class = btnData.id === 'notificationBtn' ? 'notification-btn' : 'view-balance-btn';
    }

    const dbRef = currentEditKey 
        ? ref(db, `admin/header_buttons/${currentEditKey}`) 
        : push(ref(db, 'admin/header_buttons'));

    try {
        await set(dbRef, btnData);
        showToast(`Button saved successfully!`);
        hideEditor();
    } catch (err) {
        showToast('Error: ' + err.message, true);
    } finally {
        setButtonState(saveBtn, false, 'Save Changes');
    }
}

