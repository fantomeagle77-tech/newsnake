export async function onRequestGet({ env, request }) {
  const url = new URL(request.url);

  const seed = parseInt(url.searchParams.get("seed") || "0", 10);
  const mode = (url.searchParams.get("mode") || "score").slice(0, 16);

  if (!seed) {
    return new Response(JSON.stringify({ error: "seed is required" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const row = await env.DB.prepare(
    `SELECT name, best_score, best_time_ms, ghost, updated_at
     FROM ghosts
     WHERE seed = ? AND mode = ?`
  ).bind(seed, mode).first();

  const ghost = row ? {
    name: row.name,
    score: Number(row.best_score || 0),
    time_ms: Number(row.best_time_ms || 0),
    ghost: row.ghost || '[]',
    updated_at: row.updated_at,
  } : null;

  return new Response(JSON.stringify({ seed, mode, ghost }), {
    headers: { "content-type": "application/json" },
  });
}
