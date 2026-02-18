import admin from 'firebase-admin';

// --- ROBUST FIREBASE INITIALIZATION ---
if (!admin.apps.length) {
  try {
    // Check agar teeno cheezein available hain
    if (!process.env.FIREBASE_PROJECT_ID || !process.env.FIREBASE_CLIENT_EMAIL || !process.env.FIREBASE_PRIVATE_KEY) {
      throw new Error("Missing Firebase Env Variables (Project ID, Email, or Private Key)");
    }

    // 🔥 PRIVATE KEY REPAIR:
    // Ye line tooti hui key ko jodti hai (New lines fix)
    const privateKey = process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n');

    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: privateKey,
      }),
      databaseURL: "https://bank-master-data-default-rtdb.asia-southeast1.firebasedatabase.app"
    });

    console.log("✅ Firebase Initialized via Separate Variables");

  } catch (error) {
    console.error("❌ Firebase Init Error:", error.message);
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
    // Agar Google 404 deta hai, to hum clean error dikhayenge
    return res.status(500).json({ error: error.message });
  }
}
