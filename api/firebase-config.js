// File Path: /api/firebase-config.js

// This is a Vercel Serverless Function.
// It runs on the server, not in the user's browser.
export default function handler(request, response) {
  
  // process.env securely accesses the Environment Variables you set in the Vercel dashboard.
  // These values are never exposed to the public.
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

  // We send the configuration as a JSON response to the front-end request.
  // The 'Cache-Control' header tells browsers to cache the config for 10 minutes,
  // reducing the number of function invocations.
  response.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate');
  response.status(200).json(firebaseConfig);
}

