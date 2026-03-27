export async function onRequestGet({ env, request }) {
  const url = new URL(request.url);
  const scope = (url.searchParams.get("scope") || "seed").slice(0, 16);
  const seed = parseInt(url.searchParams.get("seed") || "0", 10);
  const mode = (url.searchParams.get("mode") || "score").slice(0, 16);
  const limit = Math.min(50, Math.max(1, parseInt(url.searchParams.get("limit") || "20", 10)));

  if (scope !== "all" && !seed) {
    return new Response(JSON.stringify({ error: "seed is required" }), {
      status: 400,
      headers: { "content-type": "application/json", "access-control-allow-origin": "*" },
    });
  }

  let stmt;
  if (scope === "all") {
    stmt = env.DB.prepare(
      `SELECT s.name, s.score, s.time_ms, s.coins, s.created_at, s.seed, COALESCE(s.extracted, 0) AS extracted
       FROM scores s
       WHERE s.mode = ?
         AND NOT EXISTS (
           SELECT 1
           FROM scores s2
           WHERE s2.mode = s.mode
             AND s2.name = s.name
             AND (
               s2.score > s.score
               OR (s2.score = s.score AND s2.time_ms > s.time_ms)
               OR (s2.score = s.score AND s2.time_ms = s.time_ms AND s2.coins > s.coins)
               OR (s2.score = s.score AND s2.time_ms = s.time_ms AND s2.coins = s.coins AND COALESCE(s2.extracted,0) > COALESCE(s.extracted,0))
               OR (s2.score = s.score AND s2.time_ms = s.time_ms AND s2.coins = s.coins AND COALESCE(s2.extracted,0) = COALESCE(s.extracted,0) AND s2.created_at > s.created_at)
             )
         )
       ORDER BY s.score DESC, s.time_ms DESC, s.coins DESC, COALESCE(s.extracted,0) DESC, s.created_at DESC
       LIMIT ?`
    ).bind(mode, limit);
  } else {
    stmt = env.DB.prepare(
      `SELECT s.name, s.score, s.time_ms, s.coins, s.created_at, s.seed, COALESCE(s.extracted, 0) AS extracted
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
               OR (s2.score = s.score AND s2.time_ms = s.time_ms AND s2.coins = s.coins AND COALESCE(s2.extracted,0) > COALESCE(s.extracted,0))
               OR (s2.score = s.score AND s2.time_ms = s.time_ms AND s2.coins = s.coins AND COALESCE(s2.extracted,0) = COALESCE(s.extracted,0) AND s2.created_at > s.created_at)
             )
         )
       ORDER BY s.score DESC, s.time_ms DESC, s.coins DESC, COALESCE(s.extracted,0) DESC, s.created_at DESC
       LIMIT ?`
    ).bind(seed, mode, limit);
  }

  const { results } = await stmt.all();

  return new Response(JSON.stringify({ seed, mode, scope, rows: results }), {
    headers: { "content-type": "application/json", "access-control-allow-origin": "*" },
  });
}
