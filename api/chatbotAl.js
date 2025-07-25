// api/chatbotAI.js
// This is a Vercel Serverless Function to handle the 3-layer API key fallback system.

export default async function handler(request, response) {
    // Only allow POST requests
    if (request.method !== 'POST') {
        return response.status(405).json({ error: 'Method Not Allowed' });
    }

    const { promptText } = request.body;
    if (!promptText) {
        return response.status(400).json({ error: 'promptText is required' });
    }

    // Read the three API keys from Vercel Environment Variables
    const apiKeys = [
        process.env.GEMINI_API_KEY_1,
        process.env.GEMINI_API_KEY_2,
        process.env.GEMINI_API_KEY_3,
    ].filter(key => key); // Filter out any undefined keys

    if (apiKeys.length === 0) {
        return response.status(500).json({ error: 'No API keys configured on the server.' });
    }

    // Function to make the actual API call
    const callGeminiAPI = async (apiKey) => {
        const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${apiKey}`;
        
        const payload = {
            contents: [{
                parts: [{ "text": promptText }]
            }]
        };

        const apiResponse = await fetch(API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
        });

        // If the API call itself fails for network reasons, it will throw here
        if (!apiResponse.ok) {
            // Specifically check for quota errors (429 Too Many Requests)
            if (apiResponse.status === 429) {
                const error = new Error('Quota exceeded');
                error.isQuotaError = true;
                throw error;
            }
            // For other errors, throw a generic error
            const errorBody = await apiResponse.json();
            throw new Error(`API Error: ${errorBody.error?.message || 'Unknown error'}`);
        }

        return apiResponse.json();
    };

    // Try each key in sequence
    for (let i = 0; i < apiKeys.length; i++) {
        const currentKey = apiKeys[i];
        try {
            console.log(`Attempting to use API Key #${i + 1}`);
            const result = await callGeminiAPI(currentKey);
            
            // Extract the text from the successful response
            const explanation = result.candidates[0]?.content?.parts[0]?.text || "AI se koi jawaab nahi mila.";
            
            // If successful, return the response immediately
            return response.status(200).json({ explanation });

        } catch (error) {
            console.error(`Error with API Key #${i + 1}:`, error.message);
            // If it's a quota error and it's not the last key, the loop will continue to the next key.
            // If it's the last key or not a quota error, we handle it below.
            if (!error.isQuotaError || i === apiKeys.length - 1) {
                // Return the final error message if all keys fail or if a non-quota error occurs
                return response.status(500).json({ 
                    error: 'All API keys have exceeded their quota or an unexpected error occurred.',
                    details: error.message 
                });
            }
        }
    }
}

