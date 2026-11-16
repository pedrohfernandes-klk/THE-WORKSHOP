// sfx.js — the eerie and the wacky, layered over audio.js. Pure Web Audio,
// fully procedural, no files. Nothing is built until audio.context exists and
// is running; everything is routed into audio.bus, so mute and the limiter
// apply. Without Web Audio (Node, old browsers) every call is a safe no-op.
//
//   const sfx = createSfx(audio);
//   sfx.update(dt, { x, y, z, area, speed, airborne, justJumped, justLanded, seated, indoor });
//
// Eerie beds (built on approach, released when far away, 3 s crossfades):
//   the ruin: a drone of two sines a semitone apart through a slow resonant
//   sweep, a distant dripping loop, rare whispers and metal creaks, louder
//   the deeper you go (towards −49, −33);
//   the amphitheatre bowl below the rim: a faint ghost choir that swells on
//   the stage.
// Wacky one-shots: a cartoon boing on 3 in 5 outdoor jumps, a slide whistle
// after a long fall, a cushion "pfff" on 1 in 3 sits, an absurd bird in the
// garden every 20–40 s, wind in the ears after 3 s of sprinting outdoors.
// Voices (one-shots + running beds) are capped at 8; one-shots disconnect
// themselves when they end. Levels before the bus: one-shots peak about −20 dBFS,
// beds at most ≈ −30 dBFS RMS.
// Zones come from x/y/z (main's `area` is sticky and the ruin has no area);
// y is the floor height under the visitor.

const MAX_VOICES = 8;            // one-shots + running beds, never more at once
const XFADE = 3;                 // s for a place's sound to fade fully in or out
const FREE_AFTER = 8;            // s of silence before a bed's nodes are released
const BOING = [1, 1, 0, 1, 0];   // which outdoor jumps go boing: 3 in 5
const LONG_AIR = 0.95;           // s of effective airtime for a slide whistle (a flat jump is ≈0.6)
const GRAVITY = 13.5;            // controls.js: turns a floor drop into extra fall time

// Linear levels before the bus, measured offline in Chromium's Web Audio at
// 48 kHz: ruin heart ≈ −30 dBFS RMS (peak −20), stage choir ≈ −33 RMS (peak
// −18), orchestra ≈ −43 RMS, sprint wind ≈ −35 RMS (peak −20); one-shots peak
// −20…−25 dBFS. Layers that coincide (sprinting and jumping in the ruin) sum
// to peaks of about −16 dBFS.
const LV = {
  drone: 0.037, drip: 0.09, whisper: 0.4, creak: 0.62, choir: 0.134, whoosh: 0.28,
  boing: 0.1, slide: 0.08, pfff: 0.3, bird: 0.06,
};

const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const smooth = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };
const num = (v, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- places (metres; BRIEF §6.1) ----------
const RUIN = { x: -49, z: -33, inner: 3, outer: 30 };            // deepest point; heard from 30 m
const BOWL = { x: -50, z: 30, r: 18.5 };                          // rim y = 0, orchestra y = −4.2
const STAGE = { minX: -57.2, maxX: -50.8, minZ: 21.8, maxZ: 38.2 }; // deck top y = −3.2
const GARDEN = { minX: 28, maxX: 64, minZ: 14, maxZ: 50 };

const ruinDepth = (x, y, z) => (y > 4 || y < -2 ? 0 : 1 - smooth(RUIN.inner, RUIN.outer, Math.hypot(x - RUIN.x, z - RUIN.z)));
const bowlDepth = (x, y, z) => (Math.hypot(x - BOWL.x, z - BOWL.z) > BOWL.r ? 0 : smooth(-1, -2.6, y));
const onStage = (x, y, z) => x > STAGE.minX && x < STAGE.maxX && z > STAGE.minZ && z < STAGE.maxZ && y > -3.6 && y < -2.5;
const inGarden = (x, y, z) => x > GARDEN.minX && x < GARDEN.maxX && z > GARDEN.minZ && z < GARDEN.maxZ && y > -1 && y < 4;

// ---------- graph helpers ----------
// Every node made through a kit is listed, so a voice or a bed can free it all.
// Note: Web Audio reads Q in dB for lowpass/highpass and as a ratio for bandpass.
function kit(ctx, nodes, srcs, lease = null) {
  const add = (n) => { nodes.push(n); return n; };
  return {
    gain(v = 1) { const n = add(ctx.createGain()); n.gain.value = v; return n; },
    filter(type, f, q) { const n = add(ctx.createBiquadFilter()); n.type = type; n.frequency.value = f; if (q !== undefined) n.Q.value = q; return n; },
    osc(type, f) { const n = add(ctx.createOscillator()); n.type = type; n.frequency.value = f; srcs.push(n); lease?.track(n); return n; },
    loop(buf) { const n = add(ctx.createBufferSource()); n.buffer = buf; n.loop = true; srcs.push(n); lease?.track(n); return n; },
    pan(p) {
      const n = add(ctx.createStereoPanner ? ctx.createStereoPanner() : ctx.createGain());
      if (n.pan) n.pan.value = clamp(p, -1, 1);
      return n;
    },
    shaper(curve) { const n = add(ctx.createWaveShaper()); n.curve = curve; return n; },
    delay(t, max) { const n = add(ctx.createDelay(max)); n.delayTime.value = t; return n; },
  };
}
function release(group) {
  if (!group) return;
  if(group.lease?.fading){if(!group.releaseQueued){group.releaseQueued=true;const before=group.lease.onRelease;group.lease.onRelease=reason=>{try{before?.(reason);}finally{release(group);}};}return;}
  group.lease?.release();
  for (const s of group.srcs) { try { s.stop(); } catch (e) { /* never started or already stopped */ } }
  for (const n of group.nodes) { try { n.disconnect(); } catch (e) { /* ignore */ } }
}
function tanhCurve(drive, n = 1025) {
  const c = new Float32Array(n), k = Math.tanh(drive);
  for (let i = 0; i < n; i++) c[i] = Math.tanh(drive * ((i / (n - 1)) * 2 - 1)) / k;
  return c;
}
// Glide a parameter towards v (setTarget from wherever it is now, never a jump).
function glide(param, v, now, tc = 0.12) {
  try { param.cancelScheduledValues(now); param.setTargetAtTime(v, now, tc); } catch (e) { /* ignore */ }
}

// ---------- engine: output, ghost echo, shared noise ----------
function buildEngine(ctx, bus, rnd) {
  const nodes = [], srcs = [], k = kit(ctx, nodes, srcs);
  try {
    const sr = ctx.sampleRate, n = Math.floor(sr * 2), white = ctx.createBuffer(1, n, sr), d = white.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = rnd() * 2 - 1;
    const out = k.gain(1);
    // Ghost echo: cross-fed ping-pong delays, darker on every repeat, the delay
    // times wavering a few ms so each repeat smears slightly out of tune.
    const echo = k.gain(1), hp = k.filter('highpass', 220, -3);
    const dA = k.delay(0.33, 1.5), dB = k.delay(0.49, 1.5);
    const lpA = k.filter('lowpass', 2500, -3), lpB = k.filter('lowpass', 1900, -3);
    const fbA = k.gain(0.5), fbB = k.gain(0.5), pA = k.pan(-0.7), pB = k.pan(0.7), ret = k.gain(0.6);
    echo.connect(hp); hp.connect(dA);
    dA.connect(lpA); lpA.connect(fbA); fbA.connect(dB);
    dB.connect(lpB); lpB.connect(fbB); fbB.connect(dA);
    lpA.connect(pA); lpB.connect(pB); pA.connect(ret); pB.connect(ret); ret.connect(out);
    // Fixed echo: no inaudible perpetual oscillator consumes a voice.
    out.connect(bus);
    return { ctx, bus, out, echo, white, drip: null, curve: null, nodes, srcs };
  } catch (e) { release({ nodes, srcs }); throw e; }   // half-built: free what was made
}

// A leaking roof: two drips at their own irregular rates, 7.3 s, looped.
function dripLoop(ctx, rnd) {
  const sr = ctx.sampleRate, len = Math.floor(sr * 7.3);
  const buf = ctx.createBuffer(1, len, sr), d = buf.getChannelData(0);
  const drops = [[0.30, 1180, 1], [1.55, 1260, 0.75], [2.14, 980, 0.5], [3.85, 1320, 0.9],
    [4.66, 1150, 0.55], [5.98, 1080, 0.85], [6.47, 1460, 0.35]];
  for (const [t0, f0, a] of drops) {
    const i0 = Math.floor(t0 * sr), n = Math.floor(0.2 * sr);
    let ph = 0;
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      ph += f0 * (1 + 1.6 * (1 - Math.exp(-t / 0.012))) / sr;        // the bubble's pitch rises as it closes
      const e = Math.exp(-t / 0.03) * (1 - Math.exp(-t / 0.0005));
      const tick = t < 0.003 ? (rnd() * 2 - 1) * 0.35 * Math.exp(-t / 0.0007) : 0;
      d[(i0 + i) % len] += a * (e * Math.sin(TAU * ph) + tick);
    }
  }
  let pk = 0;
  for (let i = 0; i < len; i++) pk = Math.max(pk, Math.abs(d[i]));
  if (pk > 0) for (let i = 0; i < len; i++) d[i] /= pk;
  return buf;
}

// ---------- beds ----------
// A bed has a dry and an optional wet (echo) gain, both following the zone
// weight; body() wires it and may return a Map of start offsets (seconds into
// a loop buffer, or a start delay for an oscillator, which sets its phase). If
// anything throws half-way, whatever was made is released again.
function makeBed(E, withWet, body) {
  const lease=E.audio.acquireVoice({priority:0,foreground:false,ms:2000});
  if(!lease)return null;
  const nodes = [], srcs = [], k = kit(E.ctx, nodes, srcs,lease);
  const B = { nodes, srcs, lease, dry: null, wet: null };
  try {
    B.dry = k.gain(0); const dg=k.gain(1); lease.addOutput(dg); B.dry.connect(dg); dg.connect(E.out);
    if (withWet) { B.wet = k.gain(0); const wg=k.gain(1); lease.addOutput(wg); B.wet.connect(wg); wg.connect(E.echo); }
    const offsets = body(B, k) || null, t = E.ctx.currentTime;
    for (const s of srcs) {
      const o = offsets && offsets.get(s);
      if (o === undefined) s.start(t);
      else if ('buffer' in s) s.start(t, o);
      else s.start(t + o);
    }
    return B;
  } catch (e) { release(B); throw e; }
}

const buildRuin = (E, rnd) => makeBed(E, true, (B, k) => {
  const ctx = E.ctx;
  // Drone: D2 against D#2, beating ~4 Hz (drifting), soft-saturated so the
  // resonant lowpass has overtones to sweep through, ~30 s per breath.
  const a = k.osc('sine', 73.42), b = k.osc('sine', 77.78);
  const drift = k.osc('sine', 0.021), driftD = k.gain(14);
  drift.connect(driftD); driftD.connect(b.detune);
  const mix = k.gain(0.6);
  a.connect(mix); b.connect(mix);
  if (!E.curve) E.curve = tanhCurve(2.4);
  const sat = k.shaper(E.curve), lp = k.filter('lowpass', 320, 9);
  const s1 = k.osc('sine', 0.031), s1d = k.gain(130), s2 = k.osc('sine', 0.0113), s2d = k.gain(60);
  s1.connect(s1d); s1d.connect(lp.frequency); s2.connect(s2d); s2d.connect(lp.frequency);
  const drone = k.gain(LV.drone), droneWet = k.gain(0.25);
  mix.connect(sat); sat.connect(lp); lp.connect(drone); drone.connect(B.dry);
  drone.connect(droneWet); droneWet.connect(B.wet);
  // Drips: a looped leak far off, heard mostly through the echo.
  if (!E.drip) E.drip = dripLoop(ctx, rnd);
  const dr = k.loop(E.drip), rate = k.osc('sine', 0.047), rateD = k.gain(0.012);
  rate.connect(rateD); rateD.connect(dr.playbackRate);
  const dlp = k.filter('lowpass', 3400, -3), drip = k.gain(LV.drip), dripDry = k.gain(0.45);
  dr.connect(dlp); dlp.connect(drip); drip.connect(dripDry); dripDry.connect(B.dry); drip.connect(B.wet);
  return new Map([[dr, rnd() * 7]]);
});

// A2 E3 C4 B4 (Am add9, inside the music's A minor), two saws each, a few
// cents apart so every note beats slowly; E5 joins on the stage.
const CHOIR = [[110.0, 1.0], [164.81, 0.75], [261.63, 0.55], [493.88, 0.3]];
const buildChoir = (E, rnd) => makeBed(E, true, (B, k) => {
  const voices = k.gain(1), high = k.gain(0), phase = new Map();
  const vibA = k.osc('sine', 4.4), vibB = k.osc('sine', 5.3), vA = k.gain(6), vB = k.gain(6); // cents
  vibA.connect(vA); vibB.connect(vB);
  let i = 0;
  const pair = (f, amp, dest) => {
    for (const det of [-4, 4.5]) {
      const o = k.osc('sawtooth', f), g = k.gain(amp);
      o.detune.value = det;
      ((i++) % 2 ? vA : vB).connect(o.detune);
      o.connect(g); g.connect(dest);
      phase.set(o, rnd() / f);                 // random phases: no in-phase thump at the start
    }
  };
  for (const [f, a] of CHOIR) pair(f, a * 0.5, voices);
  pair(659.26, 0.12, high);
  high.connect(voices);
  // vowel: two formants drifting between "oo" and "ah", a little body under them
  const lp = k.filter('lowpass', 1300, -3);
  const f1 = k.filter('bandpass', 430, 3.5), f2 = k.filter('bandpass', 950, 5), f2g = k.gain(0.7), body = k.gain(0.22);
  const vowel = k.osc('sine', 0.045), vowelD = k.gain(230);
  vowel.connect(vowelD); vowelD.connect(f2.frequency);
  const breath = k.gain(0.75), br = k.osc('sine', 0.07), brD = k.gain(0.12);
  br.connect(brD); brD.connect(breath.gain);
  voices.connect(lp); lp.connect(f1); lp.connect(f2); lp.connect(body);
  f1.connect(breath); f2.connect(f2g); f2g.connect(breath); body.connect(breath);
  const level = k.gain(LV.choir);
  breath.connect(level); level.connect(B.dry); level.connect(B.wet);
  B.lp = lp; B.high = high;
  return phase;
});

// Air rushing past both ears: two decorrelated band-passed noises, gusting.
const buildWhoosh = (E) => makeBed(E, false, (B, k) => {
  const gust = k.gain(0.75), g = k.osc('sine', 0.63), gd = k.gain(0.25);
  g.connect(gd); gd.connect(gust.gain);
  B.bps = [];
  const offs = new Map();
  for (const side of [-0.6, 0.6]) {
    const n = k.loop(E.white), bp = k.filter('bandpass', 700, 0.9), p = k.pan(side);
    n.connect(bp); bp.connect(p); p.connect(gust);
    offs.set(n, side < 0 ? 0 : 1.1);
    B.bps.push(bp);
  }
  gust.connect(B.dry);
  return offs;
});

// ---------- one-shot sounds: fn(v, k, t0, rnd) on an open voice ----------
const VOWELS = [[800, 1250, 2600], [500, 1900, 2650], [330, 2300, 3000], [500, 900, 2500], [360, 820, 2400], [560, 1500, 2500]];

function whisper(v, k, t0, rnd, depth) {
  const rr = (a, b) => a + rnd() * (b - a);
  const shift = rnd() < 0.25 ? 0.82 : rr(0.92, 1.15);
  const A = LV.whisper * (0.45 + 0.55 * depth);
  const n = k.loop(v.E.white);
  const fs = [k.filter('bandpass', 500, 9), k.filter('bandpass', 1500, 11), k.filter('bandpass', 2500, 12)];
  const env = k.gain(0), sib = k.filter('highpass', 5200, -3), sg = k.gain(0);
  [1, 0.75, 0.4].forEach((a, i) => { const g = k.gain(a); n.connect(fs[i]); fs[i].connect(g); g.connect(env); });
  n.connect(sib); sib.connect(sg); sg.connect(v.inp); env.connect(v.inp);
  const hiss = (ts, a) => { sg.gain.setValueAtTime(0, ts); sg.gain.linearRampToValueAtTime(A * 0.12 * a, ts + 0.03); sg.gain.linearRampToValueAtTime(0, ts + 0.13); };
  let t = t0;
  if (rnd() < 0.4) { hiss(t, 1); t += 0.09; }
  env.gain.setValueAtTime(0, t0);
  const syl = 2 + Math.floor(rnd() * 4);
  let prev = null;
  for (let s = 0; s < syl; s++) {
    const V = VOWELS[Math.floor(rnd() * VOWELS.length)], dur = rr(0.12, 0.26), pk = A * rr(0.6, 1);
    fs.forEach((f, i) => {
      if (!prev) f.frequency.setValueAtTime(V[i] * shift, t);
      else { f.frequency.setValueAtTime(prev[i] * shift, t); f.frequency.linearRampToValueAtTime(V[i] * shift, t + 0.06); }
    });
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(pk, t + 0.035);
    env.gain.linearRampToValueAtTime(pk * 0.6, t + dur - 0.04);
    env.gain.linearRampToValueAtTime(0, t + dur);
    prev = V;
    t += dur + rr(0.03, 0.09);
  }
  if (rnd() < 0.4) { hiss(t, 0.8); t += 0.14; }
  if (v.pan.pan) {   // the voice drifts as it speaks
    const p0 = v.pan.pan.value;
    v.pan.pan.setValueAtTime(p0, t0);
    v.pan.pan.linearRampToValueAtTime(clamp(p0 + rr(-0.6, 0.6), -0.95, 0.95), t);
  }
  v.play(n, t0, t + 0.1, rnd() * 1.5);
}

function creak(v, k, t0, rnd, depth) {
  const rr = (a, b) => a + rnd() * (b - a);
  const dur = rr(0.6, 1.5), A = LV.creak * (0.5 + 0.5 * depth);
  // stick-slip: a sawtooth whose rate stutters excites three inharmonic resonances
  const ex = k.osc('sawtooth', 24);
  ex.frequency.setValueAtTime(rr(16, 30), t0);
  for (let t = t0; t < t0 + dur;) { t += rr(0.035, 0.09); ex.frequency.linearRampToValueAtTime(rr(12, 52), t); }
  const f0 = rr(300, 620), bend = rnd() < 0.7 ? rr(0.7, 0.86) : rr(1.12, 1.3);
  const sum = k.gain(1);
  [[1, 34, 1], [2.31, 28, 0.6], [3.73, 22, 0.35]].forEach(([r, q, a]) => {
    const b = k.filter('bandpass', f0 * r, q), g = k.gain(a);
    b.frequency.setValueAtTime(f0 * r, t0);
    b.frequency.exponentialRampToValueAtTime(f0 * r * bend, t0 + dur);
    ex.connect(b); b.connect(g); g.connect(sum);
  });
  const hp = k.filter('highpass', 180, -3), env = k.gain(0);
  env.gain.setValueAtTime(0, t0);
  env.gain.linearRampToValueAtTime(A, t0 + 0.09);
  env.gain.linearRampToValueAtTime(A * 0.75, t0 + dur * 0.6);
  env.gain.linearRampToValueAtTime(0, t0 + dur);
  sum.connect(hp); hp.connect(env); env.connect(v.inp);
  v.play(ex, t0, t0 + dur + 0.1);
}

function boing(v, k, t0, rnd, m) {
  const T = 0.62, A = LV.boing;
  const o = k.osc('sine', 150), o2 = k.osc('sine', 300);
  const path = (p, mul) => {
    p.setValueAtTime(150 * m * mul, t0);
    p.exponentialRampToValueAtTime(420 * m * mul, t0 + 0.065);
    p.exponentialRampToValueAtTime(320 * m * mul, t0 + T);
  };
  path(o.frequency, 1); path(o2.frequency, 2);
  // the spring: vibrato that starts wide and fast and dies away
  const lfo = k.osc('sine', 15), dep = k.gain(0), dep2 = k.gain(2);
  lfo.frequency.setValueAtTime(15, t0); lfo.frequency.linearRampToValueAtTime(8.5, t0 + T);
  dep.gain.setValueAtTime(0, t0);
  dep.gain.linearRampToValueAtTime(75 * m, t0 + 0.07);
  dep.gain.exponentialRampToValueAtTime(4, t0 + T);
  lfo.connect(dep); dep.connect(o.frequency); dep.connect(dep2); dep2.connect(o2.frequency);
  const env = k.gain(0), h = k.gain(0.22);
  env.gain.setValueAtTime(0, t0);
  env.gain.linearRampToValueAtTime(A, t0 + 0.008);
  env.gain.exponentialRampToValueAtTime(A * 0.45, t0 + 0.18);
  env.gain.exponentialRampToValueAtTime(0.0005, t0 + T);
  o.connect(env); o2.connect(h); h.connect(env); env.connect(v.inp);
  v.play(o, t0, t0 + T + 0.03); v.play(o2, t0, t0 + T + 0.03); v.play(lfo, t0, t0 + T + 0.03);
}

function slideDown(v, k, t0) {
  const T = 0.46, A = LV.slide;
  const o = k.osc('sine', 1750), n = k.loop(v.E.white), bp = k.filter('bandpass', 1750, 7);
  for (const p of [o.frequency, bp.frequency]) {
    p.setValueAtTime(1750, t0);
    p.linearRampToValueAtTime(1900, t0 + 0.05);
    p.exponentialRampToValueAtTime(520, t0 + T);
  }
  const vib = k.osc('sine', 7), vd = k.gain(24);
  vib.connect(vd); vd.connect(o.frequency);
  const env = k.gain(0), breath = k.gain(2.5);
  env.gain.setValueAtTime(0, t0);
  env.gain.linearRampToValueAtTime(A, t0 + 0.03);
  env.gain.linearRampToValueAtTime(A * 0.85, t0 + T - 0.1);
  env.gain.linearRampToValueAtTime(0, t0 + T);
  o.connect(env); n.connect(bp); bp.connect(breath); breath.connect(env); env.connect(v.inp);
  v.play(o, t0, t0 + T + 0.05); v.play(vib, t0, t0 + T + 0.05); v.play(n, t0, t0 + T + 0.05, 0.3);
}

function pfff(v, k, t0, rnd) {
  const T = 0.55, A = LV.pfff;
  const n = k.loop(v.E.white), bp = k.filter('bandpass', 1500, 1.4), lp = k.filter('lowpass', 2400, -3);
  bp.frequency.setValueAtTime(1500, t0);
  bp.frequency.exponentialRampToValueAtTime(380, t0 + T);
  // a soft flutter that slows as the cushion empties
  const am = k.gain(0.72), fl = k.osc('sine', 31), fd = k.gain(0.28);
  fl.frequency.setValueAtTime(31, t0); fl.frequency.linearRampToValueAtTime(19, t0 + T);
  fl.connect(fd); fd.connect(am.gain);
  const env = k.gain(0);
  env.gain.setValueAtTime(0, t0);
  env.gain.linearRampToValueAtTime(A, t0 + 0.02);
  env.gain.linearRampToValueAtTime(A * 0.6, t0 + 0.2);
  env.gain.exponentialRampToValueAtTime(0.0008, t0 + T);
  n.connect(bp); bp.connect(lp); lp.connect(am); am.connect(env); env.connect(v.inp);
  v.play(n, t0, t0 + T + 0.05, rnd() * 1.5); v.play(fl, t0, t0 + T + 0.05);
}

// cu – ckoo – CU?! : the third note lands a tritone too high and cracks.
function cuckoo(v, k, t0, rnd) {
  const A = LV.bird, f1 = 690 * (0.94 + rnd() * 0.12);
  const o = k.osc('sine', f1), o2 = k.osc('sine', f1 * 2), h = k.gain(0.15), env = k.gain(0);
  const wob = k.osc('sine', 7), wd = k.gain(0), wd2 = k.gain(2);
  wob.connect(wd); wd.connect(o.frequency); wd.connect(wd2); wd2.connect(o2.frequency);
  const notes = [[0, f1, 0.17, 1], [0.24, f1 * 0.8, 0.34, 0.95], [0.86, f1 * 1.414, 0.36, 1]];
  env.gain.setValueAtTime(0, t0);
  notes.forEach(([dt, f, d, a], i) => {
    const ts = t0 + dt;
    [[o.frequency, 1], [o2.frequency, 2]].forEach(([p, mul]) => {
      p.setValueAtTime(f * 1.02 * mul, ts);
      if (i === 2) { p.setValueAtTime(f * 0.89 * mul, ts + 0.13); p.exponentialRampToValueAtTime(f * 0.95 * mul, ts + d); }
      else p.exponentialRampToValueAtTime(f * 0.97 * mul, ts + d);
    });
    env.gain.setValueAtTime(0, ts);
    env.gain.linearRampToValueAtTime(A * a, ts + 0.03);
    env.gain.linearRampToValueAtTime(A * a * 0.75, ts + d - 0.06);
    env.gain.linearRampToValueAtTime(0, ts + d);
  });
  const t3 = t0 + notes[2][0];
  wd.gain.setValueAtTime(0, t3 + 0.12); wd.gain.linearRampToValueAtTime(16, t3 + 0.2);
  o.connect(env); o2.connect(h); h.connect(env); env.connect(v.inp);
  const end = t3 + notes[2][2] + 0.05;
  v.play(o, t0, end); v.play(o2, t0, end); v.play(wob, t0, end);
}

// A bird that is really a slide whistle: up, down, warble, up, and away.
function trillBird(v, k, t0, rnd) {
  const T = 1.35, A = LV.bird * 0.85, m = 0.92 + rnd() * 0.16;
  const o = k.osc('sine', 1100 * m), n = k.loop(v.E.white), bp = k.filter('bandpass', 1100 * m, 8);
  for (const p of [o.frequency, bp.frequency]) {
    p.setValueAtTime(1100 * m, t0);
    p.exponentialRampToValueAtTime(2300 * m, t0 + 0.42);
    p.exponentialRampToValueAtTime(1500 * m, t0 + 0.78);
    p.exponentialRampToValueAtTime(2600 * m, t0 + 1.02);
    p.exponentialRampToValueAtTime(820 * m, t0 + T);
  }
  const tr = k.osc('sine', 9.5), td = k.gain(0);
  td.gain.setValueAtTime(0, t0);
  td.gain.linearRampToValueAtTime(240 * m, t0 + 0.3);
  td.gain.linearRampToValueAtTime(240 * m, t0 + 0.95);
  td.gain.linearRampToValueAtTime(0, t0 + 1.2);
  tr.connect(td); td.connect(o.frequency);
  const env = k.gain(0), breath = k.gain(2);
  env.gain.setValueAtTime(0, t0);
  env.gain.linearRampToValueAtTime(A, t0 + 0.05);
  env.gain.linearRampToValueAtTime(A * 0.85, t0 + T - 0.15);
  env.gain.linearRampToValueAtTime(0, t0 + T);
  o.connect(env); n.connect(bp); bp.connect(breath); breath.connect(env); env.connect(v.inp);
  v.play(o, t0, t0 + T + 0.05); v.play(tr, t0, t0 + T + 0.05); v.play(n, t0, t0 + T + 0.05, rnd() * 1.5);
}

// ---------- public ----------
export function createSfx(audio) {
  const rnd = mulberry32(0x5EED5F);
  const rr = (a, b) => a + rnd() * (b - a);
  let E = null, retryAt = 0, disposed = false;
  const voices = [];                                   // open one-shots
  const bed = (n) => ({ B: null, w: 0, quiet: 0, retry: 0, sent: new Array(n).fill(-1) });
  const beds = { ruin: bed(2), choir: bed(4), whoosh: bed(3) };
  const BEDS = [beds.ruin, beds.choir, beds.whoosh];
  const st = {
    t: 0, pclock: 0, air: false, airT: 0, airY: 0, jumps: 0, seated: false, sits: 0,
    pfff: -1, pfffPeak: 0, lx: 0, lz: 0, fast: 0, whooshOn: false, stage: 0, bird: rr(10, 20), birds: 0,
    whisper: rr(3, 6), creak: rr(5, 9),
  };
  const played = { boing: 0, slide: 0, pfff: 0, bird: 0, whisper: 0, creak: 0, dropped: 0 };

  const mkRuin = () => buildRuin(E, rnd), mkChoir = () => buildChoir(E, rnd), mkWhoosh = () => buildWhoosh(E);
  const bedsLive = () => (beds.ruin.B ? 1 : 0) + (beds.choir.B ? 1 : 0) + (beds.whoosh.B ? 1 : 0);
  const free = () => MAX_VOICES - voices.length - bedsLive();

  function finish(v) {
    if (v.done) return;
    v.done = true;
    v.lease?.release();
    for (const n of v.nodes) { try { n.disconnect(); } catch (e) { /* ignore */ } }
    const i = voices.indexOf(v);
    if (i >= 0) voices.splice(i, 1);
  }
  // One voice: fn builds into v.inp (mono); dry goes out through a panner, wet
  // feeds the echo. Returns false when the voice cap is reached.
  function oneShot(name, fn, pan, dry, wet, arg) {
    if (!E || free() <= 0) { played.dropped++; return false; }
    const lease=audio.acquireVoice?.({priority:1,foreground:false,ms:12000});
    if(!lease){played.dropped++;return false;}
    const nodes = [], srcs = [], k = kit(E.ctx, nodes, srcs,lease);
    const v = { E, nodes, srcs, lease, end: 0, last: null, done: false, inp: null, pan: null };
    v.play = (src, t0, t1, offset) => {
      if (offset !== undefined) src.start(t0, offset); else src.start(t0);
      src.stop(t1);
      if (t1 >= v.end) { v.end = t1; v.last = src; }
    };
    try {
      v.inp = k.gain(1); v.pan = k.pan(pan);
      const d = k.gain(dry);
      v.inp.connect(lease.gain); lease.gain.connect(v.pan); v.pan.connect(d); d.connect(E.out);
      if (wet > 0) { const w = k.gain(wet); lease.gain.connect(w); w.connect(E.echo); }
      fn(v, k, E.ctx.currentTime + 0.02, rnd, arg);
      if (!v.last) throw new Error('silent voice');
      v.last.onended = () => finish(v);
      voices.push(v);
      played[name]++;
      return true;
    } catch (e) {
      for (const s of srcs) { try { s.stop(); } catch (_) { /* ignore */ } }
      finish(v);
      return false;
    }
  }

  function dropAll() {
    for (const b of BEDS) { release(b.B); b.B = null; b.w = 0; b.quiet = 0; }
    while (voices.length) {
      const v = voices[voices.length - 1];
      for (const s of v.srcs) { try { s.stop(); } catch (e) { /* ignore */ } }
      finish(v);
    }
    release(E);
    E = null;
  }

  // Ready when the context exists, runs, and the engine is built.
  function ready() {
    let ctx = null, bus = null;
    try { ctx = (audio && audio.context) || null; bus = (audio && audio.bus) || null; } catch (e) { /* ignore */ }
    if (E && (E.ctx !== ctx || ctx.state === 'closed')) dropAll();
    if (!ctx || !bus || ctx.state !== 'running' || audio.muted || audio.quietConfirmed) { if(E)dropAll(); return false; }
    if (E && E.bus !== bus) { try { E.out.disconnect(); E.out.connect(bus); E.bus = bus; } catch (e) { dropAll(); } }
    if (!E) {
      if (st.t < retryAt) return false;
      try { E = buildEngine(ctx, bus, rnd); E.audio=audio; }
      catch (e) { if (E) release(E); E = null; retryAt = st.t + 5; return false; }
    }
    return true;
  }

  // Follow a target weight (rate = fraction per second), building the bed on
  // approach and releasing it after a while of silence.
  function manage(b, target, up, down, dt, build) {
    if(b.B && !b.B.lease.renew(2000)){release(b.B);b.B=null;b.retry=st.t+.4;}
    if (!b.B) {
      b.w = 0;
      if (target > 0.001 && free() > 0 && st.t >= b.retry) {
        try { b.B = build(); b.sent.fill(-1); } catch (e) { b.B = null; b.retry = st.t + 5; }
      }
      return;
    }
    b.w += clamp(target - b.w, -down * dt, up * dt);
    if (b.w < 0.0005 && target <= 0.001) {
      b.quiet += dt;
      if (b.quiet > FREE_AFTER) { release(b.B); b.B = null; b.w = 0; b.quiet = 0; }
    } else b.quiet = 0;
  }
  // Only reschedule a parameter when its value has really moved (or reached 0).
  function send(b, i, param, v, now, tc) {
    const last = b.sent[i];
    if (last === v || (v !== 0 && last >= 0 && Math.abs(v - last) < 0.0015 + 0.01 * Math.abs(v))) return;
    b.sent[i] = v;
    glide(param, v, now, tc);
  }

  function applyBeds(now, speed) {
    const R = beds.ruin, C = beds.choir, W = beds.whoosh;
    if (R.B) {
      const g = Math.pow(R.w, 1.5);                          // ~−15 dB at the ruin's edge, full at its heart
      send(R, 0, R.B.dry.gain, g, now); send(R, 1, R.B.wet.gain, g, now);
    }
    if (C.B) {
      const g = C.w * (0.35 + 0.65 * st.stage);
      send(C, 0, C.B.dry.gain, g, now); send(C, 1, C.B.wet.gain, g * 0.45, now);
      send(C, 2, C.B.lp.frequency, 1300 + 1100 * st.stage, now, 0.4);
      send(C, 3, C.B.high.gain, st.stage, now, 0.4);
    }
    if (W.B) {
      // the band rises with speed; constant-Q noise gets louder as it rises, so compensate
      const f = clamp(350 + 220 * (speed - 3), 300, 2400);
      send(W, 0, W.B.dry.gain, W.w * LV.whoosh * Math.sqrt(600 / f), now, 0.08);
      send(W, 1, W.B.bps[0].frequency, f, now, 0.15);
      send(W, 2, W.B.bps[1].frequency, f * 1.18, now, 0.15);
    }
  }

  function update(dt, s) {
    if (disposed) return;
    try {
      dt = clamp(num(dt), 0, 0.1);
      st.t += dt;
      const o = s || {};
      const x = num(o.x), y = num(o.y), z = num(o.z), speed = Math.max(0, num(o.speed));
      const seated = o.seated === true, indoor = o.indoor === true;
      const airborne = o.airborne === true || (o.justJumped === true && o.justLanded !== true);
      const ok = ready();
      const live = ok && !(audio && audio.muted);

      // take-off, airtime, landing (edges tracked even while silent)
      if (airborne && !st.air) {
        st.air = true; st.airT = 0; st.airY = y;
        if (live && !indoor) { if (BOING[st.jumps % BOING.length]) oneShot('boing', boing, 0, 1, 0.12, [1, 1.12, 0.94, 1.06][st.jumps % 4]); st.jumps++; }
      } else if (airborne) st.airT += dt;
      else if (st.air) {
        st.air = false;
        const fell = st.airT + Math.sqrt(2 * Math.max(0, st.airY - y) / GRAVITY);  // a drop adds fall time
        if (live && fell >= LONG_AIR) oneShot('slide', slideDown, 0, 1, 0.15);
      }

      // sitting: 1 in 3 sits (the first of every three), as the glide onto the seat
      // comes to rest. The glide (0.25–2.4 s, eased) is followed in x/z itself:
      // main's speed is smoothed and still carries any run-up to the seat.
      if (seated && !st.seated) { st.sits++; if ((st.sits - 1) % 3 === 0) { st.pfff = 0; st.pfffPeak = 0; } }
      if (!seated) st.pfff = -1;
      st.seated = seated;
      if (st.pfff >= 0 && dt > 0) {
        const v = Math.hypot(x - st.lx, z - st.lz) / dt;
        st.pfff += dt; st.pfffPeak = Math.max(st.pfffPeak, v);
        const rest = v < 0.05 && st.pfff > 0.3 && (st.pfffPeak > 0.3 || st.pfff > 0.85);
        if (rest || st.pfff >= 2.6) { st.pfff = -1; if (live) oneShot('pfff', pfff, rr(-0.15, 0.15), 1, 0.05); }
      }
      st.lx = x; st.lz = z;

      // sprinting outdoors: 3 s above 4 m/s, then wind until you ease off
      st.fast = !indoor && !seated && speed > 4 ? st.fast + dt : 0;
      st.whooshOn = !indoor && !seated && (st.fast >= 3 || (st.whooshOn && speed > 3.3));

      // the garden's absurd bird, alternating kinds
      if (!indoor && inGarden(x, y, z)) {
        st.bird -= dt;
        if (st.bird <= 0) {
          st.bird = rr(20, 40);
          if (live) oneShot('bird', st.birds++ % 2 ? trillBird : cuckoo, rr(-0.75, 0.75), 0.8, 0.35);
        }
      }

      if (!ok) return;
      const now = E.ctx.currentTime;
      for (let i = voices.length - 1; i >= 0; i--) if (now > voices[i].end + 1.5) finish(voices[i]); // missed 'ended'

      // places
      const ruinT = ruinDepth(x, y, z), bowlT = bowlDepth(x, y, z);
      const stageT = bowlT > 0.5 && onStage(x, y, z) ? 1 : 0;
      manage(beds.ruin, ruinT, 1 / XFADE, 1 / XFADE, dt, mkRuin);
      manage(beds.choir, bowlT, 1 / XFADE, 1 / XFADE, dt, mkChoir);
      st.stage += clamp(stageT - st.stage, -dt / XFADE, dt / XFADE);
      const windT = st.whooshOn ? clamp((speed - 2.5) / 3.5, 0, 0.8) : 0;
      manage(beds.whoosh, windT, 1 / 0.8, 1 / 0.5, dt, mkWhoosh);
      st.pclock += dt;
      if (st.pclock >= 0.1) { st.pclock = 0; applyBeds(now, speed); }

      // the ruin's voices: more often, and closer, the deeper you are
      const R = beds.ruin;
      if (R.B && R.w > 0.25) {
        const often = 0.35 + 0.65 * R.w;
        st.whisper -= dt;
        if (st.whisper <= 0) { st.whisper = rr(6, 13) / often; if (live) oneShot('whisper', whisper, rr(-0.9, 0.9), 0.55, 0.9, R.w); }
        st.creak -= dt;
        if (st.creak <= 0) { st.creak = rr(10, 22) / often; if (live) oneShot('creak', creak, rr(-0.8, 0.8), 0.6, 0.8, R.w); }
      } else if (!R.B) { st.whisper = rr(3, 6); st.creak = rr(5, 9); }
    } catch (e) { /* sound must never break the frame */ }
  }

  function dispose() {
    disposed = true;
    try { dropAll(); } catch (e) { /* ignore */ }
  }

  // stats(): for tests and the console; not needed by main.
  function stats() {
    return {
      running: !!E, voices: voices.length, beds: BEDS.filter((b) => b.B).length,
      ruin: beds.ruin.w, choir: beds.choir.w, stage: st.stage, whoosh: beds.whoosh.w, played: { ...played },
    };
  }

  return { update, dispose, stats };
}
