// loan/js/loan_pdf.js
import { calculateEMI } from './loan_calc.js';

// DOM Elements for Preview
const preview = {
    overlay: document.getElementById('preview-overlay'),
    inputPage: document.getElementById('input-page'),
    capture: document.getElementById('capture'),
    scaler: document.getElementById('paper-scaler'),

    // Fields
    name: document.getElementById('displayName'),
    mobile: document.getElementById('displayMobile'),
    amount: document.getElementById('displayAmount'),
    photo: document.getElementById('apiApplicantPhoto'),

    // Sections
    loanFields: document.getElementById('loanFields'),
    withdrawFields: document.getElementById('withdrawFields'),
    loanCalc: document.getElementById('loanCalculations'),
    loanNotice: document.getElementById('loanNotice'),
    withdrawNotice: document.getElementById('withdrawNotice'),

    // Images
    sig: document.getElementById('displaySignature'),
    docFront: document.getElementById('docFrontImg'),
    docBack: document.getElementById('docBackImg'),
    docSection: document.getElementById('docSection')
};

// 1. Render Data to Preview
export function renderPreviewAndShow(data) {
    const { member, amount, mode, durationString, manualImage } = data;

    // Common Data
    document.getElementById('currentDate').innerText = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
    preview.name.innerText = member.fullName;
    preview.mobile.innerText = member.mobileNumber || 'N/A';
    preview.amount.innerText = amount.toFixed(2);

    // Profile Photo (Using weserv.nl for CORS)
    setImg(preview.photo, member.profilePicUrl);

    if (mode === 'loan') {
        // LOAN SETUP
        document.getElementById('preview-subtitle').innerText = "PERSONAL LOAN";
        document.getElementById('previewAmountLabel').innerText = "Loan Amount:";

        preview.withdrawFields.classList.add('hidden');
        preview.loanFields.classList.remove('hidden');
        preview.loanCalc.classList.remove('hidden');
        preview.loanNotice.classList.remove('hidden');
        preview.withdrawNotice.classList.add('hidden');
        document.getElementById('loanRequestText').classList.remove('hidden');

        // Guarantor
        if (member.guarantorName && member.guarantorName !== 'N/A') {
            document.getElementById('displayGuarantor').innerText = member.guarantorName;
            document.getElementById('guarantorRow').classList.remove('hidden');
            document.getElementById('guarantorRow').style.display = 'flex';
        } else {
            document.getElementById('guarantorRow').classList.add('hidden');
        }

        // EMI Math
        const math = calculateEMI(amount, durationString);
        if (math) {
            document.getElementById('displayRate').innerText = `${math.rate}% Monthly for ${math.months} Months`;
            document.getElementById('displayEMI').innerText = math.emi.toFixed(2);
            document.getElementById('displayTotal').innerText = math.totalPayable.toFixed(2);
            document.getElementById('repaymentDate').innerText = math.endDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
        }

    } else {
        // WITHDRAWAL SETUP
        document.getElementById('preview-subtitle').innerText = "SIP WITHDRAWAL REQUEST";
        document.getElementById('previewAmountLabel').innerText = "Withdraw Amount:";

        preview.withdrawFields.classList.remove('hidden');
        preview.loanFields.classList.add('hidden');
        preview.loanCalc.classList.add('hidden');
        preview.loanNotice.classList.add('hidden');
        preview.withdrawNotice.classList.remove('hidden');
        document.getElementById('loanRequestText').classList.add('hidden');

        document.getElementById('displayMemId').innerText = member.membershipId || 'N/A';
        document.getElementById('displayJoinDate').innerText = member.joiningDate || 'N/A';
        document.getElementById('displayAddress').innerText = member.address || 'N/A';
    }

    // Signature
    if (member.signatureUrl) {
        setImg(preview.sig, member.signatureUrl);
        document.getElementById('noSignatureText').classList.add('hidden');
    } else {
        preview.sig.classList.add('hidden');
        document.getElementById('noSignatureText').classList.remove('hidden');
    }

    // Documents (Manual Upload or Profile Docs)
    handleDocuments(member, manualImage);

    // Show Overlay
    preview.inputPage.classList.add('hidden');
    preview.overlay.style.display = 'flex';

    // Auto-Scale Logic
    autoScalePaper();
    window.scrollTo(0, 0);
}

// Helper: Handle Images with CORS Proxy
function setImg(el, url) {
    if (url && url.length > 5) {
        // Use weserv.nl to proxy images and avoid tainted canvas
        el.src = `https://images.weserv.nl/?url=${url.replace(/^https?:\/\//, '')}`;
        el.classList.remove('hidden');
    } else {
        el.src = '';
        el.classList.add('hidden');
    }
}

// Helper: Document Logic
function handleDocuments(member, manualFile) {
    if (manualFile) {
        const reader = new FileReader();
        reader.onload = e => {
            document.getElementById('docFrontImg').src = e.target.result;
            if (member.documentBackUrl) setImg(preview.docBack, member.documentBackUrl);
            preview.docSection.classList.remove('hidden');
        };
        reader.readAsDataURL(manualFile);
    } else {
        const front = member.documentFrontUrl || member.documentUrl;
        const back = member.documentBackUrl;

        if (front) {
            setImg(preview.docFront, front);
            if (back) setImg(preview.docBack, back);
            preview.docSection.classList.remove('hidden');
        } else {
            preview.docSection.classList.add('hidden');
        }
    }
}

// 2. Download Logic
document.getElementById('downloadBtn').onclick = async function () {
    const btn = this;
    btn.disabled = true;
    const originalText = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> Generating...';

    try {
        // Wait for images to load
        const imgs = Array.from(preview.capture.getElementsByTagName('img'));
        await Promise.all(imgs.map(img => {
            if (img.complete) return Promise.resolve();
            return new Promise(r => { img.onload = r; img.onerror = r; });
        }));

        // Reset transform for capture
        const currentTransform = preview.scaler.style.transform;
        preview.scaler.style.transform = 'none';
        window.scrollTo(0, 0);

        const canvas = await html2canvas(preview.capture, {
            scale: 2, // High Quality
            useCORS: true,
            backgroundColor: '#ffffff',
            scrollY: -window.scrollY
        });

        // Restore transform
        preview.scaler.style.transform = currentTransform;

        // Download
        const link = document.createElement('a');
        link.download = `TCF_${preview.name.innerText.replace(/\s/g, '_')}_Slip.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();

        btn.innerHTML = '<i class="fas fa-check mr-2"></i> Done';
        setTimeout(() => {
            btn.disabled = false;
            btn.innerHTML = originalText;
        }, 2000);

    } catch (e) {
        alert('Download error: ' + e.message);
        autoScalePaper();
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
};

// Close Button
document.getElementById('closePreviewBtn').onclick = () => {
    preview.overlay.style.display = 'none';
    preview.inputPage.classList.remove('hidden');
};

// Auto Scale for Mobile
function autoScalePaper() {
    const screenW = window.innerWidth;
    const paperW = preview.capture.offsetWidth;
    if (screenW < paperW + 40) {
        const scale = (screenW - 20) / paperW;
        preview.scaler.style.transform = `scale(${scale})`;
    } else {
        preview.scaler.style.transform = `scale(1)`;
    }
}
