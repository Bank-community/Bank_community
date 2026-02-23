// loan/js/loan_pdf.js
import { calculateEMI } from './loan_calc.js';

// DOM Elements for Preview
const preview = {
    overlay: document.getElementById('preview-overlay'),
    inputPage: document.getElementById('input-page'),
    capture: document.getElementById('capture'),
    scaler: document.getElementById('paper-scaler'),
    // ... (rest mapped dynamically below)
};

// 1. Render Data to Preview & SHOW OVERLAY
export function renderPreviewAndShow(data) {
    console.log("🖼️ PDF Generator Started...");
    const { member, amount, mode, durationString, manualImage } = data;

    // A. Basic Fields
    setText('currentDate', new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }));
    setText('displayName', member.fullName);
    setText('displayMobile', member.mobileNumber || 'N/A');
    setText('displayAmount', amount.toFixed(2));

    // B. Profile Photo (with CORS Proxy for html2canvas)
    setImg('apiApplicantPhoto', member.profilePicUrl);

    // C. Mode Specific Layout
    if (mode === 'loan') {
        // Loan Mode
        setText('preview-subtitle', "PERSONAL LOAN");
        setText('previewAmountLabel', "Loan Amount:");

        hide('withdrawFields'); show('loanFields');
        show('loanCalculations'); show('loanNotice'); hide('withdrawNotice');
        show('loanRequestText');

        // Guarantor
        const guarRow = document.getElementById('guarantorRow');
        if (member.guarantorName && member.guarantorName !== 'N/A') {
            setText('displayGuarantor', member.guarantorName);
            guarRow.classList.remove('hidden'); guarRow.style.display = 'flex'; // Important for flex
        } else {
            guarRow.classList.add('hidden');
        }

        // EMI Math
        const math = calculateEMI(amount, durationString);
        if (math) {
            setText('displayRate', `${math.rate}% Monthly for ${math.months} Months`);
            setText('displayEMI', math.emi.toFixed(2));
            setText('displayTotal', math.totalPayable.toFixed(2));
            setText('repaymentDate', math.endDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }));
        }

    } else {
        // Withdrawal Mode
        setText('preview-subtitle', "SIP WITHDRAWAL REQUEST");
        setText('previewAmountLabel', "Withdraw Amount:");

        show('withdrawFields'); hide('loanFields');
        hide('loanCalculations'); hide('loanNotice'); show('withdrawNotice');
        hide('loanRequestText');

        setText('displayMemId', member.membershipId || 'N/A');
        setText('displayJoinDate', member.joiningDate || 'N/A');
        setText('displayAddress', member.address || 'N/A');
    }

    // D. Signature
    if (member.signatureUrl) {
        setImg('displaySignature', member.signatureUrl);
        hide('noSignatureText');
    } else {
        hide('displaySignature'); show('noSignatureText');
    }

    // E. Manual/Auto Documents
    handleDocuments(member, manualImage);

    // F. Show Overlay (Crucial Step)
    preview.inputPage.classList.add('hidden');
    preview.overlay.style.display = 'flex';

    // Scale for Mobile
    autoScalePaper();
    window.scrollTo(0, 0);
    console.log("✅ Preview Displayed");
}

// --- HELPER FUNCTIONS ---

function setText(id, val) { document.getElementById(id).innerText = val; }
function show(id) { document.getElementById(id).classList.remove('hidden'); }
function hide(id) { document.getElementById(id).classList.add('hidden'); }

// Handle Images with CORS Proxy (Fixes Tainted Canvas)
function setImg(id, url) {
    const el = document.getElementById(id);
    if (url && url.length > 5) {
        // Using weserv.nl to prevent CORS issues during download
        const proxyUrl = `https://images.weserv.nl/?url=${url.replace(/^https?:\/\//, '')}`;
        el.src = proxyUrl;
        el.classList.remove('hidden');
    } else {
        el.src = '';
        el.classList.add('hidden');
    }
}

function handleDocuments(member, manualFile) {
    const docSection = document.getElementById('docSection');

    if (manualFile) {
        const reader = new FileReader();
        reader.onload = e => {
            document.getElementById('docFrontImg').src = e.target.result;
            // Back image from profile if exists
            if (member.documentBackUrl) setImg('docBackImg', member.documentBackUrl);
            docSection.classList.remove('hidden');
        };
        reader.readAsDataURL(manualFile);
    } else {
        const front = member.documentFrontUrl || member.documentUrl;
        if (front) {
            setImg('docFrontImg', front);
            if (member.documentBackUrl) setImg('docBackImg', member.documentBackUrl);
            docSection.classList.remove('hidden');
        } else {
            docSection.classList.add('hidden');
        }
    }
}

// 2. Download Logic (Attach listener here)
const downloadBtn = document.getElementById('downloadBtn');
if(downloadBtn) {
    downloadBtn.onclick = async function () {
        console.log("⬇️ Download Started");
        const btn = this;
        btn.disabled = true;
        const originalText = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin animate-spin"></i> Generating...';

        try {
            // Wait for images to render
            const imgs = Array.from(preview.capture.getElementsByTagName('img'));
            await Promise.all(imgs.map(img => {
                if (img.complete) return Promise.resolve();
                return new Promise(r => { img.onload = r; img.onerror = r; });
            }));

            // Short Delay for rendering
            await new Promise(r => setTimeout(r, 500));

            // Reset Transform for clean screenshot
            const currentTransform = preview.scaler.style.transform;
            preview.scaler.style.transform = 'none';
            window.scrollTo(0, 0);

            // Capture
            const canvas = await html2canvas(preview.capture, {
                scale: 2, // High Quality
                useCORS: true, // IMPORTANT for external images
                backgroundColor: '#ffffff',
                scrollY: -window.scrollY
            });

            // Restore View
            preview.scaler.style.transform = currentTransform;

            // Trigger Download
            const link = document.createElement('a');
            const name = document.getElementById('displayName').innerText.replace(/\s/g, '_');
            link.download = `TCF_Slip_${name}.png`;
            link.href = canvas.toDataURL('image/png');
            link.click();

            btn.innerHTML = '<i class="fas fa-check"></i> Done';
            setTimeout(() => {
                btn.disabled = false;
                btn.innerHTML = originalText;
            }, 2000);

        } catch (e) {
            console.error(e);
            alert('Download error: ' + e.message);
            autoScalePaper();
            btn.disabled = false;
            btn.innerHTML = originalText;
        }
    };
}

// Close Button Logic
document.getElementById('closePreviewBtn').onclick = () => {
    preview.overlay.style.display = 'none';
    preview.inputPage.classList.remove('hidden');
};

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
