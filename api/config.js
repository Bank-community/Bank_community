// File Path: /api/config.js

// यह एक Vercel सर्वरलेस फंक्शन है।
// यह सर्वर पर चलता है, यूजर के ब्राउज़र में नहीं।
export default function handler(request, response) {
  
  // process.env सुरक्षित रूप से Vercel डैशबोर्ड में सेट किए गए आपके 
  // Environment Variables को एक्सेस करता है।
  const config = {
    firebase: {
      apiKey: process.env.FIREBASE_API_KEY,
      authDomain: process.env.FIREBASE_AUTH_DOMAIN,
      databaseURL: process.env.FIREBASE_DATABASE_URL,
      projectId: process.env.FIREBASE_PROJECT_ID,
      storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
      messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
      appId: process.env.FIREBASE_APP_ID,
      measurementId: process.env.FIREBASE_MEASUREMENT_ID,
    },
    imgbb: {
      // एडमिन पैनल के लिए पुरानी API Key
      apiKey: process.env.IMGBB_API_KEY,
      // लोन फॉर्म के लिए नई API Key
      formApiKey: process.env.IMGBB_API_KEY_FORM,
    }
  };

  // हम कॉन्फ़िगरेशन को JSON रेस्पॉन्स के रूप में भेजते हैं।
  response.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate');
  response.status(200).json(config);
}

