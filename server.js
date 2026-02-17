const express = require('express');
const path = require('path');
const cron = require('node-cron'); // Automation ke liye
const cors = require('cors');
const admin = require('firebase-admin');

const app = express();
const PORT = 5000;

// Middleware
app.use(cors()); 
app.use(express.json());

// --- FIREBASE CONNECTION (Service Account Key Required) ---
// Note: Bina Service Account Key ke notification nahi jayega.
let firebaseInitialized = false;

if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
  try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      databaseURL: "https://bank-master-data-default-rtdb.asia-southeast1.firebasedatabase.app"
    });
    firebaseInitialized = true;
    console.log("✅ Firebase Connected Successfully");
  } catch (error) {
    console.error("❌ Firebase Init Error:", error.message);
  }
} else {
    console.warn("⚠️ Warning: FIREBASE_SERVICE_ACCOUNT_KEY missing. Notifications won't work.");
}

// --- 🤖 AUTOMATION LOGIC (CRON JOB) ---
// Time: Har roz Subah 10:00 AM execute hoga
cron.schedule('0 10 * * *', async () => {
    console.log("⏰ Daily Cron Job Started...");
    
    if (!firebaseInitialized) return;

    const today = new Date();
    const day = today.getDate(); // 1 se 31

    // RULE: Sirf 1 se 10 taarik ke beech reminder bhejna hai
    if (day >= 1 && day <= 10) {
        console.log(`📅 Date is ${day}, Sending Automatic SIP Reminders...`);
        
        try {
            // 1. Database se users nikalo
            const membersSnap = await admin.database().ref('members').once('value');
            const members = membersSnap.val() || {};

            const tokensToSend = [];

            Object.values(members).forEach(member => {
                // Logic: Agar Payment "Paid" nahi hai, tabhi reminder bhejo
                if (member.currentMonthSIPStatus !== 'Paid' && member.notificationTokens) {
                    const tokens = Object.keys(member.notificationTokens);
                    if(tokens.length > 0) tokensToSend.push(tokens[tokens.length - 1]); // Latest token
                }
            });

            if (tokensToSend.length > 0) {
                // 2. Notification Bhejo
                const message = {
                    notification: {
                        title: "🔔 SIP Payment Reminder",
                        body: `Aaj ${day} taarik hai. Kripya apni monthly SIP jama karein.`
                    },
                    data: { url: '/qr.html?type=sip' }, 
                    tokens: tokensToSend
                };

                const response = await admin.messaging().sendMulticast(message);
                console.log(`✅ Sent ${response.successCount} auto-reminders.`);
            } else {
                console.log("ℹ️ No pending members found with tokens.");
            }

        } catch (error) {
            console.error("Auto-Notification Error:", error);
        }
    } else {
        console.log(`📅 Date is ${day}. No SIP reminders scheduled (Only 1-10th).`);
    }
});

// --- 📡 API ROUTES ---

// 1. Config Route (Purana wala, same rahega)
app.get('/api/firebase-config', (req, res) => {
  res.json({
    apiKey: process.env.FIREBASE_API_KEY,
    authDomain: process.env.FIREBASE_AUTH_DOMAIN,
    databaseURL: process.env.FIREBASE_DATABASE_URL,
    projectId: process.env.FIREBASE_PROJECT_ID,
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.FIREBASE_APP_ID
  });
});

// 2. Manual Notification Sender (Admin Panel Isko Call Karega)
app.post('/api/send-notification', async (req, res) => {
  if (!firebaseInitialized) return res.status(500).json({ error: 'Server DB not connected' });

  const { token, title, body, imageUrl, url } = req.body;

  // Message Structure
  const message = {
    notification: {
      title: title || "TCF Update",
      body: body || "Check new updates in the app.",
    },
    data: {
      url: url || '/notifications.html',
      click_action: url || '/notifications.html'
    },
    android: {
      priority: 'high',
      notification: {
        sound: 'default',
        icon: 'https://ik.imagekit.io/kdtvm0r78/1000123791_3ZT7JNENn.jpg',
        imageUrl: imageUrl || null
      }
    }
  };

  try {
    // Agar single token hai (Specific User)
    if (token) {
        message.token = token;
        await admin.messaging().send(message);
    } 
    // Agar sabko bhejna hai (Topic) - Future Use
    else if (req.body.topic) {
        message.topic = req.body.topic;
        await admin.messaging().send(message);
    }
    
    res.status(200).json({ success: true });
  } catch (error) {
    console.error("Send Error:", error);
    res.status(500).json({ error: error.message });
  }
});

// Serve Admin & User Files
app.use(express.static(path.join(__dirname))); 

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on http://0.0.0.0:${PORT}`);
});
