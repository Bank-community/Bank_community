import admin from 'firebase-admin';

export default async function handler(req, res) {
    // 1. CORS Headers (Browser ko permission dene ke liye)
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // Preflight request handle karein
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    try {
        // 🔥 FORCE RESET SYSTEM (Jabardasti Cache Clear)
        // Agar pehle se koi connection atka hai, to usse delete karo
        if (admin.apps.length > 0) {
            await Promise.all(admin.apps.map(app => app.delete()));
            console.log("♻️ Purana Firebase Cache Clear kar diya gaya.");
        }

        // 2. Credentials Load Karein (Base64 Variable se)
        // Ye "Secret Detected" error se bachayega
        const base64String = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
        
        if (!base64String) {
            throw new Error("Vercel Settings me 'FIREBASE_SERVICE_ACCOUNT_BASE64' nahi mila!");
        }

        // Base64 ko wapas JSON banaya
        const buffer = Buffer.from(base64String, 'base64');
        const serviceAccountJson = buffer.toString('utf-8');
        const serviceAccount = JSON.parse(serviceAccountJson);

        // 3. Fresh Connection Banayein
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
            databaseURL: "https://bank-master-data-default-rtdb.asia-southeast1.firebasedatabase.app"
        });
        console.log("✅ Naya Fresh Connection Ban Gaya!");

        // 4. Notification Data Check Karein
        const { title, body, imageUrl, url, tokens } = req.body;

        if (!tokens || tokens.length === 0) {
            return res.status(400).json({ error: "Tokens missing hain!" });
        }

        console.log(`📤 ${tokens.length} users ko bhej rahe hain...`);

        // 5. Notification Bhejein
        const response = await admin.messaging().sendMulticast({
            data: { 
                title: title || "New Update", 
                body: body || "Check app", 
                imageUrl: imageUrl || "", 
                url: url || "/notifications.html" 
            },
            tokens: tokens
        });
        
        console.log("✅ Success Count:", response.successCount);
        return res.status(200).json({ success: true, count: response.successCount });

    } catch (error) {
        console.error("❌ Critical Error:", error.message);
        return res.status(500).json({ 
            error: error.message,
            step: "Check Vercel Environment Variable (Base64)" 
        });
    }
}
