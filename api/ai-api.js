module.exports = async function handler(req, res) {
    // Sirf POST request allow karenge
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const { promptText } = req.body;
    
    // Vercel Environment Variable se API Key le rahe hain
    const API_KEY = process.env.GEMINI_API_KEY;

    if (!API_KEY) {
        return res.status(500).json({ error: "API Key (GEMINI_API_KEY) missing in Vercel Environment Variables!" });
    }

    const MODEL_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent";

    try {
        const response = await fetch(MODEL_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-goog-api-key': API_KEY
            },
            body: JSON.stringify({
                contents: [
                    {
                        parts: [
                            { text: promptText }
                        ]
                    }
                ],
                generationConfig: {
                    temperature: 0.7,
                    topK: 40,
                    topP: 0.95,
                    maxOutputTokens: 1024,
                }
            })
        });

        if (!response.ok) {
            const errorData = await response.json();
            console.error("Gemini API Error:", errorData);
            const googleError = errorData?.error?.message || "Google API se connect nahi ho paya.";
            return res.status(500).json({ error: `Google Error: ${googleError}` });
        }

        const data = await response.json();
        
        if (data && data.candidates && data.candidates.length > 0) {
            let aiText = data.candidates[0].content.parts[0].text;
            return res.status(200).json({ reply: aiText });
        } else {
            return res.status(500).json({ error: "AI se koi response nahi aaya." });
        }

    } catch (error) {
        console.error("Server Error:", error);
        return res.status(500).json({ error: error.message });
    }
};