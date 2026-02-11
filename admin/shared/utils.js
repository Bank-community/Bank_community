// shared/utils.js

import { showToast } from './uiComponents.js';

export async function uploadImage(file) {
    const PRIVATE_KEY = "private_DTe1eFnHCsh8oBkKhpcFTS381+c=";
    const ENDPOINT = "https://upload.imagekit.io/api/v1/files/upload";

    if (!file) return null;

    const formData = new FormData();
    formData.append('file', file);
    formData.append('fileName', file.name || "uploaded_image");
    formData.append('useUniqueFileName', 'true');

    try {
        const res = await fetch(ENDPOINT, {
            method: 'POST',
            headers: {
                'Authorization': 'Basic ' + btoa(PRIVATE_KEY + ":")
            },
            body: formData
        });

        const json = await res.json();
        if (!res.ok) throw new Error(json.message || 'Image upload failed');
        return json.url; 
    } catch (err) {
        console.error('Image upload failed:', err);
        showToast('Image upload failed: ' + err.message, true);
        return null;
    }
}