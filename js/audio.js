// js/audio.js
// Lightweight WebAudio: SFX + generative ambient (no annoying "saw")
(() => {
  const LS_SFX = "newsnake_sfxVol";
  const LS_MUS = "newsnake_musicVol";
  const LS_MUS_ON = "newsnake_musicOn";
  const LS_ENABLED = "newsnake_soundOn";

  let ctx = null;
  let unlocked = false;

  let enabled = (localStorage.getItem(LS_ENABLED) ?? "1") !== "0";
  let musicOn = (localStorage.getItem(LS_MUS_ON) ?? "1") !== "0";

  let sfxVol = clamp(parseFloat(localStorage.getItem(LS_SFX) ?? "0.35"), 0, 1);
  let musicVol = clamp(parseFloat(localStorage.getItem(LS_MUS) ?? "0.18"), 0, 1);

  let masterGain, sfxGain, musicGain;

  // music state
  let musicTimer = null;
  let musicNodes = [];

  function clamp(v, a, b){ return Math.max(a, Math.min(b, v)); }
  function rnd(a=1){ return Math.random()*a; }

  function ensure() {
    if (ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    ctx = new AC();
    masterGain = ctx.createGain();
    sfxGain = ctx.createGain();
    musicGain = ctx.createGain();
    sfxGain.connect(masterGain);
    musicGain.connect(masterGain);
    masterGain.connect(ctx.destination);
    applyVolumes();
  }

  function applyVolumes() {
    if (!ctx) return;
    const e = enabled ? 1 : 0;
    sfxGain.gain.value = e * sfxVol;
    musicGain.gain.value = e * (musicOn ? musicVol : 0);
  }

  async function unlock() {
    ensure();
    try { if (ctx.state === "suspended") await ctx.resume(); } catch(e) {}
    unlocked = true;
    if (enabled && musicOn) startMusic();
  }

  function autoUnlock() {
    const once = { once: true, passive: true };
    window.addEventListener("pointerdown", unlock, once);
    window.addEventListener("keydown", unlock, once);
    window.addEventListener("touchstart", unlock, once);
  }

  // ---------- SFX helpers ----------
  function envGain(g, t0, a, d, peak) {
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(peak, t0 + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + a + d);
  }

  function beep(freq=440, dur=0.12, type="sine", peak=0.25, detune=0) {
    if (!enabled) return;
    ensure();
    const t0 = ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (detune) o.detune.setValueAtTime(detune, t0);
    envGain(g, t0, 0.008, Math.max(0.03, dur), peak);
    o.connect(g);
    g.connect(sfxGain);
    o.start(t0);
    o.stop(t0 + dur + 0.08);
  }

  function noiseBurst(dur=0.08, peak=0.12) {
    if (!enabled) return;
    ensure();
    const t0 = ctx.currentTime;
    const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * dur), ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i=0;i<data.length;i++) data[i] = (Math.random()*2-1) * Math.pow(1 - i/data.length, 2);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const g = ctx.createGain();
    envGain(g, t0, 0.001, dur, peak);
    src.connect(g);
    g.connect(sfxGain);
    src.start(t0);
    src.stop(t0 + dur + 0.02);
  }

  // ---------- MUSIC (generative ambient) ----------
  function stopMusic() {
    if (musicTimer) { clearInterval(musicTimer); musicTimer = null; }
    for (const n of musicNodes) {
      try { n.stop(); } catch(e) {}
      try { n.disconnect(); } catch(e) {}
    }
    musicNodes = [];
  }

  function startMusic() {
    if (!unlocked || !enabled || !musicOn) return;
    ensure();
    stopMusic();

    // soft pad: 2 oscillators + lowpass + slow LFO
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 680;
    lp.Q.value = 0.7;

    const padGain = ctx.createGain();
    padGain.gain.value = 0.0;

    lp.connect(padGain);
    padGain.connect(musicGain);

    const lfo = ctx.createOscillator();
    lfo.type = "sine";
    lfo.frequency.value = 0.08 + rnd(0.06);
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 90;
    lfo.connect(lfoGain);
    lfoGain.connect(lp.frequency);

    lfo.start();
    musicNodes.push(lfo, lp, padGain, lfoGain);

    const scale = [0, 3, 5, 7, 10]; // minor pentatonic
    const roots = [196, 220, 246, 174]; // a few base roots

    function noteToFreq(root, step, octave=0) {
      const semi = scale[step % scale.length] + octave*12;
      return root * Math.pow(2, semi/12);
    }

    function playPadChord() {
      const t0 = ctx.currentTime;
      const root = roots[Math.floor(rnd(roots.length))];
      const a = 1.2;   // attack
      const d = 3.8;   // decay
      const peak = 0.12;

      // clear previous pad osc
      musicNodes = musicNodes.filter(n => !(n && n._isPadOsc));
      // (we don't stop old ones; they naturally end soon)
      // new pad
      const o1 = ctx.createOscillator();
      const o2 = ctx.createOscillator();
      o1.type = "triangle";
      o2.type = "sine";

      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.linearRampToValueAtTime(peak, t0 + a);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + a + d);

      // choose "chord" notes by picking 3 scale steps (varies)
      const s1 = Math.floor(rnd(scale.length));
      const s2 = (s1 + 2 + Math.floor(rnd(2))) % scale.length;
      const s3 = (s1 + 4) % scale.length;

      o1.frequency.setValueAtTime(noteToFreq(root, s1, 0), t0);
      o2.frequency.setValueAtTime(noteToFreq(root, s2, 0), t0);
      // subtle detune = movement
      o2.detune.setValueAtTime(-7 + rnd(14), t0);

      // add a third "air" tone (very quiet)
      const o3 = ctx.createOscillator();
      o3.type = "sine";
      o3.frequency.setValueAtTime(noteToFreq(root, s3, 1), t0);
      o3.detune.setValueAtTime(-10 + rnd(20), t0);
      const g3 = ctx.createGain();
      g3.gain.setValueAtTime(0.0001, t0);
      g3.gain.linearRampToValueAtTime(0.045, t0 + a*0.8);
      g3.gain.exponentialRampToValueAtTime(0.0001, t0 + a + d);

      o1.connect(g);
      o2.connect(g);
      g.connect(lp);

      o3.connect(g3);
      g3.connect(lp);

      o1._isPadOsc = o2._isPadOsc = o3._isPadOsc = True

      o1.start(t0); o2.start(t0); o3.start(t0);
      o1.stop(t0 + a + d + 0.2);
      o2.stop(t0 + a + d + 0.2);
      o3.stop(t0 + a + d + 0.2);

      musicNodes.push(o1,o2,o3,g,g3);
    }

    // first chord immediately, then every ~4.2s with jitter
    playPadChord();
    musicTimer = setInterval(() => {
      if (!enabled || !musicOn) return;
      playPadChord();
    }, 3800 + Math.floor(rnd(900)));
  }

  // ---------- Public API ----------
  function toggleEnabled() {
    enabled = !enabled;
    localStorage.setItem(LS_ENABLED, enabled ? "1" : "0");
    if (!enabled) stopMusic();
    else if (unlocked && musicOn) startMusic();
    applyVolumes();
    return enabled;
  }

  function toggleMusic() {
    musicOn = !musicOn;
    localStorage.setItem(LS_MUS_ON, musicOn ? "1" : "0");
    if (!musicOn) stopMusic();
    else if (unlocked && enabled) startMusic();
    applyVolumes();
    return musicOn;
  }

  function setSfxVolume(v) {
    sfxVol = clamp(v, 0, 1);
    localStorage.setItem(LS_SFX, String(sfxVol));
    applyVolumes();
    return sfxVol;
  }

  function setMusicVolume(v) {
    musicVol = clamp(v, 0, 1);
    localStorage.setItem(LS_MUS, String(musicVol));
    applyVolumes();
    if (unlocked && enabled && musicOn) {
      // no restart needed; gain updates
    }
    return musicVol;
  }

  function getSfxVolume(){ return sfxVol; }
  function getMusicVolume(){ return musicVol; }

  // SFX mapping (pleasant, short)
  function click(){ beep(520, 0.06, "sine", 0.18); }
  function coin(){ beep(740, 0.07, "triangle", 0.22); beep(980, 0.05, "sine", 0.10); }
  function torch(){ beep(420, 0.10, "sine", 0.16); }
  function dash(){ beep(260, 0.09, "triangle", 0.22); noiseBurst(0.05, 0.06); }
  function hit(){ noiseBurst(0.09, 0.16); beep(150, 0.12, "triangle", 0.18); }
  function dead(){ noiseBurst(0.12, 0.22); beep(110, 0.18, "sine", 0.20); }
  function levelUp(){ beep(620, 0.09, "sine", 0.16); beep(820, 0.08, "triangle", 0.13); }

  window.AudioFX = {
    autoUnlock, unlock,
    toggleEnabled, toggleMusic,
    setSfxVolume, setMusicVolume,
    getSfxVolume, getMusicVolume,
    click, coin, torch, dash, hit, dead, levelUp,
  };
})();
