// js/online_ui.js
// Simple panel for TOP + ghost toggle + audio sliders.
(() => {
  const $ = (id) => document.getElementById(id);

  const panel = $("onlinePanel");
  if (!panel) return;

  const btnTop = $("btnTop");
  const btnRefresh = $("onlineRefresh");
  const btnSave = $("onlineSave");
  const inputName = $("onlineName");
  const elTop = $("onlineTop");
  const elSeed = $("onlineSeed");
  const elGhost = $("onlineGhost");

  // ensure globals exist (game file will extend them)
  window.ONLINE = window.ONLINE || {};
  if (typeof window.ONLINE.showGhost === "undefined") window.ONLINE.showGhost = true;

  // audio controls injected here (so you don't edit HTML)
  const audioBox = document.createElement("div");
  audioBox.style.cssText = "margin-top:10px; padding-top:8px; border-top:1px solid rgba(255,255,255,.08);";
  audioBox.innerHTML = `
    <div style="font-size:12px; opacity:.9; display:flex; align-items:center; justify-content:space-between; gap:10px;">
      <span>🔊 SFX</span>
      <input id="sfxVol" type="range" min="0" max="1" step="0.01" style="flex:1" />
      <span id="sfxVal" style="width:38px; text-align:right; opacity:.7;"></span>
    </div>
    <div style="margin-top:8px; font-size:12px; opacity:.9; display:flex; align-items:center; justify-content:space-between; gap:10px;">
      <span>🎵 Music</span>
      <input id="musVol" type="range" min="0" max="1" step="0.01" style="flex:1" />
      <span id="musVal" style="width:38px; text-align:right; opacity:.7;"></span>
    </div>
    <div style="margin-top:8px; font-size:12px; opacity:.85; display:flex; align-items:center; justify-content:space-between; gap:10px;">
      <button class="btn" id="ghostToggle" style="padding:8px 10px; font-size:12px;">👻 Призрак: ON</button>
      <button class="btn" id="audioTest" style="padding:8px 10px; font-size:12px;">▶ тест</button>
    </div>
  `;
  panel.appendChild(audioBox);

  const sfxVol = $("sfxVol");
  const musVol = $("musVol");
  const sfxVal = $("sfxVal");
  const musVal = $("musVal");
  const ghostToggle = $("ghostToggle");
  const audioTest = $("audioTest");

  function getSeed(){
    const p = new URLSearchParams(location.search);
    return (window.SEED ?? p.get("seed") ?? "0") + "";
  }
  function getMode(){
    const p = new URLSearchParams(location.search);
    return (window.MODE ?? p.get("mode") ?? "score") + "";
  }

  function setPanelVisible(v){
    panel.style.display = v ? "block" : "none";
  }

  function togglePanel(){
    const v = panel.style.display === "none";
    setPanelVisible(v);
    if (v) refreshTop();
  }

  async function refreshTop(){
    try {
      const seed = getSeed();
      const mode = getMode();
      elSeed.textContent = `seed ${seed} • ${mode}`;
      const url = `/api/top?seed=${encodeURIComponent(seed)}&mode=${encodeURIComponent(mode)}&limit=10`;
      const r = await fetch(url);
      const j = await r.json();
      renderTop(j.rows || []);
      await loadGhost();
    } catch(e) {
      renderTop([]);
      elGhost.textContent = "Ошибка загрузки TOP";
    }
  }

  function renderTop(rows){
    elTop.innerHTML = "";
    for (const it of rows){
      const li = document.createElement("li");
      li.style.cssText = "margin:6px 0;";
      const name = (it.name || "anon").toString().slice(0,18);
      const score = (it.score ?? 0)|0;
      const t = ((it.time_ms ?? 0)/1000).toFixed(1);
      li.textContent = `${name} — ${score} • ${t}s`;
      elTop.appendChild(li);
    }
    if (!rows.length) {
      const li = document.createElement("div");
      li.style.cssText = "opacity:.7; font-size:12px; margin-top:8px;";
      li.textContent = "Пока пусто. Сыграй и умри 😅 (результат отправится)";
      elTop.appendChild(li);
    }
  }

  async function submit(payload){
    try {
      const seed = getSeed();
      const mode = getMode();
      const name = (inputName?.value || localStorage.getItem("newsnake_name") || "anon").trim().slice(0,18) || "anon";

      const body = Object.assign({
        name,
        seed,
        mode,
        version: "newsnake-pages-v1",
      }, payload || {});

      await fetch("/api/submit", {
        method: "POST",
        headers: {"content-type":"application/json"},
        body: JSON.stringify(body),
      });
    } catch(e) {}
  }

  async function loadGhost(){
    try {
      const seed = getSeed();
      const mode = getMode();
      const url = `/api/ghost?seed=${encodeURIComponent(seed)}&mode=${encodeURIComponent(mode)}`;
      const r = await fetch(url);
      const j = await r.json();

      // Update info
      if (j && j.name) elGhost.textContent = `Призрак дня: ${j.name} (${((j.time_ms||0)/1000).toFixed(1)}s)`;
      else elGhost.textContent = "Призрак дня: нет данных";

      // Pass ghost path to game (if it exists)
      if (j && j.ghost && window.ONLINE) {
        try {
          const arr = JSON.parse(j.ghost);
          window.ONLINE.ghostPath = arr;
          window.ONLINE.ghostIdx = 0;
        } catch(e) {}
      }
    } catch(e) {
      elGhost.textContent = "Призрак дня: ошибка";
    }
  }

  // init panel hidden by default
  setPanelVisible(false);

  // name persistence
  const saved = localStorage.getItem("newsnake_name");
  if (inputName && saved) inputName.value = saved;
  if (btnSave) btnSave.addEventListener("click", () => {
    const v = (inputName.value || "").trim().slice(0,18);
    localStorage.setItem("newsnake_name", v || "anon");
    if (window.AudioFX) window.AudioFX.click();
    refreshTop();
  });

  if (btnRefresh) btnRefresh.addEventListener("click", () => {
    if (window.AudioFX) window.AudioFX.click();
    refreshTop();
  });

  if (btnTop) btnTop.addEventListener("click", () => {
    if (window.AudioFX) window.AudioFX.click();
    togglePanel();
  });

  // sliders bind
  function syncSliders(){
    if (!window.AudioFX) return;
    sfxVol.value = window.AudioFX.getSfxVolume().toFixed(2);
    musVol.value = window.AudioFX.getMusicVolume().toFixed(2);
    sfxVal.textContent = Math.round(window.AudioFX.getSfxVolume()*100) + "%";
    musVal.textContent = Math.round(window.AudioFX.getMusicVolume()*100) + "%";
  }
  syncSliders();

  if (sfxVol) sfxVol.addEventListener("input", () => {
    if (!window.AudioFX) return;
    window.AudioFX.setSfxVolume(parseFloat(sfxVol.value));
    sfxVal.textContent = Math.round(window.AudioFX.getSfxVolume()*100) + "%";
  });
  if (musVol) musVol.addEventListener("input", () => {
    if (!window.AudioFX) return;
    window.AudioFX.setMusicVolume(parseFloat(musVol.value));
    musVal.textContent = Math.round(window.AudioFX.getMusicVolume()*100) + "%";
  });

  if (ghostToggle) ghostToggle.addEventListener("click", async () => {
    window.ONLINE.showGhost = !window.ONLINE.showGhost;
    ghostToggle.textContent = window.ONLINE.showGhost ? "👻 Призрак: ON" : "👻 Призрак: OFF";
    if (window.AudioFX) window.AudioFX.click();
  });

  if (audioTest) audioTest.addEventListener("click", async () => {
    if (window.AudioFX) {
      await window.AudioFX.unlock();
      window.AudioFX.coin();
      setTimeout(()=>window.AudioFX.levelUp(), 130);
      setTimeout(()=>window.AudioFX.dash(), 280);
    }
  });

  // public API
  window.OnlineUI = {
    togglePanel,
    refreshTop,
    submit,
    loadGhost,
  };
})();
