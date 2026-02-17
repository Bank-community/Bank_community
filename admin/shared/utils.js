// shared/utils.js
import { showToast } from './uiComponents.js';

export async function uploadImage(file) {
    if (!file) return null;

    // 1. File ko Base64 mein convert karein
    const toBase64 = (file) => new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result);
        reader.onerror = error => reject(error);
    });

    try {
        showToast("Uploading image...");
        const base64File = await toBase64(file);

        // 2. Hamari Vercel API ko bhejein
        const res = await fetch('/api/upload-image', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                file: base64File,
                fileName: file.name || "uploaded_image"
            })
        });

        const json = await res.json();

        if (!res.ok) throw new Error(json.error || 'Upload failed');
        
        // showToast("Image uploaded!", false); // Optional
        return json.url; 

    } catch (err) {
        console.error('Image upload failed:', err);
        showToast('Upload Error: ' + err.message, true);
        return null;
    }
}
