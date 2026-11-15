// audio.js — the sound of the room. Pure Web Audio, fully procedural, no files.
// Graph builders take a context parameter so they can also render offline.

const TAU = Math.PI * 2;
const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

// ---------- helpers ----------
function ramp(param, value, ctx, dur = 0.3) {
  try {
    const t = ctx.currentTime;
    param.cancelScheduledValues(t);
    param.setValueAtTime(param.value, t);
    param.linearRampToValueAtTime(value, t + Math.max(0.01, dur));
  } catch (e) { /* ignore */ }
}

// percussive envelope on a gain param: fast attack, exponential decay
function env(param, t, peak, attack, decay) {
  param.setValueAtTime(0.00001, t);
  param.linearRampToValueAtTime(Math.max(peak, 0.00002), t + attack);
  param.exponentialRampToValueAtTime(0.00001, t + attack + decay);
}

function makeNoise(ctx, kind, seconds) {
  const sr = ctx.sampleRate, n = Math.floor(sr * seconds);
  const buf = ctx.createBuffer(1, n, sr);
  const d = buf.getChannelData(0);
  if (kind === 'white') {
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  } else if (kind === 'pink') { // Paul Kellet
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < n; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759;
      b2 = 0.969 * b2 + w * 0.153852; b3 = 0.8665 * b3 + w * 0.3104856;
      b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
      d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11; b6 = w * 0.115926;
    }
  } else { // brown
    let last = 0;
    for (let i = 0; i < n; i++) {
      const w = Math.random() * 2 - 1;
      last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5;
    }
  }
  // make loop seamless: short crossfade of the tail into the head
  const x = Math.min(Math.floor(sr * 0.05), n >> 2);
  for (let i = 0; i < x; i++) {
    const a = i / x;
    d[i] = d[i] * a + d[n - x + i] * (1 - a);
  }
  return buf;
}

// Generated hall impulse response: early reflections + exponentially decaying
// stereo noise, high-frequency damping increasing with time. RT60 ~ 2.5 s.
export function makeImpulse(ctx, rt60 = 2.5, length = 3.0) {
  const sr = ctx.sampleRate, n = Math.floor(sr * length);
  const buf = ctx.createBuffer(2, n, sr);
  const k = Math.log(1000) / rt60; // -60 dB at rt60
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    let lp = 0;
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      const damp = clamp(0.92 - t * 0.28, 0.35, 0.92); // one-pole LP coefficient: darker over time
      const w = Math.random() * 2 - 1;
      lp = lp * (1 - damp) + w * damp; // smoothing (higher damp => brighter)
      const pre = t < 0.012 ? 0 : Math.min(1, (t - 0.012) / 0.05); // soft onset after pre-delay
      d[i] = lp * Math.exp(-k * t) * pre;
    }
    // discrete early reflections (floor/ceiling/walls of a 13 x 34 x 6.4 m hall)
    const taps = [0.014, 0.021, 0.029, 0.037, 0.046, 0.058, 0.071, 0.089];
    taps.forEach((tt, j) => {
      const idx = Math.floor((tt + (c ? 0.0017 : 0)) * sr);
      if (idx < n) d[idx] += (j % 2 ? -1 : 1) * (0.55 - j * 0.045);
    });
  }
  // normalise energy so wet level is predictable
  let e = 0;
  for (let c = 0; c < 2; c++) { const d = buf.getChannelData(c); for (let i = 0; i < n; i++) e += d[i] * d[i]; }
  const g = 1 / Math.sqrt(e / 2);
  for (let c = 0; c < 2; c++) { const d = buf.getChannelData(c); for (let i = 0; i < n; i++) d[i] *= g; }
  return buf;
}

function makePan(ctx, v) {
  if (ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = clamp(v, -1, 1); return p; }
  return ctx.createGain();
}

// ---------- engine: bus + reverb + limiter ----------
export function buildEngine(ctx, destination) {
  const master = ctx.createGain();
  master.gain.value = 0;
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -6; limiter.knee.value = 6; limiter.ratio.value = 12;
  limiter.attack.value = 0.003; limiter.release.value = 0.2;
  master.connect(limiter); limiter.connect(destination || ctx.destination);

  const dry = ctx.createGain(); dry.gain.value = 1; dry.connect(master);
  const conv = ctx.createConvolver();
  conv.buffer = makeImpulse(ctx);
  const wetIn = ctx.createGain(); wetIn.gain.value = 1;
  const wetOut = ctx.createGain(); wetOut.gain.value = 0.9;
  wetIn.connect(conv); conv.connect(wetOut); wetOut.connect(master);

  const noise = { white: makeNoise(ctx, 'white', 2), pink: makeNoise(ctx, 'pink', 6), brown: makeNoise(ctx, 'brown', 8) };
  return { ctx, master, dry, wetIn, noise, tone: null, lastReveal: -10, hum: null };
}

function noiseSrc(E, kind, loop = true) {
  const s = E.ctx.createBufferSource();
  s.buffer = E.noise[kind]; s.loop = loop;
  return s;
}

// ---------- room tone ----------
export function buildRoomTone(E, level = 1, fade = 3) {
  const ctx = E.ctx, t0 = ctx.currentTime;
  const out = ctx.createGain(); out.gain.setValueAtTime(0, t0); out.gain.linearRampToValueAtTime(level, t0 + fade);
  out.connect(E.dry);
  const send = ctx.createGain(); send.gain.value = 0.5; out.connect(send); send.connect(E.wetIn);

  // air: brown noise low-passed, slowly breathing
  const air = noiseSrc(E, 'brown');
  air.loopStart = 0; air.start(t0, rand(0, 5));
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 480; lp.Q.value = 0.5;
  const airG = ctx.createGain(); airG.gain.value = 0.0075;
  const lfo = ctx.createOscillator(); lfo.frequency.value = 0.063;
  const lfoD = ctx.createGain(); lfoD.gain.value = 0.0022;
  lfo.connect(lfoD); lfoD.connect(airG.gain); lfo.start(t0);
  const lfoF = ctx.createOscillator(); lfoF.frequency.value = 0.037;
  const lfoFD = ctx.createGain(); lfoFD.gain.value = 90;
  lfoF.connect(lfoFD); lfoFD.connect(lp.frequency); lfoF.start(t0);
  air.connect(lp); lp.connect(airG); airG.connect(out);

  // pink body for a little air (high-ish, very soft)
  const pk = noiseSrc(E, 'pink'); pk.start(t0, rand(0, 4));
  const pkF = ctx.createBiquadFilter(); pkF.type = 'lowpass'; pkF.frequency.value = 900;
  const pkG = ctx.createGain(); pkG.gain.value = 0.0035;
  pk.connect(pkF); pkF.connect(pkG); pkG.connect(out);

  // HVAC hum 55 Hz + harmonics, barely there
  [[55, 0.0016], [110, 0.0009], [165, 0.0004], [220, 0.00018]].forEach(([f, a], i) => {
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f * (1 + (i ? 0.0007 * i : 0));
    const g = ctx.createGain(); g.gain.value = a; o.connect(g); g.connect(out); o.start(t0);
  });

  // distant outside life through the open door: band-limited wash, mostly reverberant
  const od = noiseSrc(E, 'pink'); od.start(t0, rand(0, 4));
  const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 650; bp.Q.value = 0.6;
  const lp2 = ctx.createBiquadFilter(); lp2.type = 'lowpass'; lp2.frequency.value = 1600;
  const odG = ctx.createGain(); odG.gain.value = 0.0042;
  const odL = ctx.createOscillator(); odL.frequency.value = 0.11;
  const odLD = ctx.createGain(); odLD.gain.value = 0.002;
  odL.connect(odLD); odLD.connect(odG.gain); odL.start(t0);
  od.connect(bp); bp.connect(lp2); lp2.connect(odG); odG.connect(out);
  const odSend = ctx.createGain(); odSend.gain.value = 1.2; odG.connect(odSend); odSend.connect(E.wetIn);

  E.tone = out;
  return out;
}

// ---------- footsteps ----------
// One leather-soled step on polished concrete: heel strike, then softer toe.
export function scheduleStep(E, t, { level = 1, pan = 0, soft = 1, pitch = 1 } = {}) {
  const ctx = E.ctx;
  const p = pitch * rand(0.93, 1.08);
  const lv = level * rand(0.8, 1.1) * soft;
  const panner = makePan(ctx, pan);
  const dry = ctx.createGain(); dry.gain.value = 1;
  const send = ctx.createGain(); send.gain.value = 0.55;
  panner.connect(dry); dry.connect(E.dry);
  panner.connect(send); send.connect(E.wetIn);

  const strike = (tt, amp, bpf, decay, click) => {
    // noise burst through bandpass
    const n = noiseSrc(E, 'white', false);
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = bpf * p; f.Q.value = 1.3;
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 900;
    const g = ctx.createGain(); env(g.gain, tt, amp, 0.0015, decay);
    n.connect(f); f.connect(hp); hp.connect(g); g.connect(panner);
    n.start(tt, rand(0, 1.5)); n.stop(tt + decay + 0.05);
    if (click) { // hard sole "tick": short ringing resonance
      const o = ctx.createOscillator(); o.type = 'sine';
      o.frequency.value = rand(1500, 2100) * p;
      const og = ctx.createGain(); env(og.gain, tt, amp * 0.28, 0.0008, 0.022);
      o.connect(og); og.connect(panner); o.start(tt); o.stop(tt + 0.05);
    }
  };
  const tHeel = t, tToe = t + rand(0.07, 0.1);
  strike(tHeel, 0.30 * lv, 2800, 0.03, true);
  strike(tToe, 0.13 * lv, 2100, 0.024, false);

  // tiny low thud of the body weight landing
  const th = ctx.createOscillator(); th.type = 'sine';
  th.frequency.setValueAtTime(110 * p, t); th.frequency.exponentialRampToValueAtTime(52, t + 0.09);
  const thg = ctx.createGain(); env(thg.gain, t, 0.07 * lv, 0.004, 0.09);
  th.connect(thg); thg.connect(panner); th.start(t); th.stop(t + 0.14);
}

// ---------- lights on ----------
export function scheduleRelay(E, t, i, count) {
  const ctx = E.ctx;
  const f = count > 1 ? clamp(i / (count - 1), 0, 1) : 0; // 0 near the entrance, 1 far end
  const level = 0.24 * (1 - 0.55 * f);
  const darkHz = 5200 - 3000 * f;
  const pan = (i % 2 ? 1 : -1) * (0.18 + 0.22 * f) + rand(-0.08, 0.08);
  const panner = makePan(ctx, pan);
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = darkHz; lp.Q.value = 0.4;
  const dry = ctx.createGain(); dry.gain.value = 1 - 0.45 * f;
  const send = ctx.createGain(); send.gain.value = 0.9 + 0.7 * f;
  panner.connect(lp); lp.connect(dry); dry.connect(E.dry); lp.connect(send); send.connect(E.wetIn);

  // contactor body: low thump
  const o = ctx.createOscillator(); o.type = 'sine';
  o.frequency.setValueAtTime(95, t); o.frequency.exponentialRampToValueAtTime(38, t + 0.22);
  const og = ctx.createGain(); env(og.gain, t, level * 0.9, 0.004, 0.24);
  o.connect(og); og.connect(panner); o.start(t); o.stop(t + 0.35);

  // mechanical clack: band noise
  const click = (tt, amp, fc, dec) => {
    const n = noiseSrc(E, 'white', false);
    const b = ctx.createBiquadFilter(); b.type = 'bandpass'; b.frequency.value = fc; b.Q.value = 1.1;
    const g = ctx.createGain(); env(g.gain, tt, amp, 0.001, dec);
    n.connect(b); b.connect(g); g.connect(panner); n.start(tt, rand(0, 1.5)); n.stop(tt + dec + 0.05);
    const r = ctx.createOscillator(); r.type = 'square'; r.frequency.value = fc * 1.7;
    const rf = ctx.createBiquadFilter(); rf.type = 'bandpass'; rf.frequency.value = fc * 1.7; rf.Q.value = 8;
    const rg = ctx.createGain(); env(rg.gain, tt, amp * 0.18, 0.001, dec * 1.5);
    r.connect(rf); rf.connect(rg); rg.connect(panner); r.start(tt); r.stop(tt + dec * 2 + 0.05);
  };
  click(t, level * 1.1, 900, 0.07);
  click(t + 0.004, level * 0.5, 2400, 0.045);
  click(t + 0.075, level * 0.5, 1300, 0.05); // armature settles
  const t2 = t + 0.075; // tiny second thump
  const o2 = ctx.createOscillator(); o2.type = 'sine';
  o2.frequency.setValueAtTime(70, t2); o2.frequency.exponentialRampToValueAtTime(45, t2 + 0.1);
  const o2g = ctx.createGain(); env(o2g.gain, t2, level * 0.35, 0.004, 0.1);
  o2.connect(o2g); o2g.connect(panner); o2.start(t2); o2.stop(t2 + 0.2);
}

// gentle rising ballast hum that settles at a whisper
export function buildBallast(E, t) {
  const ctx = E.ctx;
  const out = ctx.createGain();
  out.gain.setValueAtTime(0.00001, t);
  out.gain.linearRampToValueAtTime(0.0065, t + 2.2);
  out.gain.linearRampToValueAtTime(0.0022, t + 5.5);
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(260, t);
  lp.frequency.linearRampToValueAtTime(520, t + 2.2); lp.frequency.linearRampToValueAtTime(380, t + 5.5);
  lp.connect(out); out.connect(E.dry);
  const send = ctx.createGain(); send.gain.value = 0.8; out.connect(send); send.connect(E.wetIn);
  [[100, 1], [200, 0.55], [300, 0.3], [400, 0.12]].forEach(([f, a]) => {
    const o = ctx.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(f * 0.93, t); o.frequency.linearRampToValueAtTime(f, t + 2.4);
    const g = ctx.createGain(); g.gain.value = a * 0.5; o.connect(g); g.connect(lp); o.start(t);
  });
  return out;
}

// ---------- reveal ----------
export function scheduleReveal(E, t) {
  const ctx = E.ctx;
  const out = ctx.createGain(); out.gain.value = 1;
  const send = ctx.createGain(); send.gain.value = 1.0;
  out.connect(E.dry); out.connect(send); send.connect(E.wetIn);
  const n = noiseSrc(E, 'pink', false);
  const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 0.9;
  bp.frequency.setValueAtTime(1800, t); bp.frequency.exponentialRampToValueAtTime(4800, t + 1.2);
  const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 1000;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.00001, t);
  g.gain.linearRampToValueAtTime(0.045, t + 0.55);
  g.gain.exponentialRampToValueAtTime(0.00001, t + 1.55);
  n.connect(bp); bp.connect(hp); hp.connect(g); g.connect(out);
  n.start(t, rand(0, 4)); n.stop(t + 1.6);
  const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = 2637;
  const og = ctx.createGain();
  og.gain.setValueAtTime(0.00001, t); og.gain.linearRampToValueAtTime(0.0055, t + 0.5);
  og.gain.exponentialRampToValueAtTime(0.00001, t + 1.5);
  o.connect(og); og.connect(out); o.start(t); o.stop(t + 1.6);
}

// ---------- public ----------
export function createAudio() {
  const A = {
    ctx: null, E: null, started: false, starting: null,
    muted: false, hidden: false,
    speed: 0, moving: false, wasMoving: false,
    nextStep: 0, lastStep: -10, side: 1, stepCount: 0,
    lightsHum: false,
  };
  const MASTER = 0.9;

  const usable = () => A.started && A.ctx && A.E && !A.muted && !A.hidden && A.ctx.state !== 'closed';

  function onVis() {
    const c = A.ctx; if (!c) return;
    A.hidden = typeof document !== 'undefined' && !!document.hidden;
    try {
      if (A.hidden) c.suspend && c.suspend().catch(() => {});
      else c.resume && c.resume().catch(() => {});
    } catch (e) { /* ignore */ }
  }

  const api = {
    get muted() { return A.muted; },

    async start() {
      if (A.started) { try { if (A.ctx.state === 'suspended' && !A.hidden) await A.ctx.resume(); } catch (e) {} return; }
      if (A.starting) return A.starting;
      A.starting = (async () => {
        try {
          const AC = (typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext)) ||
                     (typeof globalThis !== 'undefined' && globalThis.AudioContext);
          if (!AC) return;
          const ctx = new AC({ latencyHint: 'interactive' });
          const E = buildEngine(ctx);
          A.ctx = ctx; A.E = E;
          if (typeof document !== 'undefined') {
            A.hidden = !!document.hidden;
            document.addEventListener('visibilitychange', onVis);
          }
          try { if (ctx.state === 'suspended' && !A.hidden) await ctx.resume(); } catch (e) {}
          buildRoomTone(E, 1, 3);
          ramp(E.master.gain, A.muted ? 0 : MASTER, ctx, 1.2);
          A.nextStep = ctx.currentTime;
          A.started = true;
        } catch (e) { A.ctx = null; A.E = null; A.started = false; }
        finally { A.starting = null; }
      })();
      return A.starting;
    },

    setMuted(m) {
      A.muted = !!m;
      if (!A.started || !A.E) return;
      try { ramp(A.E.master.gain, A.muted ? 0 : MASTER, A.ctx, A.muted ? 0.25 : 0.6); } catch (e) {}
    },

    setMotion(m) {
      try {
        const s = m && Number.isFinite(m.speed) ? m.speed : 0;
        A.speed = s; A.moving = !!(m && m.moving) && s >= 0.25;
      } catch (e) {}
    },

    lightsOn(i, count) {
      if (!usable()) return;
      try {
        const t = A.ctx.currentTime + 0.02;
        const idx = Number.isFinite(i) ? i : 0, cnt = Number.isFinite(count) ? count : 1;
        scheduleRelay(A.E, t, idx, cnt);
        if (!A.lightsHum) { A.lightsHum = true; buildBallast(A.E, t + 0.05); }
      } catch (e) {}
    },

    reveal() {
      if (!usable()) return;
      try {
        const now = A.ctx.currentTime;
        if (now - A.E.lastReveal < 2) return;
        A.E.lastReveal = now;
        scheduleReveal(A.E, now + 0.03);
      } catch (e) {}
    },

    update(dt) {
      try {
        if (!A.started || !A.ctx || A.hidden || A.ctx.state !== 'running') { A.wasMoving = A.moving; return; }
        const now = A.ctx.currentTime;
        const rate = clamp(1.9 + (A.speed - 1.6) * 0.62, 1.0, 3.3); // steps per second
        const period = 1 / rate;
        const hurry = clamp((A.speed - 1.6) / 1.5, 0, 1);
        const mk = (t, soft) => {
          A.side = -A.side;
          scheduleStep(A.E, t, { level: 0.85 + 0.25 * hurry, pan: A.side * rand(0.08, 0.2), soft, pitch: 1 + 0.03 * hurry });
          A.lastStep = t; A.stepCount++;
        };
        if (A.moving) {
          if (!A.wasMoving || A.nextStep < now - 0.25) A.nextStep = now + 0.03;
          if (!A.muted) {
            while (A.nextStep < now + 0.1) {
              mk(Math.max(now, A.nextStep + rand(-0.015, 0.015)), 1);
              A.nextStep += period;
            }
          } else A.nextStep = now + 0.03;
        } else if (A.wasMoving && !A.muted) {
          // final settling step on stopping, if one is due soon
          if (A.nextStep - now < 0.4 && now - A.lastStep < 0.7) mk(Math.max(now + 0.02, A.nextStep), 0.6);
        }
        A.wasMoving = A.moving;
      } catch (e) {}
    },
  };
  return api;
}

// Offline-render hook (dev harness only; not part of the Audio object)
createAudio.__graph = { buildEngine, buildRoomTone, scheduleStep, scheduleRelay, buildBallast, scheduleReveal, makeImpulse };
