// api/config.js

export default function handler(request, response) {
  // Yeh function Vercel ke server par chalta hai
  // aur Environment Variables ko access kar sakta hai.
  const firebaseConfig = {
    apiKey: process.env.VITE_FIREBASE_API_KEY,
    authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.VITE_FIREBASE_APP_ID,
  };

  // Yeh config ko JSON format mein browser ko bhej dega.
  response.status(200).json(firebaseConfig);
}
