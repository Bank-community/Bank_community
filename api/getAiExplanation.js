// api/getAiExplanation.js
// This is a simplified and more robust version to ensure stability.
// It uses the primary API key and provides clearer error messages.

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    return response.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    // Step 1: Securely get the PRIMARY API Key from Vercel Environment Variables.
    const geminiApiKey = process.env.GEMINI_API_KEY_1;
    
    if (!geminiApiKey) {
      // This error will show if the key is not set in Vercel.
      throw new Error('GEMINI_API_KEY_1 Vercel mein set nahi hai.');
    }

    // Step 2: Get the prompt from the frontend.
    const { promptText } = request.body;
    if (!promptText) {
      return response.status(400).json({ error: 'Prompt text is required.' });
    }

    // Step 3: Prepare the API call to Gemini.
    const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${geminiApiKey}`;
    const payload = {
      contents: [{
        parts: [{ text: promptText }]
      }]
    };

    // Step 4: Call the Gemini API.
    const geminiResponse = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    // Step 5: Handle potential errors from the Gemini API itself.
    if (!geminiResponse.ok) {
      const errorData = await geminiResponse.json();
      console.error("Gemini API Error:", errorData);
      const errorMessage = errorData.error?.message || 'Unknown API error';
      // This will send a specific error like "API key not valid" to the frontend.
      throw new Error(`Gemini API request failed: ${errorMessage}`);
    }

    const data = await geminiResponse.json();

    // Step 6: Extract and send the successful response.
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

