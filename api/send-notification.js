import admin from 'firebase-admin';

// 1. Firebase Admin SDK Initialization
if (!admin.apps.length) {
    try {
        admin.initializeApp({
            credential: admin.credential.cert({
                projectId: process.env.FIREBASE_PROJECT_ID,
                clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
                // Replace \n with actual line breaks for the private key
                privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
            }),
        });
    } catch (error) {
        console.error('Firebase Admin Initialization Error:', error);
    }
}

export default async function handler(req, res) {
    // 2. CORS Headers (ताकि तुम्हारा लोकल मोबाइल एडमिन पैनल भी इसे कॉल कर सके)
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed. Use POST.' });
    }

    const { token, title, body, url } = req.body;

    // 3. Validation
    if (!token || !title || !body) {
        return res.status(400).json({ error: 'Missing required fields (token, title, body)' });
    }

    try {
        // 4. Notification Payload
        const message = {
            notification: {
                title: title,
                body: body,
            },
            webpush: {
                fcmOptions: {
                    // अगर यूजर नोटिफिकेशन पर क्लिक करे, तो यह लिंक खुलेगा
                    link: url || 'https://www.trustcf.sbs/', 
                },
            },
            token: token,
        };

        // 5. Send Push Notification
        const response = await admin.messaging().send(message);
        console.log('Successfully sent message:', response);
        return res.status(200).json({ success: true, messageId: response });

    } catch (error) {
        console.error('Error sending push notification:', error);
        return res.status(500).json({ error: error.message });
    }
}