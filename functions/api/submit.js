function clampInt(v, a, b) {
  v = Number.isFinite(v) ? Math.floor(v) : a;
  return Math.max(a, Math.min(b, v));
}

export async function onRequestPost({ env, request }) {
  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "bad json" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const name = String(body.name || "anon").slice(0, 18);
  const seed = clampInt(parseInt(body.seed || 0, 10), 0, 999999999);
  const mode = String(body.mode || "score").slice(0, 16);

  const score = clampInt(parseInt(body.score || 0, 10), 0, 2_000_000_000);
  const time_ms = clampInt(parseInt(body.time_ms || 0, 10), 0, 10_000_000_000);
  const coins = clampInt(parseInt(body.coins || 0, 10), 0, 2_000_000_000);
  const version = String(body.version || "").slice(0, 24);

  const ghost = typeof body.ghost === "string" ? body.ghost : "";
  if (ghost.length > 60000) {
    return new Response(JSON.stringify({ error: "ghost too large" }), {
      status: 413,
      headers: { "content-type": "application/json" },
    });
  }

  if (!seed) {
    return new Response(JSON.stringify({ error: "seed is required" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const now = Date.now();

  const insertScore = env.DB.prepare(
    `INSERT INTO scores (created_at, name, seed, mode, score, time_ms, coins, version)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(now, name, seed, mode, score, time_ms, coins, version);

  const upsertGhost = env.DB.prepare(
    `INSERT INTO ghosts (seed, mode, best_score, best_time_ms, name, ghost, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(seed, mode) DO UPDATE SET
       best_score = excluded.best_score,
       best_time_ms = excluded.best_time_ms,
       name = excluded.name,
       ghost = excluded.ghost,
       updated_at = excluded.updated_at
     WHERE excluded.best_score > ghosts.best_score
        OR (excluded.best_score = ghosts.best_score AND excluded.best_time_ms > ghosts.best_time_ms)`
  ).bind(seed, mode, score, time_ms, name, ghost || "[]", now);

  await env.DB.batch([insertScore, upsertGhost]);

  return new Response(JSON.stringify({ ok: true }), {
    headers: { "content-type": "application/json" },
  });
}