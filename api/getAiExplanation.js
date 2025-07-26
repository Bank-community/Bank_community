// File: /api/getAiExplanation.js
// Yeh aapke Vercel project ke liye saral aur bharosemand serverless function hai.

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

  // Sirf ek API key ka istemal karo jo Vercel mein save hai
  const apiKey = process.env.GEMINI_API_KEY_1;

  if (!apiKey) {
    console.error("GEMINI_API_KEY_1 not found in environment variables.");
    return res.status(500).json({ error: "Server configuration error: API key not found." });
  }

  try {
    const { promptText } = req.body;
    if (!promptText) {
      return res.status(400).json({ error: 'promptText zaroori hai' });
    }
    
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
      const errorBody = await apiResponse.json();
      console.error('Gemini API Error:', errorBody);
      return res.status(apiResponse.status).json(errorBody);
    }

    const data = await apiResponse.json();
    
    const explanation = data.candidates[0]?.content?.parts[0]?.text || 'Jawab mein koi text nahi mila.';

    res.status(200).json({ explanation });

  } catch (error) {
    console.error('getAiExplanation function mein error:', error);
    res.status(500).json({ error: `Server error: ${error.message}` });
  }
}

