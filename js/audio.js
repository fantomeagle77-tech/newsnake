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
  function mulberry32(a){ return function(){ a|=0; a=a+0x6D2B79F5|0; let t=Math.imul(a^a>>>15,1|a); t=t+Math.imul(t^t>>>7,61|t)^t; return ((t^t>>>14)>>>0)/4294967296; }; }

  function startMusic(seed=0){
    if(!musicOn) return;
    ensure();
    if(musicTimer) return;
  
    const rng = mulberry32((seed||Date.now())>>>0);
  
    // scale choices: minor / dorian-ish
    const scales = [
      [0,2,3,5,7,8,10],   // natural minor
      [0,2,3,5,7,9,10],   // dorian
      [0,1,3,5,7,8,10],   // phrygian-ish
    ];
    const scale = scales[Math.floor(rng()*scales.length)];
  
    // base key around A2..D3
    const baseMidi = 45 + Math.floor(rng()*8); // 45..52
    const bpm = 74 + Math.floor(rng()*20);     // 74..93
    const step = 60 / bpm;                      // quarter note seconds
  
    // instruments
    const lp = ctx.createBiquadFilter();
    lp.type="lowpass"; lp.frequency.value = 900;
    lp.connect(music);
  
    const bassG = ctx.createGain(); bassG.gain.value = 0.22;
    bassG.connect(lp);
  
    const padG = ctx.createGain(); padG.gain.value = 0.18;
    padG.connect(lp);
  
    const leadG = ctx.createGain(); leadG.gain.value = 0.12;
    leadG.connect(lp);
  
    // helper: midi->hz
    const m2h = (m)=> 440*Math.pow(2,(m-69)/12);
  
    // simple progression degrees (tonic/sub/med)
    const degrees = [0, 3, 4, 5];
    let bar = 0;
  
    function pickNote(oct=0){
      const deg = degrees[Math.floor(rng()*degrees.length)];
      const n = baseMidi + 12*oct + scale[(deg + Math.floor(rng()*3)) % scale.length];
      return n;
    }
  
    function playPad(t0){
      const root = pickNote(0);
      const third = root + 3 + (rng()<0.4?1:0);
      const fifth = root + 7;
  
      [root, third, fifth].forEach((m,i)=>{
        const o = ctx.createOscillator();
        o.type="sine";
        o.frequency.value = m2h(m);
        const g = ctx.createGain();
        g.gain.value = 0.0001;
        envGain(g.gain, t0, 0.10, step*3.7, 0.22, 0.0001);
        o.connect(g); g.connect(padG);
        o.start(t0); o.stop(t0 + step*4.0);
      });
    }
  
    function playBass(t0){
      const m = pickNote(-1);
      const o = ctx.createOscillator();
      o.type="triangle";
      o.frequency.value = m2h(m);
      const g = ctx.createGain();
      g.gain.value = 0.0001;
      envGain(g.gain, t0, 0.01, step*0.85, 0.20, 0.0001);
      o.connect(g); g.connect(bassG);
      o.start(t0); o.stop(t0 + step*1.0);
    }
  
    function playLead(t0){
      if(rng() < 0.45) return; // не всегда, чтобы не надоедало
      const m = pickNote(1) + (rng()<0.25?12:0);
      const o = ctx.createOscillator();
      o.type="sine";
      o.frequency.value = m2h(m);
      o.detune.value = (rng()*10 - 5);
      const g = ctx.createGain();
      g.gain.value = 0.0001;
      envGain(g.gain, t0, 0.005, step*0.45, 0.10, 0.0001);
      o.connect(g); g.connect(leadG);
      o.start(t0); o.stop(t0 + step*0.55);
    }
  
    // light hat (noise)
    function playHat(t0){
      if(rng() < 0.25) return;
      const dur = 0.03 + rng()*0.02;
      const len = Math.floor(ctx.sampleRate * dur);
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for(let i=0;i<len;i++) data[i]=(Math.random()*2-1)*(1-i/len);
  
      const src = ctx.createBufferSource(); src.buffer=buf;
      const hp = ctx.createBiquadFilter(); hp.type="highpass"; hp.frequency.value=2500;
      const g = ctx.createGain(); g.gain.value = 0.0001;
      envGain(g.gain, t0, 0.002, dur, 0.08, 0.0001);
      src.connect(hp); hp.connect(g); g.connect(music);
      src.start(t0); src.stop(t0 + dur + 0.01);
    }
  
    // scheduler
    let nextT = ctx.currentTime + 0.05;
    let stepIdx = 0;
  
    musicTimer = setInterval(()=>{
      if(!musicOn) return;
  
      const now = ctx.currentTime;
      while(nextT < now + 0.20){
        // каждые 4 шага — pad
        if(stepIdx % 4 === 0) playPad(nextT);
        // бас на каждом шаге
        playBass(nextT);
        // лид иногда
        playLead(nextT + step*0.15);
        // хэт
        playHat(nextT + step*0.5);
  
        stepIdx++;
        nextT += step;
  
        // очень медленная смена фильтра
        if(stepIdx % 32 === 0){
          lp.frequency.setTargetAtTime(700 + rng()*900, now, 0.8);
        }
      }
      bar++;
    }, 60);
  }
  
  function stopMusic(){
    if(musicTimer){ clearInterval(musicTimer); musicTimer=null; }
  }

  // ---------- UI helpers ----------
  AudioFX.setEnabled = (v) => { enabled = !!v; };
  AudioFX.toggleEnabled = () => { enabled = !enabled; AudioFX.click(); return enabled; };

  AudioFX.toggleMusic = async () => {
    musicOn = !musicOn;
    await unlock();
    const daySeed = new Date().getUTCFullYear()*10000 + (new Date().getUTCMonth()+1)*100 + new Date().getUTCDate();
    if (musicOn) startMusic(daySeed); else stopMusic();
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
