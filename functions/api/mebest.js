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
  const name = String(url.searchParams.get("name") || "anon").trim().slice(0, 18);

  if (!seed) {
    return new Response(JSON.stringify({ error: "seed is required" }), {
      status: 400,
      headers: corsHeaders(),
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
    headers: corsHeaders(),
  });
}
