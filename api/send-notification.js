import admin from 'firebase-admin';

// --- DIRECT HARDCODED SETUP (ONLY FOR TESTING) ---
const serviceAccount = {
  // 👇 YAHAN APNA PURA JSON PASTE KAREIN (Jo file aapne download ki thi)
  "type": "service_account",
  "project_id": "bank-master-data",
  "private_key_id": "YE_WALA_ID_BHI_JSON_SE_DEKHEIN",
  "private_key": "-----BEGIN PRIVATE KEY-----
MIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQCgt65kyTN0mD8d
1NHkpgZUkzAOUYhNAMZtqoiH4GagWe/Ec5l1S1yWfLhXRan/shFsi07wmqDLieGs
0C7l4BhLImm+vDDFZKt1f3MtOTmejZgAba8q+NxUdPhN+CUHylnznf70bRUASL7T
5XIAIOIpUMwFneYtAhcK2yOseuuCLLyJms4TZDFFVQEIb7MnjF5cRMXlZUIhT2Y/
CSr2BQSoGP9L5j8XvAA++WuLtelUTrvQyAAYp76oQ1z1uXUKSnvyLXDRa82mkXhV
wj8WYm0GuhTdI8oDHzmMogeLnU0SmQilYew/CRpcFMIhtLroZcoD7fvmLxsGytPS
w7HoppHNAgMBAAECggEAF3i2jZM8ImHeYeRut5ZZo/4PospcfhEdaZm3W89gHY3/
msYJL4dPNnkbe5S5zup6FKCZvut44pDjS6znFH0FqeoU3cgNKrQuPY2HTB+oib6D
Eu5HNUmSn/up4cqE2fOURHnFaNFfePhRdOUe9jmB3hJ7NrId52J/6/7KDHVdMgL2
8kjkhDDKr2bryy5LSo9N54lhlnqdoo5u6vv66PE/s9cJzRiksEqsVVWMhFR/cBdD
kiKt47AmRtFkU7wpSYlZZSlDL6lVNSbzUGWp+EIj/YTJURJzpF6KLAU5YOlaVjGC
lnd1JL1srB/V8NHQlh3gkJZ7k/ckV3rkdVKxQXvyvwKBgQDSgREfrVpQ46+0+Nlw
cM+y+FE8fTy6nbxeJFUxlCnMCMTv4hJJ+dWHkdbNPXcTGRvKz8oPA4kL6h+tWxWp
DrKrw5RHIOk4AtZ0TV1qNvcYekKgIhWWRsc821WXC396G5fwmVyaxGSYA2SOiGw7
gUGUuzG2/5b+i8qnhU8cr7GyiwKBgQDDc/r5NlFyJJfDKZ0oWYH8zt+sfB6YIM8o
27QEYJl0kaZVrJXjTha0zamot8nqAPqPEopLw0lTMKAb71frX797GFcvwRIIPfDK
n9qTTNIJW85yMq3ASqIEaFAyFlADPMzanl7Hkz5bFcIWz3T1SaUZ/oQECUUu0RWH
GTEzXSYQBwKBgQCSyOMq5pOa4hnMpNXinReHobXr6xxkuMb4EnfBmaJHnznMWCUO
poKqBRz2gsy8aX7CvoAUVg/DWh96n5AMEa6vLTMBIkbeAsSN1sCz5t4ImIBK71mE
L5iQrBUTvTXH7OPXJum3FglbIsqExUZLfAdB8gJpq/IbT1kh1UhkJXNQnwKBgHBh
VWLJepb4t1H9sWEr5fOoNy+DxkuOQc6qVJ1XtaQywsLsEtq5YZDf17csxaoImgh9
jor1ZEmy4bxuJ80sJnruieLpTibzBmpa82BSgUnkQZWj0geIYhPKrqG99o+F+/uP
p8t0vBu/LPPUoNkQWR/TGbEAa4j5qzkcoQ95dZMtAoGBAKW/gWyEE21pzViLQ2rq
t+9FxkQXerZICNZZpP3mjHhYgl4nu/q8iD+qqb/UeqZBmNvMHLJ3ZgIvkZ+dIFVS
g8HmQzuPfJvX8c3HCUE7xpS1eHD1HEmlzAzG1DqpLO4v/FUMIyKi4l8lb+WrLVrX
EQH3rmHZrsrOHq++7u/aAijo
-----END PRIVATE KEY-----
",
  "client_email": "firebase-adminsdk-fbsvc@bank-master-data.iam.gserviceaccount.com",
  "client_id": "...",
  "auth_uri": "https://accounts.google.com/o/oauth2/auth",
  "token_uri": "https://oauth2.googleapis.com/token",
  "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
  "client_x509_cert_url": "..."
};

if (!admin.apps.length) {
  try {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      databaseURL: "https://bank-master-data-default-rtdb.asia-southeast1.firebasedatabase.app"
    });
    console.log("✅ Firebase Connected via Hardcoded JSON");
  } catch (error) {
    console.error("❌ Init Error:", error.message);
  }
}

export default async function handler(req, res) {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const { title, body, imageUrl, url, tokens } = req.body;

  try {
    const response = await admin.messaging().sendMulticast({
      data: { 
          title: title || "Test Alert", 
          body: body || "Checking notification...", 
          imageUrl: imageUrl || "", 
          url: url || "/notifications.html" 
      },
      tokens: tokens
    });
    
    return res.status(200).json({ success: true, count: response.successCount });

  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
