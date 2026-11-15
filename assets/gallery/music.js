// THE WORKSHOP: the score. Procedural Web Audio: no files, no network, nothing built before the first gesture.
// French-touch filter house crossed with action-game scoring and a pinch of chiptune. G minor / dorian, 118 BPM,
// swung 16ths, a kick-keyed sidechain pump, a resonant chord loop that sweeps open over 16 bars and closes in the
// breaks, a warm octave bass, a vowel-formant ("talking") lead through a phaser, a pulse-wave arp for sprints.
// It follows the visitor: keys and pad in the hall, the groove outdoors, a sprint layer, a drone and metal pings
// near the ruins, a muffled after-hours mix at night, a driving minor ostinato in storms, all crossfaded.
// A 64-bar form (A, B with the lead, a break that closes and rebuilds, a drop) re-seeds every cycle.
//
// createMusic(opts?) -> {
//   start(ctx?, out?)  call inside the first gesture. Pass the effects' AudioContext and bus
//                      (audio.context, audio.bus) to share one render thread and one final limiter;
//                      otherwise the score makes its own context. Enters on a downbeat ~3.2 s later.
//   setMuted(b), muted silent within ~20 ms; no voices are made while muted
//   setScene(s)        { area, indoor, x, z, speed, airborne, intensity, night, storm, weather, duck } (each frame)
//   setIntensity(v)    legacy 0..1 input; ignored once setScene drives the score
//   setDuck(v)         0..1: sit under NPC voices or a film (-11 dB and a deeper voice-band dip at 1)
//   update(dt)         every frame; the score also keeps its own 25 ms clock
// }

const BPM = 118;
const BEAT = 60 / BPM, STEP = BEAT / 4, BAR = BEAT * 4;
const LOOK = 0.2;     // s scheduled ahead of the audio clock (survives a 150 ms frame hitch)
const CAP = 64;       // short-lived voices alive at once (drums, keys, bells, fx); persistent synths are extra
const MASTER = 0.65;  // calibrated offline: score master ~ -16 LUFS outdoors at a walk, sample peaks < -1.5 dBFS
const TRIM = 0.4;     // -8 dB seat in the game mix, after the score's own dynamics (footsteps and voices on top,
                      // and under the effects limiter's knee when sharing its bus)
const ENTRY = 3.2;    // s after the click: the lights' relays land in the clear, then the score comes in

const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const sm = (a, b, x) => { x = clamp((x - a) / (b - a)); return x * x * (3 - 2 * x); };
function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------- harmony --
// Scales as semitones above G. A chord: b = bass root (midi), v = 4-note voicing, s = scale for the lead.
const DOR = [0, 2, 3, 5, 7, 9, 10], AEO = [0, 2, 3, 5, 7, 8, 10], HMI = [0, 2, 3, 5, 7, 8, 11], PHR = [0, 1, 3, 5, 7, 8, 10];
const ch = (b, v, s) => ({ b, v, s, pcs: new Set([b, ...v].map((n) => n % 12)) });
const HARM = {
  main: { bars: 2, ch: [
    ch(31, [58, 62, 65, 69], DOR), // Gm9
    ch(36, [58, 62, 64, 67], DOR), // C9
    ch(39, [58, 62, 65, 67], AEO), // Ebmaj9
    ch(38, [57, 60, 62, 67], DOR), // D7sus4
    ch(31, [58, 62, 65, 69], DOR), // Gm9
    ch(41, [57, 60, 62, 65], DOR), // F6
    ch(36, [58, 62, 63, 67], AEO), // Cm9
    ch(38, [57, 60, 63, 66], HMI), // D7(b9)
  ] },
  storm: { bars: 1, ch: [
    ch(31, [55, 58, 62, 67], AEO), // Gm
    ch(39, [55, 58, 63, 67], AEO), // Eb
    ch(36, [55, 60, 63, 67], AEO), // Cm
    ch(38, [54, 57, 62, 66], HMI), // D
    ch(31, [55, 58, 62, 67], AEO), // Gm
    ch(34, [53, 58, 62, 65], AEO), // Bb
    ch(39, [55, 60, 63, 67], AEO), // Cm/Eb
    ch(38, [57, 60, 63, 66], HMI), // D7(b9)
  ] },
  ruin: { bars: 2, ch: [
    ch(31, [57, 58, 62, 67], PHR), // Gm(add9): the A-Bb rub
    ch(31, [56, 60, 63, 67], PHR), // Ab/G
    ch(31, [57, 58, 62, 67], PHR),
    ch(31, [54, 58, 63, 66], PHR), // Ebm/G
    ch(31, [54, 58, 62, 67], HMI), // Gm(maj7)
    ch(31, [56, 60, 63, 67], PHR), // Ab/G
    ch(31, [55, 60, 62, 63], AEO), // Cm(add9)/G
    ch(31, [57, 62, 63, 66], HMI), // D(b9)/G
  ] },
};
function degree(C, d) {
  const has = (iv) => C.pcs.has((C.b + iv) % 12);
  if (d === 'O') return C.b + 12;
  if (d === '5') return C.b + (has(7) ? 7 : 12);
  if (d === '7') return C.b + (has(10) ? 10 : has(11) ? 11 : 12);
  if (d === 'b2') return C.b + 1;
  return C.b;
}

// --------------------------------------------------------------- patterns --
// 16-step bars. Stabs: x = hit, - = hold, . = rest. Bass: [step, degree, length in steps, velocity].
const STAB = {
  intro: 'x-------........', a: 'x-.x-.x-..x-.x..', b: '..x-..x-..x-.x-.',
  drop: 'x-.xx-.x-.x-.xx.', brk: 'x---------------', storm: 'x.x.x.x.x.x.x.xx',
};
const BASS = {
  intro: [[0, 'R', 3, 0.9], [8, 'R', 3, 0.8]],
  a: [[0, 'R', 1.5, 1], [3, 'R', 1, 0.7], [6, 'O', 1, 0.9], [8, 'R', 1.5, 0.85], [10, 'O', 1, 0.8], [11, 'R', 1, 0.6], [14, 'O', 1.5, 0.9]],
  b: [[0, 'R', 2, 1], [2, 'O', 1, 0.8], [5, 'R', 1, 0.7], [6, '7', 1, 0.8], [8, 'R', 1, 0.9], [10, 'O', 1, 0.85], [12, '5', 1, 0.7], [14, 'O', 1, 0.9], [15, 'R', 1, 0.6]],
  brk: [[0, 'R', 14, 0.6]],
  hall0: [[0, 'R', 11, 0.8]], hall1: [[6, '5', 3, 0.45], [10, 'R', 5, 0.55]],
  storm: [[0, 'R', 1, 1], [2, 'R', 1, 0.8], [4, 'O', 1, 0.9], [6, 'R', 1, 0.8], [8, 'R', 1, 0.95], [10, 'R', 1, 0.8], [12, 'O', 1, 0.9], [14, '5', 1, 0.85]],
  ruin: [[0, 'R', 7, 0.8], [10, 'b2', 2, 0.45], [13, 'R', 3, 0.6]],
};
const HAT16 = [0.55, 0.28, 0, 0.34, 0.5, 0.26, 0, 0.36, 0.55, 0.3, 0, 0.32, 0.5, 0.27, 0, 0.42];
const SHAKE = [0.5, 0.18, 0.32, 0.2, 0.45, 0.18, 0.3, 0.24, 0.5, 0.18, 0.32, 0.2, 0.45, 0.2, 0.36, 0.26];
const TOMS = { 0: [1, 0], 3: [0.6, 0], 6: [0.8, 1], 10: [0.7, 0], 12: [0.9, 1], 14: [0.6, 2] };
// Keys comping over two bars (32 steps): a rolled chord, then a few soft answers.
const KEYS = [
  { 0: 'roll', 22: 'top2' },
  { 0: 'roll', 10: 'top1', 24: 'mid2' },
  { 2: 'roll', 16: 'top2', 27: 'top1' },
  { 0: 'roll', 12: 'mid2', 20: 'top1', 28: 'top2' },
];
// Lead rhythms: [step, length]. A phrase = call (RH + END) and response (RH + another END), then 4 bars of air.
const RH = [
  [[0, 3], [4, 2], [6, 2], [10, 4]], [[2, 2], [4, 1], [6, 3], [10, 2], [12, 3]], [[0, 2], [3, 3], [7, 1], [8, 4], [14, 2]],
  [[0, 6], [8, 2], [10, 2], [12, 4]], [[3, 1], [4, 3], [8, 1], [9, 1], [10, 6]],
];
const END = [[[0, 8]], [[0, 2], [2, 2], [4, 8]], [[0, 4], [6, 6]], [[2, 10]]];
const ARP = [[0, 1, 2, 3, 4, 3, 2, 1], [0, 2, 1, 3, 2, 4, 3, 1], [4, 3, 2, 1, 0, 1, 2, 3]];
const FORM = { a: [800, 1150, 2900], o: [450, 800, 2830], u: [325, 700, 2530], e: [400, 1600, 2700], i: [300, 1900, 2900] };

const stabSteps = (s) => { const out = new Array(16).fill(0); for (let i = 0; i < 16; i++) if (s[i] === 'x') { let l = 1; while (s[i + l] === '-') l++; out[i] = l; } return out; };
const bassSteps = (p) => { const out = new Array(16).fill(null); for (const [s, d, l, v] of p) out[s] = [d, l, v]; return out; };
const STAB_S = Object.fromEntries(Object.entries(STAB).map(([k, v]) => [k, stabSteps(v)]));
const BASS_S = Object.fromEntries(Object.entries(BASS).map(([k, v]) => [k, bassSteps(v)]));
const KEYS_S = KEYS.map((o) => { const a = new Array(32).fill(null); for (const k in o) a[k] = o[k]; return a; });
const section = (bar) => { const b = bar % 64; return b < 8 ? 'intro' : b < 24 ? 'a' : b < 40 ? 'b' : b < 48 ? 'brk' : 'drop'; };
const INDOOR = /hall|cinema|studio|arcade|sala|school|lift/i;
// The ruins: a half-collapsed pavilion NW of the campus (x -64..-34, z -47..-18), not a named area.
function ruinNear(x, z) {
  const dx = Math.max(-64 - x, 0, x + 34), dz = Math.max(-47 - z, 0, z + 18);
  return 1 - sm(4, 26, Math.hypot(dx, dz));
}
function pickNum(...xs) {
  for (const x of xs) { if (typeof x === 'boolean') return x ? 1 : 0; if (Number.isFinite(x)) return clamp(x); }
  return 0;
}

export function createMusic(opts = {}) {
  const entry = Number.isFinite(opts.entry) ? opts.entry : ENTRY;
  const trimLevel = Number.isFinite(opts.trim) ? opts.trim : TRIM;
  const solo = typeof opts.solo === 'string' ? opts.solo : '';   // dev harness: hear one layer
  let ctx = null, N = null, started = false, starting = null, muted = false, hidden = false, offline = false, shared = false;
  let timer = null, nextTime = 0, step = Math.max(0, (opts.bar | 0) * 16), lastTick = 0, mixClock = 0, made = 0, entryAt = 0;
  let noiseBuf = null, alive = [], rng = mulberry32(7);
  let harm = 'main', harmSet = false, chordKey = '', curSec = 'intro', bassPat = BASS_S.hall0, stabPat = null, keysPat = KEYS_S[0], phrase = null;
  let sceneDriven = false, wasAir = false, boost = 0, duckAmt = 0, swing = 0.18;
  const T = { out: 0, hall: 1, room: 0, night: 0, storm: 0, ruin: 0, arcade: 0, want: 0 };   // where the scene asks to be
  const S = { ...T, energy: 0, groove: 0, calm: 1 };                                          // where the score is
  const lvl = {};                                                                             // JS mirror of layer levels
  const lastSet = new Map();
  let snapping = false;   // true while the first mix is set: values land at once instead of gliding

  // ----------------------------------------------------------- helpers --
  const G = (v = 0) => { const n = ctx.createGain(); n.gain.value = v; return n; };
  const kr = (...ps) => { for (const p of ps) try { p.automationRate = 'k-rate'; } catch (e) { /* older engines: a-rate */ } };
  // k-rate: filter coefficients once per 128-frame block, not per sample (the big CPU cost of swept filters)
  const F = (type, f, q = 0.7) => { const n = ctx.createBiquadFilter(); n.type = type; n.frequency.value = f; n.Q.value = q; kr(n.frequency, n.Q, n.gain); return n; };
  const O = (type, f = 110) => { const o = ctx.createOscillator(); if (typeof type === 'string') o.type = type; else o.setPeriodicWave(type); o.frequency.value = f; return o; };
  const pan = (v) => { if (ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = v; kr(p.pan); return p; } return G(1); };
  const shaper = (drive) => {
    const s = ctx.createWaveShaper(), n = 1024, c = new Float32Array(n);
    for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; c[i] = Math.tanh(drive * x) / drive; }
    s.curve = c; s.oversample = 'none'; return s;
  };
  function param(p, v, tc, now) {
    const old = lastSet.get(p);
    if (!snapping && old !== undefined && Math.abs(old - v) <= Math.abs(v) * 0.01 + 1e-4) return;
    lastSet.set(p, v);
    if (snapping) p.setValueAtTime(v, now); else p.setTargetAtTime(v, now, tc);
  }
  function room(end) {
    if (alive.length >= CAP) { const now = ctx.currentTime; alive = alive.filter((e) => e > now); }
    if (alive.length >= CAP) return false;
    alive.push(end); made++; return true;
  }
  const hum = () => (rng() - 0.5) * 0.005;

  // ------------------------------------------------------------- graph --
  function build(out) {
    const c = ctx, sr = c.sampleRate;
    const len = Math.floor(sr * 2), nb = c.createBuffer(1, len, sr), nd = nb.getChannelData(0), nr = mulberry32(99);
    for (let i = 0; i < len; i++) nd[i] = nr() * 2 - 1;
    noiseBuf = nb;

    // master: sum -> rumble HPF -> voice-band pocket -> air -> glue -> level -> soft clip -> duck -> mute -> trim -> out
    const sum = G(0.4), hp = F('highpass', 30, -3), dip = F('peaking', 2300, 0.9), air = F('highshelf', 9500, 0.7);
    dip.gain.value = -2.5; air.gain.value = 1.5;
    const glue = c.createDynamicsCompressor();
    glue.threshold.value = -14; glue.knee.value = 10; glue.ratio.value = 2.5; glue.attack.value = 0.012; glue.release.value = 0.2;
    const level = G(0), clip = c.createWaveShaper();
    { const n = 4096, cv = new Float32Array(n), k = 0.6, top = 0.86;
      for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1, a = Math.abs(x); cv[i] = Math.sign(x) * (a <= k ? a : k + (top - k) * Math.tanh((a - k) / (top - k))); }
      clip.curve = cv; clip.oversample = 'none'; } // sample peaks can never pass -1.5 dBFS
    const duck = G(1), mute = G(muted ? 0 : 1), trim = G(trimLevel);
    sum.connect(hp); hp.connect(dip); dip.connect(air); air.connect(glue); glue.connect(level); level.connect(clip);
    clip.connect(duck); duck.connect(mute); mute.connect(trim);
    trim.connect(out && out.context === c ? out : c.destination);

    // kick-keyed sidechain: A = chords, pad and returns (soft pump), B = bass (deep and quick)
    const duckA = G(1), duckB = G(1); duckA.connect(sum); duckB.connect(sum);

    // returns: one hall (a 4-line feedback delay network), one ping-pong dotted-8th delay, one chorus for width
    const revIn = G(1), revHP = F('highpass', 220, -3), revLP = F('lowpass', 7000, 0.5), revOut = G(0.5);
    revIn.channelCount = 1; revIn.channelCountMode = 'explicit';           // the hall runs mono-in, stereo-out
    revIn.connect(revHP); hallVerb(revHP, revLP); revLP.connect(revOut); revOut.connect(duckA);
    const delIn = G(1), dHP = F('highpass', 350, 0.6), dLP = F('lowpass', 3200, 0.6), dL = c.createDelay(2), dR = c.createDelay(2);
    dL.delayTime.value = STEP * 3; dR.delayTime.value = STEP * 3;
    const fbL = G(0.5), fbR = G(0.5), pL = pan(-0.6), pR = pan(0.6), delOut = G(0.42);
    delIn.connect(dHP); dHP.connect(dLP); dLP.connect(dL); dL.connect(pL); dL.connect(fbL); fbL.connect(dR); dR.connect(pR); dR.connect(fbR); fbR.connect(dL);
    pL.connect(delOut); pR.connect(delOut); delOut.connect(duckA);
    const wideIn = G(1), cdL = c.createDelay(0.05), cdR = c.createDelay(0.05);
    cdL.delayTime.value = 0.011; cdR.delayTime.value = 0.017; kr(cdL.delayTime, cdR.delayTime);
    const cl = O('sine', 0.23), clL = G(0.0025), clR = G(-0.0025), wL = pan(-0.9), wR = pan(0.9), wOut = G(0.5);
    cl.connect(clL); cl.connect(clR); clL.connect(cdL.delayTime); clR.connect(cdR.delayTime); cl.start();
    wideIn.connect(cdL); wideIn.connect(cdR); cdL.connect(wL); cdR.connect(wR); wL.connect(wOut); wR.connect(wOut); wOut.connect(duckA);
    const send = (from, to, v) => { const s = G(v); from.connect(s); s.connect(to); return s; };

    // layers (gains the scene crossfades)
    const L = {};
    const mk = (k, dest) => { const n = G(0); if (dest) n.connect(dest); L[k] = n; lvl[k] = 0; return n; };
    const drum = G(0.9), drumSat = shaper(1.3), drumLP = F('lowpass', 18000, 0.5);
    drum.connect(drumSat); drumSat.connect(drumLP); drumLP.connect(sum);
    mk('kick', drum); mk('clap', drum); mk('perc', drum);
    send(L.clap, revIn, 0.22);
    const hatP = pan(0.18), ohatP = pan(-0.12), shakeP = pan(-0.3);
    mk('hat', hatP); mk('ohat', ohatP); mk('shaker', shakeP);
    hatP.connect(drumLP); ohatP.connect(drumLP); shakeP.connect(drumLP);
    send(L.shaker, revIn, 0.2); send(L.ohat, revIn, 0.06);

    // bass: one mono voice (two saws + sine), warmed, mud cut, rumble cut, pumped by the kick
    const bo1 = O('sawtooth'), bo2 = O('sawtooth'), bsub = O('sine');
    bo2.detune.value = 8;
    const bSaw = G(0.4), bSub = G(0.45), bLP = F('lowpass', 300, 2.2), bAmp = G(0);
    bo1.connect(bSaw); bo2.connect(bSaw); bSaw.connect(bLP); bLP.connect(bAmp); bsub.connect(bSub); bSub.connect(bAmp);
    for (const o of [bo1, bo2, bsub]) o.start();
    const bSat = shaper(1.8), bMud = F('peaking', 210, 1.1), bHP = F('highpass', 34, -3);
    bMud.gain.value = -2.5;
    mk('bass', bSat); bAmp.connect(L.bass); bSat.connect(bMud); bMud.connect(bHP); bHP.connect(duckB);

    // chord stabs: 4 voices x 2 saws held, chopped by one gate, through the sweeping resonant filter and a phaser
    const stabO = [], sMix = G(0.2), sHP = F('highpass', 180, 0.7), sLP = F('lowpass', 600, 5), sAmp = G(0);
    for (let i = 0; i < 8; i++) { const o = O('sawtooth'); o.detune.value = (i & 1) ? 7 : -6; o.connect(sMix); o.start(); stabO.push(o); }
    sMix.connect(sHP); sHP.connect(sLP); sLP.connect(sAmp);
    mk('stab', duckA); phaser(sAmp, [500, 900, 1500, 2400], 0.11).connect(L.stab);
    send(L.stab, wideIn, 0.5); send(L.stab, revIn, 0.18); send(L.stab, delIn, 0.08);

    // pad: 4 voices x 2 soft saws, slow filter drift, a breath at each chord, chorus-wide
    const W = waves();
    const padO = [], pMix = G(0.075), pLP = F('lowpass', 900, 0.8), pBreath = G(1);
    for (let i = 0; i < 8; i++) { const o = O(W.warm); o.detune.value = (i & 1) ? 9 : -9; o.connect(pMix); o.start(); padO.push(o); }
    const pl = O('sine', 0.07), plD = G(320); pl.connect(plD); plD.connect(pLP.frequency); pl.start();
    pMix.connect(pLP); pLP.connect(pBreath);
    mk('pad', duckA); pBreath.connect(L.pad);
    send(L.pad, wideIn, 0.6); send(L.pad, revIn, 0.5);

    // lead: saw + square through three formant band-passes (a talking, vocoder-like vowel) and a phaser
    const lo1 = O('sawtooth'), lo2 = O('square'), lSrc = G(0.1), lvib = O('sine', 5.3), lvD = G(9);
    lo2.detune.value = -5; lvib.connect(lvD); lvD.connect(lo1.detune); lvD.connect(lo2.detune);
    lo1.connect(lSrc); lo2.connect(lSrc);
    const lForm = G(1), bp = [F('bandpass', 800, 7), F('bandpass', 1150, 9), F('bandpass', 2900, 10)];
    [4, 2.6, 0.7].forEach((v, i) => { lSrc.connect(bp[i]); send(bp[i], lForm, v); });
    const lBody = F('lowpass', 1300, 0.7); lSrc.connect(lBody); send(lBody, lForm, 0.35);
    const lAmp = G(0); lForm.connect(lAmp);
    for (const o of [lo1, lo2, lvib]) o.start();
    mk('lead', sum); phaser(lAmp, [600, 1300, 2600], 0.37).connect(L.lead);
    send(L.lead, revIn, 0.25); send(L.lead, delIn, 0.32);

    // chip: one pulse-wave voice, ping-ponged by note
    const co = O(W.pulse), cAmp = G(0), cPan = pan(0);
    co.connect(cAmp); cAmp.connect(cPan); co.start();
    mk('chip', sum); cPan.connect(L.chip);
    send(L.chip, delIn, 0.35); send(L.chip, revIn, 0.12);

    // keys (additive electric piano) with a slow stereo tremolo; bells; ruin drone and wind; fx
    const kP = pan(0); mk('keys', kP); kP.connect(sum);
    if (kP.pan) { const kl = O('sine', 2.4), kd = G(0.28); kl.connect(kd); kd.connect(kP.pan); kl.start(); }
    send(L.keys, revIn, 0.45); send(L.keys, delIn, 0.14);
    mk('bell', sum); send(L.bell, revIn, 0.7); send(L.bell, delIn, 0.35);
    mk('ruin', sum); send(L.ruin, revIn, 0.8);
    const d1 = O('sawtooth', mtof(43)), d2 = O('sawtooth', mtof(50)), dBP = F('bandpass', 520, 5), dG = G(0.22);
    d2.detune.value = 11;
    const dl = O('sine', 0.045), dlD = G(260); dl.connect(dlD); dlD.connect(dBP.frequency);
    d1.connect(dBP); d2.connect(dBP); dBP.connect(dG); dG.connect(L.ruin);
    const wn = c.createBufferSource(); wn.buffer = noiseBuf; wn.loop = true;
    const wBP = F('bandpass', 700, 9), wl = O('sine', 0.08), wlD = G(300), wG = G(0.5);
    wl.connect(wlD); wlD.connect(wBP.frequency); wn.connect(wBP); wBP.connect(wG); wG.connect(L.ruin);
    for (const o of [d1, d2, dl, wl]) o.start(); wn.start();
    mk('fx', sum); send(L.fx, revIn, 0.4);

    N = { W, sum, dip, level, duck, mute, duckA, duckB, revIn, revOut, revLP, delIn, fbL, fbR, drumLP, L,
      bass: { o: [bo1, bo2, bsub], saw: bSaw, sub: bSub, lp: bLP, amp: bAmp },
      stab: { o: stabO, lp: sLP, amp: sAmp }, pad: { o: padO, breath: pBreath, lp: pLP },
      lead: { o: [lo1, lo2], bp, amp: lAmp, last: 0, end: 0 }, chip: { o: co, amp: cAmp, pan: cPan } };
  }

  function phaser(input, freqs, rate) {
    const out = G(1), dry = G(0.62), wet = G(0.62), lfo = O('sine', rate);
    input.connect(dry); dry.connect(out);
    let prev = input;
    for (const f of freqs) {
      const ap = F('allpass', f, 0.6), d = G(f * 0.55);
      lfo.connect(d); d.connect(ap.frequency); prev.connect(ap); prev = ap;
    }
    prev.connect(wet); wet.connect(out); lfo.start();
    return out;
  }

  function waves() {
    const n = 40, re = new Float32Array(n), im = new Float32Array(n), re2 = new Float32Array(n), im2 = new Float32Array(n), D = 0.25;
    const epIm = new Float32Array([0, 1, 0.38, 0.14, 0.06, 0.03]);
    for (let k = 1; k < n; k++) {
      im[k] = Math.pow(k, -1.35) * (k % 2 ? 1 : 0.8);                          // soft, slightly hollow saw
      const roll = 1 - k / (n + 8);                                             // 25% pulse, edges softened
      re2[k] = roll * Math.sin(2 * Math.PI * k * D) / (k * Math.PI);
      im2[k] = roll * 2 * Math.pow(Math.sin(Math.PI * k * D), 2) / (k * Math.PI);
    }
    return { warm: ctx.createPeriodicWave(re, im), pulse: ctx.createPeriodicWave(re2, im2), ep: ctx.createPeriodicWave(new Float32Array(6), epIm) };
  }

  // A hall for a few delay lines' worth of CPU (a long convolver costs ~10x more): pre-delay, two Schroeder
  // diffusers, then four damped lines mixed by a Householder matrix; odd lines feed the right, even the left.
  // Stability: Web Audio reads lowpass/highpass Q in dB. The damping filter sits inside the loop, so its Q must
  // be <= -3 dB (no peak): at Q -6 its gain never exceeds 1 and the loop gain stays <= g < 1 (RT60 ~2 s).
  function hallVerb(input, out, rt = 2.1) {
    const pre = ctx.createDelay(0.1); pre.delayTime.value = 0.016; input.connect(pre);
    let x = pre;
    for (const [d, g] of [[0.0061, 0.6], [0.0089, 0.55]]) x = allpass(x, d, g);
    const D = [0.0317, 0.0373, 0.0419, 0.0471], mixS = G(-0.5), merger = ctx.createChannelMerger(2), wet = G(0.39);
    D.forEach((d, i) => {
      const dl = ctx.createDelay(0.1), fb = G(Math.pow(10, (-3 * d) / rt)), damp = F('lowpass', 5200, -6), inj = G(i & 1 ? -0.5 : 0.5);
      dl.delayTime.value = d;
      dl.connect(fb); dl.connect(mixS); mixS.connect(fb); fb.connect(damp); damp.connect(dl);
      x.connect(inj); inj.connect(dl); dl.connect(merger, 0, i & 1);
    });
    merger.connect(wet); wet.connect(out);
  }
  function allpass(input, d, g) { // v = x + g v[n-D]; y = -g v + v[n-D]
    const v = G(1), dl = ctx.createDelay(0.05), fb = G(g), ff = G(-g), out = G(1);
    dl.delayTime.value = d;
    input.connect(v); v.connect(dl); dl.connect(fb); fb.connect(v); v.connect(ff); ff.connect(out); dl.connect(out);
    return out;
  }

  // ------------------------------------------------------------ voices --
  function nz(t, dur, type, f, q, v, dest, atk = 0.001) {
    if (!room(t + dur)) return;
    const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
    const fl = F(type, f, q), e = G(0);
    e.gain.setValueAtTime(0, t); e.gain.linearRampToValueAtTime(v, t + atk); e.gain.setTargetAtTime(0, t + atk, dur / 6);
    s.connect(fl); fl.connect(e); e.connect(dest);
    s.start(t, rng() * 1.8); s.stop(t + dur + 0.02);
  }
  function kick(t, v) {
    if (!room(t + 0.45)) return;
    const o = O('sine'), e = G(0);
    o.frequency.setValueAtTime(170, t); o.frequency.exponentialRampToValueAtTime(58, t + 0.06); o.frequency.exponentialRampToValueAtTime(46, t + 0.35);
    e.gain.setValueAtTime(0, t); e.gain.linearRampToValueAtTime(0.85 * v, t + 0.0015); e.gain.setTargetAtTime(0, t + 0.07, 0.075);
    o.connect(e); e.connect(N.L.kick); o.start(t); o.stop(t + 0.45);
    nz(t, 0.012, 'highpass', 3500, 0.7, 0.3 * v, N.L.kick, 0.0005);           // beater click: the transient
    // the pump: only as deep as the kick is loud, so a silent kick never pumps a sustained pad
    const k = lvl.kick || 0, A = N.duckA.gain, B = N.duckB.gain;
    A.setTargetAtTime(1 - 0.5 * k * v, t, 0.004); A.setTargetAtTime(1, t + 0.04, 0.1);
    B.setTargetAtTime(1 - 0.72 * k * v, t, 0.003); B.setTargetAtTime(1, t + 0.03, 0.06);
  }
  function clap(t, v) {
    for (let k = 0; k < 3; k++) nz(t + k * 0.009, 0.014, 'bandpass', 1150, 1.1, 1.5 * v, N.L.clap);
    nz(t + 0.027, 0.17, 'bandpass', 1050, 0.9, 1.3 * v, N.L.clap);
    nz(t, 0.09, 'highpass', 5200, 0.6, 0.55 * v, N.L.clap);
    if (!room(t + 0.1)) return;
    const o = O('triangle'), e = G(0);
    o.frequency.setValueAtTime(195, t); o.frequency.exponentialRampToValueAtTime(150, t + 0.07);
    e.gain.setValueAtTime(0, t); e.gain.linearRampToValueAtTime(0.6 * v, t + 0.001); e.gain.setTargetAtTime(0, t + 0.002, 0.03);
    o.connect(e); e.connect(N.L.clap); o.start(t); o.stop(t + 0.16);
  }
  function snare(t, v) { nz(t, 0.08, 'bandpass', 1000, 0.8, 0.45 * v, N.L.clap); nz(t, 0.06, 'highpass', 5000, 0.6, 0.2 * v, N.L.clap); }
  const chat = (t, v) => nz(t, 0.035 + 0.012 * v, 'highpass', 8200, 0.9, 1.3 * v, N.L.hat, 0.0008);
  const ohat = (t, v) => nz(t, 0.2, 'highpass', 7000, 0.8, 0.58 * v, N.L.ohat, 0.003);
  const shake = (t, v) => nz(t, 0.05, 'bandpass', 7000, 1.4, 1.6 * v, N.L.shaker, 0.007);
  function tom(t, v, p) {
    if (!room(t + 0.4)) return;
    const f = 105 * [1, 0.84, 0.7][p], o = O('sine'), e = G(0);
    o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(f * 0.55, t + 0.2);
    e.gain.setValueAtTime(0, t); e.gain.linearRampToValueAtTime(0.7 * v, t + 0.002); e.gain.setTargetAtTime(0, t + 0.01, 0.07);
    o.connect(e); e.connect(N.L.perc); o.start(t); o.stop(t + 0.4);
    nz(t, 0.05, 'lowpass', 900, 0.7, 0.25 * v, N.L.perc);
  }
  function bassNote(t, midi, len, v) {
    const b = N.bass, f = mtof(midi), br = S.bright ?? 0.3, end = t + len * STEP * 0.92;
    for (const o of b.o) o.frequency.setValueAtTime(f, t);
    b.sub.gain.setValueAtTime(midi < 40 ? 0.45 : 0.22, t);
    const A = b.amp.gain; A.cancelScheduledValues(t - 0.004); A.setTargetAtTime(0, t - 0.004, 0.0015);
    A.setTargetAtTime(v, t, 0.003); A.setTargetAtTime(v * 0.72, t + 0.03, 0.15); A.setTargetAtTime(0, end, 0.02);
    const Q = b.lp.frequency; Q.cancelScheduledValues(t);
    Q.setTargetAtTime(Math.min(9000, f * (4 + 10 * br)), t, 0.002); Q.setTargetAtTime(f * (1.6 + 2.5 * br), t + 0.01, 0.09 + 0.1 * (1 - br));
  }
  function stabHit(t, len, v) {
    const A = N.stab.amp.gain, end = t + len * STEP * 0.85;
    A.cancelScheduledValues(t - 0.005); A.setTargetAtTime(0, t - 0.005, 0.0015);
    A.setTargetAtTime(v, t, 0.002); A.setTargetAtTime(v * 0.55, t + 0.012, 0.07); A.setTargetAtTime(0, end, 0.025);
  }
  function leadNote(t, midi, len, v, vowel) {
    const l = N.lead, f = mtof(midi), end = t + len * STEP * 0.9;
    const slide = l.last && Math.abs(midi - l.last) <= 4 && t - l.end < 0.04;
    for (const o of l.o) o.frequency.setTargetAtTime(f, t, slide ? 0.03 : 0.002);
    const A = l.amp.gain; A.cancelScheduledValues(t - 0.003);
    if (!slide) A.setTargetAtTime(0, t - 0.003, 0.001);
    A.setTargetAtTime(v, t, 0.006); A.setTargetAtTime(v * 0.8, t + 0.05, 0.25); A.setTargetAtTime(0, end, 0.05);
    const fm = FORM[vowel] || FORM.a, dark = 1 - 0.18 * S.night;
    for (let i = 0; i < 3; i++) l.bp[i].frequency.setTargetAtTime(fm[i] * dark, t, 0.035);
    l.last = midi; l.end = end;
  }
  function chipNote(t, midi, v, p) {
    const c = N.chip;
    c.o.frequency.setValueAtTime(mtof(midi), t);
    const A = c.amp.gain; A.cancelScheduledValues(t - 0.002); A.setTargetAtTime(0, t - 0.002, 0.0008);
    A.setTargetAtTime(v * 0.3, t, 0.001); A.setTargetAtTime(0, t + STEP * 0.55, 0.02);
    if (c.pan.pan) c.pan.pan.setValueAtTime(p, t);
  }
  function key(t, midi, v) {      // electric piano: a mellow body and a short bright tine on top
    const f = mtof(midi), dur = midi < 55 ? 3.0 : 2.3;
    if (!room(t + dur + 0.2)) return;
    const o = O(N.W.ep, f), e = G(0), tn = O('sine', Math.min(f * 7, 12000)), te = G(0);
    e.gain.setValueAtTime(0, t); e.gain.linearRampToValueAtTime(v * 0.56, t + 0.003);
    e.gain.setTargetAtTime(v * 0.2, t + 0.005, 0.5); e.gain.setTargetAtTime(0, t + dur - 0.4, 0.15);
    te.gain.setValueAtTime(0, t); te.gain.linearRampToValueAtTime(v * 0.1, t + 0.001); te.gain.setTargetAtTime(0, t + 0.002, 0.035);
    o.connect(e); tn.connect(te); e.connect(N.L.keys); te.connect(N.L.keys);
    o.start(t); tn.start(t); o.stop(t + dur + 0.2); tn.stop(t + 0.3);
  }
  function bell(t, midi, v, ratio, dur) {
    if (!room(t + dur)) return;
    const f = mtof(midi), c = O('sine', f), m = O('sine', f * ratio), mg = G(0), e = G(0);
    mg.gain.setValueAtTime(f * 2, t); mg.gain.setTargetAtTime(f * 0.1, t, dur * 0.18);
    m.connect(mg); mg.connect(c.frequency);
    e.gain.setValueAtTime(0, t); e.gain.linearRampToValueAtTime(v * 0.25, t + 0.002); e.gain.setTargetAtTime(0, t + 0.002, dur / 5);
    c.connect(e); e.connect(N.L.bell); c.start(t); m.start(t); c.stop(t + dur); m.stop(t + dur);
  }
  function sweep(t, dur, v, f0, f1, dest, cut = true) {    // risers, reversed swells
    if (!room(t + dur + 0.1)) return;
    const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
    const fl = F('bandpass', f0, 1.6), e = G(0);
    fl.frequency.setValueAtTime(f0, t); fl.frequency.exponentialRampToValueAtTime(f1, t + dur);
    e.gain.setValueAtTime(0.0001, t); e.gain.exponentialRampToValueAtTime(v, t + dur);
    e.gain.linearRampToValueAtTime(0, t + dur + (cut ? 0.02 : 0.3));
    s.connect(fl); fl.connect(e); e.connect(dest); s.start(t, rng()); s.stop(t + dur + 0.35);
  }
  function impact(t, v) {
    if (!room(t + 1.4)) return;
    const o = O('sine'), e = G(0);
    o.frequency.setValueAtTime(75, t); o.frequency.exponentialRampToValueAtTime(34, t + 0.9);
    e.gain.setValueAtTime(0, t); e.gain.linearRampToValueAtTime(0.55 * v, t + 0.004); e.gain.setTargetAtTime(0, t + 0.01, 0.3);
    o.connect(e); e.connect(N.L.fx); o.start(t); o.stop(t + 1.4);
    nz(t, 0.9, 'lowpass', 1400, 0.6, 0.22 * v, N.L.fx, 0.002);
  }

  // --------------------------------------------------------- sequencer --
  function genPhrase(seed) {
    const r = mulberry32(seed), pick = (a) => a[Math.floor(r() * a.length)];
    const rh = pick(RH), en = pick(END), en2 = pick(END), mv = [];
    for (let i = 0; i < 12; i++) mv.push(pick([-2, -1, -1, 1, 1, 2, 0, 3, -3, -1]));
    const bars = Array.from({ length: 8 }, () => new Array(16).fill(null));
    const put = (b, s, l, d, last) => {
      (bars[b][s] = bars[b][s] || []).push({ l, d: clamp(d, -2, 11), strong: s % 4 === 0 || l >= 3 || !!last,
        v: l >= 3 ? pick(['a', 'o', 'a', 'u']) : pick(['e', 'i', 'a', 'o']) });
    };
    const d0 = pick([4, 2, 7, 5]);
    let d = d0, k = 0;
    for (const [s, l] of rh) { put(0, s, l, d); d += mv[k++]; }
    for (const [s, l] of en) { put(1, s, l, d); d += mv[k++]; }
    d = d0 + pick([2, -1, 1, -2]); k = 0;
    for (const [s, l] of rh) { put(2, s, l, d); d += mv[k++]; }
    en2.forEach(([s, l], i) => { const last = i === en2.length - 1; put(3, s, l, last ? pick([0, 4, 7]) : d, last); d += mv[k++]; });
    return bars;
  }
  function resolve(n, C) {
    const sc = C.s, oct = Math.floor(n.d / 7), i = ((n.d % 7) + 7) % 7;
    let m = 67 + 12 * oct + sc[i];
    if (n.strong && !C.pcs.has(m % 12)) for (const dm of [1, -1, 2, -2]) if (C.pcs.has((m + dm + 120) % 12)) { m += dm; break; }
    return clamp(m, 62, 86);
  }
  function setChord(t, C) {
    const so = N.stab.o, po = N.pad.o;
    for (let i = 0; i < 4; i++) {
      const fs = mtof(C.v[i]), fp = mtof(i === 0 ? C.v[i] - 12 : C.v[i]);
      so[i * 2].frequency.setValueAtTime(fs, t); so[i * 2 + 1].frequency.setValueAtTime(fs, t);
      po[i * 2].frequency.setTargetAtTime(fp, t, 0.012); po[i * 2 + 1].frequency.setTargetAtTime(fp, t, 0.012);
    }
    const B = N.pad.breath.gain; B.setTargetAtTime(0.62, Math.max(0, t - 0.06), 0.03); B.setTargetAtTime(1, t + 0.01, 0.6);
  }
  function barStart(bar, sec, t) {
    const b64 = bar % 64, cyc = Math.floor(bar / 64), groove = S.groove, e = S.energy;
    rng = mulberry32(bar * 7919 + 13);
    if (harm === 'ruin') bassPat = BASS_S.ruin;
    else if (harm === 'storm') bassPat = BASS_S.storm;
    else if (groove < 0.35) bassPat = (bar & 1) ? BASS_S.hall1 : BASS_S.hall0;
    else bassPat = BASS_S[sec === 'drop' ? ((bar >> 1) & 1 ? 'b' : 'a') : sec];
    stabPat = STAB_S[harm === 'storm' ? 'storm' : sec];
    keysPat = KEYS_S[(({ intro: 0, a: 1, b: 2, brk: 0, drop: 3 })[sec] + cyc) % 4];
    if (b64 % 8 === 0) phrase = (sec === 'b' || sec === 'drop' || (sec === 'a' && cyc % 2 === 1)) ? genPhrase(cyc * 131 + b64 + 5) : null;
    // the filter-house sweep: opens across A, breathes in B, closes in the break and rips open into the drop
    let cut;
    if (sec === 'intro') cut = 420 + 50 * (b64 % 8);
    else if (sec === 'a') cut = 520 * Math.pow(2, 2.9 * ((b64 - 8) / 15));
    else if (sec === 'b') cut = 2600 + 700 * Math.sin(bar * 0.8);
    else if (sec === 'brk') { const k = b64 - 40; cut = k < 6 ? 3000 * Math.pow(0.65, k) : [900, 2600][k - 6]; }
    else cut = 4200 + 900 * ((bar & 3) / 3);
    cut *= Math.pow(2, 0.8 * (e - 0.6)) * (1 - 0.35 * S.night) * (1 - 0.3 * S.ruin);
    if (harm === 'storm') cut = Math.min(cut, 1900);
    N.stab.lp.frequency.setTargetAtTime(clamp(cut, 260, 9000), t, BAR / 3);
    N.stab.lp.Q.setTargetAtTime(harm === 'storm' ? 8 : 5 + 1.5 * S.energy, t, 0.5);
    // fx: risers into B and the drop, a low hit on arrival (only when the visitor is really moving)
    if (!muted && lvl.fx > 0.05) {
      if (b64 === 46) sweep(t, BAR * 2, 0.16 * lvl.fx, 350, 7000, N.L.fx);
      if (b64 === 23) sweep(t, BAR, 0.1 * lvl.fx, 500, 6000, N.L.fx);
      if (b64 === 48) impact(t, lvl.fx);
      if (b64 === 24) impact(t, 0.5 * lvl.fx);
    }
    // near the ruins: a reversed swell into each chord change
    if (!muted && lvl.ruin > 0.05 && bar % 2 === 1) sweep(t, BAR, 0.08 * lvl.ruin, 2500, 600, N.L.ruin, false);
  }

  function schedule(s16, t0) {
    const sb = s16 & 15, bar = s16 >> 4, sec = section(bar);
    if (sb === 0 && (bar % 4 === 0 || !harmSet)) { harm = S.ruin > 0.5 ? 'ruin' : S.storm > 0.5 ? 'storm' : 'main'; harmSet = true; }
    const H = HARM[harm], ci = Math.floor(bar / H.bars) % H.ch.length, C = H.ch[ci];
    if (harm + ci !== chordKey) { chordKey = harm + ci; setChord(t0, C); }
    if (sb === 0) { curSec = sec; barStart(bar, sec, t0); }
    if (muted || !stabPat) return;
    const t = t0 + ((sb & 1) ? swing * STEP : 0), b64 = bar % 64;
    // drums
    if (lvl.kick > 0.01) {
      if (sec !== 'brk' && (sb % 4 === 0 || (harm === 'storm' && (sb === 11 || (sb === 14 && bar & 1))) || (sec === 'drop' && sb === 14 && bar % 4 === 3))) kick(t0, sb % 4 === 0 ? 1 : 0.7);
      else if (sec === 'brk' && b64 === 47 && sb % 2 === 0) kick(t0, 0.3 + 0.045 * sb);       // the build back in
    }
    if (lvl.clap > 0.01) {
      if ((sb === 4 || sb === 12) && sec !== 'intro' && !(sec === 'brk' && sb === 4)) clap(t, sec === 'brk' ? 0.6 : 1);
      if (bar % 16 === 15 && sb >= 12 && sec !== 'brk') snare(t, 0.35 + 0.15 * (sb - 12));     // fill into the next section
    }
    if (lvl.ohat > 0.01 && sb % 4 === 2 && !(sec === 'brk' && sb % 8 === 2)) ohat(t, sb === 14 ? 1 : 0.85);
    if (lvl.hat > 0.01 && HAT16[sb] > 0 && sec !== 'brk') chat(t + hum(), HAT16[sb] * (0.82 + 0.18 * rng()));
    if (lvl.shaker > 0.01 && sec !== 'brk' && !(sec === 'intro' && S.calm > 0.5)) shake(t + hum(), SHAKE[sb] * (0.8 + 0.2 * rng()));
    if (lvl.perc > 0.01 && TOMS[sb] && (harm === 'storm' || (sec === 'drop' && bar & 1))) tom(t, TOMS[sb][0], TOMS[sb][1]);
    // bass, stabs, lead, chip
    const bp = bassPat[sb];
    if (bp && lvl.bass > 0.01) bassNote(t, degree(C, bp[0]), bp[1], bp[2]);
    if (stabPat[sb] && lvl.stab > 0.01) stabHit(t, stabPat[sb], 0.9);
    const ln = phrase && phrase[bar % 8][sb];
    if (ln && lvl.lead > 0.01) for (const n of ln) leadNote(t, resolve(n, C), n.l, 0.85, n.v);
    if (lvl.chip > 0.01 && sec !== 'brk') {
      const pool = [C.v[0] + 12, C.v[1] + 12, C.v[2] + 12, C.v[3] + 12, C.v[0] + 24], pat = ARP[(bar >> 2) % ARP.length];
      chipNote(t, pool[pat[sb % 8] % pool.length], sb % 4 === 0 ? 0.9 : 0.65, (sb & 1) ? 0.35 : -0.35);
    }
    // keys: the hall's comping
    const kv = keysPat[(bar & 1) * 16 + sb];
    if (kv && lvl.keys > 0.01) {
      if (kv === 'roll') [C.b + 12, ...C.v].forEach((m, i) => key(t + i * 0.028, m, 0.55 - i * 0.03));
      else if (kv === 'top2') { key(t, C.v[2], 0.4); key(t + 0.012, C.v[3], 0.42); }
      else if (kv === 'top1') key(t, C.v[3] + (rng() < 0.35 ? 12 : 0), 0.38);
      else { key(t, C.v[1], 0.36); key(t + 0.01, C.v[2], 0.36); }
    }
    // bells: glass at night and in the hall, metal near the ruins
    if (lvl.bell > 0.02 && sb % 2 === 0 && rng() < 0.02 + 0.05 * S.night + 0.07 * S.ruin) {
      const metal = S.ruin > 0.5;
      bell(t, C.v[Math.floor(rng() * 4)] + (metal ? 12 : 24), 0.5 + 0.4 * rng(), metal ? (rng() < 0.5 ? 3.5 : 1.41) : 2, metal ? 3.5 : 2.2);
    }
  }

  function pump() {
    if (!ctx || !N) return;
    if (!offline && (hidden || ctx.state !== 'running')) return;
    const now = ctx.currentTime;
    if (nextTime < now - 0.02) { const miss = Math.ceil((now - nextTime) / STEP); step += miss; nextTime += miss * STEP; } // stalled: keep the grid
    while (nextTime < now + LOOK) { schedule(step, nextTime); nextTime += STEP; step++; }
  }

  // ------------------------------------------------------------- scene --
  function applyMix(now, dt) {
    const o = S.out, h = S.hall, n = S.night, st = S.storm, r = S.ruin, a = S.arcade, e = S.energy;
    const groove = clamp(o * (1 - 0.85 * r) + S.room * 0.45 + a * 0.4), calm = 1 - groove;
    S.groove = groove; S.calm = calm;
    S.bright = clamp(0.25 + 0.75 * groove * (0.5 + 0.5 * e)) * (1 - 0.35 * n);
    swing = 0.14 + 0.08 * calm - 0.1 * st;
    const k = snapping ? 1 : 1 - Math.exp(-dt / 0.7);
    const set = (key, v) => { v = solo && key !== solo ? 0 : clamp(v, 0, 1.5); lvl[key] += (v - lvl[key]) * k; param(N.L[key].gain, v, 0.7, now); };
    set('kick', groove * sm(0.12, 0.45, e) * (1 - 0.25 * n));
    set('clap', groove * sm(0.3, 0.6, e) * (1 - 0.3 * n));
    set('ohat', groove * sm(0.2, 0.5, e) * (1 - 0.45 * n));
    set('hat', groove * sm(0.55, 0.9, e) * (1 - 0.3 * n) + 0.35 * st * o);
    set('shaker', (0.55 * calm + 0.25 * n) * (1 - 0.7 * r) * (1 - 0.6 * groove * e));
    set('perc', st * (0.35 + 0.65 * o) * (1 - r) + groove * sm(0.8, 1, e) * 0.45);
    set('bass', (0.28 + 0.72 * groove * sm(0.05, 0.45, e)) * (1 - 0.35 * r));
    set('stab', (groove * sm(0.12, 0.5, e) + 0.6 * st * o) * (1 - 0.8 * r));
    set('pad', clamp(0.24 + 0.19 * calm + 0.35 * n + 0.5 * r - 0.15 * groove * e, 0.2, 1));
    set('keys', (0.85 * calm + 0.45 * n * groove) * (1 - 0.85 * r) * (1 - 0.6 * groove * e));
    set('lead', groove * sm(0.3, 0.6, e) * (1 - 0.3 * st));
    set('chip', groove * sm(0.72, 0.95, e) + 0.7 * a);
    set('bell', 0.6 * n + 0.8 * r + 0.25 * calm * h);
    set('ruin', r);
    set('fx', groove * sm(0.4, 0.8, e));
    // tone: night muffles the drums, the ruins darken the room, the hall opens it; night echoes linger
    param(N.drumLP.frequency, 18000 * Math.pow(0.45, n), 0.8, now);
    param(N.revOut.gain, 0.42 + 0.3 * calm + 0.3 * n + 0.45 * r, 0.8, now);
    param(N.revLP.frequency, 7500 * (1 - 0.55 * r) * (1 - 0.3 * n), 0.8, now);
    param(N.fbL.gain, 0.48 + 0.12 * n, 0.8, now); param(N.fbR.gain, 0.48 + 0.12 * n, 0.8, now);
    param(N.bass.saw.gain, 0.1 + 0.3 * S.bright, 0.5, now);
    param(N.pad.lp.frequency, 900 * (1 - 0.35 * r) * (1 + 0.25 * n), 1, now);
  }

  function tick() {
    if (!ctx || !N) return;
    const now = ctx.currentTime;
    let dt = now - lastTick; lastTick = now;
    if (!(dt > 0)) dt = 0; else if (dt > 0.5) dt = 0.5;
    // places crossfade over ~3 s; energy rises with ~2 s of effort and settles over ~6 s
    const k = 1 - Math.exp(-dt / 1.1);
    for (const key of ['out', 'hall', 'room', 'night', 'storm', 'ruin', 'arcade']) S[key] += (T[key] - S[key]) * k;
    boost *= Math.exp(-dt / 2.5);
    const want = clamp(T.want + boost);
    S.energy += (want - S.energy) * (1 - Math.exp(-dt / (want > S.energy ? 1.8 : 6)));
    mixClock -= dt;
    if (mixClock <= 0) { applyMix(now, 0.1 - mixClock); mixClock = 0.1; }
    pump();
  }

  function onVis() {
    hidden = typeof document !== 'undefined' && !!document.hidden;
    if (!ctx || offline || shared) return; // a shared context belongs to the effects; they suspend it
    try { const p = hidden ? ctx.suspend() : ctx.resume(); if (p && p.catch) p.catch(() => {}); } catch (e) { /* ignore */ }
  }

  const api = {
    async start(existing, out) {
      if (started) {
        if (!offline && !hidden && ctx.state === 'suspended') { try { await ctx.resume(); } catch (e) { /* ignore */ } }
        return;
      }
      if (starting) return starting;
      starting = (async () => {
        try {
          const AC = typeof globalThis !== 'undefined' && (globalThis.AudioContext || globalThis.webkitAudioContext);
          shared = !!(existing && typeof existing.createGain === 'function');
          ctx = shared ? existing : (AC ? new AC({ latencyHint: 'interactive' }) : null);
          if (!ctx) return;
          offline = typeof ctx.startRendering === 'function';
          build(out);
          const t0 = ctx.currentTime;
          entryAt = t0 + entry; nextTime = entryAt; lastTick = t0;
          Object.assign(S, T); S.energy = T.want;            // begin where the visitor already is
          snapping = true; applyMix(t0, 0.1); snapping = false;
          setChord(t0, HARM.main.ch[0]);
          N.level.gain.setValueAtTime(0, t0); N.level.gain.setValueAtTime(0, Math.max(t0, entryAt - 0.3));
          N.level.gain.linearRampToValueAtTime(MASTER, entryAt + 1.2);
          started = true;
          if (!offline) {
            timer = setInterval(tick, 25);
            if (typeof document !== 'undefined') { document.addEventListener('visibilitychange', onVis); onVis(); }
            if (!hidden && ctx.state === 'suspended') { try { await ctx.resume(); } catch (e) { /* the effects resume it */ } }
          }
        } catch (e) {
          if (timer) clearInterval(timer);
          timer = null; started = false; ctx = null; N = null;
        } finally { starting = null; }
      })();
      return starting;
    },
    setMuted(b) {
      muted = !!b;
      if (!N) return;
      const now = ctx.currentTime, g = N.mute.gain;
      g.cancelScheduledValues(now); g.setTargetAtTime(muted ? 0 : 1, now, muted ? 0.004 : 0.08);
    },
    get muted() { return muted; },
    setScene(s) {
      if (!s || typeof s !== 'object') return;
      sceneDriven = true;
      const w = s.weather && typeof s.weather === 'object' ? s.weather : {};
      const area = typeof s.area === 'string' ? s.area : '';
      const hall = /hall|cinema/i.test(area);
      const indoor = typeof s.indoor === 'boolean' ? s.indoor : INDOOR.test(area);
      let ruin = /ruin/i.test(area) ? 1 : 0;
      if (Number.isFinite(s.x) && Number.isFinite(s.z)) ruin = Math.max(ruin, ruinNear(s.x, s.z));
      T.out = indoor ? 0 : 1;
      T.hall = indoor && hall ? 1 : 0;
      T.room = indoor && !hall ? 1 : 0;
      T.arcade = indoor && /arcade/i.test(area) ? 1 : 0;
      T.ruin = indoor ? 0 : ruin;
      T.night = pickNum(s.night, w.night, w.mode === 'night');
      T.storm = pickNum(s.storm, w.storm, w.mode === 'storm');
      if (Number.isFinite(s.intensity)) T.want = clamp(s.intensity);
      else {
        // the place sets the floor, sustained movement lifts it (walk ~0.25, run 4.9 m/s ~0.75)
        const sp = Number.isFinite(s.speed) ? s.speed : 0;
        T.want = clamp((indoor ? (T.room ? 0.1 : 0) : 0.32) + 0.75 * clamp((sp - 0.8) / 3.6));
      }
      if (s.airborne && !wasAir) boost = Math.min(0.35, boost + 0.18);     // a jump lifts the energy for a moment
      wasAir = !!s.airborne;
      if (s.duck !== undefined) api.setDuck(s.duck);
    },
    setIntensity(v) {
      if (sceneDriven) return;
      v = Number.isFinite(v) ? clamp(v) : 0;
      // legacy main.js formula: 0.25 + speed/5, +0.25 outside the hall
      T.out = v > 0.8 ? 1 : 0; T.hall = 1 - T.out; T.room = 0;
      T.want = clamp((v - 0.25) / 0.75);
    },
    setDuck(v) {
      v = clamp(Number(v) || 0);
      if (Math.abs(v - duckAmt) < 0.01) return;
      const down = v > duckAmt; duckAmt = v;
      if (!N) return;
      const now = ctx.currentTime, tc = down ? 0.12 : 0.6;
      N.duck.gain.setTargetAtTime(Math.pow(10, (-11 * v) / 20), now, tc);
      N.dip.gain.setTargetAtTime(-2.5 - 4 * v, now, tc);
    },
    update() { if (started) tick(); },
    get stats() { return { voices: made, alive: alive.length, bar: step >> 4, harm, section: curSec, energy: S.energy, lvl: { ...lvl } }; },
  };
  return api;
}
