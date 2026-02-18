import admin from 'firebase-admin';

// --- BASE64 DECODING LOGIC ---
if (!admin.apps.length) {
  try {
    if (process.env.FIREBASE_SERVICE_ACCOUNT_BASE64) {
      const buffer = Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64, 'base64');
      const serviceAccount = JSON.parse(buffer.toString('utf-8'));

      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        databaseURL: "https://bank-master-data-default-rtdb.asia-southeast1.firebasedatabase.app"
      });
    }
  } catch (error) {
    console.error("Init Error:", error);
  }
}

export default async function handler(req, res) {
  // ... (Baaki code same rahega) ...
  // Niche ka code wahi purana wala use karein jo 1-10 date check karta hai
  const today = new Date();
  const day = today.getDate();

  if (day < 1 || day > 10) {
      return res.status(200).json({ message: "No reminders today (Not 1-10)." });
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
