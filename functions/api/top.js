export async function onRequestGet({ env, request }) {
  const url = new URL(request.url);

  const seed = parseInt(url.searchParams.get("seed") || "0", 10);
  const mode = (url.searchParams.get("mode") || "score").slice(0, 16);
  const limit = Math.min(50, Math.max(1, parseInt(url.searchParams.get("limit") || "20", 10)));

  if (!seed) {
    return new Response(JSON.stringify({ error: "seed is required" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const stmt = env.DB.prepare(
    `SELECT s.name, s.score, s.time_ms, s.coins, s.created_at
     FROM scores s
     WHERE s.seed = ? AND s.mode = ?
       AND s.created_at = (
         SELECT s2.created_at
         FROM scores s2
         WHERE s2.seed = s.seed AND s2.mode = s.mode AND LOWER(TRIM(s2.name)) = LOWER(TRIM(s.name))
         ORDER BY s2.score DESC, s2.time_ms DESC, s2.coins DESC, s2.created_at DESC
         LIMIT 1
       )
     ORDER BY s.score DESC, s.time_ms DESC, s.coins DESC, s.created_at DESC
     LIMIT ?`
  ).bind(seed, mode, limit);

  const { results } = await stmt.all();

  return new Response(JSON.stringify({ seed, mode, rows: results || [] }), {
    headers: { "content-type": "application/json" },
  });
}
