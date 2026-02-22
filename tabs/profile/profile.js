// tabs/profile/profile.js

import { ref, update } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-database.js";

const DEFAULT_PIC = 'https://placehold.co/200x200/E0E7FF/4F46E5?text=User';

export function init(app) {
    const member = app.state.member;
    const db = app.db;

    // 1. Render Profile Data
    renderProfile(member);

    // 2. Setup Event Listeners
    setupListeners(db, member);
}

function renderProfile(m) {
    setText('header-name', m.fullName);
    setText('header-id', `ID: ${m.membershipId}`);
    setImg('header-profile-pic', m.profilePicUrl);

    setText('profile-mobile', m.mobileNumber);
    setText('profile-email', m.email || 'No Email');
    setText('profile-address', m.address);
    setText('profile-guarantor', m.guarantorName || 'N/A');

    // Document Images
    setImg('doc-thumb-pic', m.profilePicUrl);
    setImg('doc-thumb-front', m.documentUrl);
    setImg('doc-thumb-back', m.documentBackUrl);
    setImg('doc-thumb-sign', m.signatureUrl);

    // --- NEW LOGIC: KYC VERIFICATION CHECK ---
    const verifyTag = document.getElementById('profile-verification-status');
    if (verifyTag) {
        // Check if ALL 4 documents exist
        const isKycComplete = m.profilePicUrl && m.documentUrl && m.documentBackUrl && m.signatureUrl;

        if (isKycComplete) {
            // Gold and Blue VERIFIED Tag
            verifyTag.innerHTML = '<i class="fas fa-check-circle"></i> VERIFIED';
            verifyTag.className = 'absolute -bottom-2 left-1/2 transform -translate-x-1/2 bg-[#D4AF37] text-[#001540] text-[10px] font-bold px-3 py-1 rounded-full border-2 border-white shadow-lg flex items-center gap-1 min-w-max';
        } else {
            // Red UNVERIFIED Tag
            verifyTag.innerHTML = '<i class="fas fa-exclamation-triangle"></i> UNVERIFIED';
            verifyTag.className = 'absolute -bottom-2 left-1/2 transform -translate-x-1/2 bg-red-500 text-white text-[10px] font-bold px-3 py-1 rounded-full border-2 border-white shadow-lg flex items-center gap-1 min-w-max';
        }
    }
}

function setText(id, val) { const el = document.getElementById(id); if(el) el.textContent = val; }
function setImg(id, url) { const el = document.getElementById(id); if(el) el.src = url || DEFAULT_PIC; }

// Modal Helper Functions
function showModal(id) { const el = document.getElementById(id); if(el) { el.classList.remove('hidden'); el.classList.add('flex'); } }
function hideModal(id) { const el = document.getElementById(id); if(el) { el.classList.add('hidden'); el.classList.remove('flex'); } }
function showError(el, msg) { el.textContent = msg; el.classList.remove('hidden'); }

function setupListeners(db, currentMember) {
    const container = document.getElementById('app-content');

    // Clear old listener to prevent duplicates
    if (container._profileListener) container.removeEventListener('click', container._profileListener);

    container._profileListener = async (e) => {
        const target = e.target;

        // 1. Image Viewer Zoom
        const trigger = target.closest('.document-trigger');
        if (trigger) {
            const img = trigger.querySelector('img');
            if (img && img.src && !img.src.includes('placehold.co')) {
                document.getElementById('fullImageView').src = img.src;
                showModal('imageViewerModal');
            }
        }

        // 2. Open Change Password Modal
        if (target.closest('#change-password-btn')) {
            document.getElementById('current-password').value = '';
            document.getElementById('new-password').value = '';
            document.getElementById('confirm-password').value = '';
            document.getElementById('password-error').classList.add('hidden');
            document.getElementById('password-success').classList.add('hidden');
            showModal('passwordModal');
        }

        // 3. Open Edit Email Modal
        if (target.closest('#edit-email-btn')) {
            document.getElementById('new-email-input').value = currentMember.email || '';
            document.getElementById('email-error').classList.add('hidden');
            document.getElementById('email-success').classList.add('hidden');
            showModal('emailModal');
        }

        // 4. Submit Password Change
        if (target.closest('#submit-password-change')) {
            await handlePasswordSubmit(db, currentMember);
        }

        // 5. Submit Email Change
        if (target.closest('#submit-email-change')) {
            await handleEmailSubmit(db, currentMember);
        }

        // 6. Close Modals & Overlays
        if (target.closest('#closeImageViewer')) hideModal('imageViewerModal');
        if (target.closest('#close-password-modal')) hideModal('passwordModal');
        if (target.closest('#close-email-modal')) hideModal('emailModal');

        if (target.classList.contains('modal-overlay')) hideModal(target.id);
    };

    container.addEventListener('click', container._profileListener);
}

async function handlePasswordSubmit(db, currentMember) {
    const currentPass = document.getElementById('current-password').value.trim();
    const newPass = document.getElementById('new-password').value.trim();
    const confirmPass = document.getElementById('confirm-password').value.trim();
    const errorEl = document.getElementById('password-error');
    const successEl = document.getElementById('password-success');
    const btn = document.getElementById('submit-password-change');

    errorEl.classList.add('hidden');
    successEl.classList.add('hidden');

    if (!currentPass || !newPass || !confirmPass) return showError(errorEl, 'All fields required.');
    if (String(currentPass) !== String(currentMember.password)) return showError(errorEl, 'Incorrect current PIN.');
    if (!/^\d+$/.test(newPass)) return showError(errorEl, 'PIN must be numbers only.');
    if (newPass !== confirmPass) return showError(errorEl, 'New PINs do not match.');

    try {
        btn.disabled = true; btn.textContent = 'Updating...';
        await update(ref(db, 'members/' + currentMember.membershipId), { password: newPass });

        currentMember.password = newPass; 
        successEl.classList.remove('hidden');

        setTimeout(() => { 
            hideModal('passwordModal'); 
            btn.disabled = false; 
            btn.textContent = 'Update'; 
        }, 1500);
    } catch (error) {
        showError(errorEl, error.message);
        btn.disabled = false; btn.textContent = 'Update';
    }
}

async function handleEmailSubmit(db, currentMember) {
    const newEmail = document.getElementById('new-email-input').value.trim();
    const errorEl = document.getElementById('email-error');
    const successEl = document.getElementById('email-success');
    const btn = document.getElementById('submit-email-change');

    errorEl.classList.add('hidden');

    if (!newEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) return showError(errorEl, 'Invalid email address.');

    try {
        btn.disabled = true; btn.textContent = 'Saving...';
        await update(ref(db, 'members/' + currentMember.membershipId), { email: newEmail });

        currentMember.email = newEmail; 
        document.getElementById('profile-email').textContent = newEmail;

        successEl.classList.remove('hidden');

        setTimeout(() => { 
            hideModal('emailModal'); 
            btn.disabled = false; 
            btn.textContent = 'Save'; 
        }, 1500);
    } catch (error) {
        showError(errorEl, error.message);
        btn.disabled = false; btn.textContent = 'Save';
    }
}
