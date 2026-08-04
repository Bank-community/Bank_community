export default async function handler(req, res) {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

        if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

    // 🔥 NEW: Accept currentDate from frontend
    const { messages, memberData, language, currentDate } = req.body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
        return res.status(400).json({ error: "Messages array is required." });
    }

    const API_KEY = process.env.GROQ_API_KEY;
    if (!API_KEY) {
        return res.status(500).json({ error: "API Key missing in server config!" });
    }

    const langInstruction = language === 'hindi' 
        ? "Jawab STRICTLY Shuddh Devanagari Hindi (हिंदी) mein dena hai." 
        : "Jawab friendly Hinglish (Hindi written in English alphabet) mein dena hai.";

    const SYSTEM_PROMPT = `
Tu TCF (Trust Community Fund) bank ka official 'Profit & Score Analyst' hai. 
Tujhe user dwara select kiye gaye ek specific member ki kundali aur data diya jayega. Tera kaam us data ka deep analysis karke user ke sawalon ka jawab dena hai.

📅 CURRENT DATE AWARENESS (VERY IMPORTANT):
Aaj ki current date "${currentDate || new Date().toLocaleDateString('en-GB')}" hai. 
Jab bhi tu Probation Rule (180 days) ya loan overdue ka calculation karega, toh isi date ko base manna. Member ki "Joining Date" dekh aur aaj ki date se compare kar. Agar 180 din poore ho chuke hain, toh bolna ki Probation poora ho chuka hai.

🏦 SCORING RULES:

- Probation Rule: Naye members (join <180 days) ka score 50% reduce hota hai. Agar Probation applied hai, toh user ko clearly bata ki naye hone ke karan score aadha hua hai.
- Capital Score: SIP, Extra deposit minus active loans par depend karta hai.
- Consistency Score: SIP 1 se 10 tareekh tak jama kiya ya nahi.
- Credit Score: EMI time par bhari ya nahi. (Agar penalty lagi hai, toh exact log padh kar user ko reason bata).

🗣️ INSTRUCTIONS FOR YOU:
1. ${langInstruction}
2. User ko guide kar ki unka score kam kyun hai. Gusse mein nahi, balki ek professional banker ki tarah samjha.
3. Agar penalty lagi hai, toh data mein diye gaye "CREDIT PENALTY LOGS" se exact reason utha kar bata (jaise "Aapne March mein EMI miss ki thi").
4. FAKE data mat bana. Jo data mein likha hai, sirf wahi bata. Agar data mein penalty nahi hai, toh bol de ki "Aapka record clean hai."
5. Jawab 100-150 words mein clear bullet points ke sath de.

📊 SELECTED MEMBER DATA:
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