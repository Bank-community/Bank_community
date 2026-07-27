// modules/registration/registrationController.js
import { db } from '../../core/firebaseConfig.js';
import { ref, set, get, query, orderByChild, equalTo } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-database.js";
import { showToast, openModal, closeModal, setButtonState } from '../../shared/uiComponents.js';
import { uploadImage } from '../../shared/utils.js';

export async function init() {
    console.log("Registration Module Initialized");
    const container = document.getElementById('new-registration-view');

    // 1. Form Submit (Review Step)
    container.addEventListener('submit', (e) => {
        if (e.target.id === 'new-registration-form') {
            e.preventDefault();
            populateRegistrationReviewModal();
            openModal(document.getElementById('registrationReviewModal'));
        }
    });

    // 2. File Input Previews
    container.addEventListener('change', (e) => {
        if (e.target.type === 'file' && e.target.id.startsWith('reg-')) {
            handleFilePreview(e.target);
        }
    });

    // 3. Password Toggle
    container.addEventListener('click', (e) => {
        const toggleBtn = e.target.closest('#reg-togglePassword');
        if (toggleBtn) {
            const passwordInput = document.getElementById('reg-password');
            const type = passwordInput.getAttribute('type') === 'password' ? 'text' : 'password';
            passwordInput.setAttribute('type', type);
            toggleBtn.querySelector('i').classList.toggle('ph-eye');
            toggleBtn.querySelector('i').classList.toggle('ph-eye-slash');
        }

        // Image Preview Click Trigger
        if (e.target.classList.contains('img-preview')) {
             const inputId = e.target.id.replace('Preview', '');
             document.getElementById(inputId).click();
        }
    });

    // 4. Modal Action Listeners (Delegated to Body)
    document.body.addEventListener('click', async (e) => {
        // Edit Button in Modal (Close & Fix)
        if (e.target.id === 'editRegistrationBtn') {
            closeModal(document.getElementById('registrationReviewModal'));
        }

        // Final Confirm Submit
        if (e.target.closest('#confirmSubmitRegistrationBtn')) {
            const btn = e.target.closest('#confirmSubmitRegistrationBtn');
            await handleFinalSubmit(btn);
        }
    });
}

// Helper Function for ID Generation
function generateMembershipId() {
    const year = new Date().getFullYear(); // Current Year (e.g., 2026)
    const randomNum = Math.floor(10000 + Math.random() * 90000); // Random 5 digit number (10000-99999)
    return `TCF-MEM-${year}-${randomNum}`;
}

export async function render() {
    const container = document.getElementById('new-registration-view');

    // Generate ID using new format
    const generatedId = generateMembershipId();
    const today = new Date().toISOString().split('T')[0];

    container.innerHTML = `
        <style>
            .img-preview { width: 100px; height: 100px; border: 2px dashed #cbd5e1; background-color: #f8fafc; background-size: cover; background-position: center; display: flex; align-items: center; justify-content: center; color: #94a3b8; font-size: 12px; text-align: center; cursor: pointer; transition: transform 0.2s; }
            .img-preview:hover { transform: scale(1.05); }
        </style>
        <form id="new-registration-form" class="bg-white p-6 sm:p-8 rounded-xl shadow-md space-y-6">
            <h2 class="text-2xl font-bold text-gray-800 mb-4 text-center">New Member Registration</h2>

            <div class="border-b border-gray-200 pb-6">
                <h3 class="text-lg font-semibold text-gray-700 mb-4">Personal Details</h3>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div><label class="block text-sm font-medium text-gray-700 mb-1 required-label">Full Name</label><input type="text" id="reg-fullName" class="form-input w-full px-4 py-2 rounded-lg" required></div>
                    <div><label class="block text-sm font-medium text-gray-700 mb-1 required-label">Mobile Number</label><input type="tel" id="reg-mobileNumber" pattern="[6-9]{1}[0-9]{9}" class="form-input w-full px-4 py-2 rounded-lg" required></div>
                    <div><label class="block text-sm font-medium text-gray-700 mb-1 required-label">Date of Birth</label><input type="date" id="reg-dob" class="form-input w-full px-4 py-2 rounded-lg" required></div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1 required-label">Gender</label>
                        <select id="reg-gender" class="form-select w-full px-4 py-2 rounded-lg" required>
                            <option value="" disabled selected>Select...</option>
                            <option value="Male">Male</option>
                            <option value="Female">Female</option>
                            <option value="Other">Other</option>
                        </select>
                    </div>
                    <div><label class="block text-sm font-medium text-gray-700 mb-1 required-label">Aadhaar Card Number</label><input type="text" id="reg-aadhaar" pattern="\\d{12}" class="form-input w-full px-4 py-2 rounded-lg" required></div>
                    <div><label class="block text-sm font-medium text-gray-700 mb-1 required-label">Guarantor's Name</label><input type="text" id="reg-guarantorName" class="form-input w-full px-4 py-2 rounded-lg" required></div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1 required-label">Password</label>
                        <div class="relative">
                            <input type="password" id="reg-password" class="form-input w-full px-4 py-2 pr-10 rounded-lg" required>
                            <button type="button" id="reg-togglePassword" class="absolute inset-y-0 right-0 px-3 flex items-center text-gray-500"><i class="ph-eye"></i></button>
                        </div>
                    </div>
                    <div class="md:col-span-2"><label class="block text-sm font-medium text-gray-700 mb-1 required-label">Permanent Address</label><textarea id="reg-address" rows="3" class="form-input w-full px-4 py-2 rounded-lg" required></textarea></div>
                </div>
            </div>

            <div class="border-b border-gray-200 pb-6">
                <h3 class="text-lg font-semibold text-gray-700 mb-4">Membership Details</h3>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div><label class="block text-sm font-medium text-gray-700 mb-1">Membership ID</label><input type="text" id="reg-membershipId" value="${generatedId}" class="w-full px-4 py-2 bg-gray-100 rounded-lg" readonly></div>
                    <div><label class="block text-sm font-medium text-gray-700 mb-1 required-label">Joining Date</label><input type="date" id="reg-joiningDate" value="${today}" class="form-input w-full px-4 py-2 rounded-lg" required></div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1 required-label">SIP Amount (Monthly)</label>
                        <div class="relative">
                            <span class="absolute inset-y-0 left-0 flex items-center pl-3 text-gray-500">₹</span>
                            <input type="number" id="reg-sipAmount" min="500" step="100" class="form-input w-full pl-7 pr-4 py-2 rounded-lg" required>
                        </div>
                    </div>
                    <!-- Account Balance REMOVED -->
                </div>
            </div>

            <div>
                <h3 class="text-lg font-semibold text-gray-700 mb-4">Document Upload</h3>
                <div class="grid grid-cols-1 md:grid-cols-3 gap-8">
                    <div class="text-center">
                        <label class="block text-sm font-medium text-gray-700 mb-2 required-label">Profile Photo</label>
                        <div id="reg-profilePicPreview" class="img-preview rounded-full mx-auto">Click to upload</div>
                        <input type="file" id="reg-profilePic" class="hidden" accept="image/*" required>
                    </div>
                    <div class="text-center">
                        <label class="block text-sm font-medium text-gray-700 mb-2 required-label">Signature</label>
                        <div id="reg-signaturePreview" class="img-preview rounded-lg mx-auto">Click to upload</div>
                        <input type="file" id="reg-signature" class="hidden" accept="image/*" required>
                    </div>
                    <div class="text-center">
                        <label class="block text-sm font-medium text-gray-700 mb-2 required-label">Document</label>
                        <div id="reg-documentPreview" class="img-preview rounded-lg mx-auto">Click to upload</div>
                        <input type="file" id="reg-document" class="hidden" accept="image/*" required>
                    </div>
                </div>
            </div>

            <div class="pt-6 text-right">
                <button type="submit" class="inline-flex items-center justify-center px-8 py-3 bg-blue-600 text-white font-semibold rounded-lg shadow-md hover:bg-blue-700">Review & Submit</button>
            </div>
        </form>
    `;
}

// --- Internal Helper Functions ---

function handleFilePreview(fileInput) {
    const previewId = fileInput.id + 'Preview';
    const preview = document.getElementById(previewId);
    const file = fileInput.files[0];
    if (file && preview) {
        const reader = new FileReader();
        reader.onload = (event) => {
            preview.style.backgroundImage = `url(${event.target.result})`;
            preview.textContent = ''; // Text hatao
        };
        reader.readAsDataURL(file);
    }
}

function populateRegistrationReviewModal() {
    const d = (id) => document.getElementById(id).value;
    // Helper to get background image URL safely
    const p = (id) => {
        const el = document.getElementById(id);
        const bg = el.style.backgroundImage;
        return bg ? bg.slice(5, -2) : '';
    };

    const reviewHTML = `
        <div class="space-y-4 text-sm">
            <h3 class="text-lg font-semibold text-gray-800 border-b pb-2">Personal Details</h3>
            <div class="grid grid-cols-2 gap-x-6 gap-y-3">
                <p><strong>Full Name:</strong> ${d('reg-fullName')}</p>
                <p><strong>Mobile Number:</strong> ${d('reg-mobileNumber')}</p>
                <p><strong>Date of Birth:</strong> ${d('reg-dob')}</p>
                <p><strong>Gender:</strong> ${d('reg-gender')}</p>
                <p><strong>Aadhaar:</strong> ${d('reg-aadhaar')}</p>
                <p><strong>Guarantor:</strong> ${d('reg-guarantorName')}</p>
                <p><strong>SIP Amount:</strong> ₹${parseInt(d('reg-sipAmount') || 0).toLocaleString('en-IN')}</p>
                <p><strong>Joining Date:</strong> ${d('reg-joiningDate')}</p>
                <p class="col-span-2"><strong>Address:</strong> ${d('reg-address')}</p>
            </div>
            <h3 class="text-lg font-semibold text-gray-800 border-b pb-2 pt-4">Document Upload</h3>
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 text-center">
                <div><p class="font-semibold mb-1">Profile Photo</p><img src="${p('reg-profilePicPreview')}" class="w-24 h-24 object-cover mx-auto rounded-lg border"></div>
                <div><p class="font-semibold mb-1">Signature</p><img src="${p('reg-signaturePreview')}" class="w-32 h-20 object-contain mx-auto rounded-lg border"></div>
                <div><p class="font-semibold mb-1">Document</p><img src="${p('reg-documentPreview')}" class="w-32 h-20 object-contain mx-auto rounded-lg border"></div>
            </div>
        </div>`;

    document.getElementById('registrationReviewContent').innerHTML = reviewHTML;
}

async function handleFinalSubmit(btn) {
    setButtonState(btn, true);

    try {
        const mobileNumber = document.getElementById('reg-mobileNumber').value;
        const aadhaar = document.getElementById('reg-aadhaar').value;

        // 1. Check Duplicates (Mobile & Aadhaar)
        const membersRef = ref(db, 'members');
        const mobileQuery = query(membersRef, orderByChild('mobileNumber'), equalTo(mobileNumber));
        const aadhaarQuery = query(membersRef, orderByChild('aadhaar'), equalTo(aadhaar));

        const [mobileSnapshot, aadhaarSnapshot] = await Promise.all([get(mobileQuery), get(aadhaarQuery)]);

        if (mobileSnapshot.exists()) throw new Error('This mobile number is already registered.');
        if (aadhaarSnapshot.exists()) throw new Error('This Aadhaar card number is already registered.');

        // 2. Upload Images
        const [profilePicUrl, signatureUrl, documentUrl] = await Promise.all([
            uploadImage(document.getElementById('reg-profilePic').files[0]), 
            uploadImage(document.getElementById('reg-signature').files[0]), 
            uploadImage(document.getElementById('reg-document').files[0])
        ]);

        if (!profilePicUrl || !signatureUrl || !documentUrl) throw new Error('One or more image uploads failed. Please try again.');

        // 3. Prepare Member Data
        const newMembershipId = document.getElementById('reg-membershipId').value;
        const memberData = {
            fullName: document.getElementById('reg-fullName').value,
            mobileNumber,
            dob: document.getElementById('reg-dob').value,
            gender: document.getElementById('reg-gender').value,
            aadhaar,
            guarantorName: document.getElementById('reg-guarantorName').value,
            address: document.getElementById('reg-address').value,
            password: document.getElementById('reg-password').value,
            membershipId: newMembershipId,
            joiningDate: document.getElementById('reg-joiningDate').value,
            sipAmount: parseFloat(document.getElementById('reg-sipAmount').value),
            // accountBalance REMOVED
            profilePicUrl,
            signatureUrl,
            documentUrl,
            createdAt: new Date().toISOString(),
            status: 'Approved' // CHANGED: Direct 'Approved'
        };

        // 4. Save to Database
        await set(ref(db, 'members/' + newMembershipId), memberData);

        // 5. Success & Cleanup
        closeModal(document.getElementById('registrationReviewModal'));
        showToast('Registration successful! Member added as Approved.');
        document.getElementById('new-registration-form').reset();

        // Reset Previews
        ['reg-profilePicPreview', 'reg-signaturePreview', 'reg-documentPreview'].forEach(id => { 
            const el = document.getElementById(id); 
            el.style.backgroundImage = ''; 
            el.textContent = 'Click to upload'; 
        });

        // Regenerate ID for next user (TCF Format)
        document.getElementById('reg-membershipId').value = generateMembershipId();
        document.getElementById('reg-joiningDate').valueAsDate = new Date();

    } catch (error) {
        showToast(`Error: ${error.message}`, true);
    } finally {
        setButtonState(btn, false, 'Confirm & Submit');
    }
}

