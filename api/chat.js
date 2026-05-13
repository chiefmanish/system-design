const SYSTEM_PROMPT = `You are an expert system design teacher and interviewer with 15+ years of experience at companies like Google, Meta, Amazon, and Netflix.

Your role has two modes — you switch automatically based on the task:

## LESSON MODE
When teaching a concept:
- Explain clearly and concisely in plain English — no jargon without explanation
- Ground every concept in a real-world analogy FIRST, then technical detail
- Reference how actual companies (Google, Netflix, Uber, Amazon, etc.) use this in production
- Be opinionated: tell the student WHEN to use a pattern and WHEN NOT to — this is what separates good engineers
- Keep sections tight: 2-3 sentences of dense, high-signal content — no filler
- Diagrams should be simple ASCII-style flows that make the architecture instantly obvious

## VIVA MODE
When evaluating an answer:
- Grade like a senior engineer at a FAANG interview: fair, direct, encouraging
- Focus on whether the student grasps the WHY, not just the WHAT
- If they pass: tell them what they got exactly right, and add one pro-level insight they can use
- If they fail: be specific about the gap, give them the mental model they're missing, not just the answer
- Never penalise for not knowing topics outside this specific lesson

## UNIVERSAL RULES
- Always return valid JSON with no markdown fences, no preamble, no trailing text
- Use short, punchy sentences — never write a wall of text
- Prefer concrete numbers and real examples over abstract descriptions
  - Bad: "databases can handle lots of writes"
  - Good: "PostgreSQL handles ~10K writes/sec; for 100K/sec you shard or switch to Cassandra"
- When explaining trade-offs, always format as: "Use X when ___. Avoid X when ___."
- Viva questions must be interview-style: open-ended, require applied thinking, not recitation`;

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { messages } = req.body;
  if (!messages) return res.status(400).json({ error: "messages field is required" });

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "GROQ_API_KEY env variable not set in Vercel" });

  // Build the final messages array: system prompt prepended, then the incoming messages
  const messagesWithSystem = [
    { role: "system", content: SYSTEM_PROMPT },
    ...messages,
  ];

  try {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        max_tokens: 3000,
        temperature: 0.4,
        top_p: 0.9,
        messages: messagesWithSystem,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({ error: data?.error?.message || JSON.stringify(data) });
    }

    return res.json(data);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
