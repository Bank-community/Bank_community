// api/send-notification.js (CORS FIXED v2)
const admin = require('firebase-admin');

// 1. Firebase Init (Cache handled)
if (!admin.apps.length) {
  try {
    // Vercel Environment Variable se Key lein
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
    
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      // Apna Database URL yahan confirm karein
      databaseURL: "https://bank-master-data-default-rtdb.asia-southeast1.firebasedatabase.app"
    });
  } catch (error) {
    console.error("Firebase Init Error:", error);
  }
}

export default async function handler(req, res) {
  // --- 🔥 CORS FIX (महत्वपूर्ण बदलाव) ---
  // '*' ka matlab hai kisi bhi device se request aane do
  res.setHeader('Access-Control-Allow-Origin', '*'); 
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Preflight Check (Browser pehle ye check karta hai)
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Sirf POST request allow karein
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

    // Firebase ko message bhejo
    const response = await admin.messaging().send(message);
    console.log("Notification Sent:", response);
    
    return res.status(200).json({ success: true, id: response });

  } catch (error) {
    console.error('API Error:', error);
    return res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
}
