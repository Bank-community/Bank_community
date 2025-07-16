// File: /api/firebase-config.js

export default function handler(request, response) {
  // यह फंक्शन सर्वर पर चलता है, इसलिए process.env यहाँ सुरक्षित है।
  const firebaseConfig = {
    apiKey: process.env.FIREBASE_API_KEY,
    authDomain: process.env.FIREBASE_AUTH_DOMAIN,
    databaseURL: process.env.FIREBASE_DATABASE_URL,
    projectId: process.env.FIREBASE_PROJECT_ID,
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.FIREBASE_APP_ID,
    measurementId: process.env.FIREBASE_MEASUREMENT_ID,
  };

  // कॉन्फ़िगरेशन को JSON के रूप में फ्रंट-एंड पर भेजें।
  response.status(200).json(firebaseConfig);
}
