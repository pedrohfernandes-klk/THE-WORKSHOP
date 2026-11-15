// perf.js — adaptive quality governor.
//
// Holds a steady 60 fps by trading render resolution and expensive passes,
// never by swapping the room's materials (no shader recompiles: every step only
// resizes targets, toggles passes, changes uniforms or skips mirror refreshes).
//
// Fed by the measured frame interval: a time-based EMA plus a smoothed
// dropped-frame ratio, with hysteresis (separate "slow" and "headroom" bands),
// dwell times and an exponential back-off on failed step-ups, so it settles
// instead of oscillating. It ignores the first seconds after the visitor goes in
// and after the campus arrives (shader compiles, uploads, shadow bakes), single
// hitches and tab-hidden gaps.
//
// Levels (0 = best). Resolution is a fraction of min(devicePixelRatio, 2).
//   scale  AO        bloom  MSAA  mirrors (every, size)  DOF
export const LADDER = [
  { scale: 1.00, ao: 'full', bloom: 1.0, msaa: 4, mirrorEvery: 1, mirrorScale: 1.00, dof: true },
  { scale: 0.90, ao: 'full', bloom: 1.0, msaa: 4, mirrorEvery: 1, mirrorScale: 1.00, dof: true },
  { scale: 0.80, ao: 'half', bloom: 1.0, msaa: 4, mirrorEvery: 1, mirrorScale: 0.75, dof: true },
  { scale: 0.72, ao: 'half', bloom: 0.5, msaa: 2, mirrorEvery: 2, mirrorScale: 0.75, dof: true },
  { scale: 0.66, ao: 'off', bloom: 0.5, msaa: 2, mirrorEvery: 2, mirrorScale: 0.60, dof: false },
  { scale: 0.60, ao: 'off', bloom: 0.5, msaa: 2, mirrorEvery: 3, mirrorScale: 0.50, dof: false },
];
const LAST = LADDER.length - 1;

const TARGET_MS = 1000 / 60;
const WARMUP_MS = 3500;      // ignore this long after the governor becomes active
const SETTLE_MS = 1200;      // ignore this long after a level change / a gap
const GAP_MS = 250;          // a longer interval is a gap or a one-off hitch, not a steady cost
const DOWN_AFTER_MS = 800;   // sustained slowness before stepping down
const UP_HOLD_MIN = 4000;    // sustained headroom before stepping up into a level...
const UP_HOLD_MAX = 64000;   // ...doubling each time that level failed recently
const FORGIVE_MS = 150000;   // a level's failure count drops by one after this long without changes

function gpuName(renderer) {
  try {
    const gl = renderer.getContext();
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    return String(gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER) || '');
  } catch (e) { return ''; }
}

// What this device is, from what the browser tells (also used by main.js to
// pick the quality tier, which selects geometry density and the texture set).
export function deviceProfile(renderer) {
  const nav = typeof navigator !== 'undefined' ? navigator : {};
  const ua = nav.userAgent || '';
  const mm = (q) => typeof matchMedia === 'function' && matchMedia(q).matches;
  const coarse = mm('(pointer: coarse)');
  const mobile = /Android|iPhone|iPad|iPod|Mobile|Silk/i.test(ua) || (coarse && (nav.maxTouchPoints || 0) > 1);
  const w = typeof innerWidth === 'number' ? innerWidth : 1280, h = typeof innerHeight === 'number' ? innerHeight : 800;
  const phone = mobile && Math.min(w, h) < 600;
  const gpu = renderer ? gpuName(renderer) : '';
  const software = /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  const discrete = /NVIDIA|GeForce|RTX|GTX|Quadro|Radeon RX|Radeon Pro|Arc\(TM\) A|Arc A\d/i.test(gpu);
  const appleSilicon = /Apple M\d/i.test(gpu);
  const integrated = !discrete && /Intel|UHD|Iris|HD Graphics|Mali|Adreno|PowerVR|Apple|Vivante|Tegra|Radeon\(TM\)|Vega \d|Graphics/i.test(gpu);
  return {
    gpu, software, discrete, integrated, appleSilicon, mobile, phone, coarse,
    cores: nav.hardwareConcurrency || 4,
    mem: nav.deviceMemory || 0,           // Chromium only, capped at 8; 0 = unknown
    caps: (renderer && renderer.capabilities) || {},
  };
}

// Where to start: conservative on weak machines; the governor climbs when there
// is headroom. Returns { level, reasons, gpu }.
export function initialLevel({ renderer, quality = 'high', width = 1280, height = 800, base = 1 } = {}) {
  const d = deviceProfile(renderer);
  const reasons = [];
  if (d.software) return { level: LAST, reasons: ['software renderer'], gpu: d.gpu };
  let score = 1;                          // a strong desktop starts one step below the top
  if (quality === 'low') { score += 2; reasons.push('low quality'); }
  if (d.mobile) { score += 1; reasons.push('mobile'); }
  if (d.cores <= 4) { score += 1; reasons.push(`${d.cores} cores`); }
  if (d.mem && d.mem <= 4) { score += 1; reasons.push(`${d.mem} GB`); }
  if (d.integrated && !d.appleSilicon) { score += 1; reasons.push('integrated GPU'); }
  if (d.discrete) { score -= 1; reasons.push('discrete GPU'); }
  if ((d.caps.maxSamples || 4) < 4 || (d.caps.maxTextureSize || 8192) < 8192) { score += 1; reasons.push('small GPU limits'); }
  if (width * height * base * base > 3.7e6) { score += 1; reasons.push('large drawing buffer'); }
  return { level: Math.max(0, Math.min(LAST, score)), reasons, gpu: d.gpu };
}

/**
 * createPerf({ renderer, quality, onChange, debug }) → governor
 *   governor.pixelRatio / mirrorEvery / mirrorScale / level
 *   governor.attach(post)          apply post-processing steps (post.setQuality)
 *   governor.update(nowMs, { active })   once per frame, after rendering
 *   governor.setLevel(i)           force a level (tests); governor.snapshot()
 */
export function createPerf({ renderer, quality = 'high', onChange = null, debug = false } = {}) {
  const dpr = (typeof devicePixelRatio === 'number' && devicePixelRatio > 0) ? devicePixelRatio : 1;
  const base = Math.min(dpr, 2);
  const start = initialLevel({
    renderer, quality, base,
    width: typeof innerWidth === 'number' ? innerWidth : 1280,
    height: typeof innerHeight === 'number' ? innerHeight : 800,
  });
  let level = start.level;
  let post = null;

  let last = 0;              // previous frame timestamp (ms)
  let ema = TARGET_MS;       // smoothed frame interval (ms)
  let miss = 0;              // smoothed share of dropped frames
  let ignoreUntil = 0;
  let wasActive = false;
  let slowFor = 0, fastFor = 0;
  let lastChange = -1e9;
  const fails = new Array(LADDER.length).fill(0); // failed step-ups into each level
  let lastUpAt = -1e9, lastUpTo = -1, lastForgive = 0;
  const upHoldFor = (L) => Math.min(UP_HOLD_MAX, UP_HOLD_MIN * 2 ** fails[L]);
  let emaAtDown = 0, ineffective = 0, pauseDownUntil = 0;
  let capMs = 0;             // detected display cap (e.g. a 30 Hz low-power mode), 0 = none
  const win = new Float32Array(90);
  let winN = 0;
  const history = [];        // recent level changes (for tests / notes)

  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      // rAF stops while hidden: the first interval back is a gap, not a cost
      last = 0;
      slowFor = fastFor = 0;
      if (!document.hidden) ignoreUntil = performance.now() + SETTLE_MS;
    });
  }

  function applyPost() {
    if (!post || typeof post.setQuality !== 'function') return;
    const L = LADDER[level];
    post.setQuality({ ao: L.ao, bloomScale: L.bloom, dof: L.dof, samples: L.msaa });
  }

  function setLevel(next, reason = 'manual', now = performance.now()) {
    next = Math.max(0, Math.min(LAST, next | 0));
    if (next === level) return false;
    const prev = level;
    level = next;
    lastChange = now;
    ignoreUntil = now + SETTLE_MS;  // resizes reallocate targets: no decisions while it re-settles
    slowFor = fastFor = 0;
    // Start the averages afresh: the old level's history must not push a second step.
    ema = Math.max(TARGET_MS, capMs); miss = 0;
    history.push({ t: Math.round(now), from: prev, to: next, reason, ema: +ema.toFixed(1) });
    if (history.length > 24) history.shift();
    applyPost();
    const cb = gov.onChange || onChange;
    if (typeof cb === 'function') cb(gov, prev);
    return true;
  }

  // Display cap: intervals tightly clustered well above 16.7 ms (iOS low-power,
  // battery savers) cannot be helped by dropping quality.
  function trackCap(dt) {
    win[winN++] = dt;
    if (winN < win.length) return;
    winN = 0;
    const s = Array.from(win).sort((a, b) => a - b);
    const p10 = s[Math.floor(s.length * 0.1)], p90 = s[Math.floor(s.length * 0.9)];
    // Only the common 30 Hz cap: a GPU-bound rate that happens to be steady would
    // otherwise read as a cap at any interval.
    capMs = p10 > 31 && p10 < 36 && p90 - p10 < 2.5 ? p10 : 0;
  }

  function update(now, { active = true } = {}) {
    const prevT = last;
    last = now;
    if (!active) { wasActive = false; return; }
    if (!wasActive) { wasActive = true; ignoreUntil = Math.max(ignoreUntil, now + WARMUP_MS); }
    if (!prevT) return;
    const dt = now - prevT;
    if (!(dt > 0) || dt > GAP_MS) { ignoreUntil = Math.max(ignoreUntil, now + 500); slowFor = fastFor = 0; return; }
    trackCap(dt);                    // also during warm-up, so a display cap is known early
    const budget = Math.max(TARGET_MS, capMs);
    // A one-off hitch (GC, an upload) counts as a dropped frame, not as a new
    // steady cost: clamp what it adds to the average. The averages keep running
    // while settling (no decisions then), so they describe the current level.
    const x = Math.min(dt, budget * 2.5);
    ema += (x - ema) * (1 - Math.exp(-x / 500));                      // ~0.5 s time constant
    miss += ((dt > budget * 1.5 ? 1 : 0) - miss) * (1 - Math.exp(-x / 1000));
    if (now < ignoreUntil) return;

    const slow = ema > budget * 1.15 || miss > 0.12;
    const fast = ema < budget * 1.06 && miss < 0.03;
    if (slow) { slowFor += dt; fastFor = 0; }
    else if (fast) { fastFor += dt; slowFor = Math.max(0, slowFor - dt); }
    else { fastFor = 0; slowFor = Math.max(0, slowFor - dt); }

    // Settled at a level for a while: forgive earlier failed step-ups.
    if (now - Math.max(lastChange, lastForgive) > FORGIVE_MS) {
      lastForgive = now;
      for (let i = 0; i < fails.length; i++) fails[i] = Math.max(0, fails[i] - 1);
    }

    if (slowFor > DOWN_AFTER_MS && level < LAST && now >= pauseDownUntil) {
      // Two steps that did not help: not bound by what this ladder trades (JS, a
      // display cap). Stop sacrificing quality for a while.
      if (emaAtDown && ema > emaAtDown * 0.96) ineffective++; else ineffective = 0;
      if (ineffective >= 2) { ineffective = 0; emaAtDown = 0; pauseDownUntil = now + 20000; slowFor = 0; return; }
      const failedUp = now - lastUpAt < 12000 && level === lastUpTo;
      if (failedUp) fails[level]++; // that step up failed: go back one, retry it later
      emaAtDown = ema;
      setLevel(level + (!failedUp && ema > budget * 1.9 ? 2 : 1), failedUp ? 'step-up failed' : 'slow', now);
    } else if (level > 0 && fastFor > upHoldFor(level - 1)) {
      lastUpAt = now; lastUpTo = level - 1; emaAtDown = 0; ineffective = 0;
      setLevel(level - 1, 'headroom', now);
    }
  }

  const gov = {
    LADDER,
    onChange: null,          // (gov, previousLevel) => void, after a level change
    get level() { return level; },
    get base() { return base; },
    get pixelRatio() { return Math.max(0.5, Math.round(base * LADDER[level].scale * 100) / 100); },
    get mirrorEvery() { return LADDER[level].mirrorEvery; },
    get mirrorScale() { return LADDER[level].mirrorScale; },
    attach(p) { post = p; applyPost(); return gov; },
    update,
    setLevel: (i) => setLevel(i, 'manual'),
    snapshot() {
      return {
        level, start: start.level, reasons: start.reasons, gpu: start.gpu,
        pixelRatio: gov.pixelRatio, base, emaMs: +ema.toFixed(2), miss: +miss.toFixed(3), capMs,
        fails: fails.slice(), history: history.slice(), ...LADDER[level],
        post: post && post.stats ? post.stats() : null,
      };
    },
  };
  if (debug && typeof window !== 'undefined') window.__galleryPerf = gov;
  return gov;
}
