// api/send-notification.js
import admin from 'firebase-admin';

if (!admin.apps.length) {
  try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      databaseURL: "https://bank-master-data-default-rtdb.asia-southeast1.firebasedatabase.app"
    });
  } catch (error) {
    console.error("Firebase Init Error:", error);
  }
}

export default async function handler(req, res) {
  // CORS Headers (Zaroori hai taaki Admin panel se call ho sake)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  
  const { title, body, imageUrl, url, tokens } = req.body;

  if (!tokens || tokens.length === 0) {
      return res.status(400).json({ error: "No tokens provided" });
  }

  const message = {
    data: {
      title: title || "New Update",
      body: body || "Check the app for details.",
      url: url || "/notifications.html",
      icon: "https://ik.imagekit.io/kdtvm0r78/1000123791_3ZT7JNENn.jpg",
      imageUrl: imageUrl || ""
    },
    tokens: tokens
  };

  try {
    const response = await admin.messaging().sendMulticast(message);
    return res.status(200).json({ success: true, count: response.successCount });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
