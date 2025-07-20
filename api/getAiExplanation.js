// File path: /api/getAiExplanation.js

// This is the main Vercel serverless function for handling AI requests.
export default async function handler(request, response) {
  // We only accept POST requests for security and to receive the prompt.
  if (request.method !== 'POST') {
    return response.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    // Get the Gemini API Key securely from Vercel Environment Variables.
    const geminiApiKey = process.env.GEMINI_API_KEY;
    
    if (!geminiApiKey || geminiApiKey === "YOUR_API_KEY_HERE") {
      throw new Error('Gemini API Key Vercel में सेट नहीं है।');
    }

    // Get the prompt text sent from the frontend.
    const { promptText } = request.body;
    if (!promptText) {
      return response.status(400).json({ error: 'Prompt text is required.' });
    }

    // UPDATED: Using the reliable 'gemini-pro' model endpoint.
    const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${geminiApiKey}`;

    const payload = {
      contents: [{
        parts: [{ text: promptText }]
      }]
    };

    // Call the Gemini API.
    const geminiResponse = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!geminiResponse.ok) {
      const errorData = await geminiResponse.json();
      console.error("Gemini API Error:", errorData);
      throw new Error(`Gemini API request failed: ${errorData.error.message}`);
    }

    const data = await geminiResponse.json();

    // Extract the text from the Gemini response.
    if (data.candidates && data.candidates.length > 0 && data.candidates[0].content.parts.length > 0) {
      const explanation = data.candidates[0].content.parts[0].text;
      // Send the successful response back to the frontend.
      return response.status(200).json({ explanation });
    } else {
      // Handle cases where the response might be blocked or empty
      const blockReason = data.promptFeedback?.blockReason || data.candidates?.[0]?.finishReason || 'Unknown';
      throw new Error(`AI से कोई valid response nahi mila. Karan: ${blockReason}`);
    }

  } catch (error) {
    console.error('AI Backend Error:', error);
    response.status(500).json({ error: 'Server par AI request fail ho gayi.', details: error.message });
  }
}

