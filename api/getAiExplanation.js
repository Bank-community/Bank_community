// /api/getAiExplanation.js
// UPDATED & ENHANCED VERSION
// This version intelligently selects the API key based on the request source.

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    return response.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    // Step 1: Get the prompt and the source from the frontend.
    const { promptText, source } = request.body;
    if (!promptText) {
      return response.status(400).json({ error: 'Prompt text is required.' });
    }

    // Step 2: Intelligently select the API Key.
    let geminiApiKey;
    let apiKeyName;

    if (source === 'profit_system') {
      // Use the specific key for the profit analytics system.
      apiKeyName = 'GEMINI_API_KEY';
      geminiApiKey = process.env.GEMINI_API_KEY;
    } else {
      // Use the default/primary key for all other requests.
      apiKeyName = 'GEMINI_API_KEY_1';
      geminiApiKey = process.env.GEMINI_API_KEY_1;
    }
    
    // Step 3: Securely validate that the chosen API Key is set in Vercel.
    if (!geminiApiKey) {
      // This error will show if the required key is not set in Vercel.
      throw new Error(`API Key Error: Environment variable '${apiKeyName}' Vercel mein set nahi hai.`);
    }

    // Step 4: Prepare the API call to Gemini.
    const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${geminiApiKey}`;
    const payload = {
      contents: [{
        parts: [{ text: promptText }]
      }]
    };

    // Step 5: Call the Gemini API.
    const geminiResponse = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    // Step 6: Handle potential errors from the Gemini API itself.
    if (!geminiResponse.ok) {
      const errorData = await geminiResponse.json();
      console.error("Gemini API Error:", errorData);
      const errorMessage = errorData.error?.message || 'Unknown API error';
      // This will send a specific error like "API key not valid" or "quota exceeded" to the frontend.
      throw new Error(`Gemini API request failed: ${errorMessage}`);
    }

    const data = await geminiResponse.json();

    // Step 7: Extract and send the successful response.
    if (data.candidates && data.candidates[0]?.content.parts[0]?.text) {
      const explanation = data.candidates[0].content.parts[0].text;
      return response.status(200).json({ explanation });
    } else {
      // Handle cases where the response might be blocked for safety reasons.
      const reason = data.promptFeedback?.blockReason || data.candidates?.[0]?.finishReason || 'Unknown';
      throw new Error(`AI se koi valid response nahi mila. Karan: ${reason}`);
    }

  } catch (error) {
    // This is the final catch-all for any server-side error.
    console.error('AI Backend Error:', error);
    response.status(500).json({ 
        error: 'Server par AI request fail ho gayi.', 
        details: error.message // This will show the specific error reason.
    });
  }
}

