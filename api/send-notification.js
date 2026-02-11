// api/send-notification.js (FINAL & CORRECTED)
const admin = require('firebase-admin');

// 1. Firebase Setup
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
  // 🔥🔥🔥 YAHAN HAI WO CODE (Sabse upar) 🔥🔥🔥
  
  // 1. Browser ko permission do (CORS Allow)
  res.setHeader('Access-Control-Allow-Origin', '*'); 
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // 2. Agar browser sirf check karne aya hai (Preflight), to "Haan" bol do
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // --- Main Code Shuru ---

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { token, title, body, url } = req.body;

    if (!token) return res.status(400).json({ error: 'Missing Token' });

    const message = {
      token: token,
      notification: {
        title: title,
        body: body
      },
      data: {
        url: url || '/notifications.html',
        click_action: url || '/notifications.html'
      },
      android: {
        priority: 'high',
        notification: {
          sound: 'default',
          icon: 'https://ik.imagekit.io/kdtvm0r78/1000123791_3ZT7JNENn.jpg'
        }
      }
    };

    const response = await admin.messaging().send(message);
    console.log("Success:", response);
    return res.status(200).json({ success: true, id: response });

  } catch (error) {
    console.error('API Error:', error);
    return res.status(500).json({ error: error.message });
  }
}
