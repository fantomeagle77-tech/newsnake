function corsHeaders() {
  return {
    "content-type": "application/json",
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type",
  };
}

export function onRequestOptions() {
  return new Response(null, { status: 204, headers: corsHeaders() });
}

export async function onRequestGet({ env, request }) {
  const url = new URL(request.url);

  const seed = parseInt(url.searchParams.get("seed") || "0", 10);
  const mode = (url.searchParams.get("mode") || "score").slice(0, 16);
  const limit = Math.min(50, Math.max(1, parseInt(url.searchParams.get("limit") || "20", 10)));

  if (!seed) {
    return new Response(JSON.stringify({ error: "seed is required" }), {
      status: 400,
      headers: corsHeaders(),
    });
  }

  const stmt = env.DB.prepare(
    `WITH ranked AS (
       SELECT
         name,
         score,
         time_ms,
         coins,
         created_at,
         ROW_NUMBER() OVER (
           PARTITION BY LOWER(TRIM(name))
           ORDER BY score DESC, time_ms DESC, coins DESC, created_at DESC
         ) AS rn
       FROM scores
       WHERE seed = ? AND mode = ?
     )
     SELECT name, score, time_ms, coins, created_at
     FROM ranked
     WHERE rn = 1
     ORDER BY score DESC, time_ms DESC, coins DESC, created_at DESC
     LIMIT ?`
  ).bind(seed, mode, limit);

  const { results } = await stmt.all();

  return new Response(JSON.stringify({ seed, mode, rows: results || [] }), {
    headers: corsHeaders(),
  });
}
