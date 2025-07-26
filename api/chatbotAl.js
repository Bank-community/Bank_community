// api/chatbotAI.js
// This is a NEW, dedicated Vercel Serverless Function for the chatbot ONLY.
// It handles the 3-layer API key fallback system.

export default async function handler(request, response) {
    if (request.method !== 'POST') {
        return response.status(405).json({ error: 'Method Not Allowed' });
    }

    const { promptText } = request.body;
    if (!promptText) {
        return response.status(400).json({ error: 'promptText is required' });
    }

    // Read the three API keys for the chatbot from Vercel Environment Variables
    const apiKeys = [
        process.env.GEMINI_API_KEY_1,
        process.env.GEMINI_API_KEY_2,
        process.env.GEMINI_API_KEY_3,
    ].filter(key => key); // Filter out any undefined/empty keys

    if (apiKeys.length === 0) {
        return response.status(500).json({ error: 'Chatbot API keys are not configured on the server.' });
    }

    const callGeminiAPI = async (apiKey) => {
        // Using a robust model like gemini-1.5-flash-latest
        const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${apiKey}`;
        const payload = { contents: [{ parts: [{ "text": promptText }] }] };

        const apiResponse = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });

        if (!apiResponse.ok) {
            if (apiResponse.status === 429) { // Quota Exceeded
                const error = new Error('Quota exceeded');
                error.isQuotaError = true;
                throw error;
            }
            const errorBody = await apiResponse.json();
            throw new Error(`API Error: ${errorBody.error?.message || 'Unknown error'}`);
        }
        return apiResponse.json();
    };

    // Try each key in sequence
    for (let i = 0; i < apiKeys.length; i++) {
        const currentKey = apiKeys[i];
        try {
            console.log(`Chatbot attempting to use API Key #${i + 1}`);
            const result = await callGeminiAPI(currentKey);
            const explanation = result.candidates[0]?.content?.parts[0]?.text || "AI se koi jawaab nahi mila.";
            return response.status(200).json({ explanation });
        } catch (error) {
            console.error(`Chatbot error with API Key #${i + 1}:`, error.message);
            if (!error.isQuotaError || i === apiKeys.length - 1) {
                return response.status(500).json({ 
                    error: 'All chatbot API keys have failed.',
                    details: error.message 
                });
            }
        }
    }
}

