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

  const noise = { white: makeNoise(ctx, 'white', 2), pink: makeNoise(ctx, 'pink', 6), brown: makeNoise(ctx, 'brown', 8) };
  return { ctx, master, dry, wetIn, noise, envs, env: 'hall', tone: null, bed: null, lastReveal: -10, hum: null };
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
const SURF = {
  concrete: { heel: 2800, hd: 0.03, ha: 0.30, toe: 2100, ta: 0.13, click: [1500, 2100], ca: 0.28, thud: 0.07, tf: 110 },
  stone:    { heel: 2000, hd: 0.04, ha: 0.27, toe: 1500, ta: 0.13, click: [900, 1400], ca: 0.22, thud: 0.08, tf: 100 },
  wood:     { heel: 1500, hd: 0.05, ha: 0.20, toe: 1200, ta: 0.10, click: [170, 250], ca: 1.0, cd: 0.08, thud: 0.11, tf: 150 },
  metal:    { heel: 3200, hd: 0.05, ha: 0.25, toe: 2600, ta: 0.12, click: [650, 900], ca: 0.5, cd: 0.16, thud: 0.05, tf: 130 },
  gravel:   { grain: true, thud: 0.04, tf: 90 },
  grass:    { soft: true, thud: 0.09, tf: 80 },
};

// One step on the given surface (leather sole on polished concrete by default).
export function scheduleStep(E, t, { level = 1, pan = 0, soft = 1, pitch = 1, surface = 'concrete', thudMul = 1, rustle = 0.035 } = {}) {
  const ctx = E.ctx;
  const S = SURF[surface] || SURF.concrete;
  const p = pitch * rand(0.93, 1.08);
  const lv = level * rand(0.8, 1.1) * soft;
  const panner = makePan(ctx, pan);
  const dry = ctx.createGain(); dry.gain.value = 1;
  const send = ctx.createGain(); send.gain.value = surface === 'concrete' || surface === 'stone' ? 0.55 : 0.35;
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
  const tToe = t + rand(0.07, 0.1);
  if (S.grain) { // gravel: a crunchy cluster of grains
    const n = 6 + Math.floor(Math.random() * 4);
    for (let k = 0; k < n; k++) burst(t + k * rand(0.006, 0.015), rand(0.05, 0.11) * lv, rand(2500, 6500), 0.8, 0.001, rand(0.012, 0.03), 1200);
    burst(t, 0.10 * lv, 900, 0.7, 0.002, 0.09, 300);
    for (let k = 0; k < 4; k++) burst(tToe + k * rand(0.008, 0.016), rand(0.03, 0.07) * lv, rand(2500, 5500), 0.8, 0.001, 0.02, 1200);
  } else if (S.soft) { // grass: soft swish
    burst(t, 0.12 * lv, 1500, 0.5, 0.025, 0.14, 500);
    burst(tToe, 0.06 * lv, 1900, 0.5, 0.02, 0.1, 500);
  } else {
    burst(t, S.ha * lv, S.heel, 1.3, 0.0015, S.hd);
    burst(tToe, S.ta * lv, S.toe, 1.3, 0.0015, S.hd * 0.8);
    tone(t, rand(S.click[0], S.click[1]) * p, S.ha * S.ca * lv, S.cd || 0.022);
    if (surface === 'metal') tone(t, rand(1800, 2700), 0.05 * lv, 0.2);
  }
  // body thud
  const th = ctx.createOscillator(); th.type = 'sine';
  th.frequency.setValueAtTime(S.tf * p, t); th.frequency.exponentialRampToValueAtTime(Math.max(40, S.tf * 0.47), t + 0.09);
  const thg = ctx.createGain(); env(thg.gain, t, S.thud * lv * thudMul, 0.004, 0.09 + 0.05 * thudMul);
  th.connect(thg); thg.connect(panner); th.start(t); th.stop(t + 0.25);
  // cloth / gear rustle
  if (rustle > 0) burst(t - 0.01, rustle * lv, rand(1800, 3500), 0.5, 0.03, 0.12, 1000);
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
export function scheduleJump(E, t, surface) {
  const ctx = E.ctx;
  const panner = makePan(ctx, 0); panner.connect(E.dry);
  const nz = (fc, q, amp, att, dec, hpf, dt = 0) => {
    const n = noiseSrc(E, 'pink', false);
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = fc; f.Q.value = q;
    const h = ctx.createBiquadFilter(); h.type = 'highpass'; h.frequency.value = hpf;
    const g = ctx.createGain(); env(g.gain, t + dt, amp, att, dec);
    n.connect(f); f.connect(h); h.connect(g); g.connect(panner); n.start(t + dt, rand(0, 4)); n.stop(t + dt + att + dec + 0.05);
  };
  nz(surface === 'gravel' ? 3500 : 2200, 0.8, 0.09, 0.004, 0.06, 900);          // push-off scuff
  nz(1100, 0.7, 0.035, 0.05, 0.22, 400, 0.02);                                   // breath
}
export function scheduleLand(E, t, strength, surface) {
  const s = clamp(strength, 0, 1);
  const o = { level: 0.8 + 0.7 * s, surface, thudMul: 1 + 2 * s, rustle: 0.05, soft: 1 };
  scheduleStep(E, t, Object.assign({ pan: -0.08 }, o));
  scheduleStep(E, t + 0.018, Object.assign({ pan: 0.08 }, o, { level: o.level * 0.8 }));
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
export function scheduleThunder(E, t) {
  const ctx = E.ctx, out = oneShotOut(E, 1.3, rand(-0.4, 0.4));
  const n = noiseSrc(E, 'brown', false);
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 0.6;
  lp.frequency.setValueAtTime(500, t); lp.frequency.exponentialRampToValueAtTime(90, t + 5);
  const g = ctx.createGain(); const dur = 5 + rand(0, 1.5);
  g.gain.setValueAtTime(0.00001, t); g.gain.linearRampToValueAtTime(0.16, t + 0.5);
  for (let k = 1; k < 5; k++) g.gain.linearRampToValueAtTime(rand(0.05, 0.14) * (1 - k / 6), t + 0.5 + k * rand(0.5, 0.9));
  g.gain.exponentialRampToValueAtTime(0.00001, t + dur);
  n.connect(lp); lp.connect(g); g.connect(out); n.start(t, rand(0, 4)); n.stop(t + dur + 0.1);
}
export function scheduleBird(E, t) {
  const ctx = E.ctx, out = oneShotOut(E, 0.25, rand(-0.8, 0.8));
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
  const city = noiseSrc(E, 'brown'); city.start(t0, rand(0, 4));
  const cf = ctx.createBiquadFilter(); cf.type = 'lowpass'; cf.frequency.value = 240;
  const cg = ctx.createGain(); cg.gain.value = 0.006; city.connect(cf); cf.connect(cg); cg.connect(out);
  E.bed = out; return out;
}

function loopNoise(E, kind, filters, gainNode) {
  const s = noiseSrc(E, kind); s.start(E.ctx.currentTime, rand(0, 4));
  let node = s;
  filters.forEach(([type, f, q]) => { const b = E.ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; if (q) b.Q.value = q; node.connect(b); node = b; });
  node.connect(gainNode); return filters;
}

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
  // rain bed + roof patter
  const rl = ctx.createGain(); rl.gain.value = 1; rl.connect(S.rain);
  loopNoise(E, 'white', [['highpass', 1500], ['lowpass', 9000]], (() => { const g = ctx.createGain(); g.gain.value = 0.5; g.connect(rl); return g; })());
  const pat = ctx.createGain(); pat.gain.value = 0.0; pat.connect(rl);
  const pm = ctx.createOscillator(); pm.frequency.value = 17; const pmd = ctx.createGain(); pmd.gain.value = 0.25; pm.connect(pmd); pmd.connect(pat.gain);
  const pm2 = ctx.createOscillator(); pm2.frequency.value = 29; const pmd2 = ctx.createGain(); pmd2.gain.value = 0.2; pm2.connect(pmd2); pmd2.connect(pat.gain);
  pm.start(t0); pm2.start(t0);
  const pn = loopNoise(E, 'white', [['bandpass', 3800, 1.2]], pat);
  E.srcLp = lp; E.srcClack = 0; return S;
}

export function applyEnvironment(E, name, dur = 1.5) {
  const ctx = E.ctx;
  const cfg = {
    hall:    { dry: 1, tone: 1, bed: 0 },
    outdoor: { dry: 1, tone: 0.15, bed: 1 },
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

// ---------- public ----------
export function createAudio() {
  const A = {
    ctx: null, E: null, started: false, starting: null,
    muted: false, hidden: false,
    speed: 0, moving: false, wasMoving: false,
    nextStep: 0, lastStep: -10, side: 1, stepCount: 0,
    lightsHum: false, surface: 'concrete', env: 'hall', src: { fountain: 1e9, tram: 1e9, rain: 0 },
    nextBird: 4, clackT: 0,
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

  function applySources() {
    const E = A.E; if (!E || !E.srcOut) return;
    const c = A.ctx, S = A.src;
    const att = (d, range) => { const x = clamp(1 - (Number.isFinite(d) ? d : 1e9) / range, 0, 1); return x * x; };
    const dFn = (d) => clamp(7000 - (Number.isFinite(d) ? d : 99) * 140, 1200, 7000);
    ramp(E.srcOut.fountain.gain, 0.012 * att(S.fountain, 32), c, 0.4);
    ramp(E.srcLp.fountain.frequency, dFn(S.fountain), c, 0.4);
    ramp(E.srcOut.tram.gain, 0.12 * att(S.tram, 70), c, 0.4);
    ramp(E.srcLp.tram.frequency, dFn(S.tram) * 0.6, c, 0.4);
    ramp(E.srcOut.rain.gain, 0.014 * clamp(S.rain || 0, 0, 1), c, 0.8);
  }

  const api = {
    get muted() { return A.muted; },
    get context() { return A.ctx || null; },
    get bus() { return (A.E && A.E.master) || null; },

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

    setSurface(name) { if (SURF[name]) A.surface = name; },
    setEnvironment(name) {
      A.env = name;
      if (A.started && A.E) try { applyEnvironment(A.E, name, 1.5); } catch (e) {}
    },
    setSources(o) {
      try {
        if (!o) return;
        ['fountain', 'tram', 'rain'].forEach((k) => { if (typeof o[k] === 'number') A.src[k] = o[k]; });
        if (usable()) applySources();
      } catch (e) {}
    },
    jump() { if (!usable()) return; try { scheduleJump(A.E, A.ctx.currentTime + 0.01, A.surface); } catch (e) {} },
    land(strength = 0.5) { if (!usable()) return; try { scheduleLand(A.E, A.ctx.currentTime + 0.01, Number.isFinite(strength) ? strength : 0.5, A.surface); } catch (e) {} },
    thunder(delaySec = 0) { if (!usable()) return; try { scheduleThunder(A.E, A.ctx.currentTime + Math.max(0, +delaySec || 0)); } catch (e) {} },
    chime() { if (!usable()) return; try { scheduleChime(A.E, A.ctx.currentTime + 0.02); } catch (e) {} },
    doors() { if (!usable()) return; try { scheduleDoors(A.E, A.ctx.currentTime + 0.02); } catch (e) {} },
    score() { if (!usable()) return; try { scheduleScore(A.E, A.ctx.currentTime + 0.02); } catch (e) {} },
    click() { if (!usable()) return; try { scheduleClick(A.E, A.ctx.currentTime + 0.01); } catch (e) {} },

    update(dt) {
      try {
        if (!A.started || !A.ctx || A.hidden || A.ctx.state !== 'running') { A.wasMoving = A.moving; return; }
        const now = A.ctx.currentTime;
        if (!A.muted) {
          if (A.env === 'outdoor') { A.nextBird -= dt || 0; if (A.nextBird <= 0) { A.nextBird = rand(3, 10); scheduleBird(A.E, now + 0.02); } }
          const tg = 1 - clamp((A.src.tram || 1e9) / 70, 0, 1);
          if (tg > 0.02 && A.E.srcOut) { A.clackT = Math.max(A.clackT, now);
            while (A.clackT < now + 0.1) { scheduleClack(A.E, A.clackT, tg * tg); scheduleClack(A.E, A.clackT + 0.045, tg * tg * 0.8); A.clackT += 0.26; } }
        }
        const rate = clamp(1.9 + (A.speed - 1.6) * 0.62, 1.0, 3.3); // steps per second
        const period = 1 / rate;
        const hurry = clamp((A.speed - 1.6) / 1.5, 0, 1);
        const mk = (t, soft) => {
          A.side = -A.side;
          scheduleStep(A.E, t, { level: 0.85 + 0.25 * hurry, pan: A.side * rand(0.08, 0.2), soft, pitch: 1 + 0.03 * hurry, surface: A.surface });
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
createAudio.__graph = { scheduleJump, scheduleLand, scheduleChime, scheduleScore, scheduleDoors, scheduleClick, scheduleThunder, scheduleBird, buildOutdoorBed, buildSources, applyEnvironment, buildEngine, buildRoomTone, scheduleStep, scheduleRelay, buildBallast, scheduleReveal, makeImpulse };
