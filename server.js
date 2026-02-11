const express = require('express');
const path = require('path');

const app = express();
const PORT = 5000;

app.use(express.json());

app.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  next();
});

app.get('/api/config', (req, res) => {
  const config = {
    firebase: {
      apiKey: process.env.FIREBASE_API_KEY,
      authDomain: process.env.FIREBASE_AUTH_DOMAIN,
      databaseURL: process.env.FIREBASE_DATABASE_URL,
      projectId: process.env.FIREBASE_PROJECT_ID,
      storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
      messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
      appId: process.env.FIREBASE_APP_ID,
      measurementId: process.env.FIREBASE_MEASUREMENT_ID,
    },
    imgbb: {
      apiKey: process.env.IMGBB_API_KEY,
      formApiKey: process.env.IMGBB_API_KEY_FORM,
    }
  };
  res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate');
  res.status(200).json(config);
});

app.get('/api/firebase-config', (req, res) => {
  const firebaseConfig = {
    apiKey: process.env.FIREBASE_API_KEY,
    authDomain: process.env.FIREBASE_AUTH_DOMAIN,
    databaseURL: process.env.FIREBASE_DATABASE_URL,
    projectId: process.env.FIREBASE_PROJECT_ID,
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.FIREBASE_APP_ID,
    measurementId: process.env.FIREBASE_MEASUREMENT_ID,
  };
  res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate');
  res.status(200).json(firebaseConfig);
});

const admin = require('firebase-admin');

let firebaseInitialized = false;
if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
  try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      databaseURL: "https://bank-master-data-default-rtdb.asia-southeast1.firebasedatabase.app"
    });
    firebaseInitialized = true;
  } catch (error) {
    console.error("Firebase Init Error:", error.message);
  }
}

app.options('/api/send-notification', (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.status(200).end();
});

app.post('/api/send-notification', async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (!firebaseInitialized) {
    return res.status(500).json({ error: 'Firebase not initialized. Set FIREBASE_SERVICE_ACCOUNT_KEY.' });
  }

  try {
    const { token, title, body, url } = req.body;
    if (!token) return res.status(400).json({ error: 'Missing Token' });

    const message = {
      token: token,
      notification: { title, body },
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
    return res.status(200).json({ success: true, id: response });
  } catch (error) {
    console.error('API Error:', error.message);
    return res.status(500).json({ error: error.message });
  }
});

app.use(express.static(path.join(__dirname), {
  setHeaders: (res) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  }
}));

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on http://0.0.0.0:${PORT}`);
});
