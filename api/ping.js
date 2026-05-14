// Health check endpoint — call /api/ping to verify Vercel function is alive
// Returns: { ok, ts, has_groq_key, node_version }
module.exports = function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.json({
    ok: true,
    ts: new Date().toISOString(),
    has_groq_key: !!process.env.GROQ_API_KEY,
    node_version: process.version,
    env: process.env.VERCEL_ENV || "unknown",
  });
};
