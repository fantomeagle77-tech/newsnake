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

  if (!seed) {
    return new Response(JSON.stringify({ error: "seed is required" }), {
      status: 400,
      headers: corsHeaders(),
    });
  }

  const row = await env.DB.prepare(
    `SELECT name, best_score AS score, best_time_ms AS time_ms, ghost, updated_at
     FROM ghosts
     WHERE seed = ? AND mode = ?`
  ).bind(seed, mode).first();

  return new Response(JSON.stringify({ seed, mode, ghost: row || null }), {
    headers: corsHeaders(),
  });
}
