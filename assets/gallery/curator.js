// THE WORKSHOP — curator.js
// Pure logic for a room that re-hangs itself around the visitor's attention.
// No DOM, no THREE, no imports. Runs in browsers and Node 22.
//
// Time: every `now` is in SECONDS (any monotonic clock, e.g. performance.now()/1000).
//
// Similarity weighting (distance in a scaled feature space, then a Gaussian kernel):
//   COLOUR (dominant)  hue distribution (12 bins, circularly smoothed, scaled by chroma
//                      confidence)  x4.0 | mean chroma x1.4 | lightness x1.6 | a*, b* warmth x1.1 each
//   MATERIAL (second)  edge/texture x0.9 | lightness spread x0.5 | family one-hot x0.55
//   SERIES             a shared non-null series adds +0.08 (capped at 1)
// Achromatic works have an all-zero hue block, so they sit close together and far
// from chromatic works through the chroma / a* / b* terms; nothing divides by zero.

export const KEEP_SECONDS = 4;

const MIN_TOTAL = 5;            // total attention before any swap
const HERO_TOTAL = 40;          // total attention before the hero may change
const GLOBAL_INTERVAL = 3.5;    // s between swaps
const SLOT_COOLDOWN = 25;       // s before a slot may be swapped again
const NO_RETURN = 60;           // s before a removed work may return
const MIN_GAIN = 0.06;          // taste improvement required
const HALF_LIFE = 120;          // s, taste attention only
const MAX_DT = 0.25;            // s, survive tab sleeps
const SERIES_BONUS = 0.08;
const SIGMA = 1.5;

const FAMILIES = ['matter', 'signal', 'archive'];

// ---------------------------------------------------------------- vectors

const vecCache = new WeakMap();

function num(x, d = 0) { return Number.isFinite(x) ? x : d; }

export function workVector(work) {
  if (work && typeof work === 'object' && vecCache.has(work)) return vecCache.get(work);
  const f = (work && work.f) || {};
  const hue = Array.isArray(f.hue) && f.hue.length === 12 ? f.hue.map((v) => num(v)) : new Array(12).fill(0);
  const C = num(f.C);
  const g = Math.min(1, C / 14);
  const v = [];
  for (let i = 0; i < 12; i++) {
    const s = 0.25 * hue[(i + 11) % 12] + 0.5 * hue[i] + 0.25 * hue[(i + 1) % 12];
    v.push(4.0 * g * s);
  }
  v.push(1.4 * (C / 50));
  v.push(1.6 * (num(f.L, 50) / 100));
  v.push(1.1 * (num(f.a) / 50));
  v.push(1.1 * (num(f.b) / 50));
  v.push(0.9 * (num(f.edge) / 0.15));
  v.push(0.5 * (num(f.Lsd) / 30));
  for (const fam of FAMILIES) v.push(work && work.family === fam ? 0.55 : 0);
  if (work && typeof work === 'object') vecCache.set(work, v);
  return v;
}

function dist2(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) { const d = a[i] - b[i]; s += d * d; }
  return s;
}
function kernel(d2) { return Math.exp(-d2 / (2 * SIGMA * SIGMA)); }

export function similarity(a, b) {
  let s = kernel(dist2(workVector(a), workVector(b)));
  if (a.series != null && a.series === b.series) s += SERIES_BONUS;
  return Math.max(0, Math.min(1, s));
}

export function fits(work, slot) {
  if (!work || !slot) return false;
  const asp = work.aspect;
  if (slot.kind === 'hero') return asp >= 1.15 && work.family !== 'archive';
  if (slot.kind === 'door') return asp <= 1.6;
  return true;
}

// ---------------------------------------------------------------- PRNG

function mulberry32(seed) {
  let a = (seed >>> 0) || 1;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function wallOf(slot) {
  if (slot.kind === 'hero') return 'end';
  if (slot.kind === 'door') return 'door';
  return slot.index <= 6 ? 'left' : 'right';
}

// ---------------------------------------------------------------- initial hang

export function initialHang(works, slots, seed = 1) {
  const rnd = mulberry32(seed);
  const hang = new Array(slots.length).fill(null);
  const used = new Set();
  const bySlot = (i) => slots.find((s) => s.index === i);
  const pos = (slot) => slot.index;

  // hero
  const hero = slots.find((s) => s.kind === 'hero');
  if (hero) {
    const ce1 = works.find((w) => w.id === 'ce1');
    let pick = ce1 && fits(ce1, hero) ? ce1 : null;
    if (!pick) {
      const opts = works.filter((w) => fits(w, hero));
      if (opts.length) pick = opts[Math.floor(rnd() * opts.length)];
    }
    if (pick) { hang[pos(hero)] = pick.id; used.add(pick.id); }
  }

  const order = [
    ...slots.filter((s) => s.kind === 'door'),
    ...slots.filter((s) => s.kind === 'side'),
  ];
  const wallWorks = {};
  const jitter = new Map(works.map((w) => [w.id, rnd()]));
  const seriesAt = (i) => {
    const id = hang[i];
    if (id == null) return null;
    const w = works.find((x) => x.id === id);
    return w ? w.series : null;
  };

  for (const slot of order) {
    const wall = wallOf(slot);
    const onWall = wallWorks[wall] || (wallWorks[wall] = []);
    const neighbours = [slot.index - 1, slot.index + 1]
      .filter((i) => bySlot(i) && wallOf(bySlot(i)) === wall)
      .map(seriesAt)
      .filter((s) => s != null);
    const famCount = {};
    for (const w of onWall) famCount[w.family] = (famCount[w.family] || 0) + 1;

    let best = null;
    let bestCost = Infinity;
    const consider = (strict) => {
      for (const w of works) {
        if (used.has(w.id) || !fits(w, slot)) continue;
        if (strict && w.series != null && neighbours.includes(w.series)) continue;
        let maxSim = 0;
        for (const o of onWall) maxSim = Math.max(maxSim, similarity(w, o));
        const cost = 1.0 * (famCount[w.family] || 0) + 0.8 * maxSim + 0.35 * jitter.get(w.id);
        if (cost < bestCost) { bestCost = cost; best = w; }
      }
    };
    consider(true);
    if (!best) consider(false);
    if (!best) best = works.find((w) => !used.has(w.id)) || null;
    if (best) {
      hang[pos(slot)] = best.id;
      used.add(best.id);
      onWall.push(best);
    }
  }
  return hang;
}

// ---------------------------------------------------------------- colour

function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex));
  if (!m) return [128, 128, 128];
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function rgbToHex(r, g, b) {
  const h = (x) => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, '0');
  return '#' + h(r) + h(g) + h(b);
}
function rgbToLab([r, g, b]) {
  const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  const R = lin(r), G = lin(g), B = lin(b);
  const X = (0.4124564 * R + 0.3575761 * G + 0.1804375 * B) / 0.95047;
  const Y = 0.2126729 * R + 0.7151522 * G + 0.072175 * B;
  const Z = (0.0193339 * R + 0.119192 * G + 0.9503041 * B) / 1.08883;
  const fn = (t) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
  const fx = fn(X), fy = fn(Y), fz = fn(Z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}
function deltaE(a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

// ---------------------------------------------------------------- show links

export function encodeShow({ hang, seconds = {} }) {
  return hang
    .map((id) => {
      const s = Math.round(num(seconds[id]));
      return s > 0 ? `${id}~${s}` : String(id);
    })
    .join('.');
}

export function decodeShow(text, works, slotCount) {
  if (typeof text !== 'string' || text.length > 2000) return null;
  let t = text.trim();
  if (/%[0-9a-f]{2}/i.test(t)) {
    try { t = decodeURIComponent(t); } catch (e) { return null; }
  }
  t = t.trim();
  if (!t || t.length > 2000) return null;
  const parts = t.split('.');
  if (parts.length !== slotCount) return null;
  const known = new Set(works.map((w) => w.id));
  const hang = [];
  const seconds = {};
  for (const p of parts) {
    const m = /^([A-Za-z0-9_-]+)(?:~(\d{1,7}))?$/.exec(p);
    if (!m) return null;
    const id = m[1];
    if (!known.has(id) || id in seconds) return null;
    hang.push(id);
    seconds[id] = m[2] ? parseInt(m[2], 10) : 0;
  }
  return { hang, seconds };
}

// ---------------------------------------------------------------- titles

// Colour name for one work from its hue histogram, lightness and chroma.
function colourName(L, C, h) {
  if (C < 9) {
    if (L < 30) return 'ink';
    if (L < 52) return 'slate';
    if (L < 74) return 'ash';
    return 'bone';
  }
  if (h < 30) { // magenta-red
    if (L > 62) return 'rose';
    if (L < 36) return 'oxblood';
    return 'carmine';
  }
  if (h < 60) { // red to orange
    if (L < 36) return 'umber';
    if (C > 52) return 'vermilion';
    if (L > 68) return 'terracotta';
    return 'rust';
  }
  if (h < 90) { // orange to amber
    if (L < 42) return 'sepia';
    if (C > 58) return 'saffron';
    if (L > 74) return 'apricot';
    return 'ochre';
  }
  if (h < 120) { // yellow
    if (L < 52) return 'olive';
    if (C > 50) return 'gold';
    return 'straw';
  }
  if (h < 150) { // yellow-green
    if (L < 45) return 'moss';
    return 'lichen';
  }
  if (h < 190) { // green
    if (L < 40) return 'malachite';
    if (L > 72) return 'celadon';
    return 'verdigris';
  }
  if (h < 225) { // cyan to cerulean
    if (L < 40) return 'teal';
    if (C < 22) return 'slate';
    return 'cerulean';
  }
  if (h < 275) { // blue
    if (L < 28) return 'midnight';
    if (C < 20) return 'slate';
    return 'cobalt';
  }
  if (h < 310) { // violet
    if (L < 36) return 'indigo';
    if (L > 68) return 'lavender';
    return 'ultramarine';
  }
  if (L < 38) return 'aubergine'; // purple-magenta
  if (L > 66) return 'mauve';
  return 'violet';
}

function workColourName(w) {
  const f = w.f || {};
  const C = num(f.C), L = num(f.L, 50);
  const hue = Array.isArray(f.hue) && f.hue.length === 12 ? f.hue : null;
  let h = 0;
  if (hue && hue.some((v) => v > 0)) {
    let best = 0, bv = -1;
    for (let i = 0; i < 12; i++) {
      const s = 0.25 * hue[(i + 11) % 12] + 0.5 * hue[i] + 0.25 * hue[(i + 1) % 12];
      if (s > bv) { bv = s; best = i; }
    }
    // refine inside the bin using neighbours (circular centroid)
    const l = hue[(best + 11) % 12], r = hue[(best + 1) % 12], c = hue[best];
    const off = (r - l) / ((l + c + r) || 1);
    h = ((best + 0.5 + off * 0.5) * 30 + 360) % 360;
  } else if (C >= 9) {
    h = ((Math.atan2(num(f.b), num(f.a)) * 180) / Math.PI + 360) % 360;
  }
  return colourName(L, C, h);
}

export function titleTraits(hang, works, seconds = {}) {
  const byId = new Map(works.map((w) => [w.id, w]));
  const hung = hang.map((id) => byId.get(id)).filter(Boolean);
  let total = 0;
  for (const w of hung) total += Math.max(0, num(seconds[w.id]));
  const colours = new Map();
  const fams = {};
  let L = 0, C = 0, W = 0;
  for (const w of hung) {
    const wt = total > 0 ? Math.max(0, num(seconds[w.id])) : 1;
    if (wt <= 0) continue;
    const f = w.f || {};
    const vote = wt * (0.4 + Math.min(num(f.C), 40) / 40);
    const n = workColourName(w);
    colours.set(n, (colours.get(n) || 0) + vote);
    fams[w.family] = (fams[w.family] || 0) + wt;
    L += wt * num(f.L, 50); C += wt * num(f.C); W += wt;
  }
  if (W === 0) { L = 50; C = 20; W = 1; }
  const names = [...colours.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).map((e) => e[0]);
  const meanL = L / W, meanC = C / W;
  const famEntries = Object.entries(fams).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
  const famTotal = famEntries.reduce((s, e) => s + e[1], 0) || 1;
  return {
    colours: names,
    tone: meanL < 40 ? 'dark' : meanL > 64 ? 'light' : 'mid',
    vivid: meanC > 34 ? 'vivid' : meanC < 19 ? 'muted' : 'plain',
    family: famEntries.length ? famEntries[0][0] : 'matter',
    mixed: famEntries.length ? famEntries[0][1] / famTotal < 0.5 : true,
    meanL, meanC,
  };
}

function hash32(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  h ^= h >>> 13; h = Math.imul(h, 0x5bd1e995); h ^= h >>> 15;
  return h >>> 0;
}
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

const FAMILY_WORDS = {
  matter: { mass: ['Surface', 'Residue', 'Ground', 'Pigment'], hours: ['Residue', 'Pigment', 'Salt'], plural: ['Surfaces', 'Deposits', 'Grounds'], weather: ['Weather', 'Dust', 'Salt', 'Lime'] },
  signal: { mass: ['Signal', 'Glare', 'Static', 'Broadcast'], hours: ['Signal', 'Static', 'Glare'], plural: ['Signals', 'Carriers', 'Frequencies'], weather: ['Static', 'Noise', 'Weather', 'Glare'] },
  archive: { mass: ['Paper', 'Graphite', 'Ink', 'Index'], hours: ['Paper', 'Ink', 'Dust'], plural: ['Plates', 'Specimens', 'Diagrams'], weather: ['Dust', 'Paper', 'Weather', 'Index'] },
};
const NEUTRAL = { dark: 'ink', light: 'bone', mid: 'ash' };

function buildTitle(t, h) {
  const fw = FAMILY_WORDS[t.family] || FAMILY_WORDS.matter;
  const pick = (arr, salt) => arr[hash32(String(h) + ':' + salt) % arr.length];
  const c1 = cap(t.colours[0] || NEUTRAL[t.tone]);
  let c2n = t.colours.find((n) => n !== t.colours[0]);
  if (!c2n) c2n = NEUTRAL[t.tone] === t.colours[0] ? 'salt' : NEUTRAL[t.tone];
  const c2 = cap(c2n);
  const mass = pick(fw.mass, 'm'), plural = pick(fw.plural, 'p'), wx = pick(fw.weather, 'w');
  const T = [
    () => `A Grammar of ${c1}`,
    () => `${mass}, in ${c1}`,
    () => `${c1}, ${c2} and ${wx}`,
    () => `The Long Look at ${c1}`,
    () => `Small Hours of ${pick(fw.hours, 'h')}`,
    () => `Notes Toward ${c1}`,
    () => `An Inventory of ${plural}`,
    () => `${plural} in ${c1} and ${c2}`,
    () => `${c1} Weather`,
    () => `What ${c1} Remembers`,
    () => `${c1} and ${c2}, Unfinished`,
    () => `The ${c1} Hour`,
  ];
  const darkT = [() => `Low Light on ${c1}`, () => `${c1} After Closing`, () => `The Night Shift in ${c1}`];
  const lightT = [() => `${c1} in Full Daylight`, () => `A Pale Study of ${c1}`, () => `Open Windows, ${c1}`];
  const vividT = [() => `${c1} at Full Volume`, () => `Loud ${c1}`];
  const mutedT = [() => `A Quiet ${c1}`, () => `${c1}, Mostly Silence`];
  const mixedT = [() => `Three Rooms of ${c1}`, () => `A Hang in ${c1} and ${c2}`];
  const sigT = [() => `Glare, Mostly ${c1}`, () => `A Broadcast in ${c1}`];
  const arcT = [() => `Specimens of ${c1}`, () => `Plates in ${c1}`];
  const matT = [() => `${c1} Ground`, () => `Residue of ${c1}`];
  const pool = [...T];
  if (t.tone === 'dark') pool.push(...darkT, ...darkT);
  if (t.tone === 'light') pool.push(...lightT, ...lightT);
  if (t.vivid === 'vivid') pool.push(...vividT);
  if (t.vivid === 'muted') pool.push(...mutedT);
  if (t.mixed) pool.push(...mixedT);
  if (t.family === 'signal') pool.push(...sigT, ...sigT);
  if (t.family === 'archive') pool.push(...arcT, ...arcT);
  if (t.family === 'matter') pool.push(...matT, ...matT);
  return pool[h % pool.length]();
}

export function titleFor(hang, works, seconds = {}) {
  const t = titleTraits(hang, works, seconds);
  const h = hash32(hang.join(','));
  return buildTitle(t, h);
}

// ---------------------------------------------------------------- curator

export function createCurator({ works, slots, hang, fixed = false, seconds }) {
  const byId = new Map(works.map((w) => [w.id, w]));
  const order = new Map(works.map((w, i) => [w.id, i]));
  const slotAt = (i) => slots.find((s) => s.index === i) || slots[i];
  const att = {};      // decaying attention per work id
  const attAt = {};    // time of last decay evaluation per id
  const swapAt = {};   // slot -> last swap time
  const removedAt = {};// id -> time removed
  let lastSwap = -Infinity;
  let lastNow = 0;

  const c = {
    hang: hang.slice(),
    seconds: Object.assign({}, seconds || {}),
    fixed: !!fixed,
    setFixed(b) { c.fixed = !!b; },
  };

  const total = () => { let s = 0; for (const k in c.seconds) s += c.seconds[k]; return s; };
  const decay = (id, now) => {
    if (!(id in att)) return 0;
    const dt = Math.max(0, now - attAt[id]);
    att[id] *= Math.pow(0.5, dt / HALF_LIFE);
    attAt[id] = Math.max(attAt[id], now);
    return att[id];
  };

  function taste(now) {
    const dim = workVector(works[0] || { f: {} }).length;
    const v = new Array(dim).fill(0);
    const series = {};
    let sum = 0;
    for (const id of Object.keys(att)) {
      const a = decay(id, now);
      const w = byId.get(id);
      if (!w || a <= 1e-9) continue;
      const wv = workVector(w);
      for (let i = 0; i < dim; i++) v[i] += a * wv[i];
      if (w.series != null) series[w.series] = (series[w.series] || 0) + a;
      sum += a;
    }
    if (sum <= 0) return null;
    for (let i = 0; i < dim; i++) v[i] /= sum;
    for (const k in series) series[k] /= sum;
    return { v, series };
  }
  const score = (w, tst) => kernel(dist2(workVector(w), tst.v)) + (w.series != null ? SERIES_BONUS * (tst.series[w.series] || 0) : 0);

  c.observe = function (dt, gazes, now) {
    dt = Math.min(Math.max(num(dt), 0), MAX_DT);
    if (Number.isFinite(now)) lastNow = now;
    if (dt <= 0 || !gazes) return;
    for (const g of gazes) {
      const id = c.hang[g.slot];
      if (id == null) continue;
      const wt = Math.max(0, Math.min(1, num(g.weight)));
      if (wt <= 0) continue;
      c.seconds[id] = (c.seconds[id] || 0) + dt * wt;
      if (!(id in att)) { att[id] = 0; attAt[id] = lastNow; }
      decay(id, lastNow);
      att[id] += dt * wt;
    }
  };

  c.proposeSwap = function (safe, now) {
    if (c.fixed) return null;
    if (Number.isFinite(now)) lastNow = now;
    const tot = total();
    if (tot < MIN_TOTAL) return null;
    if (now - lastSwap < GLOBAL_INTERVAL) return null;
    const tst = taste(now);
    if (!tst) return null;
    const hung = new Set(c.hang);
    let best = null;
    let bestGain = -Infinity;
    for (let i = 0; i < c.hang.length; i++) {
      if (!safe || !safe[i]) continue;
      if (i === 0 && slotAt(0) && slotAt(0).kind === 'hero' && tot < HERO_TOTAL) continue;
      if (i in swapAt && now - swapAt[i] < SLOT_COOLDOWN) continue;
      const from = c.hang[i];
      if ((c.seconds[from] || 0) >= KEEP_SECONDS) continue;
      const out = byId.get(from);
      if (!out) continue;
      const slot = slotAt(i);
      const outScore = score(out, tst);
      let bw = null, bs = -Infinity;
      for (const w of works) {
        if (hung.has(w.id) || !fits(w, slot)) continue;
        if (w.id in removedAt && now - removedAt[w.id] < NO_RETURN) continue;
        const s = score(w, tst);
        if (s > bs) { bs = s; bw = w; }
      }
      if (!bw) continue;
      const gain = bs - outScore;
      if (gain < MIN_GAIN - 1e-12) continue;
      if (gain > bestGain + 1e-12) { bestGain = gain; best = { slot: i, from, to: bw.id }; }
    }
    return best;
  };

  c.commitSwap = function (swap, now) {
    if (!swap || c.hang[swap.slot] !== swap.from) return false;
    c.hang[swap.slot] = swap.to;
    swapAt[swap.slot] = now;
    removedAt[swap.from] = now;
    lastSwap = now;
    return true;
  };

  c.candidates = function (n = 3) {
    const tst = taste(lastNow);
    if (!tst) return [];
    const hung = new Set(c.hang);
    const slotsList = c.hang.map((_, i) => slotAt(i));
    const list = [];
    for (const w of works) {
      if (hung.has(w.id)) continue;
      if (!slotsList.some((s) => fits(w, s))) continue;
      list.push({ id: w.id, s: score(w, tst), o: order.get(w.id) });
    }
    list.sort((a, b) => b.s - a.s || a.o - b.o);
    return list.slice(0, n).map((e) => e.id);
  };

  c.palette = function (n = 6) {
    const items = [];
    for (const w of works) {
      const s = c.seconds[w.id] || 0;
      if (s <= 0 || !Array.isArray(w.palette)) continue;
      for (const p of w.palette) {
        const wt = s * num(p.share);
        if (wt <= 0) continue;
        const rgb = hexToRgb(p.hex);
        items.push({ rgb, lab: rgbToLab(rgb), wt });
      }
    }
    if (!items.length) return [];
    items.sort((a, b) => b.wt - a.wt);
    const clusters = [];
    for (const it of items) {
      let best = null, bd = 10;
      for (const cl of clusters) {
        const d = deltaE(it.lab, cl.lab);
        if (d < bd) { bd = d; best = cl; }
      }
      if (best) {
        const t = best.wt + it.wt;
        for (let k = 0; k < 3; k++) best.rgb[k] = (best.rgb[k] * best.wt + it.rgb[k] * it.wt) / t;
        best.wt = t;
        best.lab = rgbToLab(best.rgb);
      } else {
        clusters.push({ rgb: it.rgb.slice(), lab: it.lab, wt: it.wt });
      }
    }
    clusters.sort((a, b) => b.wt - a.wt);
    const top = clusters.slice(0, Math.max(1, n));
    const sum = top.reduce((s, c2) => s + c2.wt, 0);
    return top.map((c2) => ({ hex: rgbToHex(c2.rgb[0], c2.rgb[1], c2.rgb[2]), share: c2.wt / sum }));
  };

  c.summary = function (date = new Date()) {
    const items = c.hang.map((id, i) => ({ id, seconds: Math.round(c.seconds[id] || 0), raw: c.seconds[id] || 0, i }));
    items.sort((a, b) => b.raw - a.raw || a.i - b.i);
    return {
      title: titleFor(c.hang, works, c.seconds),
      hang: c.hang.slice(),
      works: items.map((e) => ({ id: e.id, seconds: e.seconds })),
      palette: c.palette(6),
      totalSeconds: Math.round(total()),
      date,
    };
  };

  return c;
}
