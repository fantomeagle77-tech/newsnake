export async function onRequestGet({ env, request }) {
  const url = new URL(request.url);
  const scope = (url.searchParams.get("scope") || "seed").slice(0, 16);
  const seed = parseInt(url.searchParams.get("seed") || "0", 10);
  const mode = (url.searchParams.get("mode") || "score").slice(0, 16);
  const name = String(url.searchParams.get("name") || "anon").slice(0, 18);

  if (scope !== "all" && !seed) {
    return new Response(JSON.stringify({ error: "seed is required" }), {
      status: 400,
      headers: { "content-type": "application/json", "access-control-allow-origin": "*" },
    });
  }

  let row;
  if (scope === "all") {
    row = await env.DB.prepare(
      `SELECT name, score, time_ms, coins, created_at, seed, 0 AS extracted
       FROM scores
       WHERE mode = ? AND name = ?
       ORDER BY score DESC, time_ms DESC, coins DESC, created_at DESC
       LIMIT 1`
    ).bind(mode, name).first();
  } else {
    row = await env.DB.prepare(
      `SELECT name, score, time_ms, coins, created_at, seed, 0 AS extracted
       FROM scores
       WHERE seed = ? AND mode = ? AND name = ?
       ORDER BY score DESC, time_ms DESC, coins DESC, created_at DESC
       LIMIT 1`
    ).bind(seed, mode, name).first();
  }

  return new Response(JSON.stringify({ seed, mode, scope, row: row || null }), {
    headers: { "content-type": "application/json", "access-control-allow-origin": "*" },
  });
}
