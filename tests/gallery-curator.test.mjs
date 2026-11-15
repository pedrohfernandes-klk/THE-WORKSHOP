import test from 'node:test';
import assert from 'node:assert/strict';
import {
  KEEP_SECONDS, workVector, similarity, initialHang, fits, createCurator,
  encodeShow, decodeShow, titleFor, titleTraits,
} from '../assets/gallery/curator.js';

// ---------- synthetic works
function hsl2rgb(h, s, l) {
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0), f(8), f(4)].map((x) => Math.round(x * 255));
}
const hex = (rgb) => '#' + rgb.map((x) => x.toString(16).padStart(2, '0')).join('');

// hueDeg is Lab-ish hue angle in 30deg bins; null = achromatic
let counter = 0;
function mk({ id, hueDeg = null, L = 50, C = 40, family = 'matter', aspect = 1.3, series = null, edge = 0.05, shades } = {}) {
  id = id || `w${counter++}`;
  const hue = new Array(12).fill(0);
  let a = 0, b = 0;
  if (hueDeg != null && C >= 4) {
    hue[Math.floor((((hueDeg % 360) + 360) % 360) / 30)] = 1;
    a = C * Math.cos((hueDeg * Math.PI) / 180);
    b = C * Math.sin((hueDeg * Math.PI) / 180);
  } else C = Math.min(C, 2);
  const base = hueDeg == null ? [128, 128, 128] : hsl2rgb(hueDeg, 0.7, L / 100);
  const palette = shades || [
    { hex: hex(base), share: 0.6 },
    { hex: hex(base.map((x) => Math.min(255, x + 30))), share: 0.4 },
  ];
  return {
    id, src: `${id}.jpg`, title: id, no: id, family, frame: 'canvas', series, artist: null,
    medium: '', note: '', w: 1000, h: Math.round(1000 / aspect), aspect,
    palette, accent: palette[0].hex,
    f: { L, Lsd: 12, C, a, b, edge, hue },
  };
}

const SLOTS = [{ index: 0, id: 's0', kind: 'hero' }];
for (let i = 1; i <= 12; i++) SLOTS.push({ index: i, id: `s${i}`, kind: 'side' });
SLOTS.push({ index: 13, id: 's13', kind: 'door' }, { index: 14, id: 's14', kind: 'door' });

function catalogue() {
  const ws = [mk({ id: 'ce1', hueDeg: 250, L: 40, C: 50, family: 'signal', aspect: 1.78 })];
  const fams = ['matter', 'signal', 'archive'];
  const hues = [45, 75, 100, 160, 200, 250, 290, 330, 15, null];
  for (let i = 0; i < 45; i++) {
    ws.push(mk({
      id: `x${i}`, hueDeg: hues[i % hues.length], L: 25 + ((i * 17) % 55), C: 12 + ((i * 7) % 45),
      family: fams[i % 3], aspect: [0.75, 1, 1.3, 1.5, 1.8, 0.6][i % 6],
      series: i % 4 === 0 ? `ser${i % 3}` : null, edge: 0.02 + (i % 5) * 0.03,
    }));
  }
  return ws;
}

// ---------- similarity
test('similarity: bounds, symmetry, self=1', () => {
  const ws = catalogue();
  for (const a of ws) {
    assert.equal(similarity(a, a), 1);
    for (const b of ws.slice(0, 12)) {
      const s = similarity(a, b);
      assert.ok(s >= 0 && s <= 1, `bounds ${s}`);
      assert.ok(Math.abs(s - similarity(b, a)) < 1e-12);
    }
  }
  assert.equal(workVector(ws[0]).length, workVector(ws[1]).length);
});

test('similarity: red matter closer to red matter than to blue archive', () => {
  const r1 = mk({ hueDeg: 40, L: 45, C: 55, family: 'matter' });
  const r2 = mk({ hueDeg: 38, L: 50, C: 50, family: 'matter' });
  const blue = mk({ hueDeg: 270, L: 45, C: 55, family: 'archive' });
  assert.ok(similarity(r1, r2) > similarity(r1, blue) + 0.25);
  // colour dominates family: red archive is closer to red matter than blue matter is
  const rArch = mk({ hueDeg: 40, L: 45, C: 55, family: 'archive' });
  const bMat = mk({ hueDeg: 270, L: 45, C: 55, family: 'matter' });
  assert.ok(similarity(r1, rArch) > similarity(r1, bMat));
});

test('similarity: series bonus, capped; achromatic works are safe', () => {
  const a = mk({ hueDeg: 40, series: 'S' }), b = mk({ hueDeg: 200, series: 'S' }), c = mk({ hueDeg: 200, series: 'T' });
  assert.ok(Math.abs(similarity(a, b) - similarity(a, { ...b, series: null }) - 0.08) < 1e-9);
  assert.ok(similarity(a, c) <= 1);
  const g1 = mk({ hueDeg: null, L: 20 }), g2 = mk({ hueDeg: null, L: 85 }), g3 = mk({ hueDeg: null, L: 22 });
  for (const v of workVector(g1)) assert.ok(Number.isFinite(v));
  assert.ok(similarity(g1, g3) > similarity(g1, g2));
  assert.ok(similarity(g1, g3) > similarity(g1, mk({ hueDeg: 40, C: 60, L: 20 })));
});

// ---------- fits
test('fits rules', () => {
  const hero = SLOTS[0], side = SLOTS[1], door = SLOTS[13];
  assert.equal(fits(mk({ aspect: 1.15 }), hero), true);
  assert.equal(fits(mk({ aspect: 1.14 }), hero), false);
  assert.equal(fits(mk({ aspect: 2, family: 'archive' }), hero), false);
  assert.equal(fits(mk({ aspect: 1.6 }), door), true);
  assert.equal(fits(mk({ aspect: 1.61 }), door), false);
  assert.equal(fits(mk({ aspect: 0.4 }), side), true);
  assert.equal(fits(mk({ aspect: 3 }), side), true);
});

// ---------- initialHang
test('initialHang: valid, mixed, deterministic', () => {
  const ws = catalogue();
  const byId = new Map(ws.map((w) => [w.id, w]));
  for (const seed of [1, 2, 99, 12345]) {
    const h = initialHang(ws, SLOTS, seed);
    assert.equal(h.length, 15);
    assert.equal(new Set(h).size, 15);
    assert.equal(h[0], 'ce1');
    h.forEach((id, i) => assert.ok(fits(byId.get(id), SLOTS[i]), `slot ${i}`));
    for (const [lo, hi] of [[1, 6], [7, 12]]) {
      const fam = new Set();
      for (let i = lo; i <= hi; i++) {
        fam.add(byId.get(h[i]).family);
        if (i < hi) {
          const s1 = byId.get(h[i]).series, s2 = byId.get(h[i + 1]).series;
          assert.ok(s1 == null || s1 !== s2, `adjacent series at ${i}`);
        }
      }
      assert.ok(fam.size >= 2, 'wall mixes families');
    }
    assert.deepEqual(h, initialHang(ws, SLOTS, seed));
  }
  assert.notDeepEqual(initialHang(ws, SLOTS, 1), initialHang(ws, SLOTS, 2));
});

test('initialHang: hero falls back when ce1 missing or unfit', () => {
  const ws = catalogue().filter((w) => w.id !== 'ce1');
  const h = initialHang(ws, SLOTS, 3);
  assert.ok(fits(ws.find((w) => w.id === h[0]), SLOTS[0]));
});

// ---------- swap rules
function setup(opts = {}) {
  const ws = catalogue();
  const hang = initialHang(ws, SLOTS, 7);
  const cur = createCurator({ works: ws, slots: SLOTS, hang, ...opts });
  return { ws, cur };
}
const ALL = new Array(15).fill(true);
// make a long look at a (fake) red work placed in slot 5
function lookAtRed(ctx, seconds, t0 = 0) {
  const red = mk({ id: 'redA', hueDeg: 40, L: 45, C: 55 });
  ctx.ws.push(red);
  const cur = ctx.cur;
  // rebuild curator with the red work hung at 5
  const hang = cur.hang.slice();
  hang[5] = 'redA';
  const c2 = createCurator({ works: ctx.ws, slots: SLOTS, hang, fixed: cur.fixed });
  let t = t0;
  for (let s = 0; s < seconds; s += 0.1) { t += 0.1; c2.observe(0.1, [{ slot: 5, weight: 1 }], t); }
  return { cur: c2, t };
}

test('no swap before 5 s total attention', () => {
  const { cur } = setup();
  for (let t = 0; t < 4.9; t += 0.1) cur.observe(0.1, [{ slot: 5, weight: 1 }], t);
  assert.equal(cur.proposeSwap(ALL, 5), null);
  assert.equal(cur.proposeSwap(ALL, 100), null);
});

test('raw seconds never decay; dt is clamped; weight scales', () => {
  const { cur } = setup();
  const id = cur.hang[3];
  cur.observe(10, [{ slot: 3, weight: 1 }], 1);
  assert.equal(cur.seconds[id], 0.25);
  cur.observe(0.1, [{ slot: 3, weight: 0.5 }], 2);
  assert.ok(Math.abs(cur.seconds[id] - 0.3) < 1e-9);
  cur.proposeSwap(ALL, 10000);
  assert.ok(Math.abs(cur.seconds[id] - 0.3) < 1e-9);
});

test('swaps only on safe slots, never keep-rule works, never non-fitting', () => {
  const ctx = setup();
  const { cur, t } = lookAtRed(ctx, 8);
  const safe = new Array(15).fill(false);
  assert.equal(cur.proposeSwap(safe, t + 1), null);
  safe[2] = true;
  const sw = cur.proposeSwap(safe, t + 1);
  if (sw) assert.equal(sw.slot, 2);
  // keep rule: slot 5 holds redA with >= KEEP_SECONDS
  assert.ok(cur.seconds.redA >= KEEP_SECONDS);
  for (let k = 0; k < 20; k++) {
    const s = cur.proposeSwap(ALL, t + 1 + k * 30);
    if (s) {
      assert.notEqual(s.slot, 5);
      assert.ok((cur.seconds[s.from] || 0) < KEEP_SECONDS);
      assert.ok(fits(ctx.ws.find((w) => w.id === s.to), SLOTS[s.slot]));
      assert.ok(!cur.hang.includes(s.to));
      cur.commitSwap(s, t + 1 + k * 30);
    }
  }
});

test('after a long look at a red work, swaps bring red works in', () => {
  const ctx = setup();
  // add a pool of red works so there is something to bring in
  for (let i = 0; i < 6; i++) ctx.ws.push(mk({ id: `red${i}`, hueDeg: 40 + i, L: 45 + i, C: 52 }));
  const hang = ctx.cur.hang.slice();
  hang[5] = 'redX';
  ctx.ws.push(mk({ id: 'redX', hueDeg: 40, L: 45, C: 55 }));
  const cur = createCurator({ works: ctx.ws, slots: SLOTS, hang });
  let t = 0;
  for (let s = 0; s < 12; s += 0.1) { t += 0.1; cur.observe(0.1, [{ slot: 5, weight: 1 }], t); }
  const incoming = [];
  for (let k = 0; k < 6; k++) {
    t += 4;
    const sw = cur.proposeSwap(ALL.map((_, i) => i !== 5), t);
    if (!sw) break;
    cur.commitSwap(sw, t);
    incoming.push(sw.to);
  }
  assert.ok(incoming.length >= 2, `swaps happened: ${incoming}`);
  assert.ok(incoming.filter((id) => id.startsWith('red')).length >= 2, `red in: ${incoming}`);
  assert.ok(cur.candidates(3).length > 0);
});

test('3.5 s global interval, 25 s slot cooldown, 60 s no-return', () => {
  const ctx = setup();
  for (let i = 0; i < 8; i++) ctx.ws.push(mk({ id: `red${i}`, hueDeg: 40, L: 45, C: 52 }));
  const hang = ctx.cur.hang.slice(); hang[5] = 'redX';
  ctx.ws.push(mk({ id: 'redX', hueDeg: 40, L: 45, C: 55 }));
  const cur = createCurator({ works: ctx.ws, slots: SLOTS, hang });
  let t = 0;
  for (let s = 0; s < 10; s += 0.1) { t += 0.1; cur.observe(0.1, [{ slot: 5, weight: 1 }], t); }
  const safe = ALL.map((_, i) => i !== 5);
  const first = cur.proposeSwap(safe, t);
  assert.ok(first);
  cur.commitSwap(first, t);
  assert.equal(cur.proposeSwap(safe, t + 3.4), null, 'global interval');
  const second = cur.proposeSwap(safe, t + 3.6);
  assert.ok(second, 'allowed after 3.5 s');
  assert.notEqual(second.slot, first.slot, 'slot cooldown');
  // push time on: the first slot is only eligible after 25 s
  let tt = t;
  const seen = [];
  for (let k = 0; k < 14; k++) {
    tt += 4;
    const s = cur.proposeSwap(safe, tt);
    if (!s) continue;
    if (s.slot === first.slot) { assert.ok(tt - t >= 25, 'slot cooldown respected'); }
    assert.ok(!(s.to === first.from && tt - t < 60), 'no return within 60 s');
    cur.commitSwap(s, tt); seen.push(s);
  }
  assert.ok(seen.length > 0);
});

test('hero only after 40 s total attention', () => {
  const ctx = setup();
  for (let i = 0; i < 6; i++) ctx.ws.push(mk({ id: `blu${i}`, hueDeg: 250, L: 40, C: 50, family: 'signal', aspect: 1.8 }));
  const hang = ctx.cur.hang.slice(); hang[5] = 'blueX';
  ctx.ws.push(mk({ id: 'blueX', hueDeg: 40, L: 70, C: 50 }));
  const cur = createCurator({ works: ctx.ws, slots: SLOTS, hang });
  let t = 0;
  for (let s = 0; s < 20; s += 0.1) { t += 0.1; cur.observe(0.1, [{ slot: 5, weight: 1 }], t); }
  const onlyHero = ALL.map((_, i) => i === 0);
  assert.equal(cur.proposeSwap(onlyHero, t), null);
  for (let s = 0; s < 30; s += 0.1) { t += 0.1; cur.observe(0.1, [{ slot: 5, weight: 1 }], t); }
  // after 50 s the hero may be proposed (if an improvement exists); never before
  const sw = cur.proposeSwap(onlyHero, t);
  if (sw) assert.equal(sw.slot, 0);
});

test('fixed mode: always null; setFixed toggles', () => {
  const ctx = setup();
  const { cur, t } = lookAtRed(ctx, 12);
  ctx.ws.push(mk({ id: 'extra', hueDeg: 40 }));
  cur.setFixed(true);
  assert.equal(cur.fixed, true);
  assert.equal(cur.proposeSwap(ALL.map((_, i) => i !== 5), t + 100), null);
  cur.setFixed(false);
  assert.equal(cur.fixed, false);
  const c2 = createCurator({ works: ctx.ws, slots: SLOTS, hang: cur.hang, fixed: true });
  c2.observe(0.2, [{ slot: 1, weight: 1 }], 1);
  assert.equal(c2.proposeSwap(ALL, 500), null);
});

test('determinism', () => {
  const run = () => {
    const ctx = setup();
    const { cur, t } = lookAtRed(ctx, 10);
    const out = [];
    let tt = t;
    for (let k = 0; k < 8; k++) {
      tt += 4;
      const s = cur.proposeSwap(ALL.map((_, i) => i !== 5), tt);
      if (s) { cur.commitSwap(s, tt); out.push(s); }
    }
    return JSON.stringify([out, cur.hang, cur.candidates(5), cur.palette(4)]);
  };
  assert.equal(run(), run());
});

// ---------- show links
test('encode/decode round trip and rejection', () => {
  const ws = catalogue();
  const hang = initialHang(ws, SLOTS, 5);
  const seconds = { [hang[2]]: 42.4, [hang[7]]: 13 };
  const enc = encodeShow({ hang, seconds });
  const parts = enc.split('.');
  assert.equal(parts.length, 15);
  assert.equal(parts[2], `${hang[2]}~42`);
  assert.equal(parts[0], hang[0]);
  const dec = decodeShow(enc, ws, 15);
  assert.deepEqual(dec.hang, hang);
  assert.equal(dec.seconds[hang[2]], 42);
  assert.equal(dec.seconds[hang[7]], 13);
  assert.equal(encodeShow(dec), enc);
  assert.deepEqual(decodeShow(encodeURIComponent(enc), ws, 15).hang, hang);
  assert.deepEqual(decodeShow(encodeURIComponent(encodeURIComponent(enc).replace(/~/g, '%7E')), ws, 15), null);
  assert.equal(decodeShow(enc, ws, 14), null);
  assert.equal(decodeShow(enc, ws, 16), null);
  assert.equal(decodeShow(enc.replace(hang[3], 'nope'), ws, 15), null);
  const dup = hang.slice(); dup[4] = dup[3];
  assert.equal(decodeShow(encodeShow({ hang: dup, seconds: {} }), ws, 15), null);
  assert.equal(decodeShow('', ws, 15), null);
  assert.equal(decodeShow('<script>.alert(1)', ws, 2), null);
  assert.equal(decodeShow(enc + 'x'.repeat(2000), ws, 15), null);
  assert.equal(decodeShow(null, ws, 15), null);
  assert.equal(decodeShow(enc.replace('~42', '~-4'), ws, 15), null);
  assert.equal(decodeShow(enc.replace('~42', '~4~2'), ws, 15), null);
  assert.equal(decodeShow('%E0%A4%A', ws, 15), null);
});

// ---------- titles
test('titleFor: deterministic, 2-6 words, varied, no banned words', () => {
  const ws = catalogue();
  const titles = new Set();
  const banned = /journey|tapestry|symphony|echoes|whispers/i;
  for (let seed = 1; seed <= 40; seed++) {
    const h = initialHang(ws, SLOTS, seed);
    const secs = seed % 2 ? { [h[3]]: 30, [h[4]]: 10 } : {};
    const t = titleFor(h, ws, secs);
    assert.equal(t, titleFor(h, ws, secs));
    const n = t.split(/\s+/).length;
    assert.ok(n >= 2 && n <= 6, `${t} (${n})`);
    assert.ok(!banned.test(t));
    assert.ok(/^[A-Z]/.test(t));
    titles.add(t);
  }
  assert.ok(titles.size >= 20, `variety: ${titles.size}`);
  const tr = titleTraits(initialHang(ws, SLOTS, 1), ws, {});
  assert.ok(tr.colours.length > 0);
});

test('titleFor reflects dominant colour by attention', () => {
  const rust = mk({ id: 'r', hueDeg: 45, L: 50, C: 45 });
  const blue = mk({ id: 'b', hueDeg: 255, L: 45, C: 50 });
  const ws = [rust, blue];
  assert.match(titleFor(['r', 'b'], ws, { r: 100, b: 1 }), /Rust/);
  assert.match(titleFor(['r', 'b'], ws, { r: 1, b: 100 }), /Cobalt/);
});

// ---------- palette & summary
test('palette: empty, shares sum to 1, merges near colours', () => {
  const { cur } = setup();
  assert.deepEqual(cur.palette(), []);
  const ws = [
    mk({ id: 'p', shades: [{ hex: '#c0392b', share: 0.5 }, { hex: '#c23a2c', share: 0.3 }, { hex: '#2b5fc0', share: 0.2 }] }),
    mk({ id: 'q', shades: [{ hex: '#e8e2d0', share: 1 }] }),
  ];
  const c = createCurator({ works: ws, slots: SLOTS.slice(0, 2), hang: ['p', 'q'] });
  c.observe(0.2, [{ slot: 0, weight: 1 }, { slot: 1, weight: 1 }], 1);
  const p = c.palette(6);
  assert.equal(p.length, 3, 'near-identical reds merged');
  assert.ok(Math.abs(p.reduce((s, x) => s + x.share, 0) - 1) < 1e-9);
  assert.ok(p[0].share >= p[1].share);
  const p1 = c.palette(1);
  assert.equal(p1.length, 1);
  assert.ok(Math.abs(p1[0].share - 1) < 1e-9);
});

test('summary: ordering, rounding, totals, date', () => {
  const ws = catalogue();
  const hang = initialHang(ws, SLOTS, 4);
  const c = createCurator({ works: ws, slots: SLOTS, hang });
  let t = 0;
  for (let i = 0; i < 40; i++) { t += 0.25; c.observe(0.25, [{ slot: 3, weight: 1 }], t); }
  for (let i = 0; i < 12; i++) { t += 0.25; c.observe(0.25, [{ slot: 9, weight: 1 }], t); }
  const d = new Date('2026-01-01T00:00:00Z');
  const s = c.summary(d);
  assert.equal(s.date, d);
  assert.equal(s.works.length, 15);
  assert.equal(s.works[0].id, hang[3]);
  assert.equal(s.works[0].seconds, 10);
  assert.equal(s.works[1].id, hang[9]);
  assert.equal(s.works[1].seconds, 3);
  assert.equal(s.totalSeconds, 13);
  for (let i = 1; i < s.works.length; i++) assert.ok(s.works[i - 1].seconds >= s.works[i].seconds);
  assert.deepEqual(s.hang, hang);
  assert.equal(typeof s.title, 'string');
  assert.ok(s.palette.length > 0);
  assert.equal(c.summary().date instanceof Date, true);
});

test('observe accrues seconds and palette even when fixed', () => {
  const ws = catalogue();
  const c = createCurator({ works: ws, slots: SLOTS, hang: initialHang(ws, SLOTS, 1), fixed: true });
  c.observe(0.2, [{ slot: 2, weight: 1 }], 1);
  assert.ok(c.seconds[c.hang[2]] > 0);
  assert.ok(c.palette(3).length > 0);
});
