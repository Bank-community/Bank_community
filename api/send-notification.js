import admin from 'firebase-admin';

// --- BASE64 DECODING LOGIC ---
if (!admin.apps.length) {
  try {
    if (!process.env.FIREBASE_SERVICE_ACCOUNT_BASE64) {
      throw new Error("FIREBASE_SERVICE_ACCOUNT_BASE64 is missing!");
    }

    // 1. Base64 se wapas JSON string banana
    const buffer = Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64, 'base64');
    const serviceAccountJson = buffer.toString('utf-8');
    
    // 2. JSON Parse karna
    const serviceAccount = JSON.parse(serviceAccountJson);

    console.log("🔑 Decoded Project ID:", serviceAccount.project_id); // Debugging ke liye

    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      databaseURL: "https://bank-master-data-default-rtdb.asia-southeast1.firebasedatabase.app"
    });

    console.log("✅ Firebase Initialized with Base64 Method");

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
    return res.status(500).json({ error: "Server Config Error: " + process.env.FIREBASE_INIT_ERROR });
  }

  const { title, body, imageUrl, url, tokens } = req.body;

  if (!tokens || tokens.length === 0) {
      return res.status(400).json({ error: "No tokens provided" });
  }

  const message = {
    data: {
      title: title || "New Update",
      body: body || "Check app for details",
      url: url || "/notifications.html",
      icon: "https://ik.imagekit.io/kdtvm0r78/1000123791_3ZT7JNENn.jpg",
      imageUrl: imageUrl || ""
    },
    tokens: tokens
  };

  try {
    const response = await admin.messaging().sendMulticast(message);
    return res.status(200).json({ 
        success: true, 
        count: response.successCount,
        failed: response.failureCount
    });
  } catch (error) {
    console.error("Send Error:", error);
    return res.status(500).json({ error: error.message });
  }
}
