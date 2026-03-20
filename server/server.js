const http = require('http');
const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 8080;
const HOST = process.env.HOST || '0.0.0.0';
const ROOT = path.join(__dirname, '..', 'client');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

const rooms = new Map();
const leaderboards = new Map();
const LEADERBOARD_FILE = path.join(__dirname, 'leaderboards.json');

function loadLeaderboards() {
  try {
    if (!fs.existsSync(LEADERBOARD_FILE)) return;
    const raw = fs.readFileSync(LEADERBOARD_FILE, 'utf8');
    const parsed = JSON.parse(raw || '{}');
    for (const [key, rows] of Object.entries(parsed)) {
      if (Array.isArray(rows)) leaderboards.set(key, rows);
    }
  } catch (e) {
    console.warn('Failed to load leaderboards:', e.message);
  }
}

function saveLeaderboards() {
  try {
    const payload = Object.fromEntries(leaderboards.entries());
    fs.writeFileSync(LEADERBOARD_FILE, JSON.stringify(payload), 'utf8');
  } catch (e) {
    console.warn('Failed to save leaderboards:', e.message);
  }
}

const LEADERBOARD_FILE = path.join(__dirname, 'leaderboards.json');

function compareRows(a, b) {
  if ((b.extracted | 0) !== (a.extracted | 0)) return (b.extracted | 0) - (a.extracted | 0);
  if ((b.relics | 0) !== (a.relics | 0)) return (b.relics | 0) - (a.relics | 0);
  if ((b.score | 0) !== (a.score | 0)) return (b.score | 0) - (a.score | 0);
  return (b.time_ms | 0) - (a.time_ms | 0);
}

function loadLeaderboards() {
  try {
    if (!fs.existsSync(LEADERBOARD_FILE)) return;
    const raw = JSON.parse(fs.readFileSync(LEADERBOARD_FILE, 'utf8'));
    if (!raw || typeof raw !== 'object') return;
    for (const [key, rows] of Object.entries(raw)) {
      if (Array.isArray(rows)) leaderboards.set(key, rows);
    }
  } catch (e) {
    console.warn('Failed to load leaderboards:', e.message);
  }
}

function saveLeaderboards() {
  try {
    const payload = Object.fromEntries(leaderboards.entries());
    fs.writeFileSync(LEADERBOARD_FILE, JSON.stringify(payload, null, 2), 'utf8');
  } catch (e) {
    console.warn('Failed to save leaderboards:', e.message);
  }
}

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

function sendJson(res, code, data) {
  const body = JSON.stringify(data);
  res.writeHead(code, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  res.end(body);
}

function sanitizeName(name) {
  return String(name || 'anon').trim().slice(0, 18) || 'anon';
}

function leaderboardKey(seed, mode) {
  return `${seed || 0}::${mode || 'score'}`;
}

function sortRows(rows) {
  rows.sort((a, b) => {
    if ((b.score | 0) !== (a.score | 0)) return (b.score | 0) - (a.score | 0);
    if ((b.time_ms | 0) !== (a.time_ms | 0)) return (b.time_ms | 0) - (a.time_ms | 0);
    if ((b.coins | 0) !== (a.coins | 0)) return (b.coins | 0) - (a.coins | 0);
    if ((b.extracted | 0) !== (a.extracted | 0)) return (b.extracted | 0) - (a.extracted | 0);
    return (b.created_at | 0) - (a.created_at | 0);
  });
  return rows;
}

function isBetterRow(next, prev) {
  return compareRows(next, prev) < 0;
}

function submitRow(raw) {
  const row = {
    name: sanitizeName(raw.name),
    seed: Number(raw.seed) || 0,
    mode: String(raw.mode || 'score').slice(0, 24),
    score: Number(raw.score) || 0,
    relics: Number(raw.relics) || 0,
    extracted: raw.extracted ? 1 : 0,
    time_ms: Number(raw.time_ms) || 0,
    coins: Number(raw.coins) || 0,
    version: String(raw.version || 'node-ws-v2').slice(0, 48),
    ghost: typeof raw.ghost === 'string' ? raw.ghost.slice(0, 200000) : '',
    created_at: Date.now(),
  };

  const key = leaderboardKey(row.seed, row.mode);
  const rows = leaderboards.get(key) || [];
  const idx = rows.findIndex(r => sanitizeName(r.name) === row.name);

  const betterThan = (a, b) => {
    if (!b) return true;
    if ((a.score | 0) !== (b.score | 0)) return (a.score | 0) > (b.score | 0);
    if ((a.time_ms | 0) !== (b.time_ms | 0)) return (a.time_ms | 0) > (b.time_ms | 0);
    if ((a.coins | 0) !== (b.coins | 0)) return (a.coins | 0) > (b.coins | 0);
    if ((a.extracted | 0) !== (b.extracted | 0)) return (a.extracted | 0) > (b.extracted | 0);
    return true;
  };

  if (idx >= 0) {
    if (betterThan(row, rows[idx])) rows[idx] = { ...rows[idx], ...row };
    else return rows[idx];
  } else {
    rows.push(row);
  }

  sortRows(rows);
  leaderboards.set(key, rows.slice(0, 500));
  saveLeaderboards();
  return row;
}

function getTop(seed, mode, limit = 20) {
  const rows = leaderboards.get(leaderboardKey(seed, mode)) || [];
  return rows.slice(0, clamp(Number(limit) || 20, 1, 50));
}

function getGhost(seed, mode) {
  const rows = leaderboards.get(leaderboardKey(seed, mode)) || [];
  return rows.find(r => r.ghost) || rows[0] || null;
}

function getRoom(name) {
  name = String(name || 'daily').trim().slice(0, 24) || 'daily';
  let room = rooms.get(name);
  if (!room) {
    room = { name, players: new Map() };
    rooms.set(name, room);
  }
  return room;
}

function resetPlayerState(p, spawn = randomSpawn()) {
  p.x = spawn.x;
  p.y = spawn.y;
  p.r = 18;
  p.hp = 3;
  p.score = 0;
  p.alive = true;
  p.extracted = false;
  p.spawn = spawn;
  p.respawnAt = 0;
  p.pvpInvulnUntil = Date.now() + 1800;
  return spawn;
}

function directSend(ws, payload) {
  if (ws && ws.readyState === 1) {
    ws.send(JSON.stringify(payload));
  }
}


function roomColorFromId(id) {
  const palette = [
    '#79C8FF', '#6BFFB0', '#FFD36A', '#FF8BA7',
    '#C69BFF', '#8BF5FF', '#FFA86B', '#A1FF6B'
  ];
  let h = 0;
  for (let i = 0; i < id.length; i++) h = ((h << 5) - h + id.charCodeAt(i)) | 0;
  return palette[Math.abs(h) % palette.length];
}

function randomSpawn() {
  const a = Math.random() * Math.PI * 2;
  const d = 180 + Math.random() * 420;
  return {
    x: Math.round(Math.cos(a) * d),
    y: Math.round(Math.sin(a) * d),
  };
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', chunk => {
      raw += chunk;
      if (raw.length > 1024 * 1024) {
        reject(new Error('Body too large'));
        req.destroy();
      }
    });
    req.on('end', () => resolve(raw));
    req.on('error', reject);
  });
}

function serveStatic(req, res, pathname) {
  const rel = pathname === '/' ? 'index.html' : decodeURIComponent(pathname).replace(/^\/+/, '');
  const filePath = path.join(ROOT, rel);

  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const type = MIME[ext] || 'application/octet-stream';
    res.writeHead(200, { 'content-type': type });
    res.end(data);
  });
}

function makeSnapshot(room) {
  const players = [...room.players.values()].map(p => ({
    id: p.id,
    name: p.name,
    x: p.x,
    y: p.y,
    r: p.r,
    hp: p.hp,
    score: p.score,
    alive: p.alive,
    extracted: p.extracted,
    color: p.color,
  }));

  const roster = [...room.players.values()].map(p => ({
    id: p.id,
    name: p.name,
    alive: p.alive,
    color: p.color,
  }));

  return JSON.stringify({
    type: 'snapshot',
    room: room.name,
    count: room.players.size,
    roster,
    players,
    ts: Date.now(),
  });
}

function broadcastRoom(room) {
  if (!room || !room.players.size) return;
  const payload = makeSnapshot(room);
  for (const p of room.players.values()) {
    if (p.ws && p.ws.readyState === 1) {
      p.ws.send(payload);
    }
  }
}

loadLeaderboards();

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname;

  if (pathname === '/api/top' && req.method === 'GET') {
    return sendJson(res, 200, {
      rows: getTop(url.searchParams.get('seed'), url.searchParams.get('mode'), url.searchParams.get('limit')),
    });
  }

  if (pathname === '/api/ghost' && req.method === 'GET') {
    return sendJson(res, 200, {
      ghost: getGhost(url.searchParams.get('seed'), url.searchParams.get('mode')),
    });
  }

  if (pathname === '/api/mebest' && req.method === 'GET') {
    return sendJson(res, 200, {
      row: getPersonalBest(
        url.searchParams.get('seed'),
        url.searchParams.get('mode'),
        url.searchParams.get('name')
      ),
    });
  }

  if (pathname === '/api/submit' && req.method === 'POST') {
    try {
      const raw = await readBody(req);
      const body = JSON.parse(raw || '{}');
      const row = submitRow(body);
      return sendJson(res, 200, { ok: true, row });
    } catch (e) {
      return sendJson(res, 400, { ok: false, error: e.message || 'Bad request' });
    }
  }

  if (pathname === '/robots.txt' && req.method === 'GET') {
    const host = `https://${req.headers.host}`;
    res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' });
    res.end(`User-agent: *\nAllow: /\nSitemap: ${host}/sitemap.xml\n`);
    return;
  }

  if (pathname === '/sitemap.xml' && req.method === 'GET') {
    const host = `https://${req.headers.host}`;
    res.writeHead(200, { 'content-type': 'application/xml; charset=utf-8', 'cache-control': 'no-store' });
    res.end(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url><loc>${host}/</loc></url>\n</urlset>`);
    return;
  }

  return serveStatic(req, res, pathname);
});

const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname !== '/ws') {
    socket.destroy();
    return;
  }

  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit('connection', ws, req);
  });
});

wss.on('connection', (ws) => {
  const id = randomUUID().slice(0, 8);

  ws.player = {
    id,
    name: 'anon',
    room: 'daily',
    x: 0,
    y: 0,
    r: 18,
    hp: 3,
    score: 0,
    alive: false,
    extracted: false,
    color: roomColorFromId(id),
    lastSeen: Date.now(),
    spawn: { x: 0, y: 0 },
    respawnAt: 0,
    pvpInvulnUntil: Date.now() + 1500,
    ws,
  };

  ws.on('message', (buf) => {
    let msg;
    try {
      msg = JSON.parse(buf.toString('utf8'));
    } catch {
      return;
    }

    ws.player.lastSeen = Date.now();

    if (msg.type === 'hello') {
      const prevRoomName = ws.player.room;
      const prevRoom = rooms.get(prevRoomName);
      if (prevRoom) {
        prevRoom.players.delete(ws.player.id);
        if (!prevRoom.players.size) rooms.delete(prevRoom.name);
        else broadcastRoom(prevRoom);
      }

      const room = getRoom(msg.room);
      ws.player.name = sanitizeName(msg.name);
      ws.player.room = room.name;
      const spawn = resetPlayerState(ws.player);

      room.players.set(ws.player.id, ws.player);

      directSend(ws, {
        type: 'welcome',
        id: ws.player.id,
        room: room.name,
        color: ws.player.color,
        spawn,
      });

      broadcastRoom(room);
      return;
    }

    if (msg.type === 'rename') {
      ws.player.name = sanitizeName(msg.name);
      const room = rooms.get(ws.player.room);
      if (room) broadcastRoom(room);
      return;
    }

    if (msg.type === 'ping') {
      if (typeof msg.name === 'string' && msg.name.trim()) {
        ws.player.name = sanitizeName(msg.name);
      }
      if (typeof msg.alive !== 'undefined' && ws.player.respawnAt <= 0) {
        ws.player.alive = !!msg.alive;
      }
      return;
    }

    if (msg.type === 'respawn') {
      const room = getRoom(msg.room || ws.player.room);
      ws.player.room = room.name;
      const spawn = resetPlayerState(ws.player);
      room.players.set(ws.player.id, ws.player);
      directSend(ws, {
        type: 'respawned',
        spawn,
        hp: ws.player.hp,
        r: ws.player.r,
        score: ws.player.score,
      });
      broadcastRoom(room);
      return;
    }

    if (msg.type === 'state') {
      ws.player.x = clamp(Number(msg.x) || 0, -1000000, 1000000);
      ws.player.y = clamp(Number(msg.y) || 0, -1000000, 1000000);
      ws.player.r = clamp(Number(msg.r) || 18, 8, 2000);
      ws.player.hp = clamp(Number(msg.hp) || 0, 0, 20);
      ws.player.score = clamp(Number(msg.score) || 0, 0, 100000000);
      if (!ws.player.respawnAt) {
        ws.player.alive = !!msg.alive;
        ws.player.extracted = !!msg.extracted;
      }
      return;
    }
  });

  ws.on('close', () => {
    const room = rooms.get(ws.player.room);
    if (room) {
      room.players.delete(ws.player.id);
      if (!room.players.size) rooms.delete(room.name);
      else broadcastRoom(room);
    }
  });
});


function processRoomPvp(room, now) {
  const players = [...room.players.values()].filter(p => p.alive && !p.extracted);

  for (let i = 0; i < players.length; i++) {
    const a = players[i];
    for (let j = i + 1; j < players.length; j++) {
      const b = players[j];
      if (now < (a.pvpInvulnUntil || 0) || now < (b.pvpInvulnUntil || 0)) continue;

      const dx = a.x - b.x;
      const dy = a.y - b.y;
      const rr = a.r + b.r;
      if (dx * dx + dy * dy > rr * rr) continue;

      let big = null;
      let small = null;
      if (a.r >= b.r * 1.12) {
        big = a; small = b;
      } else if (b.r >= a.r * 1.12) {
        big = b; small = a;
      } else {
        continue;
      }

      big.r = clamp(big.r + small.r * 0.16, 18, 2000);
      big.score = clamp(big.score + 120 + Math.round(small.r * 6), 0, 100000000);
      big.hp = clamp(big.hp + 1, 0, 6);
      big.pvpInvulnUntil = now + 900;

      small.alive = false;
      small.hp = 0;
      small.respawnAt = now + 1400;
      small.pvpInvulnUntil = now + 1800;

      directSend(big.ws, {
        type: 'pvp',
        role: 'attacker',
        victimId: small.id,
        victimName: small.name,
        r: big.r,
        hp: big.hp,
        score: big.score,
      });

      directSend(small.ws, {
        type: 'pvp',
        role: 'victim',
        killerId: big.id,
        killerName: big.name,
        respawnInMs: 1400,
      });

      return true;
    }
  }
  return false;
}

function processRespawns(room, now) {
  for (const p of room.players.values()) {
    if (p.respawnAt && now >= p.respawnAt) {
      const spawn = resetPlayerState(p);
      directSend(p.ws, {
        type: 'respawned',
        spawn,
        hp: p.hp,
        r: p.r,
        score: p.score,
      });
      p.respawnAt = 0;
    }
  }
}

setInterval(() => {
  const now = Date.now();

  for (const [roomName, room] of rooms) {
    for (const [id, p] of room.players) {
      if (!p.ws || p.ws.readyState !== 1 || now - p.lastSeen > 30000) {
        room.players.delete(id);
      }
    }

    if (!room.players.size) {
      rooms.delete(roomName);
      continue;
    }

    processRespawns(room, now);
    processRoomPvp(room, now);
    broadcastRoom(room);
  }
}, 1000 / 15);

loadLeaderboards();

server.listen(PORT, HOST, () => {
  console.log(`VoidRun network server: http://${HOST}:${PORT}`);
});
