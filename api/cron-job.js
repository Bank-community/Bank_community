// api/cron-job.js
import admin from 'firebase-admin';

// --- FIREBASE INIT (WITH FIX) ---
if (!admin.apps.length) {
  try {
    if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
      const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
      
      // 🔥 MAGIC FIX For Private Key
      if (serviceAccount.private_key) {
        serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
      }

      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        databaseURL: "https://bank-master-data-default-rtdb.asia-southeast1.firebasedatabase.app"
      });
    }
  } catch (error) {
    console.error("Firebase Init Error:", error);
  }
}

export default async function handler(req, res) {
  const today = new Date();
  const day = today.getDate();

  // 1-10 Date Check
  if (day < 1 || day > 10) {
      return res.status(200).json({ message: "Aaj reminder ka din nahi hai." });
  }

  try {
      const db = admin.database();
      const membersSnap = await db.ref('members').once('value');
      const members = membersSnap.val() || {};
      const tokensToSend = [];

      Object.values(members).forEach(member => {
          if (member.currentMonthSIPStatus !== 'Paid' && member.notificationTokens) {
              const tokens = Object.keys(member.notificationTokens);
              if (tokens.length > 0) tokensToSend.push(tokens[tokens.length - 1]);
          }
      });

      if (tokensToSend.length === 0) return res.json({ message: "No pending members." });

      const message = {
          data: {
            title: "🔔 SIP Payment Reminder",
            body: `Aaj ${day} taarik hai. Kripya samay par SIP jama karein.`,
            url: '/qr.html?type=sip',
            icon: 'https://ik.imagekit.io/kdtvm0r78/1000123791_3ZT7JNENn.jpg'
          },
          tokens: tokensToSend
      };

      const response = await admin.messaging().sendMulticast(message);
      return res.status(200).json({ success: true, count: response.successCount });

  } catch (error) {
      return res.status(500).json({ error: error.message });
  }
}
