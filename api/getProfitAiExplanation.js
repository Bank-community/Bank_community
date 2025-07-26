// /api/getProfitAiExplanation.js
// DEDICATED API FOR THE PROFIT ANALYTICS SYSTEM

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    return response.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    // Step 1: Securely get the PROFIT-SPECIFIC API Key from Vercel.
    const geminiApiKey = process.env.GEMINI_API_KEY_PROFIT;
    
    if (!geminiApiKey) {
      // This error shows if the specific key for the profit system is not set.
      throw new Error('Environment variable GEMINI_API_KEY_PROFIT Vercel mein set nahi hai.');
    }

    // Step 2: Get the prompt from the frontend.
    const { promptText } = request.body;
    if (!promptText) {
      return response.status(400).json({ error: 'Prompt text is required.' });
    }

    // Step 3: Prepare and call the Gemini API.
    const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${geminiApiKey}`;
    const payload = {
      contents: [{
        parts: [{ text: promptText }]
      }]
    };

    const geminiResponse = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    // Step 4: Handle errors from the Gemini API.
    if (!geminiResponse.ok) {
      const errorData = await geminiResponse.json();
      console.error("Gemini API Error (Profit System):", errorData);
      const errorMessage = errorData.error?.message || 'Unknown API error';
      throw new Error(`Gemini API request failed: ${errorMessage}`);
    }

    const data = await geminiResponse.json();

    // Step 5: Extract and send the successful response.
    if (data.candidates && data.candidates[0]?.content.parts[0]?.text) {
      const explanation = data.candidates[0].content.parts[0].text;
      return response.status(200).json({ explanation });
    } else {
      const reason = data.promptFeedback?.blockReason || data.candidates?.[0]?.finishReason || 'Unknown';
      throw new Error(`AI se koi valid response nahi mila. Karan: ${reason}`);
    }

  } catch (error) {
    console.error('Profit AI Backend Error:', error);
    response.status(500).json({ 
        error: 'Server par AI request fail ho gayi.', 
        details: error.message 
    });
  }
}

