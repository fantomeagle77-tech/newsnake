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
    `SELECT s.name, s.score, s.time_ms, s.coins, s.created_at, 0 AS extracted
     FROM scores s
     WHERE s.seed = ? AND s.mode = ?
       AND NOT EXISTS (
         SELECT 1
         FROM scores s2
         WHERE s2.seed = s.seed
           AND s2.mode = s.mode
           AND s2.name = s.name
           AND (
             s2.score > s.score
             OR (s2.score = s.score AND s2.time_ms > s.time_ms)
             OR (s2.score = s.score AND s2.time_ms = s.time_ms AND s2.coins > s.coins)
             OR (s2.score = s.score AND s2.time_ms = s.time_ms AND s2.coins = s.coins AND s2.created_at > s.created_at)
           )
       )
     ORDER BY s.score DESC, s.time_ms DESC, s.coins DESC, s.created_at DESC
     LIMIT ?`
  ).bind(seed, mode, limit);

  const { results } = await stmt.all();

  return new Response(JSON.stringify({ seed, mode, rows: results }), {
    headers: { "content-type": "application/json" },
  });
}
