// api/cron-job.js
const admin = require('firebase-admin');

// 1. Firebase Initialize (Agar nahi hai to)
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
  // Security: Sirf Vercel Cron isko call kar sake
  const authHeader = req.headers['authorization'];
  if (req.headers.host.includes('localhost') === false && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      // Note: Vercel settings me CRON_SECRET set karna optional hai lekin recommended hai.
      // Abhi ke liye hum ise open rakhte hain, ya aap bas date check lagayein.
  }

  const today = new Date();
  const day = today.getDate(); // Aaj ki taarik (1-31)

  // ✅ LOGIC: Sirf 1 se 10 taarik ke beech reminder bhejo
  if (day < 1 || day > 10) {
      return res.status(200).json({ message: "Aaj reminder ka din nahi hai (Not 1-10)." });
  }

  try {
      console.log(`📅 Processing SIP Reminders for Date: ${day}`);

      // 1. Database se Members nikalo
      const db = admin.database();
      const membersSnap = await db.ref('members').once('value');
      const members = membersSnap.val() || {};

      const tokensToSend = [];

      // 2. Filter karo: Kiska Paisa Baaki Hai?
      Object.values(members).forEach(member => {
          if (member.currentMonthSIPStatus !== 'Paid' && member.notificationTokens) {
              const tokens = Object.keys(member.notificationTokens);
              // Sabse latest token lo
              if (tokens.length > 0) tokensToSend.push(tokens[tokens.length - 1]);
          }
      });

      if (tokensToSend.length === 0) {
          return res.status(200).json({ message: "Koi pending member nahi mila." });
      }

      // 3. Notification Bhejo
      const message = {
          data: {
            title: "🔔 SIP Payment Reminder",
            body: `Aaj ${day} taarik hai. Kripya 10 taarik se pehle apni SIP jama karein.`,
            url: '/qr.html?type=sip',
            icon: 'https://ik.imagekit.io/kdtvm0r78/1000123791_3ZT7JNENn.jpg'
          },
          tokens: tokensToSend
      };

      const response = await admin.messaging().sendMulticast(message);
      
      return res.status(200).json({ 
          success: true, 
          sentCount: response.successCount, 
          failedCount: response.failureCount 
      });

  } catch (error) {
      console.error("Cron Job Error:", error);
      return res.status(500).json({ error: error.message });
  }
}
