export async function onRequestGet({ env, request }) {
  const url = new URL(request.url);

  const seed = parseInt(url.searchParams.get("seed") || "0", 10);
  const mode = (url.searchParams.get("mode") || "score").slice(0, 16);
  const limit = Math.min(50, Math.max(1, parseInt(url.searchParams.get("limit") || "10", 10)));

  if (!seed) {
    return new Response(JSON.stringify({ error: "seed is required" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const stmt = env.DB.prepare(
    `SELECT name, score, time_ms, coins, created_at
     FROM scores
     WHERE seed = ? AND mode = ?
     ORDER BY score DESC, time_ms ASC
     LIMIT ?`
  ).bind(seed, mode, limit);

  const { results } = await stmt.all();

  return new Response(JSON.stringify({ seed, mode, rows: results }), {
    headers: { "content-type": "application/json" },
  });
}