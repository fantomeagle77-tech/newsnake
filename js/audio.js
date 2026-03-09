// js/audio.js
(() => {
  const AudioFX = {};
  let ctx = null;
  let master = null, sfx = null, music = null;
  let enabled = true;
  let musicOn = false;
  let started = false;
  let musicTimer = null;

  function ensure() {
    if (ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    ctx = new AC();

    master = ctx.createGain(); master.gain.value = 0.9;
    sfx = ctx.createGain();    sfx.gain.value = 0.9;
    music = ctx.createGain();  music.gain.value = 0.25;

    sfx.connect(master);
    music.connect(master);
    master.connect(ctx.destination);
  }

  async function unlock() {
    ensure();
    if (ctx.state !== "running") {
      try { await ctx.resume(); } catch {}
    }
    started = true;
  }

  function envGain(g, t0, a, d, peak=1, end=0.0001) {
    g.cancelScheduledValues(t0);
    g.setValueAtTime(end, t0);
    g.linearRampToValueAtTime(peak, t0 + a);
    g.exponentialRampToValueAtTime(end, t0 + a + d);
  }

  function oscTone(freq, dur, type="sine", vol=0.25, detune=0) {
    if (!enabled) return;
    ensure();
    const t0 = ctx.currentTime;

    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    o.detune.value = detune;

    g.gain.value = 0.0001;
    envGain(g.gain, t0, 0.005, Math.max(0.02, dur - 0.005), vol);

    o.connect(g);
    g.connect(sfx);

    o.start(t0);
    o.stop(t0 + dur + 0.02);
  }

  function noiseBurst(dur=0.12, vol=0.25, hp=500) {
    if (!enabled) return;
    ensure();
    const t0 = ctx.currentTime;

    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i=0;i<len;i++) data[i] = (Math.random()*2-1) * (1 - i/len);

    const src = ctx.createBufferSource();
    src.buffer = buf;

    const filt = ctx.createBiquadFilter();
    filt.type = "highpass";
    filt.frequency.value = hp;

    const g = ctx.createGain();
    g.gain.value = 0.0001;
    envGain(g.gain, t0, 0.002, dur, vol);

    src.connect(filt);
    filt.connect(g);
    g.connect(sfx);

    src.start(t0);
    src.stop(t0 + dur + 0.02);
  }

  // ---------- SFX ----------
  AudioFX.coin = () => { oscTone(880, 0.07, "triangle", 0.18); oscTone(1320, 0.06, "sine", 0.12); };
  AudioFX.power = () => { oscTone(440, 0.10, "sine", 0.15); oscTone(660, 0.12, "triangle", 0.12); };
  AudioFX.dash = () => { oscTone(220, 0.12, "sawtooth", 0.12); oscTone(520, 0.09, "triangle", 0.08); };
  AudioFX.hit  = () => { noiseBurst(0.10, 0.22, 800); oscTone(110, 0.18, "sine", 0.12); };
  AudioFX.dead = () => { oscTone(220, 0.25, "sine", 0.14); oscTone(140, 0.35, "sine", 0.10); };
  AudioFX.levelUp = () => { oscTone(440, 0.10, "triangle", 0.14); oscTone(660, 0.10, "triangle", 0.13); oscTone(880, 0.12, "triangle", 0.12); };
  AudioFX.click = () => { oscTone(600, 0.04, "square", 0.08); };

  // ---------- MUSIC (procedural ambient) ----------
  function playChord(rootHz) {
    const t0 = ctx.currentTime;
    const notes = [1, 5/4, 3/2]; // major-ish
    const filt = ctx.createBiquadFilter();
    filt.type = "lowpass";
    filt.frequency.value = 650;

    const g = ctx.createGain();
    g.gain.value = 0.0001;
    envGain(g.gain, t0, 0.06, 1.8, 0.22);

    filt.connect(g);
    g.connect(music);

    for (let i=0;i<notes.length;i++) {
      const o = ctx.createOscillator();
      o.type = "sine";
      o.frequency.value = rootHz * notes[i];
      o.detune.value = (i===0? -6 : i===1? 4 : 9);
      o.connect(filt);
      o.start(t0);
      o.stop(t0 + 2.0);
    }
  }

  function startMusic() {
    if (!musicOn) return;
    ensure();
    if (musicTimer) return;

    const roots = [196, 220, 246, 174]; // G3 A3 B3 F3
    let k = 0;
    playChord(roots[k % roots.length]);
    musicTimer = setInterval(() => {
      if (!musicOn) return;
      k++;
      playChord(roots[k % roots.length]);
    }, 1900);
  }

  function stopMusic() {
    if (musicTimer) {
      clearInterval(musicTimer);
      musicTimer = null;
    }
  }

  // ---------- UI helpers ----------
  AudioFX.setEnabled = (v) => { enabled = !!v; };
  AudioFX.toggleEnabled = () => { enabled = !enabled; AudioFX.click(); return enabled; };

  AudioFX.toggleMusic = async () => {
    musicOn = !musicOn;
    await unlock();
    if (musicOn) startMusic(); else stopMusic();
    AudioFX.click();
    return musicOn;
  };

  AudioFX.unlock = unlock;

  // start audio on first user gesture
  AudioFX.autoUnlock = () => {
    const go = async () => {
      await unlock();
      window.removeEventListener("pointerdown", go, true);
      window.removeEventListener("keydown", go, true);
    };
    window.addEventListener("pointerdown", go, true);
    window.addEventListener("keydown", go, true);
  };

  window.AudioFX = AudioFX;
})();
