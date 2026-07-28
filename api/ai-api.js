export default async function handler(req, res) {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

    const { messages, membersSummary } = req.body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
        return res.status(400).json({ error: "Messages array is required." });
    }

    const API_KEY = process.env.GROQ_API_KEY;
    if (!API_KEY) {
        return res.status(500).json({ error: "API Key missing in server config!" });
    }

    // ==========================================
    // TCF MASTER SYSTEM PROMPT
    // AI ko pura context deta hai — rules, scoring, formulas sab
    // ==========================================
    const SYSTEM_PROMPT = `
Tu TCF (Trust Community Fund) bank ka official AI Financial Advisor hai. Tera naam "TCF AI" hai.

🏦 TCF BANK KYA HAI:
- Ye ek community-based mutual fund/banking system hai.
- Members SIP (monthly investment) jama karte hain.
- Members ko loans milte hain aur interest se sabko profit distribute hota hai.
- Sab kuch score-based hai — jitna achha score, utna zyada profit share.

📊 SCORING ENGINE (100 Max):
- Capital Score (50% weight): Member ka SIP + P2P In - Active Loan - SIP Withdraw - P2P Out. Target ₹35,000. Agar available balance ≥ ₹35K → 100/100.
  - Tiered Bonus: ₹50K+ → +5, ₹75K+ → +10, ₹1L+ → +15 bonus points.
- Consistency Score (25% weight): Time pe SIP payment karta hai ya nahi. Regular = high score.
- Credit Score (25% weight): Loan liya aur time pe EMI bhara = achha. Default = bura.
- Probation Rule: Naye members (first 180 days) ka score 50% reduce hota hai.

💰 PROFIT DISTRIBUTION FORMULA:
- Jab koi member loan ka interest pay karta hai:
  - 10% → Loan lene wale ko (Self Return)
  - 10% → Uske Guarantor ko (Commission)
  - 70% → Community Pool (score ke hisaab se banta hai sab members me)
  - 10% → Bank reserves
- Community Pool me share = member ka weighted score / total weighted scores × pool amount

🏧 LOAN RULES:
- Eligibility: SIP ≥ ₹25,000 required.
- Amount: 1.5x to 2x of SIP (max ₹50,000 cap).
- EMI: 1st to 10th of every month pay karna hota hai.

📋 WALLET:
- Wallet Balance = Profit earned - Withdrawals + Manual credits
- Available Balance = SIP + P2P In - Active Loan - SIP Withdraw - P2P Out

IMPORTANT RULES FOR YOU:
1. Sirf Hindi (Devanagari) me jawab de. Friendly aur professional tone rakh.
2. Hamesha sahi data use kar — neeche members ka live data diya gaya hai.
3. Agar kisi member ke baare me exact data nahi hai toh bol "iska data available nahi hai" — KABHI FAKE DATA MAT DE.
4. Answers concise rakh — 100-150 words max.
5. Agar user general question pooche (like "namaste", "kaise ho") toh friendly reply de.
6. Financial advice de — kaise score badhaye, loan kaise le, SIP ke fayde.
7. Agar user kisi member ka naam pooche toh uska exact data neeche se find kar.

${membersSummary ? `\n📋 LIVE MEMBERS DATA (CURRENT):\n${membersSummary}\n` : '\n⚠️ Members data abhi load nahi hua hai.\n'}
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
