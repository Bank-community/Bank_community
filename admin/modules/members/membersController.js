// modules/members/membersController.js
import { db } from '../../core/firebaseConfig.js';
import { ref, onValue, update, remove, off } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-database.js";
import { openModal, closeModal, showConfirmation, showToast, setButtonState } from '../../shared/uiComponents.js';
import { uploadImage } from '../../shared/utils.js';

let membersListener = null;
let ledgerListener = null;
let allMembersData = {};
let currentMonthLedger = {};

export async function init() {
    console.log("Members Module Initialized");
    const container = document.getElementById('all-members-view');

    // 1. Table Actions
    container.addEventListener('click', async (e) => {
        if (e.target.closest('.edit-member-btn')) {
            const btn = e.target.closest('.edit-member-btn');
            renderEditMemberModal(btn.dataset.id, allMembersData[btn.dataset.id]);
        }
        if (e.target.closest('.delete-member-btn')) {
            const btn = e.target.closest('.delete-member-btn');
            handleDeleteMember(btn.dataset.id, btn.dataset.name);
        }
        if (e.target.classList.contains('member-status-toggle')) {
            const toggle = e.target;
            handleStatusToggle(toggle.dataset.id, toggle.checked, toggle);
        }
    });

    // 2. Search
    container.addEventListener('input', (e) => {
        if (e.target.id === 'member-search-input') {
            renderTable(e.target.value.toLowerCase());
        }
    });

    // 3. Modal Actions
    document.body.addEventListener('click', (e) => {
        if (e.target.closest('.change-image-btn')) {
            const btn = e.target.closest('.change-image-btn');
            document.getElementById(`${btn.dataset.target}-file`).click();
        }
        if (e.target.closest('.close-modal-btn')) {
            const modal = e.target.closest('.modal-overlay');
            if(modal) closeModal(modal);
        }
    });

    // 4. Edit Form Submit
    document.body.addEventListener('submit', async (e) => {
        if (e.target.id === 'edit-member-form') {
            e.preventDefault();
            await handleEditSubmit(e);
        }
    });

    // 5. File Preview
    document.body.addEventListener('change', (e) => {
        if (e.target.type === 'file' && e.target.id.startsWith('edit-')) handleFilePreview(e);
    });
}

export async function render() {
    const container = document.getElementById('all-members-view');

    container.innerHTML = `
        <div class="mb-4 flex justify-between items-center">
            <input type="text" id="member-search-input" placeholder="Search members..." class="form-input w-full p-3 rounded-lg border border-gray-300 shadow-sm">
        </div>
        <div id="all-members-container" class="bg-white rounded-xl shadow-md overflow-x-auto min-h-[200px] flex flex-col justify-center items-center">
            <div class="loader border-indigo-600"></div>
            <p class="mt-2 text-gray-500 text-sm">Loading Members & SIP Status...</p>
        </div>
    `;

    // 1. Calculate Current Month Key (YYYY-MM)
    const now = new Date();
    const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    // 2. Listen to Members Data
    const membersRef = ref(db, 'members');
    if (membersListener) off(membersRef, 'value', membersListener);

    membersListener = onValue(membersRef, (snapshot) => {
        allMembersData = snapshot.val() || {};
        checkAndRender();
    });

    // 3. Listen to SIP LEDGER (Current Month Only) - FAST!
    const ledgerRef = ref(db, `sip_ledger/${currentMonthKey}`);
    if (ledgerListener) off(ledgerRef, 'value', ledgerListener);

    ledgerListener = onValue(ledgerRef, (snapshot) => {
        currentMonthLedger = snapshot.val() || {};
        checkAndRender();
    });
}

function checkAndRender() {
    // Only render if we have data (or if data is empty but loaded)
    // We trigger render whenever either updates.
    renderTable(document.getElementById('member-search-input')?.value.toLowerCase() || '');
}

function renderTable(searchTerm = '') {
    const listContainer = document.getElementById('all-members-container');
    if (!listContainer) return;

    listContainer.className = "bg-white rounded-xl shadow-md overflow-x-auto"; 

    let approvedMembers = Object.entries(allMembersData)
        .filter(([, member]) => member.status === 'Approved');

    if (searchTerm) {
        approvedMembers = approvedMembers.filter(([, member]) => 
            member.fullName && member.fullName.toLowerCase().includes(searchTerm)
        );
    }

    if (approvedMembers.length === 0) {
        listContainer.className = "bg-white rounded-xl shadow-md overflow-x-auto min-h-[200px] flex flex-col justify-center items-center";
        listContainer.innerHTML = `<p class="text-center text-gray-500 p-8">No members found.</p>`;
        return;
    }

    // Get Current Month Name for Header
    const monthName = new Date().toLocaleString('default', { month: 'long' });

    const tableHTML = `
        <table class="w-full text-sm text-left text-gray-500 min-w-max"> 
            <thead class="text-xs text-gray-700 uppercase bg-gray-50 sticky top-0 z-10">
                <tr>
                    <th scope="col" class="px-6 py-3 sticky left-0 bg-gray-50 z-20 shadow-sm border-r border-gray-200">Name</th>
                    <th scope="col" class="px-6 py-3">Status</th>
                    <th scope="col" class="px-6 py-3 text-indigo-600">SIP (${monthName})</th>
                    <th scope="col" class="px-6 py-3">Status</th>
                    <th scope="col" class="px-6 py-3">Wallet Balance</th>
                    <th scope="col" class="px-6 py-3">Loan Due</th>
                    <th scope="col" class="px-6 py-3">Actions</th>
                </tr>
            </thead>
            <tbody class="divide-y divide-gray-100">
                ${approvedMembers.map(([id, member]) => {
                    const balance = member.accountBalance || 0;
                    const loanDue = member.totalLoanDue || 0;
                    const balanceClass = balance < 0 ? 'text-red-600 font-bold' : 'text-green-600 font-bold';
                    const isChecked = !member.isDisabled ? 'checked' : '';
                    const statusText = !member.isDisabled ? 'Active' : 'Hidden';
                    const statusColor = !member.isDisabled ? 'text-green-600' : 'text-gray-400';

                    // --- HYBRID LOGIC: CHECK LEDGER FIRST ---
                    // Check if this member ID exists in the current month's ledger
                    const ledgerEntry = currentMonthLedger[id];

                    const isPaid = !!ledgerEntry; // True if entry exists
                    const sipStatus = isPaid ? 'Paid' : 'Pending';
                    const sipStatusClass = isPaid ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800';
                    const displaySipAmount = isPaid ? (ledgerEntry.amount || 0) : 0;

                    return `
                    <tr class="bg-white hover:bg-gray-50 transition-colors">
                        <td class="px-6 py-4 font-medium text-gray-900 whitespace-nowrap sticky left-0 bg-white z-10 border-r border-gray-100 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">
                            ${member.fullName}
                        </td>
                        <td class="px-6 py-4">
                            <div class="flex items-center gap-2">
                                <label class="toggle-switch">
                                    <input type="checkbox" class="member-status-toggle" data-id="${id}" ${isChecked}>
                                    <span class="slider"></span>
                                </label>
                                <span class="text-xs ${statusColor}">${statusText}</span>
                            </div>
                        </td>
                        <td class="px-6 py-4 font-bold text-indigo-600">₹${displaySipAmount.toLocaleString('en-IN')}</td>
                        <td class="px-6 py-4">
                            <span class="${sipStatusClass} text-xs font-bold px-3 py-1 rounded-full border border-gray-200">${sipStatus}</span>
                        </td>
                        <td class="px-6 py-4 ${balanceClass}">₹${balance.toLocaleString('en-IN')}</td>
                        <td class="px-6 py-4 font-medium text-red-600">₹${loanDue.toLocaleString('en-IN')}</td>
                        <td class="px-6 py-4 flex items-center space-x-4">
                            <button class="edit-member-btn font-medium text-blue-600 hover:underline" data-id="${id}">Edit</button>
                            <button class="delete-member-btn font-medium text-red-600 hover:underline" data-id="${id}" data-name="${member.fullName}">Delete</button>
                        </td>
                    </tr>`;
                }).join('')}
            </tbody>
        </table>
    `;

    listContainer.innerHTML = tableHTML;
}

// --- Action Functions (Delete, Toggle, Edit) ---
// (No Changes needed below, just standard copy-paste to keep file complete)

async function handleDeleteMember(memberId, memberName) {
    if (await showConfirmation(`Delete ${memberName}?`, 'This will delete the member, ALL their transactions, and ALL their loans. This cannot be undone.')) {
        try {
            const updates = {};
            updates[`/members/${memberId}`] = null;
            // Note: We don't delete from sip_ledger here to keep history, but you could if needed.
            await update(ref(db), updates);
            showToast('Member deleted successfully.');
        } catch (error) {
            showToast('Error deleting member: ' + error.message, true);
        }
    }
}

async function handleStatusToggle(memberId, isChecked, toggleElement) {
    const isDisabled = !isChecked;
    try {
        await update(ref(db, `members/${memberId}`), { isDisabled: isDisabled });
        showToast(`Member ${isDisabled ? 'disabled' : 'enabled'} successfully.`);
    } catch (error) {
        showToast(`Failed: ${error.message}`, true);
        toggleElement.checked = !isChecked; 
    }
}

async function handleEditSubmit(e) {
    const submitBtn = document.getElementById('save-member-changes-btn');
    if(submitBtn) setButtonState(submitBtn, true);

    const form = e.target;
    const memberId = form.dataset.memberId;

    try {
        const pFile = document.getElementById('edit-profile-file').files[0];
        const sFile = document.getElementById('edit-signature-file').files[0];
        const dFile = document.getElementById('edit-document-file').files[0];

        const [pUrl, sUrl, dUrl] = await Promise.all([
            pFile ? uploadImage(pFile) : null,
            sFile ? uploadImage(sFile) : null,
            dFile ? uploadImage(dFile) : null
        ]);

        const updates = {
            fullName: document.getElementById('edit-member-name').value,
            mobileNumber: document.getElementById('edit-member-mobile').value,
            address: document.getElementById('edit-member-address').value,
            aadhaar: document.getElementById('edit-member-aadhaar').value,
            dob: document.getElementById('edit-member-dob').value,
            guarantorName: document.getElementById('edit-member-guarantor').value,
            password: document.getElementById('edit-member-password').value,
            profilePicUrl: pUrl || document.getElementById('edit-profile-url').value,
            signatureUrl: sUrl || document.getElementById('edit-signature-url').value,
            documentUrl: dUrl || document.getElementById('edit-document-url').value,
        };

        await update(ref(db, `members/${memberId}`), updates);
        showToast('Member details updated!');
        closeModal(document.getElementById('editMemberModal'));
    } catch (error) {
        showToast('Error updating: ' + error.message, true);
    } finally {
        if(submitBtn) setButtonState(submitBtn, false, 'Save Changes');
    }
}

function handleFilePreview(e) {
    const fileInput = e.target;
    const previewId = fileInput.id.replace('-file', '-preview');
    const preview = document.getElementById(previewId);
    if (fileInput.files[0] && preview) {
        const reader = new FileReader();
        reader.onload = (event) => { preview.src = event.target.result; };
        reader.readAsDataURL(fileInput.files[0]);
    }
}

function renderEditMemberModal(memberId, member) {
    const modal = document.getElementById('editMemberModal');
    if(!modal) return;

    // Helper for image row
    const imgRow = (id, label, url) => `
    <div class="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
        <div class="flex items-center gap-3">
            <div class="w-12 h-12 bg-gray-200 rounded-lg overflow-hidden border border-gray-300">
                ${url ? `<img id="${id}-preview" src="${url}" class="w-full h-full object-cover">` : `<div id="${id}-preview" class="w-full h-full flex items-center justify-center text-gray-400 text-xs">No Img</div>`}
            </div>
            <div><p class="text-sm font-medium text-gray-900">${label}</p><input type="hidden" id="${id}-url" value="${url || ''}"></div>
        </div>
        <div><input type="file" id="${id}-file" class="hidden" accept="image/*"><button type="button" class="change-image-btn text-xs bg-indigo-50 text-indigo-600 px-3 py-1.5 rounded-md hover:bg-indigo-100 font-medium" data-target="${id}">Change</button></div>
    </div>`;

    modal.innerHTML = `
        <div class="modal-content bg-white rounded-lg shadow-xl w-full max-w-2xl scale-95">
            <form id="edit-member-form" data-member-id="${memberId}">
                <div class="p-4 border-b flex justify-between items-center"><h3 class="text-lg font-bold">Edit: ${member.fullName}</h3><button type="button" class="close-modal-btn text-2xl text-gray-500 hover:text-gray-800">&times;</button></div>
                <div class="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div><label class="block text-sm font-medium text-gray-700 mb-1">Full Name</label><input type="text" id="edit-member-name" class="form-input w-full p-2 rounded-lg" value="${member.fullName || ''}" required></div>
                        <div><label class="block text-sm font-medium text-gray-700 mb-1">Mobile</label><input type="tel" id="edit-member-mobile" class="form-input w-full p-2 rounded-lg" value="${member.mobileNumber || ''}" required></div>
                        <div class="md:col-span-2"><label class="block text-sm font-medium text-gray-700 mb-1">Address</label><input type="text" id="edit-member-address" class="form-input w-full p-2 rounded-lg" value="${member.address || ''}"></div>
                        <div><label class="block text-sm font-medium text-gray-700 mb-1">Aadhaar</label><input type="text" id="edit-member-aadhaar" class="form-input w-full p-2 rounded-lg" value="${member.aadhaar || ''}"></div>
                        <div><label class="block text-sm font-medium text-gray-700 mb-1">DOB</label><input type="date" id="edit-member-dob" class="form-input w-full p-2 rounded-lg" value="${member.dob || ''}"></div>
                        <div><label class="block text-sm font-medium text-gray-700 mb-1">Guarantor</label><input type="text" id="edit-member-guarantor" class="form-input w-full p-2 rounded-lg" value="${member.guarantorName || ''}"></div>
                        <div><label class="block text-sm font-medium text-gray-700 mb-1">Password</label><input type="text" id="edit-member-password" class="form-input w-full p-2 rounded-lg" value="${member.password || ''}"></div>
                    </div>
                    <div class="pt-4 border-t mt-4"><label class="block text-sm font-medium text-gray-700 mb-2">Images</label>
                        <div class="space-y-4">${imgRow('edit-profile', 'Profile Pic', member.profilePicUrl)}${imgRow('edit-signature', 'Signature', member.signatureUrl)}${imgRow('edit-document', 'Document', member.documentUrl)}</div>
                    </div>
                </div>
                <div class="p-4 bg-gray-50 flex justify-end gap-3">
                    <button type="button" class="close-modal-btn px-4 py-2 text-sm font-medium text-gray-700 bg-gray-200 rounded-lg hover:bg-gray-300">Cancel</button>
                    <button type="submit" id="save-member-changes-btn" class="flex items-center justify-center px-4 py-2 text-sm font-bold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700"><span>Save Changes</span><span class="loader hidden ml-2"></span></button>
                </div>
            </form>
        </div>`;
    openModal(modal);
}