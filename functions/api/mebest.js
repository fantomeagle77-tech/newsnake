export async function onRequestGet({ env, request }) {
  const url = new URL(request.url);

  const seed = parseInt(url.searchParams.get("seed") || "0", 10);
  const mode = (url.searchParams.get("mode") || "score").slice(0, 16);
  const name = String(url.searchParams.get("name") || "anon").trim().slice(0, 18);

  if (!seed) {
    return new Response(JSON.stringify({ error: "seed is required" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const row = await env.DB.prepare(
    `SELECT name, score, time_ms, coins, created_at
     FROM scores
     WHERE seed = ? AND mode = ? AND LOWER(TRIM(name)) = LOWER(TRIM(?))
     ORDER BY score DESC, time_ms DESC, coins DESC, created_at DESC
     LIMIT 1`
  ).bind(seed, mode, name).first();

  return new Response(JSON.stringify({ seed, mode, row: row || null }), {
    headers: { "content-type": "application/json" },
  });
}
