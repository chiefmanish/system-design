const SYSTEM_PROMPT_JSON = `You are a senior engineer teaching system design.
Write in plain English. Use real-world analogies. Include concrete numbers.
For cloud examples: name exact services and show real microservices flows.
Return valid JSON only — no markdown, no preamble, no trailing text.`;

const SYSTEM_PROMPT_CHAT = `You are a friendly system design tutor.
Answer in 4-6 plain English sentences with one real company example.
Do NOT return JSON. Reply naturally like a helpful colleague.`;

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { messages, max_tokens, plain_text } = req.body;
  if (!messages) return res.status(400).json({ error: "messages required" });

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "GROQ_API_KEY not set" });

  const reqId = Date.now().toString(36); // short ID to correlate logs
  const tokens = max_tokens || 1200;
  console.log(`[${reqId}] START plain_text=${!!plain_text} max_tokens=${tokens} msg_count=${messages.length}`);

  try {
    // Groq call — no AbortController, let Vercel's 60s function timeout handle it
    const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        max_tokens: tokens,
        temperature: plain_text ? 0.7 : 0.3,
        messages: [
          { role: "system", content: plain_text ? SYSTEM_PROMPT_CHAT : SYSTEM_PROMPT_JSON },
          ...messages,
        ],
      }),
    });

    console.log(`[${reqId}] Groq responded status=${groqRes.status}`);

    // Handle 429 — return it directly so client can show friendly message
    if (groqRes.status === 429) {
      const retryAfter = groqRes.headers.get("retry-after") || "30";
      console.log(`[${reqId}] RATE LIMITED retry-after=${retryAfter}`);
      return res.status(429).json({
        error: `Rate limited by Groq. Wait ${retryAfter}s before retrying.`,
        retry_after: parseInt(retryAfter),
      });
    }

    const data = await groqRes.json();

    if (!groqRes.ok) {
      console.log(`[${reqId}] Groq error: ${JSON.stringify(data?.error)}`);
      return res.status(groqRes.status).json({ error: data?.error?.message || JSON.stringify(data) });
    }

    const content = data.choices?.[0]?.message?.content || "";
    const usage = data.usage || {};
    console.log(`[${reqId}] OK prompt_tokens=${usage.prompt_tokens} completion_tokens=${usage.completion_tokens} content_len=${content.length}`);

    return res.json(data);

  } catch (e) {
    // Log the full error including stack so Vercel logs show exactly what failed
    console.error(`[${reqId}] EXCEPTION: ${e.message}\n${e.stack}`);
    return res.status(500).json({
      error: e.message,
      hint: e.name === "AbortError" ? "Request was aborted — likely a timeout" : "Unexpected server error",
    });
  }
};
