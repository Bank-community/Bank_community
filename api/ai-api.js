export default async function handler(req, res) {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

        const { messages, memberData, language } = req.body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
        return res.status(400).json({ error: "Messages array is required." });
    }

    const API_KEY = process.env.GROQ_API_KEY;
    if (!API_KEY) {
        return res.status(500).json({ error: "API Key missing in server config!" });
    }

        const langInstruction = language === 'hindi' 
        ? "Jawab STRICTLY Shuddh Devanagari Hindi (हिंदी) mein dena hai. Fonts aur paragraph ChatGPT ki tarah professional rakhna." 
        : "Jawab friendly Hinglish (Hindi written in English alphabet) mein dena hai. Fonts aur paragraph professional rakhna.";

    const SYSTEM_PROMPT = `
Tu TCF (Trust Community Fund) bank ka ek smart 'Data Reader aur Presenter' hai.
Tera kaam niche diye gaye "PRE-CALCULATED DATA" ko padhna aur user ko ek professional banker ki tarah aasan bhasha mein samjhana hai.

🚨 STRICT RULES (CRITICAL):
1. KABHI BHI KHUD SE MATH YA CALCULATION MAT KARNA. (Koi date minus mat kar, koi percentage ya guna-bhag khud se mat nikal).
2. Jo "SCORE CARD" aur "CREDIT PENALTY LOGS" mein backend engine ne calculate karke likha hai, EXACTLY wahi bata. Apne man se koi naya reason mat bana.
3. Agar "RULE APPLIED: Probation Period" data mein likha hai, toh seedha bol "Aapka joining date 180 din se kam hai, isliye system ne aapka score 50% reduce kar diya hai." Khud se din mat gin.
4. FAKE data ya apne man se koi formula explain mat kar. Sirf wo bata jo data mein explicitly likha hai.

🗣️ FORMATTING INSTRUCTIONS (UI/UX DESIGN):
1. ${langInstruction}
2. Jawab ko hamesha Markdown format mein de. Main headings ko **Bold** (**) rakh aur bich mein line spacing (paragraphs) chhod taaki padhne mein clean lage.
3. Important numbers aur dates ko **bold** kar de.
4. Data ko list ya bullet points (-) mein dikha.

📊 PRE-CALCULATED DATA (READ ONLY):
${memberData ? memberData : 'No member selected.'}
`.trim();

    // Build final messages array with system prompt
   const apiMessages = [
        { role: "system", content: SYSTEM_PROMPT },
        ...messages
    ];

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
                messages: apiMessages,
                temperature: 0.5,
                max_tokens: 1024
            })
        });

        if (!response.ok) {
            const errorData = await response.json();
            console.error("Groq API Error:", errorData);
            return res.status(response.status).json({
                error: `AI Error: ${errorData?.error?.message || "Server se connect nahi ho paya."}`
            });
        }

        const data = await response.json();

        if (data?.choices?.length > 0) {
            return res.status(200).json({
                reply: data.choices[0].message.content
            });
        }

        return res.status(500).json({ error: "AI se koi response nahi aaya." });

    } catch (error) {
        console.error("Server Error:", error);
        return res.status(500).json({ error: error.message });
    }
}