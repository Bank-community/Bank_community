// api/send-notification.js
const admin = require('firebase-admin');

// Environment Variable se Key nikalo
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: "https://bank-community-loan-default-rtdb.firebaseio.com" // Yahan apna DB URL check kar lena
  });
}

export default async function handler(req, res) {
  // Sirf POST request allow karo
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { token, title, body, url } = req.body;

  if (!token || !title || !body) {
    return res.status(400).json({ error: 'Missing Data' });
  }

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
        icon: 'https://ik.imagekit.io/kdtvm0r78/1000123791_3ZT7JNENn.jpg' // App Icon
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
