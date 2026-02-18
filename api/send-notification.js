import admin from 'firebase-admin';

// 🔥 DIRECT HARDCODED CREDENTIALS (Ye 100% chalega)
const serviceAccount = {
  "type": "service_account",
  "project_id": "bank-master-data",
  "private_key_id": "7b53f9d73b48f68b18b7d99d4927ca28712e0b4a",
  // Niche wali line dhyan se dekhein, ye wahi key hai jo aapne bheji thi
  "private_key": "-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQCgt65kyTN0mD8d\n1NHkpgZUkzAOUYhNAMZtqoiH4GagWe/Ec5l1S1yWfLhXRan/shFsi07wmqDLieGs\n0C7l4BhLImm+vDDFZKt1f3MtOTmejZgAba8q+NxUdPhN+CUHylnznf70bRUASL7T\n5XIAIOIpUMwFneYtAhcK2yOseuuCLLyJms4TZDFFVQEIb7MnjF5cRMXlZUIhT2Y/\nCSr2BQSoGP9L5j8XvAA++WuLtelUTrvQyAAYp76oQ1z1uXUKSnvyLXDRa82mkXhV\nwj8WYm0GuhTdI8oDHzmMogeLnU0SmQilYew/CRpcFMIhtLroZcoD7fvmLxsGytPS\nw7HoppHNAgMBAAECggEAF3i2jZM8ImHeYeRut5ZZo/4PospcfhEdaZm3W89gHY3/\nmsYJL4dPNnkbe5S5zup6FKCZvut44pDjS6znFH0FqeoU3cgNKrQuPY2HTB+oib6D\nEu5HNUmSn/up4cqE2fOURHnFaNFfePhRdOUe9jmB3hJ7NrId52J/6/7KDHVdMgL2\n8kjkhDDKr2bryy5LSo9N54lhlnqdoo5u6vv66PE/s9cJzRiksEqsVVWMhFR/cBdD\nkiKt47AmRtFkU7wpSYlZZSlDL6lVNSbzUGWp+EIj/YTJURJzpF6KLAU5YOlaVjGC\nlnd1JL1srB/V8NHQlh3gkJZ7k/ckV3rkdVKxQXvyvwKBgQDSgREfrVpQ46+0+Nlw\ncM+y+FE8fTy6nbxeJFUxlCnMCMTv4hJJ+dWHkdbNPXcTGRvKz8oPA4kL6h+tWxWp\nDrKrw5RHIOk4AtZ0TV1qNvcYekKgIhWWRsc821WXC396G5fwmVyaxGSYA2SOiGw7\ngUGUuzG2/5b+i8qnhU8cr7GyiwKBgQDDc/r5NlFyJJfDKZ0oWYH8zt+sfB6YIM8o\n27QEYJl0kaZVrJXjTha0zamot8nqAPqPEopLw0lTMKAb71frX797GFcvwRIIPfDK\nn9qTTNIJW85yMq3ASqIEaFAyFlADPMzanl7Hkz5bFcIWz3T1SaUZ/oQECUUu0RWH\nGTEzXSYQBwKBgQCSyOMq5pOa4hnMpNXinReHobXr6xxkuMb4EnfBmaJHnznMWCUO\npoKqBRz2gsy8aX7CvoAUVg/DWh96n5AMEa6vLTMBIkbeAsSN1sCz5t4ImIBK71mE\nL5iQrBUTvTXH7OPXJum3FglbIsqExUZLfAdB8gJpq/IbT1kh1UhkJXNQnwKBgHBh\nVWLJepb4t1H9sWEr5fOoNy+DxkuOQc6qVJ1XtaQywsLsEtq5YZDf17csxaoImgh9\njor1ZEmy4bxuJ80sJnruieLpTibzBmpa82BSgUnkQZWj0geIYhPKrqG99o+F+/uP\np8t0vBu/LPPUoNkQWR/TGbEAa4j5qzkcoQ95dZMtAoGBAKW/gWyEE21pzViLQ2rq\nt+9FxkQXerZICNZZpP3mjHhYgl4nu/q8iD+qqb/UeqZBmNvMHLJ3ZgIvkZ+dIFVS\ng8HmQzuPfJvX8c3HCUE7xpS1eHD1HEmlzAzG1DqpLO4v/FUMIyKi4l8lb+WrLVrX\nEQH3rmHZrsrOHq++7u/aAijo\n-----END PRIVATE KEY-----\n",
  "client_email": "firebase-adminsdk-fbsvc@bank-master-data.iam.gserviceaccount.com",
  "client_id": "111932878263789322977",
  "auth_uri": "https://accounts.google.com/o/oauth2/auth",
  "token_uri": "https://oauth2.googleapis.com/token",
  "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
  "client_x509_cert_url": "https://www.googleapis.com/robot/v1/metadata/x509/firebase-adminsdk-fbsvc%40bank-master-data.iam.gserviceaccount.com"
};

// --- Initialization Logic ---
// Hum ek naya naam denge 'notifyApp' taaki purana wala clash na kare
if (!admin.apps.length) {
    try {
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
            databaseURL: "https://bank-master-data-default-rtdb.asia-southeast1.firebasedatabase.app"
        });
        console.log("✅ Firebase Initialized with HARDCODED credentials");
    } catch (e) {
        console.error("❌ Init Error:", e.message);
    }
}

export default async function handler(req, res) {
    // 1. CORS Headers (Security bypass)
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // 2. Preflight request check
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    const { title, body, imageUrl, url, tokens } = req.body;

    // 3. Validation
    if (!tokens || tokens.length === 0) {
        return res.status(400).json({ error: "Tokens list is empty!" });
    }

    try {
        console.log(`📤 Sending to ${tokens.length} devices...`);
        
        // 4. Send Multicast
        const response = await admin.messaging().sendMulticast({
            data: {
                title: title || "New Notification",
                body: body || "Check the app!",
                imageUrl: imageUrl || "",
                url: url || "/notifications.html"
            },
            tokens: tokens
        });

        console.log("✅ Success Count:", response.successCount);
        
        return res.status(200).json({ 
            success: true, 
            count: response.successCount, 
            failed: response.failureCount 
        });

    } catch (error) {
        console.error("❌ Send Error:", error);
        return res.status(500).json({ 
            error: error.message,
            stack: error.stack // Ye detail bata dega agar kuch fata
        });
    }
}
