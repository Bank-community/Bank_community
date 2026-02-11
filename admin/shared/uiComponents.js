// shared/uiComponents.js

// --- UI Helper Functions ---

export function openModal(modal) {
    if (!modal) return;
    modal.classList.remove('hidden');
    setTimeout(() => {
        modal.classList.remove('opacity-0');
        const content = modal.querySelector('.modal-content');
        if (content) {
            content.classList.remove('scale-95');
        }
    }, 10);
}

export function closeModal(modal) {
    if (!modal) return;
    const content = modal.querySelector('.modal-content');
    if (content) {
        content.classList.add('scale-95');
    }
    modal.classList.add('opacity-0');
    setTimeout(() => modal.classList.add('hidden'), 300);
}

export function showConfirmation(title, message) {
    return new Promise(resolve => {
        const modal = document.getElementById('confirmModal');
        if (!modal) {
            console.error('Confirmation modal not found!');
            resolve(false);
            return;
        }
        modal.querySelector('#confirmModalTitle').textContent = title;
        modal.querySelector('#confirmModalMessage').textContent = message;
        openModal(modal);

        const okBtn = modal.querySelector('#confirmOkBtn');
        const cancelBtn = modal.querySelector('#confirmCancelBtn');

        // Clean up event listeners to avoid memory leaks
        const cleanup = () => {
            closeModal(modal);
            const newOkBtn = okBtn.cloneNode(true);
            okBtn.parentNode.replaceChild(newOkBtn, okBtn);
            const newCancelBtn = cancelBtn.cloneNode(true);
            cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);
        };

        okBtn.onclick = () => {
            cleanup();
            resolve(true);
        };
        cancelBtn.onclick = () => {
            cleanup();
            resolve(false);
        };
    });
}

// --- UPDATED SHOW TOAST FUNCTION ---
export function showToast(message, isError = false) {
    const toast = document.getElementById("toast");
    if (!toast) return;
    toast.querySelector('#toastMessage').textContent = message;

    // Changes applied:
    // 1. Position: bottom-5 left-5 (Niche se Left side)
    // 2. Size: px-4 py-2 aur text-sm (Chhota aur Compact)
    // 3. Animation: -translate-x-[120%] (Left side chhupa hua)

    toast.className = `fixed bottom-5 left-5 px-4 py-2 rounded-lg text-white text-sm font-medium transition-transform transform z-50 shadow-lg ${isError ? "bg-red-500" : "bg-green-600"} -translate-x-[120%]`;

    // Slide IN (Left se bahar aana)
    setTimeout(() => {
        toast.classList.remove("-translate-x-[120%]");
        toast.classList.add("translate-x-0");
    }, 10);

    // Slide OUT (Wapis Left mein chale jana)
    setTimeout(() => {
        toast.classList.remove("translate-x-0");
        toast.classList.add("-translate-x-[120%]");
    }, 3000);
}

export function setButtonState(button, isLoading, buttonText) {
    if (!button) return;
    const loader = button.querySelector('.loader') || button.querySelector('svg.animate-spin');
    const textSpan = button.querySelector('span:not(.loader)');

    button.disabled = isLoading;
    if (isLoading) {
        if (textSpan) textSpan.style.display = 'none';
        if (loader) loader.classList.remove('hidden');
    } else {
        if (textSpan) {
             textSpan.style.display = 'inline';
             if(buttonText) textSpan.textContent = buttonText;
        }
        if (loader) loader.classList.add('hidden');
    }
}
