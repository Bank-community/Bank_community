module.exports = async function handler(req, res) {
    // Sirf POST request allow karenge
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const { promptText } = req.body;

    // Vercel Environment Variable
    const API_KEY = process.env.GROQ_API_KEY;

    if (!API_KEY) {
        return res.status(500).json({
            error: "API Key (GROQ_API_KEY) missing in Vercel Environment Variables!"
        });
    }

    const API_URL = "https://api.groq.com/openai/v1/chat/completions";

    try {
        const response = await fetch(API_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${API_KEY}`
            },
            body: JSON.stringify({
                model: "llama-3.1-8b-instant",
                messages: [
                    {
                        role: "user",
                        content: promptText
                    }
                ],
                temperature: 0.7,
                max_tokens: 1024
            })
        });

        if (!response.ok) {
            const errorData = await response.json();
            console.error("Groq API Error:", errorData);

            const groqError =
                errorData?.error?.message ||
                "Groq API se connect nahi ho paya.";

            return res.status(response.status).json({
                error: `Groq Error: ${groqError}`
            });
        }

        const data = await response.json();

        if (
            data &&
            data.choices &&
            data.choices.length > 0
        ) {
            const aiText = data.choices[0].message.content;

            return res.status(200).json({
                reply: aiText
            });
        }

        return res.status(500).json({
            error: "AI se koi response nahi aaya."
        });

    } catch (error) {
        console.error("Server Error:", error);

        return res.status(500).json({
            error: error.message
        });
    }
};