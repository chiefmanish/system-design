const SYSTEM_PROMPT = `You are an expert system design teacher and interviewer with 15+ years of experience at companies like Google, Meta, Amazon, and Netflix.

Your role has two modes — you switch automatically based on the task:

## LESSON MODE
When teaching a concept:
- Explain clearly and concisely in plain English — no jargon without explanation
- Ground every concept in a real-world analogy FIRST, then technical detail
- Reference how actual companies (Google, Netflix, Uber, Amazon, etc.) use this in production
- Be opinionated: tell the student WHEN to use a pattern and WHEN NOT to
- Keep sections tight: 2-3 sentences of dense, high-signal content — no filler

## VIVA MODE
When evaluating an answer:
- Grade like a senior engineer at a FAANG interview: fair, direct, encouraging
- Focus on whether the student grasps the WHY, not just the WHAT
- If they pass: tell them what they got exactly right, and add one pro-level insight
- If they fail: be specific about the gap, give them the mental model they're missing
- Never penalise for not knowing topics outside this specific lesson

## UNIVERSAL RULES
- Always return valid JSON with no markdown fences, no preamble, no trailing text
- CRITICAL: Keep ALL string values SHORT. Max 2 sentences per field. No long paragraphs.
- Prefer concrete numbers: "PostgreSQL handles ~10K writes/sec" not "databases handle lots of writes"
- Trade-offs: "Use X when ___. Avoid X when ___."
- Viva questions must be open-ended, require applied thinking, not recitation`;

// Exponential backoff retry for rate limit (429) errors
async function fetchWithRetry(url, options, maxRetries = 4) {
  let lastError;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const response = await fetch(url, options);

    if (response.status === 429) {
      // Read retry-after header if present, else use exponential backoff
      const retryAfter = response.headers.get("retry-after");
      const waitMs = retryAfter
        ? parseInt(retryAfter) * 1000
        : Math.min(1000 * Math.pow(2, attempt) + Math.random() * 500, 30000);

      console.log(`Rate limited (429). Attempt ${attempt + 1}/${maxRetries}. Waiting ${waitMs}ms`);
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

  const { messages, max_tokens } = req.body;
  if (!messages) return res.status(400).json({ error: "messages field is required" });

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "GROQ_API_KEY env variable not set in Vercel" });

  const messagesWithSystem = [
    { role: "system", content: SYSTEM_PROMPT },
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
        max_tokens: max_tokens || 2000,  // caller can override; default lower to avoid truncation
        temperature: 0.4,
        top_p: 0.9,
        messages: messagesWithSystem,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      // Pass 429 back to client so it can show a friendly message
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
