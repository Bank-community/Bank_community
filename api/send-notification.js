// api/send-notification.js (DATA-ONLY MODE)
const admin = require('firebase-admin');

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
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*'); 
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  try {
    const { token, title, body, url } = req.body;
    if (!token) return res.status(400).json({ error: 'Missing Token' });

    // 🔥 CHANGE: Hum 'notification' key nahi bhejenge.
    // Sab kuch 'data' ke andar bhejenge taaki SW control le sake.
    const message = {
      token: token,
      data: {
        title: title || 'Alert',
        body: body || 'New update',
        url: url || '/notifications.html',
        icon: 'https://ik.imagekit.io/kdtvm0r78/1000123791_3ZT7JNENn.jpg',
        click_action: '/notifications.html'
      },
      android: {
        priority: 'high'
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
