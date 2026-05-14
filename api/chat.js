const SYSTEM_PROMPT_JSON = `You are an expert system design teacher and interviewer with 15+ years of experience at Google, Meta, Amazon, and Netflix.

## LESSON MODE — when teaching a concept:
- Plain English first, then technical detail
- Real-world analogy before jargon
- Concrete numbers always: "handles ~10K writes/sec" not "handles lots of writes"
- Be opinionated: "Use X when ___. Avoid X when ___."

## VIVA MODE — when evaluating an answer:
- Fair, direct, FAANG-style grading
- Grade for WHY, not just WHAT
- If passed: say what they got right + one pro-level insight
- If failed: give the mental model they're missing

## UNIVERSAL RULES
- Always return valid JSON — no markdown fences, no preamble, no trailing text
- Keep ALL string values SHORT: max 2 sentences per field
- Viva questions must require applied thinking, not recitation`;

const SYSTEM_PROMPT_CHAT = `You are a friendly, expert system design tutor.
Answer the student's question conversationally — plain English, no jargon without explanation.
Keep answers to 3-5 sentences. Always include one concrete real-world example.
Do NOT return JSON. Just reply naturally like a helpful teacher would.`;

async function fetchWithRetry(url, options, maxRetries = 4) {
  let lastError;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const response = await fetch(url, options);
    if (response.status === 429) {
      const retryAfter = response.headers.get("retry-after");
      const waitMs = retryAfter
        ? parseInt(retryAfter) * 1000
        : Math.min(1000 * Math.pow(2, attempt) + Math.random() * 500, 30000);
      console.log(`Rate limited. Attempt ${attempt + 1}/${maxRetries}. Waiting ${waitMs}ms`);
      await new Promise(r => setTimeout(r, waitMs));
      lastError = { status: 429, message: `Rate limited after ${maxRetries} retries` };
      continue;
    }
    return response;
  }
  throw new Error(lastError?.message || "Max retries exceeded");
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { messages, max_tokens, plain_text } = req.body;
  if (!messages) return res.status(400).json({ error: "messages field is required" });

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "GROQ_API_KEY env variable not set in Vercel" });

  // plain_text=true → conversational Ask mode (no JSON required)
  const systemPrompt = plain_text ? SYSTEM_PROMPT_CHAT : SYSTEM_PROMPT_JSON;

  const messagesWithSystem = [
    { role: "system", content: systemPrompt },
    ...messages,
  ];

  try {
    const response = await fetchWithRetry("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        max_tokens: max_tokens || 2000,
        temperature: plain_text ? 0.7 : 0.4,  // slightly more natural for chat
        top_p: 0.9,
        messages: messagesWithSystem,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        error: data?.error?.message || JSON.stringify(data),
        retryable: response.status === 429,
      });
    }

    return res.json(data);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
