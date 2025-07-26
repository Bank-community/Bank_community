// File: /api/getAiExplanation.js
// Yeh aapke Vercel project ke liye theek kiya hua serverless function hai.

// Yahan Vercel Environment Variables se aapki saari API keys aa jayengi.
const API_KEYS = [
  process.env.GEMINI_API_KEY_1,
  process.env.GEMINI_API_KEY_2,
  process.env.GEMINI_API_KEY_3,
].filter(key => key); // Yeh kisi bhi undefined key ko hata dega.

let currentKeyIndex = 0;

// Yeh function har baar agli key deta hai.
function getNextApiKey() {
  if (API_KEYS.length === 0) {
    throw new Error("Vercel environment variables mein koi bhi Gemini API key nahi mili.");
  }
  // Abhi wali key lo (CORRECTED LINE)
  const key = API_KEYS[currentKeyIndex];
  // Agli request ke liye index badha do
  currentKeyIndex = (currentKeyIndex + 1) % API_KEYS.length;
  console.log(`Using API Key Index: ${currentKeyIndex}`); // Debugging ke liye
  return key;
}

export default async function handler(req, res) {
  // Kisi bhi origin se request allow karo (CORS)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // CORS ke liye preflight request handle karo
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { promptText } = req.body;
    if (!promptText) {
      return res.status(400).json({ error: 'promptText zaroori hai' });
    }

    // Agli available API key lo
    const apiKey = getNextApiKey();
    
    const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${apiKey}`;

    const payload = {
      contents: [{
        parts: [{
          text: promptText,
        }],
      }],
       "generationConfig": {
        "temperature": 0.7,
        "topK": 1,
        "topP": 1,
        "maxOutputTokens": 2048,
      },
    };

    const apiResponse = await fetch(GEMINI_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!apiResponse.ok) {
      const errorBody = await apiResponse.text();
      console.error('Gemini API Error:', errorBody);
      throw new Error(`Gemini API ne status ${apiResponse.status} ke saath jawab diya`);
    }

    const data = await apiResponse.json();
    
    // Response se text nikalo
    const explanation = data.candidates[0]?.content?.parts[0]?.text || 'Jawab mein koi text nahi mila.';

    res.status(200).json({ explanation });

  } catch (error) {
    console.error('getAiExplanation function mein error:', error);
    res.status(500).json({ error: `Server error: ${error.message}` });
  }
}

