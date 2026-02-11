// api/send-notification.js (CORS ENABLED)
const admin = require('firebase-admin');

// 1. Service Account Setup
if (!admin.apps.length) {
  try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      // Apna database URL sahi se check kar lena
      databaseURL: "https://bank-master-data-default-rtdb.asia-southeast1.firebasedatabase.app"
    });
  } catch (error) {
    console.error("Firebase Init Error:", error);
  }
}

export default async function handler(req, res) {
  // 2. CORS HEADERS (Permission Code) - Localhost se baat karne ke liye zaroori hai
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*'); // '*' ka matlab kisi bhi device se allow karo
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  // Browser pehle OPTIONS request bhejta hai check karne ke liye
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // 3. Sirf POST request allow karo
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { token, title, body, url } = req.body;

  if (!token || !title || !body) {
    return res.status(400).json({ error: 'Missing Data' });
  }

  // 4. Message Payload
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
        channelId: 'default',
        icon: 'https://ik.imagekit.io/kdtvm0r78/1000123791_3ZT7JNENn.jpg'
      }
    }
  };

  try {
    const response = await admin.messaging().send(message);
    console.log('Successfully sent message:', response);
    return res.status(200).json({ success: true, response });
  } catch (error) {
    console.error('Error sending message:', error);
    return res.status(500).json({ error: error.message });
  }
}
