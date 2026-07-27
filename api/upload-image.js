// api/upload-image.js

export default async function handler(req, res) {
    // 1. CORS Headers (Security bypass ke liye)
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

    try {
        const { file, fileName } = req.body;

        if (!file) return res.status(400).json({ error: "No file data provided" });

        // 2. ImageKit Config
        const PRIVATE_KEY = "private_DTe1eFnHCsh8oBkKhpcFTS381+c="; // Aapki Key
        const ENDPOINT = "https://upload.imagekit.io/api/v1/files/upload";

        // 3. Prepare Form Data (Node.js style)
        const formData = new URLSearchParams();
        formData.append("file", file); // Base64 string
        formData.append("fileName", fileName);
        formData.append("useUniqueFileName", "true");

        // 4. Send to ImageKit
        const uploadRes = await fetch(ENDPOINT, {
            method: "POST",
            headers: {
                "Authorization": "Basic " + btoa(PRIVATE_KEY + ":"),
                "Content-Type": "application/x-www-form-urlencoded"
            },
            body: formData
        });

        const result = await uploadRes.json();

        if (!uploadRes.ok) {
            throw new Error(result.message || "Upload Failed");
        }

        // 5. Success
        return res.status(200).json({ url: result.url });

    } catch (error) {
        console.error("Upload Error:", error);
        return res.status(500).json({ error: error.message });
    }
}
