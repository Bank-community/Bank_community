// loan/js/loan_kyc.js

/**
 * Checks if the member has all required documents.
 * @param {Object} member - The member object from Firebase.
 * @returns {Object} { isValid: boolean, missing: string[] }
 */
export function validateMemberKYC(member) {
    const missingFields = [];

    // 1. Profile Photo
    if (!member.profilePicUrl || member.profilePicUrl.length < 5) {
        missingFields.push("Profile Photo");
    }

    // 2. Document Front (Aadhaar/ID)
    // Note: Some old data might use 'documentUrl', new uses 'documentFrontUrl'
    const front = member.documentFrontUrl || member.documentUrl;
    if (!front || front.length < 5) {
        missingFields.push("Aadhaar Front");
    }

    // 3. Document Back
    if (!member.documentBackUrl || member.documentBackUrl.length < 5) {
        missingFields.push("Aadhaar Back");
    }

    // 4. Signature
    if (!member.signatureUrl || member.signatureUrl.length < 5) {
        missingFields.push("Digital Signature");
    }

    // 5. Email (NEW REQUIREMENT)
    if (!member.email || !member.email.includes('@')) {
        missingFields.push("Email ID");
    }

    return {
        isValid: missingFields.length === 0,
        missing: missingFields
    };
}

/**
 * Updates the UI based on KYC status.
 */
export function updateKYCUI(status) {
    const container = document.getElementById('kycStatusContainer');
    const btn = document.getElementById('generateBtn');

    // Reset Classes
    container.classList.remove('hidden', 'bg-red-50', 'bg-green-50', 'border-red-200', 'border-green-200', 'text-red-700', 'text-green-700');
    container.innerHTML = '';

    if (status.isValid) {
        // Success State
        container.classList.add('bg-green-50', 'border', 'border-green-200', 'text-green-700');
        container.innerHTML = `<div class="font-bold flex items-center gap-2"><i class="fas fa-check-circle text-lg"></i> <span>KYC Verified (All Docs OK)</span></div>`;
        container.classList.remove('hidden');

        // Enable Button (Logic layer says yes, but Date/Amount checks might still disable it later)
        btn.disabled = false;
        btn.classList.remove('opacity-50', 'cursor-not-allowed', 'shadow-none');
        btn.title = ""; // Clear tooltip
    } else {
        // Failure State
        container.classList.add('bg-red-50', 'border', 'border-red-200', 'text-red-700');
        container.innerHTML = `
            <div class="font-bold flex items-center gap-2"><i class="fas fa-times-circle text-lg"></i> <span>KYC Incomplete</span></div>
            <div class="text-[10px] mt-1 pl-7 font-semibold opacity-80">Missing: ${status.missing.join(', ')}</div>
        `;
        container.classList.remove('hidden');

        // Disable Button Immediately
        btn.disabled = true;
        btn.classList.add('opacity-50', 'cursor-not-allowed', 'shadow-none');
        btn.title = "KYC Documents Missing";
    }
}
