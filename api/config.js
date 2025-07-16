// api/config.js

export default function handler(request, response) {
  // Ab hum bina 'VITE_' prefix ke keys ko padh rahe hain
  const firebaseConfig = {
    apiKey: process.env.FIREBASE_API_KEY,
    authDomain: process.env.FIREBASE_AUTH_DOMAIN,
    projectId: process.env.FIREBASE_PROJECT_ID,
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.FIREBASE_APP_ID,
  };

  // Keys ko JSON format mein browser ko bhej dein
  response.status(200).json(firebaseConfig);
}
