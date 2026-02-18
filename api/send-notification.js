import admin from 'firebase-admin';

if (!admin.apps.length) {
  try {
    const base64String = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
    
    if (!base64String) {
        throw new Error("Vercel Variable 'FIREBASE_SERVICE_ACCOUNT_BASE64' missing!");
    }

    // 🔥 DECODING LOGIC (Ab ye 100% chalega)
    // Base64 -> Text -> JSON Object
    const buffer = Buffer.from(base64String, 'base64');
    const serviceAccountJson = buffer.toString('utf-8');
    const serviceAccount = JSON.parse(serviceAccountJson);

    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      databaseURL: "https://bank-master-data-default-rtdb.asia-southeast1.firebasedatabase.app"
    });
    
    console.log("✅ Firebase Initialized Successfully!");

  } catch (error) {
    console.error("❌ Init Error:", error.message);
    process.env.FIREBASE_INIT_ERROR = error.message;
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  
  if (process.env.FIREBASE_INIT_ERROR) {
      return res.status(500).json({ error: "Config Error: " + process.env.FIREBASE_INIT_ERROR });
  }

  const { title, body, imageUrl, url, tokens } = req.body;

  try {
    const response = await admin.messaging().sendMulticast({
      data: { 
          title: title || "New Update", 
          body: body || "Tap to open", 
          imageUrl: imageUrl || "", 
          url: url || "/notifications.html" 
      },
      tokens: tokens
    });
    
    return res.status(200).json({ success: true, count: response.successCount });

  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
