// audio.js — the sound of the room. Pure Web Audio, fully procedural, no files.
// Graph builders take a context parameter so they can also render offline.
//
// Mix: ONE AudioContext, ONE limiter. Everything sums into E.master (mute + level), then the limiter,
// then a soft clip that never lets the sum cross 0 dBFS (the limiter's 3 ms attack lets transients by).
//   effects, beds, weather, sfx.js, NPC voices -> E.master (audio.bus)
//   the score -> E.musicIn: -8 dB trim AFTER music.js's comp + limiter (their automatic make-up gain adds
//     ~+10 dB, so its 0.55 bus really nets ~+5 dB), a -3 dB dip at 2.2 kHz so the footstep band stays
//     clear, and a duck (cinema, speech via audio.duck(), thunder) -> E.master.
//     Join it with music.start(audio.musicContext): the real context whose `destination` is that bus.
// Weather: audio.setWeather({ mode, night, storm }) every frame (scene.userData.weather); night brings
// crickets, an owl, far dogs, the city, wind moaning in the ruins; a storm brings gusts, rain that
// sounds like what it falls on, and thunder whose crack and delay follow the strike's distance.

const TAU = Math.PI * 2;
const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

const MIX = {
  // music.js's comp + limiter level-normalise the score to ~-11 dBFS RMS at ANY intensity (measured);
  // -15 dB puts it at ~-25 dBFS RMS, ~10 dB under a footstep's peak. At rest it dips 3 dB more.
  musicTrim: 0.18,
  musicDip: -3,     // dB at 2.2 kHz
  duck: { cinema: 0.22, speech: 0.42, thunder: 0.5, rest: 0.3, night: 0.3 },
  rain: 0.12,       // full storm rain outdoors: ~-30 dBFS RMS on stone
};
const MAX_VOICES = 32; // one-shot events alive at once (steps, breaths, calls, hits); garnish is dropped first

// ---------- helpers ----------
function ramp(param, value, ctx, dur = 0.3) {
  try {
    const t = ctx.currentTime;
    param.cancelScheduledValues(t);
    param.setValueAtTime(param.value, t);
    param.linearRampToValueAtTime(value, t + Math.max(0.01, dur));
  } catch (e) { /* ignore */ }
}
// ramp only when the target really moved (called at 4-10 Hz from the frame loop)
function rampIf(E, key, param, value, dur = 0.5) {
  const L = E.last || (E.last = {});
  if (L[key] !== undefined && Math.abs(L[key] - value) < 1e-4) return;
  L[key] = value; ramp(param, value, E.ctx, dur);
}

// percussive envelope on a gain param: fast attack, exponential decay
function env(param, t, peak, attack, decay) {
  param.setValueAtTime(0.00001, t);
  param.linearRampToValueAtTime(Math.max(peak, 0.00002), t + attack);
  param.exponentialRampToValueAtTime(0.00001, t + attack + decay);
}

function voiceOk(E, t, dur, prio = 1) {
  const now = E.ctx.currentTime, v = E.voices || (E.voices = []);
  let n = 0;
  for (let i = 0; i < v.length; i++) if (v[i] > now) v[n++] = v[i];
  v.length = n;
  if (n >= MAX_VOICES + (prio >= 2 ? 8 : prio === 1 ? 0 : -10)) return false;
  v.push(t + dur); return true;
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

// Unity below 0.8 (-2 dBFS), a smooth knee to a 0.98 ceiling. The curve's -1..1 input stands for -2..2
// (a 0.5 pre-gain feeds it), so overs up to +6 dB are rounded off rather than hard-clipped.
function softClipCurve(n = 2049) {
  const c = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const a = ((i / (n - 1)) * 2 - 1) * 2, m = Math.abs(a);
    c[i] = Math.sign(a) * (m <= 0.8 ? m : 0.8 + 0.18 * Math.tanh((m - 0.8) / 0.18));
  }
  return c;
}

// The score's AudioContext: the real one, except that its `destination` is the score's bus.
function routedContext(ctx, dest) {
  if (typeof Proxy !== 'function') return ctx;
  const bound = new Map();
  return new Proxy(ctx, {
    get(target, key) {
      if (key === 'destination') return dest;
      const v = Reflect.get(target, key, target);
      if (typeof v !== 'function') return v;
      let b = bound.get(key);
      if (!b) { b = v.bind(target); bound.set(key, b); }
      return b;
    },
    set(target, key, value) { return Reflect.set(target, key, value, target); },
  });
}

// ---------- engine: bus + reverb + limiter ----------
export function buildEngine(ctx, destination) {
  const master = ctx.createGain();
  master.gain.value = 0;
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -6; limiter.knee.value = 6; limiter.ratio.value = 12;
  limiter.attack.value = 0.003; limiter.release.value = 0.2;
  const pre = ctx.createGain(); pre.gain.value = 0.5;
  const clip = ctx.createWaveShaper(); clip.curve = softClipCurve(); clip.oversample = 'none';
  master.connect(limiter); limiter.connect(pre); pre.connect(clip); clip.connect(destination || ctx.destination);

  const dry = ctx.createGain(); dry.gain.value = 1; dry.connect(master);
  const wetIn = ctx.createGain(); wetIn.gain.value = 1;
  const wetOut = ctx.createGain(); wetOut.gain.value = 0.9; wetOut.connect(master);
  const envs = {};
  [['hall', 2.5, 3.0, 1], ['outdoor', 0.5, 0.8, 0.45], ['small', 0.55, 0.9, 0.8], ['cinema', 0.25, 0.5, 0.6], ['lift', 0.35, 0.6, 0.9]].forEach(([n, rt, len, lv]) => {
    const conv = ctx.createConvolver(); conv.buffer = makeImpulse(ctx, rt, len);
    const send = ctx.createGain(); send.gain.value = n === 'hall' ? 1 : 0;
    const out = ctx.createGain(); out.gain.value = lv;
    wetIn.connect(send); send.connect(conv); conv.connect(out); out.connect(wetOut);
    envs[n] = send;
  });

  // the score's bus: trim (after its own dynamics), a dip where the footsteps live, a duck
  const musicIn = ctx.createGain(); musicIn.gain.value = MIX.musicTrim;
  const musicEq = ctx.createBiquadFilter(); musicEq.type = 'peaking';
  musicEq.frequency.value = 2200; musicEq.Q.value = 0.8; musicEq.gain.value = MIX.musicDip;
  const musicDuck = ctx.createGain(); musicDuck.gain.value = 1;
  musicIn.connect(musicEq); musicEq.connect(musicDuck); musicDuck.connect(master);

  const noise = { white: makeNoise(ctx, 'white', 2), pink: makeNoise(ctx, 'pink', 6), brown: makeNoise(ctx, 'brown', 8) };
  return { ctx, master, limiter, dry, wetIn, noise, envs, env: 'hall', tone: null, bed: null, lastReveal: -10, hum: null, musicIn, musicDuck, voices: [] };
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

// ---------- procedural takes: synthesised once into buffers, replayed with variation ----------
function synthBuffer(ctx, seconds, fill) {
  const sr = ctx.sampleRate, n = Math.max(1, Math.floor(sr * seconds));
  const buf = ctx.createBuffer(1, n, sr), d = buf.getChannelData(0);
  fill(d, sr);
  let pk = 0; for (let i = 0; i < n; i++) pk = Math.max(pk, Math.abs(d[i]));
  if (pk > 0) for (let i = 0; i < n; i++) d[i] /= pk;
  return buf;
}
// sparse grit: tiny decaying noise clicks (bright = shorter)
function grains(d, sr, t0, t1, count, bright, amp, skew = 1.6) {
  for (let k = 0; k < count; k++) {
    const at = Math.floor(sr * (t0 + Math.pow(Math.random(), skew) * (t1 - t0)));
    const len = Math.max(8, Math.floor(sr * rand(0.0006, 0.0035) / bright));
    const a = amp * rand(0.2, 1);
    let lp = 0, prev = 0;
    for (let i = 0; i < len && at + i < d.length; i++) {
      lp += (Math.random() * 2 - 1 - lp) * 0.5;
      d[at + i] += (lp - prev) * a * Math.exp(-6 * i / len); prev = lp;
    }
  }
}
const TAKES = {
  gravel: (ctx) => synthBuffer(ctx, 0.24, (d, sr) => {
    grains(d, sr, 0, 0.07, 26 + (Math.random() * 12 | 0), 1, 1);            // heel: the crunch
    grains(d, sr, 0.085, 0.16, 14 + (Math.random() * 8 | 0), 1.2, 0.7);     // toe
    let lp = 0;                                                              // the low crush under it
    for (let i = 0, n = Math.floor(sr * 0.1); i < n; i++) { lp += (Math.random() * 2 - 1 - lp) * 0.08; d[i] += lp * 1.6 * Math.exp(-i / (sr * 0.03)); }
  }),
  grass: (ctx) => synthBuffer(ctx, 0.3, (d, sr) => {
    let lp = 0, lp2 = 0;                                                     // blades brushing the shoe
    const toe = rand(0.08, 0.11);
    for (let i = 0; i < d.length; i++) {
      const t = i / sr;
      const e = Math.min(1, t / 0.018) * Math.exp(-t / 0.07) + 0.6 * (t > toe ? Math.min(1, (t - toe) / 0.015) * Math.exp(-(t - toe) / 0.06) : 0);
      lp += (Math.random() * 2 - 1 - lp) * 0.55; lp2 += (lp - lp2) * 0.12;
      d[i] = (lp - lp2) * e;
    }
    grains(d, sr, 0, 0.14, 5 + (Math.random() * 5 | 0), 0.7, 0.4);          // a few dry stems
  }),
  splash: (ctx) => synthBuffer(ctx, 0.2, (d, sr) => {
    let lp = 0;                                                              // the slap of water, then spray
    for (let i = 0; i < d.length; i++) { const t = i / sr; lp += (Math.random() * 2 - 1 - lp) * 0.25; d[i] = lp * Math.min(1, t / 0.003) * Math.exp(-t / 0.035); }
    grains(d, sr, 0.01, 0.16, 30, 1.4, 0.35);
  }),
  drops: (ctx) => synthBuffer(ctx, 3, (d, sr) => grains(d, sr, 0, 3, 2400, 1, 1, 1)), // rain hits, looped
};
function take(E, name, count = 6) {
  const B = E.banks || (E.banks = {});
  let b = B[name];
  if (!b) { b = B[name] = { arr: [], last: -1 }; for (let i = 0; i < count; i++) b.arr.push(TAKES[name](E.ctx)); }
  let i = Math.floor(Math.random() * b.arr.length);
  if (i === b.last && b.arr.length > 1) i = (i + 1 + Math.floor(Math.random() * (b.arr.length - 1))) % b.arr.length;
  b.last = i; return b.arr[i];
}

// ---------- footsteps ----------
const SURF = {
  concrete: { heel: 2800, hd: 0.03, ha: 0.30, toe: 2100, ta: 0.13, click: [1500, 2100], ca: 0.28, thud: 0.07, tf: 110, send: 0.55, scuff: 0.05 },
  stone:    { heel: 2000, hd: 0.04, ha: 0.27, toe: 1500, ta: 0.13, click: [900, 1400], ca: 0.22, thud: 0.08, tf: 100, send: 0.55, scuff: 0.06, grit: 0.05 },
  wood:     { heel: 1500, hd: 0.05, ha: 0.20, toe: 1200, ta: 0.10, click: [170, 250], ca: 1.0, cd: 0.08, thud: 0.11, tf: 150, send: 0.35, creak: 0.1 },
  metal:    { heel: 3200, hd: 0.05, ha: 0.25, toe: 2600, ta: 0.12, click: [650, 900], ca: 0.5, cd: 0.16, thud: 0.05, tf: 130, send: 0.35, ring: [[1830, 0.05, 0.22], [2710, 0.03, 0.16], [420, 0.04, 0.12]] },
  gravel:   { grain: true, thud: 0.05, tf: 90, send: 0.3 },
  grass:    { soft: true, thud: 0.09, tf: 80, send: 0.25 },
};
// round-robin takes for the hard floors: never the same timbre twice in a row
const RR = [
  { f: 1.00, a: 1.00, q: 1.3, toe: 1.00 },
  { f: 0.90, a: 0.90, q: 1.7, toe: 1.07 },
  { f: 1.09, a: 0.96, q: 1.1, toe: 0.93 },
  { f: 0.95, a: 1.06, q: 1.5, toe: 1.12 },
  { f: 1.05, a: 0.87, q: 1.2, toe: 0.96 },
];
function nextRR(E) {
  const r = E.rr || (E.rr = { bag: [], last: -1 });
  if (!r.bag.length) { r.bag = RR.map((_, i) => i).sort(() => Math.random() - 0.5); if (r.bag[r.bag.length - 1] === r.last) r.bag.reverse(); }
  r.last = r.bag.pop(); return RR[r.last];
}

// One step on the given surface (leather sole on polished concrete by default).
// gait: 0 walk (long heel-to-toe roll) ... 1 run (forefoot strike, heavier, a scuff); wet: rain on the ground.
export function scheduleStep(E, t, { level = 1, pan = 0, soft = 1, pitch = 1, surface = 'concrete', thudMul = 1, rustle = 0.035, gait = 0, wet = 0 } = {}) {
  const ctx = E.ctx;
  const S = SURF[surface] || SURF.concrete;
  if (!voiceOk(E, t, 0.3, 1)) return;
  const v = nextRR(E);
  const p = pitch * v.f * rand(0.96, 1.04) * (1 + 0.05 * gait);
  const lv = level * v.a * rand(0.86, 1.06) * soft;
  const panner = makePan(ctx, pan);
  const dry = ctx.createGain(); dry.gain.value = 1;
  const send = ctx.createGain(); send.gain.value = S.send;
  panner.connect(dry); dry.connect(E.dry);
  panner.connect(send); send.connect(E.wetIn);

  const burst = (tt, amp, fc, q, att, decay, hpf = 900) => {
    const n = noiseSrc(E, 'white', false);
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = fc * p; f.Q.value = q;
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = hpf;
    const g = ctx.createGain(); env(g.gain, tt, amp, att, decay);
    n.connect(f); f.connect(hp); hp.connect(g); g.connect(panner);
    n.start(tt, rand(0, 1.5)); n.stop(tt + att + decay + 0.05);
  };
  const tone = (tt, f0, amp, decay) => {
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f0;
    const og = ctx.createGain(); env(og.gain, tt, amp, 0.0008, decay);
    o.connect(og); og.connect(panner); o.start(tt); o.stop(tt + decay + 0.05);
  };
  const play = (buf, tt, amp, rate, hpf) => {
    const s = ctx.createBufferSource(); s.buffer = buf; s.playbackRate.value = rate;
    const g = ctx.createGain(); g.gain.value = amp;
    if (hpf) { const h = ctx.createBiquadFilter(); h.type = 'highpass'; h.frequency.value = hpf; s.connect(h); h.connect(g); } else s.connect(g);
    g.connect(panner); s.start(tt);
  };
  // heel-to-toe roll: long when walking, almost one strike when running
  const tToe = t + (gait > 0.5 ? rand(0.016, 0.03) : rand(0.07, 0.1) * (1 - 0.4 * gait));
  const heelA = 1 - 0.5 * gait, toeA = 1 + 0.9 * gait;
  if (S.grain) {
    play(take(E, 'gravel'), t, 0.2 * lv * (1 + 0.3 * gait), p * rand(0.94, 1.06));
  } else if (S.soft) {
    play(take(E, 'grass'), t, 0.14 * lv * (1 + 0.4 * gait), p * rand(0.9, 1.1));
  } else {
    burst(t, S.ha * lv * heelA, S.heel * v.f, v.q, 0.0015, S.hd);
    burst(tToe, S.ta * lv * toeA, S.toe * v.toe, v.q, 0.0015, S.hd * 0.8);
    tone(t, rand(S.click[0], S.click[1]) * p, S.ha * S.ca * lv, S.cd || 0.022);
    if (S.ring) S.ring.forEach(([f, a, d]) => tone(t, f * rand(0.97, 1.03), a * lv, d));
    if (S.grit) for (let k = 0; k < 3; k++) burst(tToe + k * rand(0.004, 0.01), S.grit * lv * rand(0.4, 1), rand(3000, 6000), 0.9, 0.0008, 0.012, 2000);
    if (S.creak && Math.random() < S.creak) creak(E, panner, t + rand(0.03, 0.08), 0.025 * lv);
    if (S.scuff && gait > 0.5 && Math.random() < 0.3) burst(tToe + 0.02, S.scuff * lv, rand(2500, 4000), 0.7, 0.01, 0.05, 1500);
  }
  if (wet > 0.05 && !S.soft) play(take(E, 'splash', 5), t + 0.004, 0.2 * wet * lv, rand(0.85, 1.15), 400);
  // body thud
  const th = ctx.createOscillator(); th.type = 'sine';
  th.frequency.setValueAtTime(S.tf * p, t); th.frequency.exponentialRampToValueAtTime(Math.max(40, S.tf * 0.47), t + 0.09);
  const thg = ctx.createGain(); env(thg.gain, t, S.thud * lv * thudMul * (1 + 0.5 * gait), 0.004, 0.09 + 0.05 * thudMul);
  th.connect(thg); thg.connect(panner); th.start(t); th.stop(t + 0.25);
  // cloth / gear rustle
  if (rustle > 0) burst(t - 0.01, rustle * lv, rand(1800, 3500), 0.5, 0.03, 0.12, 1000);
}
function creak(E, out, t, amp) { // a board's stick-slip
  const ctx = E.ctx, o = ctx.createOscillator(); o.type = 'sawtooth';
  o.frequency.setValueAtTime(rand(38, 55), t); o.frequency.linearRampToValueAtTime(rand(60, 90), t + 0.2);
  const b = ctx.createBiquadFilter(); b.type = 'bandpass'; b.frequency.value = rand(900, 1500); b.Q.value = 5;
  const g = ctx.createGain(); g.gain.setValueAtTime(0.00001, t); g.gain.linearRampToValueAtTime(amp, t + 0.05); g.gain.exponentialRampToValueAtTime(0.00001, t + 0.26);
  o.connect(b); b.connect(g); g.connect(out); o.start(t); o.stop(t + 0.3);
}
// cloth: an arm swing between running steps, or a jacket settling
export function scheduleSwish(E, t, amp, pan = 0) {
  const ctx = E.ctx; if (!voiceOk(E, t, 0.2, 0)) return;
  const n = noiseSrc(E, 'pink', false), p = makePan(ctx, pan * 0.3);
  const b = ctx.createBiquadFilter(); b.type = 'bandpass'; b.frequency.value = rand(900, 1700); b.Q.value = 0.7;
  const h = ctx.createBiquadFilter(); h.type = 'highpass'; h.frequency.value = 500;
  const g = ctx.createGain(); env(g.gain, t, amp, 0.05, 0.12);
  n.connect(b); b.connect(h); h.connect(g); g.connect(p); p.connect(E.dry);
  n.start(t, rand(0, 4)); n.stop(t + 0.22);
}
// breath: one half of a breath, right at the ears (inhale higher and softer, exhale fuller)
export function scheduleBreath(E, t, amt, inhale) {
  const ctx = E.ctx; if (!voiceOk(E, t, 0.6, 1)) return;
  const n = noiseSrc(E, 'pink', false);
  const f1 = ctx.createBiquadFilter(); f1.type = 'bandpass'; f1.frequency.value = (inhale ? 1900 : 1150) * rand(0.9, 1.1); f1.Q.value = inhale ? 1.4 : 1.0;
  const f2 = ctx.createBiquadFilter(); f2.type = 'highpass'; f2.frequency.value = inhale ? 700 : 350;
  const g = ctx.createGain();
  const a = clamp(amt, 0, 1) * (inhale ? 0.25 : 0.37), att = inhale ? 0.16 : 0.05, dec = inhale ? 0.2 : 0.32;
  g.gain.setValueAtTime(0.00001, t); g.gain.linearRampToValueAtTime(Math.max(a, 0.00002), t + att); g.gain.exponentialRampToValueAtTime(0.00001, t + att + dec);
  n.connect(f1); f1.connect(f2); f2.connect(g); g.connect(E.dry);
  n.start(t, rand(0, 4)); n.stop(t + att + dec + 0.05);
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

// ---------- movement extras ----------
export function scheduleJump(E, t, surface, gait = 0) {
  const ctx = E.ctx;
  const panner = makePan(ctx, 0); panner.connect(E.dry);
  const nz = (fc, q, amp, att, dec, hpf, dt = 0, f1) => {
    const n = noiseSrc(E, 'pink', false);
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = q;
    f.frequency.setValueAtTime(fc, t + dt); if (f1) f.frequency.exponentialRampToValueAtTime(f1, t + dt + att + dec);
    const h = ctx.createBiquadFilter(); h.type = 'highpass'; h.frequency.value = hpf;
    const g = ctx.createGain(); env(g.gain, t + dt, amp, att, dec);
    n.connect(f); f.connect(h); h.connect(g); g.connect(panner); n.start(t + dt, rand(0, 4)); n.stop(t + dt + att + dec + 0.05);
  };
  nz(surface === 'gravel' ? 3500 : surface === 'grass' ? 1600 : 2200, 0.8, 0.09, 0.004, 0.06, 900);  // push-off scuff
  scheduleStep(E, t, { level: 0.45 + 0.2 * gait, surface, thudMul: 0.5, rustle: 0, gait: 1 });     // the toes leave the floor
  nz(500, 0.7, 0.05, 0.08, 0.2, 250, 0.02, 1500);                                                  // cloth: the body lifts
  nz(1100, 0.9, 0.035 + 0.02 * gait, 0.02, 0.16, 400, 0.02);                                       // effort: a short "hup"
}
export function scheduleLand(E, t, strength, surface) {
  const s = clamp(strength, 0, 1), ctx = E.ctx;
  const o = { level: 0.75 + 0.5 * s, surface, thudMul: 1 + 1.6 * s, rustle: 0.05 + 0.05 * s, soft: 1, gait: 0.5 };
  scheduleStep(E, t, Object.assign({ pan: -0.08 }, o));
  scheduleStep(E, t + rand(0.014, 0.03), Object.assign({ pan: 0.08 }, o, { level: o.level * 0.8, rustle: 0 }));
  // the body's weight: a low thump felt more than heard (stays under the limiter's threshold)
  const th = ctx.createOscillator(); th.type = 'sine';
  th.frequency.setValueAtTime(70, t); th.frequency.exponentialRampToValueAtTime(34, t + 0.2);
  const g = ctx.createGain(); env(g.gain, t, 0.08 + 0.14 * s, 0.006, 0.2 + 0.15 * s);
  th.connect(g); g.connect(E.dry); th.start(t); th.stop(t + 0.5);
  scheduleSwish(E, t + 0.05, 0.03 + 0.04 * s, 0);                // knees bend, the jacket settles
  if (s > 0.55) scheduleBreath(E, t + 0.08, s, false);            // a heavy landing pushes the air out
}

// ---------- ui / events ----------
function oneShotOut(E, sendAmt, pan = 0) {
  const ctx = E.ctx, p = makePan(ctx, pan), s = ctx.createGain(); s.gain.value = sendAmt;
  p.connect(E.dry); p.connect(s); s.connect(E.wetIn); return p;
}
function bell(E, out, t, f, amp, dec) {
  const ctx = E.ctx;
  [[1, 1], [2.76, 0.3], [5.4, 0.1]].forEach(([m, a]) => {
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f * m;
    const g = ctx.createGain(); env(g.gain, t, amp * a, 0.004, dec / m);
    o.connect(g); g.connect(out); o.start(t); o.stop(t + dec + 0.1);
  });
}
export function scheduleChime(E, t) {
  const out = oneShotOut(E, 0.9);
  bell(E, out, t, 880, 0.05, 1.6); bell(E, out, t + 0.5, 659, 0.05, 2.0);
}
export function scheduleScore(E, t) {
  const out = oneShotOut(E, 0.4, 0.1);
  bell(E, out, t, 1318, 0.04, 0.5); bell(E, out, t + 0.09, 1760, 0.04, 0.7);
  const n = noiseSrc(E, 'white', false);
  const h = ctx_hp(E, 3500), g = E.ctx.createGain(); env(g.gain, t, 0.025, 0.05, 0.12);
  n.connect(h); h.connect(g); g.connect(out); n.start(t, rand(0, 1)); n.stop(t + 0.3);
}
function ctx_hp(E, f) { const h = E.ctx.createBiquadFilter(); h.type = 'highpass'; h.frequency.value = f; return h; }
export function scheduleDoors(E, t) {
  const ctx = E.ctx, out = oneShotOut(E, 0.5);
  const n = noiseSrc(E, 'pink', false);
  const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 0.8;
  bp.frequency.setValueAtTime(700, t); bp.frequency.exponentialRampToValueAtTime(2400, t + 0.55);
  const g = ctx.createGain(); g.gain.setValueAtTime(0.00001, t); g.gain.linearRampToValueAtTime(0.05, t + 0.2);
  g.gain.linearRampToValueAtTime(0.03, t + 0.5); g.gain.exponentialRampToValueAtTime(0.00001, t + 0.8);
  n.connect(bp); bp.connect(g); g.connect(out); n.start(t, rand(0, 4)); n.stop(t + 0.9);
  const n2 = noiseSrc(E, 'white', false), h = ctx_hp(E, 5000), g2 = ctx.createGain(); env(g2.gain, t + 0.5, 0.03, 0.01, 0.18);
  n2.connect(h); h.connect(g2); g2.connect(out); n2.start(t + 0.5, 0); n2.stop(t + 0.8);
  const o = ctx.createOscillator(); o.frequency.value = 80; const og = ctx.createGain(); env(og.gain, t + 0.62, 0.05, 0.005, 0.12);
  o.connect(og); og.connect(out); o.start(t + 0.62); o.stop(t + 0.85);
}
export function scheduleClick(E, t) {
  const ctx = E.ctx, out = oneShotOut(E, 0.1);
  const n = noiseSrc(E, 'white', false), b = ctx.createBiquadFilter(); b.type = 'bandpass'; b.frequency.value = 3200; b.Q.value = 1.5;
  const g = ctx.createGain(); env(g.gain, t, 0.05, 0.0008, 0.012);
  n.connect(b); b.connect(g); g.connect(out); n.start(t, rand(0, 1)); n.stop(t + 0.05);
  const o = ctx.createOscillator(); o.frequency.value = 1900; const og = ctx.createGain(); env(og.gain, t, 0.018, 0.0008, 0.015);
  o.connect(og); og.connect(out); o.start(t); o.stop(t + 0.05);
}
// Thunder from a strike `dist` metres away (sound takes dist/343 s: the caller delays `t`).
// Near: a tearing crack, then the boom; far: only a low roll. Indoors (muffle) the walls take the top off.
// At most two roll at once. Returns its duration (0 if skipped).
export function scheduleThunder(E, t, dist = 1200, muffle = 0) {
  const ctx = E.ctx, now = ctx.currentTime;
  E.thunders = (E.thunders || []).filter((x) => x > now);
  if (E.thunders.length >= 2 || !voiceOk(E, t, 6, 2)) return 0;
  const near = clamp(1 - (dist - 300) / 2500, 0, 1);
  const dur = 5 + 3 * (1 - near) + rand(0, 1.5);
  E.thunders.push(t + dur);
  const out = oneShotOut(E, 1.3, rand(-0.5, 0.5));
  const wall = ctx.createBiquadFilter(); wall.type = 'lowpass'; wall.frequency.value = muffle ? 380 : 14000; wall.connect(out);
  const lvl = (0.55 + 0.45 * near) * (muffle ? 0.6 : 1);
  if (near > 0.35) { // the crack: high tearing noise, a ripping mid sweep
    const c = noiseSrc(E, 'white', false), h = ctx_hp(E, 1800), cg = ctx.createGain();
    env(cg.gain, t, 0.3 * near * lvl, 0.002, 0.12 + 0.25 * near);
    c.connect(h); h.connect(cg); cg.connect(wall); c.start(t, rand(0, 1)); c.stop(t + 0.5);
    const r = noiseSrc(E, 'pink', false), rb = ctx.createBiquadFilter(); rb.type = 'bandpass'; rb.Q.value = 1.2;
    rb.frequency.setValueAtTime(2600, t + 0.01); rb.frequency.exponentialRampToValueAtTime(500, t + 0.6);
    const rg = ctx.createGain(); env(rg.gain, t + 0.01, 0.25 * near * lvl, 0.01, 0.55);
    r.connect(rb); rb.connect(rg); rg.connect(wall); r.start(t, rand(0, 4)); r.stop(t + 0.7);
  }
  // the boom and the rolls, through a closing low-pass
  const n = noiseSrc(E, 'brown', false);
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 0.7;
  lp.frequency.setValueAtTime(400 + 900 * near, t); lp.frequency.exponentialRampToValueAtTime(70 + 40 * near, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.00001, t); g.gain.linearRampToValueAtTime(0.75 * lvl, t + 0.08 + 0.4 * (1 - near));
  let tt = t + 0.5;
  for (let k = 1; k < 6; k++) { tt += rand(0.4, 1.0); g.gain.linearRampToValueAtTime(rand(0.2, 0.65) * lvl * (1 - k / 7), tt); }
  g.gain.exponentialRampToValueAtTime(0.00001, t + dur);
  n.connect(lp); lp.connect(g); g.connect(wall); n.start(t, rand(0, 3)); n.stop(t + dur + 0.1);
  // the sub: felt in the chest
  const o = ctx.createOscillator(); o.type = 'sine';
  o.frequency.setValueAtTime(52 + 10 * near, t); o.frequency.exponentialRampToValueAtTime(30, t + 2.5);
  const og = ctx.createGain(); og.gain.setValueAtTime(0.00001, t); og.gain.linearRampToValueAtTime(0.2 * lvl, t + 0.12); og.gain.exponentialRampToValueAtTime(0.00001, t + 3);
  o.connect(og); og.connect(wall); o.start(t); o.stop(t + 3.1);
  return dur;
}
export function scheduleBird(E, t) {
  const ctx = E.ctx; if (!voiceOk(E, t, 0.7, 0)) return;
  const out = oneShotOut(E, 0.25, rand(-0.8, 0.8));
  const f0 = rand(2800, 5200), n = 2 + Math.floor(Math.random() * 4);
  for (let k = 0; k < n; k++) {
    const tt = t + k * rand(0.07, 0.13);
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(f0 * rand(0.95, 1.1), tt); o.frequency.exponentialRampToValueAtTime(f0 * rand(0.75, 1.3), tt + 0.06);
    const g = ctx.createGain(); env(g.gain, tt, 0.008, 0.008, 0.05);
    o.connect(g); g.connect(out); o.start(tt); o.stop(tt + 0.1);
  }
}
export function scheduleClack(E, t, gain) {
  const ctx = E.ctx, out = E.srcOut.tram;
  const n = noiseSrc(E, 'white', false), b = ctx.createBiquadFilter(); b.type = 'bandpass'; b.frequency.value = rand(900, 1400); b.Q.value = 1.2;
  const g = ctx.createGain(); env(g.gain, t, 0.5 * gain, 0.001, 0.05);
  n.connect(b); b.connect(g); g.connect(out); n.start(t, rand(0, 1)); n.stop(t + 0.08);
  const o = ctx.createOscillator(); o.frequency.value = 70; const og = ctx.createGain(); env(og.gain, t, 0.3 * gain, 0.003, 0.08);
  o.connect(og); og.connect(out); o.start(t); o.stop(t + 0.12);
}

// ---------- night ----------
// unipolar raised-cosine pulse train p(t) in 0..1 as a zero-mean PeriodicWave + its mean (gain base)
function pulseWave(ctx, duty, H = 24) {
  const N = 256, re = new Float32Array(H + 1), im = new Float32Array(H + 1), p = new Float32Array(N);
  let mean = 0;
  for (let i = 0; i < N; i++) { const ph = i / N; p[i] = ph < duty ? 0.5 - 0.5 * Math.cos(TAU * ph / duty) : 0; mean += p[i] / N; }
  for (let k = 1; k <= H; k++) {
    let a = 0, b = 0;
    for (let i = 0; i < N; i++) { const w = TAU * k * i / N; a += p[i] * Math.cos(w); b += p[i] * Math.sin(w); }
    re[k] = 2 * a / N; im[k] = 2 * b / N;
  }
  return { wave: ctx.createPeriodicWave(re, im, { disableNormalization: true }), mean };
}
// a field cricket: a ~4.5 kHz tone pulsed ~30 times a second, in chirps of 3-5 pulses
function buildCricket(E, out, f, pulseHz, chirpHz, pan, amp, wob, stop) {
  const ctx = E.ctx, t0 = ctx.currentTime;
  const P = E.pw || (E.pw = { pulse: pulseWave(ctx, 0.55), gate: pulseWave(ctx, 0.26) });
  const car = ctx.createOscillator(); car.frequency.value = f;
  const v1 = ctx.createGain(); v1.gain.value = P.pulse.mean;
  const v2 = ctx.createGain(); v2.gain.value = amp * P.gate.mean;
  const l1 = ctx.createOscillator(); l1.setPeriodicWave(P.pulse.wave); l1.frequency.value = pulseHz;
  const l2 = ctx.createOscillator(); l2.setPeriodicWave(P.gate.wave); l2.frequency.value = chirpHz;
  const d2 = ctx.createGain(); d2.gain.value = amp; l1.connect(v1.gain); l2.connect(d2); d2.connect(v2.gain);
  const wd = ctx.createGain(); wd.gain.value = chirpHz * 0.06; wob.connect(wd); wd.connect(l2.frequency);
  const pn = makePan(ctx, pan);
  car.connect(v1); v1.connect(v2); v2.connect(pn); pn.connect(out);
  car.start(t0); l1.start(t0 + rand(0, 0.05)); l2.start(t0 + rand(0, 0.5));
  stop.push(car, l1, l2);
}
export function buildNight(E) {
  const ctx = E.ctx, t0 = ctx.currentTime, stop = [];
  const out = ctx.createGain(); out.gain.value = 0;
  const send = ctx.createGain(); send.gain.value = 0.35;
  out.connect(E.dry); out.connect(send); send.connect(E.wetIn);
  const wob = ctx.createOscillator(); wob.frequency.value = 0.13; wob.start(t0); stop.push(wob);
  // two groups of crickets that swell and recede on their own slow tides
  const groups = [[0.027, 0], [0.041, 7]].map(([rate, dt]) => {
    const g = ctx.createGain(); g.gain.value = 0.55; g.connect(out);
    const sw = ctx.createOscillator(); sw.frequency.value = rate;
    const sd = ctx.createGain(); sd.gain.value = 0.45; sw.connect(sd); sd.connect(g.gain); sw.start(t0 + dt); stop.push(sw);
    return g;
  });
  [[4520, 31, 1.7, -0.7, 0.078], [4890, 27, 2.3, -0.25, 0.056], [4310, 35, 1.3, 0.35, 0.07], [5160, 29, 1.9, 0.75, 0.045]]
    .forEach(([f, ph, ch, pan, a], i) => buildCricket(E, groups[i % 2], f, ph, ch, pan, a, wob, stop));
  E.nightL = { out, stop, idle: 0 };
  return E.nightL;
}
function dropNight(E) {
  const L = E.nightL; if (!L) return;
  L.stop.forEach((s) => { try { s.stop(); } catch (e) { /* already stopped */ } });
  try { L.out.disconnect(); } catch (e) { /* ignore */ }
  E.nightL = null; if (E.last) delete E.last.night;
}
// a tawny owl, far off: "hoo ... hu-hu-hoooooo"
export function scheduleOwl(E, t, pan = rand(-0.8, 0.8), level = 1) {
  const ctx = E.ctx; if (!voiceOk(E, t, 3.5, 0)) return;
  const out = oneShotOut(E, 1.4, pan);
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1100; lp.connect(out);
  const f0 = rand(360, 430), a = 0.05 * level;
  const hoot = (tt, dur, vib) => {
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(f0 * 0.94, tt); o.frequency.linearRampToValueAtTime(f0, tt + dur * 0.3); o.frequency.linearRampToValueAtTime(f0 * 0.9, tt + dur);
    if (vib) { const v = ctx.createOscillator(); v.frequency.value = 6.5; const vd = ctx.createGain(); vd.gain.value = f0 * 0.025; v.connect(vd); vd.connect(o.frequency); v.start(tt); v.stop(tt + dur + 0.05); }
    const g = ctx.createGain(); g.gain.setValueAtTime(0.00001, tt); g.gain.linearRampToValueAtTime(a, tt + 0.05);
    g.gain.setValueAtTime(a, tt + dur - 0.12); g.gain.exponentialRampToValueAtTime(0.00001, tt + dur);
    o.connect(g); g.connect(lp); o.start(tt); o.stop(tt + dur + 0.05);
  };
  hoot(t, 0.42, false);
  const t2 = t + rand(1.0, 1.5);
  hoot(t2, 0.13, false); hoot(t2 + 0.2, 0.13, false); hoot(t2 + 0.42, 0.95, true);
}
// a dog, a few gardens away: 2-5 barks
export function scheduleDog(E, t, pan = rand(-0.9, 0.9), level = 1) {
  const ctx = E.ctx, n = 2 + Math.floor(Math.random() * 4);
  if (!voiceOk(E, t, n * 0.6, 0)) return;
  const out = oneShotOut(E, 1.6, pan);
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = rand(1300, 2000); lp.connect(out);
  const f0 = rand(380, 560), gap = rand(0.32, 0.5);
  for (let k = 0; k < n; k++) {
    const tt = t + k * gap * rand(0.85, 1.2);
    const o = ctx.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(f0 * 0.85, tt); o.frequency.linearRampToValueAtTime(f0 * 1.15, tt + 0.025); o.frequency.exponentialRampToValueAtTime(f0 * 0.6, tt + 0.16);
    const fm = ctx.createBiquadFilter(); fm.type = 'bandpass'; fm.frequency.value = rand(800, 1100); fm.Q.value = 1.6;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.00001, tt); g.gain.linearRampToValueAtTime(0.15 * level, tt + 0.012); g.gain.exponentialRampToValueAtTime(0.00001, tt + 0.18);
    o.connect(fm); fm.connect(g); g.connect(lp); o.start(tt); o.stop(tt + 0.22);
  }
}
// wind moaning through broken stone: two resonant bands a fourth apart, swelling in and out
export function scheduleMoan(E, t, amt = 1) {
  const ctx = E.ctx, dur = rand(6, 9); if (!voiceOk(E, t, dur, 0)) return;
  const out = oneShotOut(E, 1.2, rand(-0.5, 0.5));
  const n = noiseSrc(E, 'pink', false);
  [[rand(280, 320), 1], [rand(380, 430), 0.65]].forEach(([f, a]) => {
    const b = ctx.createBiquadFilter(); b.type = 'bandpass'; b.Q.value = 14;
    b.frequency.setValueAtTime(f * 0.94, t); b.frequency.linearRampToValueAtTime(f * 1.06, t + dur * 0.5); b.frequency.linearRampToValueAtTime(f * 0.97, t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.00001, t); g.gain.linearRampToValueAtTime(Math.max(0.00002, 0.7 * a * amt), t + dur * 0.45); g.gain.linearRampToValueAtTime(0, t + dur);
    n.connect(b); b.connect(g); g.connect(out);
  });
  n.start(t, rand(0, 3)); n.stop(t + dur + 0.1);
}
// the night arrives: a slow low swell with a high shimmer, mostly reverb
export function scheduleNightfall(E, t) {
  const ctx = E.ctx; if (!voiceOk(E, t, 8, 2)) return;
  const out = oneShotOut(E, 1.5, 0);
  [[55, 0.06], [82.4, 0.035], [110, 0.02]].forEach(([f, a]) => {
    const o = ctx.createOscillator(); o.frequency.value = f;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.00001, t); g.gain.linearRampToValueAtTime(a, t + 3); g.gain.exponentialRampToValueAtTime(0.00001, t + 7.5);
    o.connect(g); g.connect(out); o.start(t); o.stop(t + 7.6);
  });
  const n = noiseSrc(E, 'pink', false), b = ctx.createBiquadFilter(); b.type = 'bandpass'; b.Q.value = 3;
  b.frequency.setValueAtTime(3200, t); b.frequency.exponentialRampToValueAtTime(6400, t + 3);
  const g = ctx.createGain(); g.gain.setValueAtTime(0.00001, t); g.gain.linearRampToValueAtTime(0.05, t + 2.5); g.gain.exponentialRampToValueAtTime(0.00001, t + 7);
  n.connect(b); b.connect(g); g.connect(out); n.start(t, rand(0, 4)); n.stop(t + 7.1);
}

// ---------- storm: gusts ----------
export function buildStorm(E) {
  const ctx = E.ctx, t0 = ctx.currentTime;
  const out = ctx.createGain(); out.gain.value = 0;
  const send = ctx.createGain(); send.gain.value = 0.3; out.connect(E.dry); out.connect(send); send.connect(E.wetIn);
  const n = noiseSrc(E, 'pink'); n.start(t0, rand(0, 4));
  const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 380; bp.Q.value = 0.7;
  const g = ctx.createGain(); g.gain.value = 0.08;
  const wh = ctx.createBiquadFilter(); wh.type = 'bandpass'; wh.frequency.value = 900; wh.Q.value = 7;
  const wg = ctx.createGain(); wg.gain.value = 0;
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 5000;  // indoors: through the walls
  n.connect(bp); bp.connect(g); g.connect(lp); n.connect(wh); wh.connect(wg); wg.connect(lp); lp.connect(out);
  E.stormL = { out, n, bp, g, wh, wg, lp, idle: 0 };
  return E.stormL;
}
// one gust of strength k (0..1): swells in, holds, dies away; returns its length
export function scheduleGust(E, t, k) {
  const L = E.stormL; if (!L) return 0;
  const up = rand(0.8, 1.8), hold = rand(0.3, 1.2), down = rand(1.8, 3.5), peak = 0.16 + 0.36 * k;
  L.g.gain.cancelScheduledValues(t); L.g.gain.setTargetAtTime(peak, t, up / 3); L.g.gain.setTargetAtTime(0.08, t + up + hold, down / 3);
  L.bp.frequency.cancelScheduledValues(t); L.bp.frequency.setTargetAtTime(350 + 700 * k, t, up / 3); L.bp.frequency.setTargetAtTime(380, t + up + hold, down / 3);
  L.wg.gain.cancelScheduledValues(t); L.wg.gain.setTargetAtTime(2.2 * peak * k, t, up / 3); L.wg.gain.setTargetAtTime(0, t + up + hold, down / 3);
  L.wh.frequency.cancelScheduledValues(t); L.wh.frequency.setTargetAtTime(rand(700, 1300), t, up / 2);
  return up + hold + down;
}
function dropStorm(E) {
  const L = E.stormL; if (!L) return;
  try { L.n.stop(); } catch (e) { /* ignore */ }
  try { L.out.disconnect(); } catch (e) { /* ignore */ }
  E.stormL = null; if (E.last) { delete E.last.storm; delete E.last.stormLp; }
}

// ---------- ambient beds & positional sources ----------
export function buildOutdoorBed(E) {
  const ctx = E.ctx, t0 = ctx.currentTime;
  const out = ctx.createGain(); out.gain.value = 0; out.connect(E.dry);
  const send = ctx.createGain(); send.gain.value = 0.3; out.connect(send); send.connect(E.wetIn);
  const wind = noiseSrc(E, 'pink'); wind.start(t0, rand(0, 4));
  const wf = ctx.createBiquadFilter(); wf.type = 'lowpass'; wf.frequency.value = 650; wf.Q.value = 0.7;
  const wg = ctx.createGain(); wg.gain.value = 0.014;
  const l = ctx.createOscillator(); l.frequency.value = 0.09; const ld = ctx.createGain(); ld.gain.value = 0.009;
  l.connect(ld); ld.connect(wg.gain); l.start(t0);
  const l2 = ctx.createOscillator(); l2.frequency.value = 0.05; const l2d = ctx.createGain(); l2d.gain.value = 220;
  l2.connect(l2d); l2d.connect(wf.frequency); l2.start(t0);
  wind.connect(wf); wf.connect(wg); wg.connect(out);
  // the far city: a brown-noise wash under 240 Hz, breathing like a distant road
  const city = noiseSrc(E, 'brown'); city.start(t0, rand(0, 4));
  const cf = ctx.createBiquadFilter(); cf.type = 'lowpass'; cf.frequency.value = 240;
  const cg = ctx.createGain(); cg.gain.value = 0.006; city.connect(cf); cf.connect(cg); cg.connect(out);
  const cl = ctx.createOscillator(); cl.frequency.value = 0.021; const cld = ctx.createGain(); cld.gain.value = 0.002;
  cl.connect(cld); cld.connect(cg.gain); cl.start(t0);
  E.bed = out; E.bedWind = wg; E.bedCity = cg; return out;
}

function loopNoise(E, kind, filters, gainNode) {
  const s = noiseSrc(E, kind); s.start(E.ctx.currentTime, rand(0, 4));
  let node = s;
  filters.forEach(([type, f, q]) => { const b = E.ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; if (q) b.Q.value = q; node.connect(b); node = b; });
  node.connect(gainNode); return filters;
}

// rain timbre by what it falls on (outdoors) or the roof over you (indoors)
const RAIN_SURF = {
  concrete: { lp: 9000, f: 4200, g: 4, drops: 1, hiss: 1 },
  stone:    { lp: 8500, f: 3600, g: 5, drops: 1.1, hiss: 1 },
  gravel:   { lp: 7000, f: 2800, g: 3, drops: 0.9, hiss: 0.9 },
  grass:    { lp: 3800, f: 1800, g: -3, drops: 0.45, hiss: 0.75 },
  wood:     { lp: 6000, f: 1300, g: 8, drops: 1, hiss: 0.8 },
  metal:    { lp: 8000, f: 3100, g: 10, drops: 1.2, hiss: 0.7 },
  roof:     { lp: 1100, f: 700, g: 4, drops: 0.9, hiss: 0.35 },
};

export function buildSources(E) {
  const ctx = E.ctx, t0 = ctx.currentTime;
  const mk = (sendAmt) => { const g = ctx.createGain(); g.gain.value = 0; const s = ctx.createGain(); s.gain.value = sendAmt; g.connect(E.dry); g.connect(s); s.connect(E.wetIn); return g; };
  const S = E.srcOut = { fountain: mk(0.15), tram: mk(0.25), rain: mk(0.3) };
  const lp = {};
  // fountain: splashing water = noise wash + random burbles
  const fl = ctx.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = 6000; fl.connect(S.fountain); lp.fountain = fl;
  loopNoise(E, 'white', [['bandpass', 2200, 0.5]], fl);
  loopNoise(E, 'pink', [['bandpass', 900, 0.7]], fl);
  [[1.3, 700], [2.1, 1100], [3.4, 1700]].forEach(([r, fc]) => {
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = fc;
    const m = ctx.createOscillator(); m.frequency.value = r * 2.3; const md = ctx.createGain(); md.gain.value = fc * 0.35; m.connect(md); md.connect(o.frequency);
    const g = ctx.createGain(); g.gain.value = 0.02; const am = ctx.createOscillator(); am.frequency.value = r; const amd = ctx.createGain(); amd.gain.value = 0.02; am.connect(amd); amd.connect(g.gain);
    o.connect(g); g.connect(fl); o.start(t0); m.start(t0); am.start(t0);
  });
  // tram: electric whine
  const tl = ctx.createBiquadFilter(); tl.type = 'lowpass'; tl.frequency.value = 3000; tl.connect(S.tram); lp.tram = tl;
  [[420, 0.012, 'sawtooth'], [840, 0.008, 'sine'], [1260, 0.004, 'sine']].forEach(([f, a, ty]) => {
    const o = ctx.createOscillator(); o.type = ty; o.frequency.value = f;
    const w = ctx.createOscillator(); w.frequency.value = 0.3; const wd = ctx.createGain(); wd.gain.value = f * 0.02; w.connect(wd); wd.connect(o.frequency);
    const g = ctx.createGain(); g.gain.value = a; o.connect(g); g.connect(tl); o.start(t0); w.start(t0);
  });
  loopNoise(E, 'brown', [['lowpass', 300]], tl);
  // rain: a hiss, the hits on whatever it falls on (a looped take through a surface EQ), the roof indoors
  const rlp = ctx.createBiquadFilter(); rlp.type = 'lowpass'; rlp.frequency.value = 9000; rlp.connect(S.rain);
  const hiss = ctx.createGain(); hiss.gain.value = 0.5; hiss.connect(rlp);
  loopNoise(E, 'white', [['highpass', 1500]], hiss);
  const dsrc = ctx.createBufferSource(); dsrc.buffer = take(E, 'drops', 1); dsrc.loop = true; dsrc.start(t0, rand(0, 2.5));
  const pk = ctx.createBiquadFilter(); pk.type = 'peaking'; pk.frequency.value = 4200; pk.Q.value = 1.2; pk.gain.value = 4;
  const drops = ctx.createGain(); drops.gain.value = 0.35; dsrc.connect(pk); pk.connect(drops); drops.connect(rlp);
  const roof = ctx.createGain(); roof.gain.value = 0; roof.connect(S.rain);
  loopNoise(E, 'brown', [['lowpass', 500]], roof);
  E.rain = { lp: rlp, hiss, drops, pk, roof };
  E.srcLp = lp; E.srcClack = 0; return S;
}

export function applyEnvironment(E, name, dur = 1.5) {
  const ctx = E.ctx;
  const cfg = {
    hall:    { dry: 1, tone: 1, bed: 0 },
    outdoor: { dry: 1, tone: 0.15, bed: 3 },   // +9.5 dB: the wind/city bed sat ~40 dB under a footstep, i.e. silent
    small:   { dry: 1, tone: 0.6, bed: 0 },
    cinema:  { dry: 0.95, tone: 0.4, bed: 0 },
    lift:    { dry: 1, tone: 0.35, bed: 0 },
  };
  const c = cfg[name]; if (!c) return;
  E.env = name;
  Object.keys(E.envs).forEach((k) => ramp(E.envs[k].gain, k === name ? 1 : 0, ctx, dur));
  if (E.tone) ramp(E.tone.gain, c.tone, ctx, dur);
  if (E.bed) ramp(E.bed.gain, c.bed, ctx, dur);
}

// how much of the outside world reaches each acoustic space
const OUTSIDE = { outdoor: 1, hall: 0.12, small: 0.1, cinema: 0, lift: 0.04 };

// ---------- public ----------
export function createAudio() {
  const A = {
    ctx: null, E: null, started: false, starting: null,
    muted: false, hidden: false,
    speed: 0, moving: false, wasMoving: false,
    nextStep: 0, lastStep: -10, side: 1, stepCount: 0,
    lightsHum: false, surface: 'concrete', env: 'hall', src: { fountain: 1e9, tram: 1e9, rain: 0, ruins: 1e9 },
    nextBird: 4, clackT: 0,
    wx: { mode: 'sunny', night: 0, storm: 0, nightT: 0, stormT: 0, applyT: 0, wasNight: false },
    exert: 0, nextBreath: 0, wetness: 0, jumpAt: -1, airAt: -1, air: false,
    nextOwl: 0, nextDog: 0, nextMoan: 0, nextGust: 0,
    duckUntil: 0, duckDepth: 1, duckCur: 1, thunderAt: -10, musicCtx: null, stillFor: 0,
  };
  const MASTER = 0.9;

  const usable = () => A.started && A.ctx && A.E && !A.muted && !A.hidden && A.ctx.state !== 'closed';
  const gaitNow = () => clamp((A.speed - 2.3) / 0.8, 0, 1);

  function onVis() {
    const c = A.ctx; if (!c) return;
    A.hidden = typeof document !== 'undefined' && !!document.hidden;
    try {
      if (A.hidden) c.suspend && c.suspend().catch(() => {});
      else c.resume && c.resume().catch(() => {});
    } catch (e) { /* ignore */ }
  }

  function applySources() {
    const E = A.E; if (!E || !E.srcOut) return;
    const c = A.ctx, S = A.src;
    const att = (d, range) => { const x = clamp(1 - (Number.isFinite(d) ? d : 1e9) / range, 0, 1); return x * x; };
    const dFn = (d) => clamp(7000 - (Number.isFinite(d) ? d : 99) * 140, 1200, 7000);
    ramp(E.srcOut.fountain.gain, 0.012 * att(S.fountain, 32), c, 0.4);
    ramp(E.srcLp.fountain.frequency, dFn(S.fountain), c, 0.4);
    ramp(E.srcOut.tram.gain, 0.12 * att(S.tram, 70), c, 0.4);
    ramp(E.srcLp.tram.frequency, dFn(S.tram) * 0.6, c, 0.4);
    rampIf(E, 'rain', E.srcOut.rain.gain, MIX.rain * clamp(S.rain || 0, 0, 1), 0.8);
    if (E.rain) {
      const R = RAIN_SURF[A.env === 'outdoor' ? A.surface : 'roof'] || RAIN_SURF.concrete;
      rampIf(E, 'rlp', E.rain.lp.frequency, R.lp, 0.8); rampIf(E, 'rpf', E.rain.pk.frequency, R.f, 0.8);
      rampIf(E, 'rpg', E.rain.pk.gain, R.g, 0.8); rampIf(E, 'rdr', E.rain.drops.gain, 0.35 * R.drops, 0.8);
      rampIf(E, 'rhs', E.rain.hiss.gain, 0.5 * R.hiss, 0.8); rampIf(E, 'rrf', E.rain.roof.gain, A.env === 'outdoor' ? 0 : 0.5, 0.8);
    }
  }

  // night, storm and what reaches you of them: ~10 Hz from update()
  function applyWeather(dt) {
    const E = A.E, W = A.wx, out = OUTSIDE[A.env] ?? 1;
    if (W.night > 0.02 && !E.nightL) buildNight(E);
    if (E.nightL) {
      rampIf(E, 'night', E.nightL.out.gain, W.night * out * (1 - 0.75 * W.storm), 0.6);  // the rain silences the crickets
      E.nightL.idle = W.night < 0.005 ? E.nightL.idle + dt : 0;
      if (E.nightL.idle > 8) dropNight(E);
    }
    if (W.storm > 0.02 && !E.stormL) buildStorm(E);
    if (E.stormL) {
      rampIf(E, 'storm', E.stormL.out.gain, W.storm * (A.env === 'outdoor' ? 1 : 0.3), 0.6);
      rampIf(E, 'stormLp', E.stormL.lp.frequency, A.env === 'outdoor' ? 5000 : 420, 0.8);
      E.stormL.idle = W.storm < 0.005 ? E.stormL.idle + dt : 0;
      if (E.stormL.idle > 8) dropStorm(E);
    }
    // the bed: softer wind at night, much more in a storm; the city carries once the birds stop
    if (E.bedWind) rampIf(E, 'wind', E.bedWind.gain, 0.014 * (1 - 0.3 * W.night) * (1 + 1.2 * W.storm), 0.6);
    if (E.bedCity) rampIf(E, 'city', E.bedCity.gain, 0.006 * (1 + 1.5 * W.night) * (1 - 0.5 * W.storm), 0.6);
  }

  // night calls, gusts: scheduled from update(), only where they can be heard
  function weatherEvents(now) {
    const E = A.E, W = A.wx, outside = A.env === 'outdoor';
    if (W.night > 0.5 && !W.wasNight) { // nightfall: a sonic event, then the first owl and a dog
      if (outside || A.env === 'hall') scheduleNightfall(E, now + 0.3);
      A.nextOwl = now + rand(4, 6); A.nextDog = now + rand(10, 14);
    }
    W.wasNight = W.night > 0.5 ? true : W.night < 0.3 ? false : W.wasNight;
    if (W.wasNight && W.storm < 0.5) {
      const lv = W.night * (outside ? 1 : 0.25);
      if (now > A.nextOwl) { A.nextOwl = now + rand(14, 38); if (lv > 0.2) scheduleOwl(E, now + 0.05, rand(-0.8, 0.8), lv); }
      if (now > A.nextDog) {
        A.nextDog = now + rand(25, 70);
        if (lv > 0.2) { const p = rand(-0.9, 0.9); scheduleDog(E, now + 0.05, p, lv); if (Math.random() < 0.4) scheduleDog(E, now + rand(1.5, 3), -p, lv * 0.6); }
      }
      const near = clamp(1 - (A.src.ruins - 8) / 40, 0, 1);
      if (near > 0.05 && outside && now > A.nextMoan) { A.nextMoan = now + rand(7, 14); scheduleMoan(E, now + 0.05, near * W.night); }
    }
    if (E.stormL && W.storm > 0.2 && now > A.nextGust) A.nextGust = now + scheduleGust(E, now + 0.05, clamp(W.storm * rand(0.4, 1), 0, 1)) + rand(0.5, 4);
  }

  function applyDuck(now) {
    let d = 1;
    if (A.env === 'cinema') d = MIX.duck.cinema;
    if (now < A.duckUntil) d = Math.min(d, A.duckDepth);
    if (now > A.thunderAt - 0.05 && now < A.thunderAt + 3) d = Math.min(d, MIX.duck.thunder);
    const fast = d < 1;  // a line or a strike: duck now
    // under the world: 3 dB lower after a few still seconds, and outdoors at night (the crickets)
    const rest = clamp((A.stillFor - 2) / 6, 0, 1), nightOut = A.env === 'outdoor' ? A.wx.night : 0;
    d *= (1 - MIX.duck.rest * Math.round(rest * 10) / 10) * (1 - MIX.duck.night * Math.round(nightOut * 10) / 10);
    if (Math.abs(d - A.duckCur) < 0.005) return;
    const p = A.E.musicDuck.gain, down = d < A.duckCur;
    A.duckCur = d;
    try { p.cancelScheduledValues(now); p.setTargetAtTime(d, now, down ? (fast ? 0.12 : 0.9) : 0.8); } catch (e) { /* ignore */ }
  }

  const api = {
    get muted() { return A.muted; },
    get context() { return A.ctx || null; },
    get bus() { return (A.E && A.E.master) || null; },
    // the score joins the mix here: music.start(audio.musicContext) (its `destination` is the score's bus)
    get musicContext() { if (!A.ctx || !A.E) return null; return A.musicCtx || (A.musicCtx = routedContext(A.ctx, A.E.musicIn)); },
    get musicBus() { return (A.E && A.E.musicIn) || null; },
    // for sfx.js and friends: the room's reverb send, shared noise, the weather as heard
    get send() { return (A.E && A.E.wetIn) || null; },
    get acoustics() { return A.env; },
    get weather() { return { mode: A.wx.mode, night: A.wx.night, storm: A.wx.storm }; },
    noise(kind = 'white') { return (A.E && A.E.noise[kind]) || null; },

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
          buildOutdoorBed(E); buildSources(E);
          A.started = true;
          applyEnvironment(E, A.env, 0.05); applySources();
        } catch (e) { A.ctx = null; A.E = null; A.started = false; A.musicCtx = null; }
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
        const air = !!(m && m.airborne);
        if (air && !A.air && A.ctx) A.airAt = A.ctx.currentTime;  // walking off a ledge counts too
        A.air = air;
        A.speed = s; A.moving = !!(m && m.moving) && s >= 0.25 && !air;
      } catch (e) {}
    },

    // { mode, night 0..1, storm 0..1 } — scene.userData.weather; night/storm default from mode. Cheap: call every frame.
    setWeather(w) {
      try {
        if (!w) return;
        const mode = typeof w.mode === 'string' ? w.mode : A.wx.mode;
        A.wx.mode = mode;
        A.wx.nightT = Number.isFinite(w.night) ? clamp(w.night, 0, 1) : (mode === 'night' ? 1 : 0);
        A.wx.stormT = Number.isFinite(w.storm) ? clamp(w.storm, 0, 1) : (mode === 'storm' ? 1 : 0);
      } catch (e) {}
    },

    // duck the score under a line of speech (NPCs, captions): seconds, depth (linear gain, default -7.5 dB)
    duck(seconds = 3, depth = MIX.duck.speech) {
      if (!A.started || !A.ctx) return;
      const now = A.ctx.currentTime, s = Number.isFinite(seconds) ? clamp(seconds, 0, 30) : 3;
      const dp = clamp(Number.isFinite(depth) ? depth : MIX.duck.speech, 0.05, 1);
      A.duckDepth = now < A.duckUntil ? Math.min(A.duckDepth, dp) : dp;
      A.duckUntil = Math.max(A.duckUntil, now + s);
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

    setSurface(name) { if (SURF[name]) A.surface = name; },
    setEnvironment(name) {
      A.env = name;
      if (A.started && A.E) try { applyEnvironment(A.E, name, 1.5); } catch (e) {}
    },
    setSources(o) {
      try {
        if (!o) return;
        ['fountain', 'tram', 'rain', 'ruins'].forEach((k) => { if (typeof o[k] === 'number') A.src[k] = o[k]; });
        if (usable()) applySources();
      } catch (e) {}
    },
    jump() {
      if (!usable()) return;
      try { const t = A.ctx.currentTime; A.jumpAt = t; scheduleJump(A.E, t + 0.01, A.surface, gaitNow()); } catch (e) {}
    },
    land(strength = 0.5) {
      if (!usable()) return;
      try {
        const now = A.ctx.currentTime, from = A.airAt > 0 ? A.airAt : A.jumpAt, air = now - from;
        // weight follows the time in the air: a flat jump (~0.65 s) is medium, a drop off a ledge is heavy
        const airK = from > 0 && air > 0 && air < 4 ? clamp((air - 0.3) / 0.8, 0, 1) : 0.5;
        const s = Math.max(0.7 * (Number.isFinite(strength) ? strength : 0.5), airK);
        A.jumpAt = -1; A.airAt = -1;
        scheduleLand(A.E, now + 0.01, s, A.surface);
        A.nextStep = Math.max(A.nextStep, now + 0.3); // no step on top of the landing
      } catch (e) {}
    },
    thunder(delaySec = 0) {
      if (!usable()) return;
      try {
        const d = Math.max(0, +delaySec || 0), t = A.ctx.currentTime + d;
        if (scheduleThunder(A.E, t, Math.max(250, d * 343), A.env === 'outdoor' ? 0 : 1) > 0) A.thunderAt = t;
      } catch (e) {}
    },
    chime() { if (!usable()) return; try { scheduleChime(A.E, A.ctx.currentTime + 0.02); } catch (e) {} },
    doors() { if (!usable()) return; try { scheduleDoors(A.E, A.ctx.currentTime + 0.02); } catch (e) {} },
    score() { if (!usable()) return; try { scheduleScore(A.E, A.ctx.currentTime + 0.02); } catch (e) {} },
    click() { if (!usable()) return; try { scheduleClick(A.E, A.ctx.currentTime + 0.01); } catch (e) {} },

    update(dt) {
      try {
        if (!A.started || !A.ctx || A.hidden || A.ctx.state !== 'running') { A.wasMoving = A.moving; return; }
        const now = A.ctx.currentTime, W = A.wx, step = Number.isFinite(dt) ? clamp(dt, 0, 0.25) : 0;
        // weather follows its targets over ~1 s, applied at 10 Hz
        const kW = 1 - Math.exp(-step / 1.2);
        W.night += (W.nightT - W.night) * kW; W.storm += (W.stormT - W.storm) * kW;
        W.applyT -= step;
        if (W.applyT <= 0) { W.applyT = 0.1; applyWeather(0.1); }
        applyDuck(now);
        const outside = A.env === 'outdoor';
        const wetT = outside ? Math.max(clamp(A.src.rain || 0, 0, 1), W.storm) : A.wetness;
        A.wetness += (wetT - A.wetness) * (1 - Math.exp(-step / (wetT > A.wetness ? 4 : 40))); // ground dries slowly
        if (!A.muted) {
          weatherEvents(now);
          if (outside) {
            A.nextBird -= step;
            if (A.nextBird <= 0) { A.nextBird = rand(3, 10); if (Math.random() > W.night * 0.97 + W.storm * 0.8) scheduleBird(A.E, now + 0.02); }
          }
          const tg = 1 - clamp((A.src.tram || 1e9) / 70, 0, 1);
          if (tg > 0.02 && A.E.srcOut) { A.clackT = Math.max(A.clackT, now);
            while (A.clackT < now + 0.1) { scheduleClack(A.E, A.clackT, tg * tg); scheduleClack(A.E, A.clackT + 0.045, tg * tg * 0.8); A.clackT += 0.26; } }
        }
        const rate = clamp(1.9 + (A.speed - 1.6) * 0.62, 1.0, 3.3); // steps per second
        const period = 1 / rate;
        const hurry = clamp((A.speed - 1.6) / 1.5, 0, 1);
        const gait = gaitNow();
        const wet = outside ? A.wetness : 0;
        const mk = (t, soft) => {
          A.side = -A.side;
          const left = A.side < 0;  // the two feet are never quite the same
          scheduleStep(A.E, t, { level: (0.85 + 0.25 * hurry) * (left ? 0.93 : 1), pan: A.side * rand(0.08, 0.2), soft, pitch: (1 + 0.03 * hurry) * (left ? 0.97 : 1), surface: A.surface, gait, wet, rustle: 0.03 + 0.06 * gait });
          if (gait > 0.3) scheduleSwish(A.E, t + period * 0.5, 0.035 * gait, A.side); // arm swing between strides
          A.lastStep = t; A.stepCount++;
        };
        if (A.moving) {
          if (!A.wasMoving || A.nextStep < now - 0.25) A.nextStep = Math.max(now + 0.03, A.nextStep);
          if (!A.muted) {
            while (A.nextStep < now + 0.1) {
              mk(Math.max(now, A.nextStep + rand(-0.015, 0.015)), 1);
              A.nextStep += period * rand(0.97, 1.03);
            }
          } else A.nextStep = now + 0.03;
        } else if (A.wasMoving && !A.muted) {
          // final settling step on stopping, if one is due soon
          if (A.nextStep - now < 0.4 && now - A.lastStep < 0.7) mk(Math.max(now + 0.02, A.nextStep), 0.6);
        }
        A.wasMoving = A.moving;
        A.stillFor = A.moving ? 0 : A.stillFor + step;
        // breath: builds over a few seconds of running, settles slowly after you stop
        A.exert += ((A.moving ? gait : 0) - A.exert) * (1 - Math.exp(-step / (A.moving && gait > A.exert ? 4 : 9)));
        const bAmt = clamp((A.exert - 0.15) / 0.7, 0, 1);
        if (bAmt > 0.02 && !A.muted) {
          const bp = A.moving && gait > 0.5 ? 4 / rate : 1.0 + 1.3 * (1 - bAmt);  // 2 strides in, 2 out; then recovery
          if (A.nextBreath < now) A.nextBreath = now + 0.05;
          while (A.nextBreath < now + 0.12) {
            scheduleBreath(A.E, A.nextBreath, bAmt, true);
            scheduleBreath(A.E, A.nextBreath + bp * 0.42, bAmt, false);
            A.nextBreath += bp * rand(0.95, 1.06);
          }
        }
      } catch (e) {}
    },
  };
  return api;
}

// Offline-render hook (dev harness only; not part of the Audio object)
createAudio.__graph = { scheduleJump, scheduleLand, scheduleChime, scheduleScore, scheduleDoors, scheduleClick, scheduleThunder, scheduleBird, buildOutdoorBed, buildSources, applyEnvironment, buildEngine, buildRoomTone, scheduleStep, scheduleRelay, buildBallast, scheduleReveal, makeImpulse, scheduleSwish, scheduleBreath, buildNight, scheduleOwl, scheduleDog, scheduleMoan, scheduleNightfall, buildStorm, scheduleGust, routedContext, MIX };
