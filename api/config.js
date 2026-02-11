// api/config.js
export default function handler(req, res) {
  // CORS Headers (Browser ko permission dene ke liye)
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // Yahan wohi Config bhejo jo Frontend ko chahiye
  const config = {
    apiKey: process.env.FIREBASE_API_KEY || "AIzaSyBVCDW0Q8YaTPz_MO9FTve1FaPu42jtO2c",
    authDomain: "bank-master-data.firebaseapp.com",
    databaseURL: "https://bank-master-data-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "bank-master-data",
    storageBucket: "bank-master-data.firebasestorage.app",
    messagingSenderId: "778113641069",
    appId: "1:778113641069:web:f2d584555dee89b8ca2d64",
    // VAPID Key Notification ke liye
    vapidKey: "BE1NgqUcrYaBxWxd0hRrtW7wES0PJ-orGaxlGVj-oT1UZyJwLaaAk7z6KczQ2ZrSy_XjSwkL6WjpX_gHMpXPp3M"
  };

  res.status(200).json(config);
}
