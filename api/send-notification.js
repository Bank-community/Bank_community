// api/send-notification.js
import admin from 'firebase-admin';

// --- FIREBASE INITIALIZATION (FIXED) ---
if (!admin.apps.length) {
  try {
    if (!process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
      throw new Error("FIREBASE_SERVICE_ACCOUNT_KEY is missing in Vercel!");
    }

    // 1. JSON Parse karein
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);

    // 🔥 MAGIC FIX: Vercel par New Lines (\n) aksar kharab ho jati hain.
    // Ye line unhe wapas sahi kar degi.
    if (serviceAccount.private_key) {
      serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
    }

    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      databaseURL: "https://bank-master-data-default-rtdb.asia-southeast1.firebasedatabase.app"
    });
    
    console.log("✅ Firebase Initialized Correctly");

  } catch (error) {
    console.error("❌ Firebase Init Error:", error.message);
    // Agar init fail hua, to aage badhne ka fayda nahi
    process.env.FIREBASE_INIT_ERROR = error.message; 
  }
}

export default async function handler(req, res) {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  // Agar Init mein error tha, to yahi rok do
  if (process.env.FIREBASE_INIT_ERROR) {
    return res.status(500).json({ error: "Server Config Error: " + process.env.FIREBASE_INIT_ERROR });
  }

  const { title, body, imageUrl, url, tokens } = req.body;

  if (!tokens || tokens.length === 0) {
      return res.status(400).json({ error: "No tokens provided" });
  }

  // Message Payload
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
    // 🔥 Send Message
    const response = await admin.messaging().sendMulticast(message);
    console.log("Sent success count:", response.successCount);
    
    // Response wapas bhejo
    return res.status(200).json({ 
        success: true, 
        count: response.successCount,
        failed: response.failureCount
    });

  } catch (error) {
    console.error("Send Error:", error);
    // Ye error user ko dikhana zaroori hai
    return res.status(500).json({ error: error.message });
  }
}
