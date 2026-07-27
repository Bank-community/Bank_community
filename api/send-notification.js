import admin from 'firebase-admin';

export default async function handler(req, res) {
    // 1. CORS Headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();

    try {
        // --- STEP 1: DECODE CREDENTIALS ---
        const base64String = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
        
        if (!base64String) {
            throw new Error("SERVER ERROR: Vercel Environment Variable 'FIREBASE_SERVICE_ACCOUNT_BASE64' is missing.");
        }

        const buffer = Buffer.from(base64String, 'base64');
        const serviceAccountJson = buffer.toString('utf-8');
        const serviceAccount = JSON.parse(serviceAccountJson);

        // --- STEP 2: FORCE RESET (Cache Clear) ---
        if (admin.apps.length > 0) {
            await Promise.all(admin.apps.map(app => app.delete()));
        }

        // --- STEP 3: INITIALIZE (WITH FORCED PROJECT ID) ---
        // 🔥 MAIN FIX: 'projectId' ko alag se likha gaya hai taaki 404 na aaye
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
            projectId: "bank-master-data", 
            databaseURL: "https://bank-master-data-default-rtdb.asia-southeast1.firebasedatabase.app"
        });

        console.log("✅ Firebase Connected for Project: bank-master-data");

        // --- STEP 4: SEND NOTIFICATION ---
        const { title, body, tokens } = req.body;

        if (!tokens || tokens.length === 0) {
            return res.status(400).json({ error: "Tokens list is empty." });
        }

        console.log(`📤 Sending to ${tokens.length} devices...`);

        const response = await admin.messaging().sendMulticast({
            data: {
                title: title || "New Update",
                body: body || "Tap to view",
                url: "/notifications.html" 
            },
            tokens: tokens
        });

        console.log("✅ Success Count:", response.successCount);
        
        // Agar kuch fail hua, to uska reason log karo
        if (response.failureCount > 0) {
            console.log("❌ Failed Example:", response.responses.find(r => !r.success)?.error);
        }

        return res.status(200).json({ 
            success: true, 
            count: response.successCount, 
            failed: response.failureCount 
        });

    } catch (error) {
        console.error("❌ CRITICAL SERVER ERROR:", error);
        // User ko saaf error dikhayein
        return res.status(500).json({ 
            error: error.message,
            suggestion: "Check Vercel Logs for details."
        });
    }
}
