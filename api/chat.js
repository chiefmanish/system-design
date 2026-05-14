// Two system prompts: one for structured JSON (lessons/viva), one for conversational Ask
const SYSTEM_PROMPT_JSON = `You are a senior software engineer and system design expert teaching a course.

When writing lesson content:
- Use plain English and real-world analogies before technical terms
- Show REAL microservices flows: "Service A calls Service B via Kafka topic X" not vague descriptions  
- Include concrete numbers: "handles 50K req/sec", "p99 latency drops from 800ms to 12ms"
- Name exact cloud services: "Azure Service Bus", not "Azure messaging"
- Compare platforms honestly: say what each is actually better at

Return valid JSON only — no markdown fences, no preamble, no trailing text.`;

const SYSTEM_PROMPT_CHAT = `You are a friendly senior engineer answering a student's question about system design.
- Answer in plain English, 4-6 sentences
- Use a real-world analogy first, then the technical explanation
- Give one concrete example from a real company (Google, Netflix, Uber, etc.)
- If the question is about cloud platforms, show the actual service names and a brief flow
Do NOT return JSON. Just answer naturally like you would to a colleague.`;

async function fetchWithRetry(url, options, maxRetries = 3) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const response = await fetch(url, options);
    if (response.status === 429) {
      const retryAfter = response.headers.get("retry-after");
      const waitMs = retryAfter
        ? parseInt(retryAfter) * 1000
        : Math.min(2000 * Math.pow(2, attempt), 16000);
      await new Promise(r => setTimeout(r, waitMs));
      continue;
    }
    return response;
  }
  throw new Error("Rate limited — try again in a moment");
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
  if (!apiKey) return res.status(500).json({ error: "GROQ_API_KEY not set" });

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
        temperature: plain_text ? 0.7 : 0.3,
        messages: [
          { role: "system", content: plain_text ? SYSTEM_PROMPT_CHAT : SYSTEM_PROMPT_JSON },
          ...messages,
        ],
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      return res.status(response.status).json({
        error: data?.error?.message || JSON.stringify(data),
      });
    }
    return res.json(data);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
