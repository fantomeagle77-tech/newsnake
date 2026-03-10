// js/online_ui.js
(() => {
  function dailySeedUTC() {
    const d = new Date();
    return d.getUTCFullYear()*10000 + (d.getUTCMonth()+1)*100 + d.getUTCDate();
  }

  const Online = {
    mode: "score",
    seed: Number(new URLSearchParams(location.search).get("seed") || dailySeedUTC()),
    name: (localStorage.getItem("newsnake_name") || "").slice(0,18),
    playerId: localStorage.getItem("newsnake_pid") || "",
    panelOpen: false,
    top: [],
  };

  // pseudo-login token (не пароль, но стабильная “личность”)
  if (!Online.playerId) {
    Online.playerId = (crypto.randomUUID ? crypto.randomUUID() : (Date.now()+"_"+Math.random()).replace(".",""));
    localStorage.setItem("newsnake_pid", Online.playerId);
  }

  function qs(id){ return document.getElementById(id); }

  function ensurePanel() {
    if (qs("topPanel")) return;

    const box = document.createElement("div");
    box.id = "topPanel";
    box.style.cssText = `
      position:fixed; right:16px; top:90px; z-index:999999;
      width:300px; max-height:70vh; overflow:auto;
      padding:12px; border-radius:16px;
      background:rgba(10,14,28,.72);
      border:1px solid rgba(90,140,255,.18);
      color:#eaf1ff; font:14px/1.25 system-ui,Segoe UI,Arial;
      backdrop-filter: blur(10px);
      display:none;
    `;

    box.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;gap:10px">
        <b>🏆 TOP дня</b>
        <span style="opacity:.75;font-size:12px">seed ${Online.seed}</span>
      </div>

      <div style="display:flex;gap:8px;margin-top:10px">
        <input id="nickInput" placeholder="ник" maxlength="18" style="
          flex:1; padding:8px 10px; border-radius:12px;
          border:1px solid rgba(255,255,255,.14);
          background:rgba(0,0,0,.25); color:#fff; outline:none;
        ">
        <button id="nickSave" style="
          padding:8px 10px; border-radius:12px; cursor:pointer;
          border:1px solid rgba(255,255,255,.14);
          background:linear-gradient(135deg, rgba(70,140,255,.95), rgba(120,70,255,.95));
          color:#fff; font-weight:700;
        ">OK</button>
      </div>

      <div style="margin-top:10px; display:flex; gap:8px;">
        <button id="topRefresh" style="
          flex:1; padding:8px 10px; border-radius:12px; cursor:pointer;
          border:1px solid rgba(255,255,255,.14);
          background:rgba(70,140,255,.18); color:#fff;
        ">Обновить</button>
      </div>

      <ol id="topList" style="margin:12px 0 0 18px; padding:0;"></ol>
      <div style="opacity:.6; font-size:12px; margin-top:10px">
        Ник сохраняется в браузере. Рейтинг общий для всех по этому seed.
      </div>
    `;

    document.body.appendChild(box);

    qs("nickInput").value = Online.name || "";
    qs("nickSave").onclick = () => {
      Online.name = (qs("nickInput").value || "anon").trim().slice(0,18);
      localStorage.setItem("newsnake_name", Online.name);
      if (window.AudioFX) AudioFX.click();
    };
    qs("nickInput").addEventListener("keydown", (e) => {
      if (e.key === "Enter") qs("nickSave").click();
    });

    qs("topRefresh").onclick = async () => {
      if (window.AudioFX) AudioFX.click();
      await Online.refreshTop();
    };
  }

  Online.togglePanel = async () => {
    ensurePanel();
    Online.panelOpen = !Online.panelOpen;
    qs("topPanel").style.display = Online.panelOpen ? "block" : "none";
    if (Online.panelOpen) await Online.refreshTop();
  };

  Online.refreshTop = async () => {
    try {
      const r = await fetch(`/api/top?seed=${Online.seed}&mode=${Online.mode}&limit=10`);
      const j = await r.json();
      Online.top = j.rows || [];
      const list = qs("topList");
      list.innerHTML = "";
      Online.top.forEach((row, i) => {
        const li = document.createElement("li");
        li.style.margin = "0 0 8px 0";
        li.innerHTML = `<b>${row.name}</b> <span style="opacity:.8">— ${row.score}</span>`;
        list.appendChild(li);
      });
    } catch (e) {
      // ничего, просто не обновилось
    }
  };

  Online.submit = async ({ score, time_ms, coins, ghost="" }) => {
    // если на file:// — API не будет
    if (location.protocol === "file:") return;

    try {
      const payload = {
        name: Online.name || "anon",
        seed: Online.seed,
        mode: Online.mode,
        score: Math.floor(score || 0),
        time_ms: Math.floor(time_ms || 0),
        coins: Math.floor(coins || 0),
        version: "newsnake-pages-v1",
        player_id: Online.playerId,
        ghost: ghost || "[]",
      };
      await fetch("/api/submit", {
        method: "POST",
        headers: {"content-type":"application/json"},
        body: JSON.stringify(payload)
      });
    } catch {}
  };

  window.OnlineUI = Online;
})();
