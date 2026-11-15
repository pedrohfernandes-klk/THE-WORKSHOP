// oddities.js — eight small, hand-made surprises tucked into the photoreal campus (BRIEF §6.2,
// world coordinates). Each is cheap: a few draw calls, canvas textures drawn by wobbly, chalky,
// risograph-ish code in limited palettes, PBR surfaces from ctx.M. All original designs.
//
//   1 chalk drawings on the plaza paving ......... (-8, 0.012, 42)   hopscotch to "céu", sun, house, poem
//   2 red-and-cream telephone kiosk .............. (22.2, 0, 19.7)   rings every ~45 s · click 'odd-phone'
//   3 battered fortune vending machine ........... (10.62, 0, 47.5)  against the arcade · click 'odd-vending'
//   4 boulder floating over the east lawn ........ (60.6, 3.2, 24)   the olive at (56, 21) owns the asked-for spot
//   5 pink neon "?" on the ruin's fallen roof .... (-48, ~2.45, -33) sits on the tilted slab (ruins.js transform)
//   6 paper plane looping over the roof terrace .. around (0, 9.5, 11), r ≈ 4
//   7 ginger cat asleep on a bench end ........... (12.98, 0.45, 34.43) click 'odd-cat'
//   8 lone streetlamp + "you found the edge" ..... (0, ground, 115)  wakes when the visitor comes near
//
// Reduced motion: nothing bobs, loops or flickers; the plane is parked on the terrace rail.
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { heightAt } from './landscape.js';

const TAU = Math.PI * 2;
const HAND = '"Comic Sans MS", "Chalkboard SE", "Segoe Print", "Bradley Hand", "Marker Felt", "Comic Neue", cursive';
const SERIF = '"Instrument Serif", Georgia, "Times New Roman", serif';
const HEAVY = '"Arial Black", Impact, "Helvetica Neue", Arial, sans-serif';
const MONO = '"Courier New", ui-monospace, monospace';

const KIOSK = { x: 22.2, z: 19.7 };          // plaza NE corner: clear of the allée bed (x ≤ 20.5) and the wall (x ≥ 23.55)
const VEND = { x: 10.62, z: 47.5 };          // back against the arcade's west wall (x = 11), 3 m north of its door
const BOULDER = { x: 60.6, y: 3.2, z: 24.0 };
const NEON = { x: -48, z: -33 };
const PLANE = { x: 0, y: 9.5, z: 11 };
const CAT = { x: 12.98, y: 0.452, z: 34.43 }; // seat top of the bench at (13, 35): slats x 12.76–13.24, y ≤ 0.45, z 34.1–35.9
const LAMP = { x: 0, z: 115 };
// The nearest place a visitor can stand is ~44 m away (the school's back classrooms, whose south
// windows look out over the meadow), so the lamp wakes inside 48 m: a literal 40 m would never fire.
const LAMP_WAKE = 48, LAMP_SLEEP = 54;
// post.js blooms above a scene-linear luminance of 1.6 (Rec.709 weights). The tube's emissive #ff2d95 gives
// ~0.253 per unit of intensity, so 8 puts it at ~2.0 (still ≥ 1.8 through the hum and the 0.9 stutter phase).
const NEON_GLOW = 8;

// Leo (final pass): vending.js owns the joke machine by the arcade door and cat.js owns the ginger
// cat, so this module's fortune machine (3) and sleeping cat (7) are built but never placed.
const KEEP_FORTUNE = false, KEEP_SLEEPING_CAT = false;
// Short enough for the 2.4 s toast; the world speaks Portuguese.
const PHONE_VOICES = [
  'Está? Há um quadro a olhar para mim.',
  'É a lua. Avisem a maré: atraso-me.',
  'Engano. Não é um farol, pois não?',
  'É o seu guarda-chuva. Fugi. Não me procure.',
  'Sindicato dos pombos: queremos mais estátuas.',
  'Sou tu, de amanhã. Leva casaco.',
  'Daqui a biblioteca. Shhh.',
  'O seu desejo está em processamento.',
  'A nuvem-coelho virou bule. Olhe já!',
  'Avião de papel. Posso aterrar no terraço?',
];
const FORTUNES = [                           // [text, Portuguese?]
  ['You will find something you weren\'t looking for. Possibly a sock.'],
  ['A small door will open soon. Go through it slowly.'],
  ['Today a bird will judge you. Kindly.'],
  ['Your next good idea is hiding inside a boring afternoon.'],
  ['The answer is yes. The question is still changing.'],
  ['Someone is thinking of you right now. It\'s the cat. It isn\'t affectionate.'],
  ['Look up. No — higher. There.'],
  ['A question mark is glowing in the ruins. It wants company, not answers.'],
  ['Out past the school, far in the meadow, a lamp is keeping a secret.'],
  ['Hoje é um bom dia para começar coisas pequenas.', true],
  ['Vais encontrar o que perdeste no sítio onde já procuraste.', true],
  ['Quem espera sempre alcança — mas leva um livro.', true],
  ['A sorte protege os distraídos.', true],
];

// ---------------------------------------------------------------- tiny utilities --
function mulberry(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hash3(x, y, z) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(z | 0, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function noise3(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const fx = x - xi, fy = y - yi, fz = z - zi;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy), w = fz * fz * (3 - 2 * fz);
  let r = 0;
  for (let k = 0; k < 8; k++) {
    const dx = k & 1, dy = (k >> 1) & 1, dz = (k >> 2) & 1;
    r += hash3(xi + dx, yi + dy, zi + dz) * (dx ? u : 1 - u) * (dy ? v : 1 - v) * (dz ? w : 1 - w);
  }
  return r;
}
function fbm3(x, y, z, oct) {
  let s = 0, a = 0.5, f = 1, n = 0;
  for (let i = 0; i < oct; i++) { s += a * noise3(x * f + i * 7.1, y * f - i * 3.3, z * f + i * 1.7); n += a; a *= 0.5; f *= 2.03; }
  return s / n;
}
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
function shuffled(list) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); const t = a[i]; a[i] = a[j]; a[j] = t; }
  return a;
}
function makeCanvas(w, h) { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; }

// A hand-wobbly stroke through pts (px): each segment is subdivided and nudged sideways by a slow,
// smooth wobble plus a little tremor, so no line is ever quite straight.
function wobblyPath(g, pts, R, amp, step, closed) {
  const P = closed ? pts.concat([pts[0]]) : pts;
  const ph = R() * 100, ph2 = R() * 100;
  let s = 0;
  g.beginPath();
  for (let i = 0; i < P.length - 1; i++) {
    const x0 = P[i][0], y0 = P[i][1], x1 = P[i + 1][0], y1 = P[i + 1][1];
    const L = Math.hypot(x1 - x0, y1 - y0) || 1, n = Math.max(1, Math.ceil(L / step));
    const nx = -(y1 - y0) / L, ny = (x1 - x0) / L;
    for (let k = i === 0 ? 0 : 1; k <= n; k++) {
      const t = k / n, ss = s + L * t;
      const w = amp * (0.65 * Math.sin(ss / (step * 9) + ph) + 0.35 * Math.sin(ss / (step * 3.1) + ph2)) + amp * 0.3 * (R() - 0.5);
      const x = x0 + (x1 - x0) * t + nx * w, y = y0 + (y1 - y0) * t + ny * w;
      if (i === 0 && k === 0) g.moveTo(x, y); else g.lineTo(x, y);
    }
    s += L;
  }
  g.stroke();
}
// Text set letter by letter, each with its own size, tilt and baseline: a playful hand.
function handWidth(g, text, size, font, spacing = 0.96, weight = 'bold') {
  g.font = `${weight} ${size}px ${font}`;
  let w = 0;
  for (const ch of text) w += g.measureText(ch).width * spacing;
  return w;
}
function handText(g, text, x, y, size, R, { font = HAND, jitter = 0.09, spacing = 0.96, weight = 'bold', stroke = false } = {}) {
  let cx = x;
  for (const ch of text) {
    const s = size * (0.93 + R() * 0.14);
    g.font = `${weight} ${s.toFixed(1)}px ${font}`;
    const w = g.measureText(ch).width;
    g.save();
    g.translate(cx + w / 2, y + (R() - 0.5) * size * 0.09);
    g.rotate((R() - 0.5) * jitter * 2);
    if (stroke) g.strokeText(ch, -w / 2, 0); else g.fillText(ch, -w / 2, 0);
    g.restore();
    cx += w * spacing;
  }
  return cx - x;
}
// Chalk: clumpy grain eats into everything drawn so far, as rough paving would.
function chalkify(c, R, lo = 0.3, hi = 0.72) {
  const g = c.getContext('2d'), W = c.width, H = c.height;
  const img = g.getImageData(0, 0, W, H), d = img.data;
  const cs = 3, cw = Math.ceil(W / cs) + 1, cells = new Float32Array(cw * (Math.ceil(H / cs) + 1));
  for (let i = 0; i < cells.length; i++) cells[i] = R();
  const inv = 1 / (hi - lo);
  for (let y = 0; y < H; y++) {
    const row = ((y / cs) | 0) * cw;
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4 + 3, a = d[i];
      if (a === 0) continue;
      const n = 0.6 * cells[row + ((x / cs) | 0)] + 0.4 * R();
      d[i] = a * (n <= lo ? 0 : n >= hi ? 1 : (n - lo) * inv);
    }
  }
  g.putImageData(img, 0, 0);
}
// Risograph: two inks printed one after the other, slightly out of register.
function riso(g, draw, c1, c2, dx, dy) {
  g.save();
  g.globalCompositeOperation = 'multiply';
  g.fillStyle = c1; g.strokeStyle = c1; g.globalAlpha = 0.92; draw(g);
  g.translate(dx, dy);
  g.fillStyle = c2; g.strokeStyle = c2; g.globalAlpha = 0.78; draw(g);
  g.restore();
}

export function build(ctx) {
  const { THREE, M, quality } = ctx;
  const low = quality === 'low';
  const calm = !!ctx.reducedMotion;
  const group = new THREE.Group();
  group.name = 'oddities';
  const colliders = [], pickables = [];
  const maxAniso = ctx.renderer?.capabilities?.getMaxAnisotropy?.() || 4;

  const tex = (c, aniso = 8) => {
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = Math.min(aniso, maxAniso);
    return t;
  };
  const box = (w, h, d, x, y, z) => { const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y, z); return g; };
  const paint = (g, hex) => {
    const c = new THREE.Color(hex), n = g.attributes.position.count, a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(a, 3));
    return g;
  };
  // Merge parts into one geometry (one draw call). Everything becomes non-indexed with the same attributes.
  const merge = (list, withColor = false) => {
    const keep = withColor ? ['position', 'normal', 'uv', 'color'] : ['position', 'normal', 'uv'];
    const out = list.map((g) => {
      const q = g.index ? g.toNonIndexed() : g;
      if (q !== g) g.dispose();
      for (const k of Object.keys(q.attributes)) if (!keep.includes(k)) q.deleteAttribute(k);
      if (!q.attributes.normal) q.computeVertexNormals();
      if (!q.attributes.uv) q.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(q.attributes.position.count * 2), 2));
      if (withColor && !q.attributes.color) paint(q, 0xffffff);
      return q;
    });
    const m = mergeGeometries(out, false);
    out.forEach((g) => g.dispose());
    return m;
  };
  const mesh = (geo, mat, parent, { cast = true, recv = true } = {}) => {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = cast; m.receiveShadow = recv;
    (parent || group).add(m);
    return m;
  };
  // Shared soft glow sprite texture (white radial falloff, tinted per use).
  const glowTex = (() => {
    const c = makeCanvas(128, 128), g = c.getContext('2d');
    const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.22, 'rgba(255,255,255,0.55)');
    gr.addColorStop(0.55, 'rgba(255,255,255,0.13)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    return tex(c, 1);
  })();
  const glowSprite = (hex, opacity, size) => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTex, color: hex, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    s.scale.set(size, size, 1);
    return s;
  };
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0xd6e4e2, roughness: 0.06, metalness: 0, transparent: true, opacity: 0.18,
    depthWrite: false, envMapIntensity: 1.3, side: THREE.DoubleSide,
  });

  // ======================================================== 1. chalk on the paving ==
  {
    const UW = 3.4, VH = 3.6, PPM = low ? 220 : 400;
    const W = Math.round(UW * PPM), H = Math.round(VH * PPM);
    const c = makeCanvas(W, H), g = c.getContext('2d'), R = mulberry(4242);
    // decal metres: u to the right of a visitor walking south (+z), v away from them
    const X = (u) => (u + UW / 2) * PPM, Y = (v) => (VH / 2 - v) * PPM;
    const COL = { white: '#fbf8f1', pink: '#ff6f9f', blue: '#4fa8ec', yellow: '#ffd23f', green: '#6fd38e', orange: '#ff9f3a' };
    g.lineCap = 'round'; g.lineJoin = 'round';
    const line = (pts, col, wM = 0.03, closed = false) => {
      const P = pts.map(([u, v]) => [X(u), Y(v)]);
      g.strokeStyle = col; g.lineWidth = wM * PPM; g.globalAlpha = 0.95;
      wobblyPath(g, P, R, 0.005 * PPM, 0.025 * PPM, closed);
      g.lineWidth = wM * PPM * 0.55; g.globalAlpha = 0.5;            // chalk always gets gone over twice
      wobblyPath(g, P.map(([x, y]) => [x + (R() - 0.5) * 0.009 * PPM, y + (R() - 0.5) * 0.009 * PPM]), R, 0.006 * PPM, 0.03 * PPM, closed);
      g.globalAlpha = 1;
    };
    const jit = (v, a = 0.012) => v + (R() - 0.5) * 2 * a;
    const word = (text, u, v, sizeM, col, rot = 0) => {
      const size = sizeM * PPM, w = handWidth(g, text, size, HAND);
      g.save(); g.translate(X(u), Y(v)); g.rotate(rot); g.fillStyle = col; g.textBaseline = 'middle';
      handText(g, text, -w / 2, 0, size, R, { jitter: 0.12 });
      g.restore();
    };
    // hopscotch: 1 2 3 [4 5] 6 [7 8] and the arch of "céu" (sky), as Lisbon children chalk it
    const s = 0.44, u0 = -0.8, v0 = -1.66;
    const sq = (ua, va, ub, vb) => line([[jit(ua), jit(va)], [jit(ub), jit(va)], [jit(ub), jit(vb)], [jit(ua), jit(vb)]], COL.white, 0.032, true);
    const NUMC = [COL.pink, COL.yellow, COL.blue, COL.green];
    [[1], [2], [3], [4, 5], [6], [7, 8]].forEach((row, r) => {
      const va = v0 + r * s, vb = va + s, vm = va + s / 2;
      if (row.length === 1) { sq(u0 - s / 2, va, u0 + s / 2, vb); word(String(row[0]), u0, vm, 0.21, NUMC[row[0] % 4], (R() - 0.5) * 0.3); }
      else {
        sq(u0 - s, va, u0, vb); sq(u0, va, u0 + s, vb);
        word(String(row[0]), u0 - s / 2, vm, 0.21, NUMC[row[0] % 4], (R() - 0.5) * 0.3);
        word(String(row[1]), u0 + s / 2, vm, 0.21, NUMC[row[1] % 4], (R() - 0.5) * 0.3);
      }
    });
    const vTop = v0 + 6 * s, arch = [];
    for (let k = 0; k <= 18; k++) { const a = Math.PI * k / 18; arch.push([u0 + Math.cos(a) * s * (1 + (R() - 0.5) * 0.04), vTop + Math.sin(a) * s * 0.95]); }
    line(arch, COL.white, 0.032);
    word('céu', u0, vTop + 0.19, 0.16, COL.pink, -0.06);
    // the sun, asleep, with a scribbled yellow fill
    const sc = [0.98, 1.22], sr = 0.24;
    g.save(); g.beginPath(); g.arc(X(sc[0]), Y(sc[1]), sr * PPM, 0, TAU); g.clip();
    g.strokeStyle = COL.yellow; g.lineWidth = 0.022 * PPM; g.globalAlpha = 0.62;
    g.beginPath();
    for (let k = -8; k <= 8; k++) {
      const o = k * 0.032;
      g.moveTo(X(sc[0] - 0.3 + o), Y(sc[1] - 0.3)); g.lineTo(X(sc[0] + 0.3 + o + (R() - 0.5) * 0.02), Y(sc[1] + 0.3));
    }
    g.stroke(); g.restore(); g.globalAlpha = 1;
    const ring = [];
    for (let k = 0; k < 22; k++) { const a = k / 22 * TAU; ring.push([sc[0] + Math.cos(a) * sr * (1 + (R() - 0.5) * 0.06), sc[1] + Math.sin(a) * sr * (1 + (R() - 0.5) * 0.06)]); }
    line(ring, COL.orange, 0.026, true);
    for (let k = 0; k < 11; k++) {
      const a = k / 11 * TAU + (R() - 0.5) * 0.2, r0 = sr + 0.06, r1 = r0 + 0.1 + R() * 0.1;
      line([[sc[0] + Math.cos(a) * r0, sc[1] + Math.sin(a) * r0], [sc[0] + Math.cos(a) * r1, sc[1] + Math.sin(a) * r1]], k % 2 ? COL.yellow : COL.orange, 0.024);
    }
    for (const ex of [-0.08, 0.08]) line([[sc[0] + ex - 0.04, sc[1] + 0.05], [sc[0] + ex, sc[1] + 0.025], [sc[0] + ex + 0.04, sc[1] + 0.05]], COL.orange, 0.018);
    line([[sc[0] - 0.09, sc[1] - 0.07], [sc[0] - 0.03, sc[1] - 0.12], [sc[0] + 0.04, sc[1] - 0.12], [sc[0] + 0.1, sc[1] - 0.06]], COL.orange, 0.018);
    // a crooked house with a curl of smoke
    const tilt = -0.07, hc = [0.95, -0.2];
    const rot = ([u, v]) => { const du = u - hc[0], dv = v - hc[1]; return [hc[0] + du * Math.cos(tilt) - dv * Math.sin(tilt), hc[1] + du * Math.sin(tilt) + dv * Math.cos(tilt)]; };
    line([[0.6, -0.5], [1.28, -0.5], [1.28, 0.05], [0.6, 0.05]].map(rot), COL.pink, 0.03, true);
    line([[0.53, 0.04], [0.88, 0.43], [1.35, 0.03]].map(rot), COL.yellow, 0.03);
    line([[0.7, -0.5], [0.7, -0.2], [0.86, -0.2], [0.86, -0.5]].map(rot), COL.blue, 0.026);
    line([[1.0, -0.26], [1.18, -0.26], [1.18, -0.08], [1.0, -0.08]].map(rot), COL.yellow, 0.022, true);
    line([[1.09, -0.26], [1.09, -0.08]].map(rot), COL.yellow, 0.016);
    line([[1.0, -0.17], [1.18, -0.17]].map(rot), COL.yellow, 0.016);
    line([[1.1, 0.24], [1.1, 0.36], [1.19, 0.36], [1.19, 0.16]].map(rot), COL.pink, 0.022);
    const smoke = [];
    for (let k = 0; k <= 26; k++) { const t = k / 26, a = t * 3.2 * TAU; smoke.push([1.16 + Math.sin(a) * 0.05 * (0.4 + t) + t * 0.08, 0.4 + t * 0.38 + Math.cos(a) * 0.025]); }
    line(smoke.map(rot), COL.white, 0.014);
    // a flower by the door, a star, a spiral
    line([[0.52, -0.52], [0.53, -0.36]], COL.green, 0.016);
    for (let k = 0; k < 5; k++) { const a = k / 5 * TAU; const pc = [0.53 + Math.cos(a) * 0.035, -0.33 + Math.sin(a) * 0.035]; line([[pc[0] - 0.012, pc[1]], [pc[0] + 0.012, pc[1]]], COL.pink, 0.03); }
    const star = [];
    for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + k * Math.PI / 5, r = k % 2 ? 0.045 : 0.11; star.push([-1.45 + Math.cos(a) * r, 0.45 - Math.sin(a) * r]); }
    line(star, COL.yellow, 0.02, true);
    const spiral = [];
    for (let k = 0; k <= 40; k++) { const a = k / 40 * 3 * TAU, r = 0.012 + k / 40 * 0.1; spiral.push([-1.42 + Math.cos(a) * r, -1.2 + Math.sin(a) * r]); }
    line(spiral, COL.green, 0.018);
    // the poem, written a little downhill
    g.save(); g.translate(X(0.66), Y(-1.16)); g.rotate(0.07); g.translate(-X(0.66), -Y(-1.16));
    g.textBaseline = 'middle';
    const lines = [['hop to the sky,', -0.15, -0.86], ['then come back', -0.05, -1.13], ['a little different', -0.12, -1.4]];
    for (const [t, u, v] of lines) { g.fillStyle = COL.blue; handText(g, t, X(u), Y(v), 0.13 * PPM, R, { jitter: 0.1 }); }
    g.restore();
    const hx = 1.33, hy = -1.5;
    line([[hx, hy - 0.06], [hx - 0.07, hy + 0.01], [hx - 0.045, hy + 0.055], [hx, hy + 0.025], [hx + 0.045, hy + 0.055], [hx + 0.07, hy + 0.01], [hx, hy - 0.06]], COL.pink, 0.02);
    chalkify(c, R);

    const t = tex(c, 16);
    const mat = new THREE.MeshStandardMaterial({
      map: t, transparent: true, depthWrite: false, roughness: 0.95, metalness: 0,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    });
    const geo = new THREE.PlaneGeometry(UW, VH);
    geo.rotateX(-Math.PI / 2); geo.rotateY(Math.PI);           // canvas top → +z, canvas right → −x
    const m = mesh(geo, mat, group, { cast: false, recv: true });
    m.position.set(-8, 0.012, 42);
    m.renderOrder = 1;
    m.name = 'oddities-chalk';
  }

  // ===================================================== 2. the telephone kiosk ==
  const kiosk = new THREE.Group();
  kiosk.name = 'oddities-phone-kiosk';
  kiosk.position.set(KIOSK.x, 0, KIOSK.z);
  kiosk.rotation.y = -Math.PI / 2;                                // door (local +z) faces the plaza (world −x)
  kiosk.userData.action = { type: 'custom', id: 'odd-phone' };
  group.add(kiosk);
  pickables.push(kiosk);
  colliders.push({ minX: KIOSK.x - 0.53, maxX: KIOSK.x + 0.53, minZ: KIOSK.z - 0.53, maxZ: KIOSK.z + 0.53, minY: 0, maxY: 2.7 });
  let kioskLamp, phone;
  {
    const red = M.get('plaster', { color: 0xa3261d, roughness: 0.45 });
    const cream = M.get('plaster', { color: 0xf7dca6, roughness: 0.5 });
    const S = 0.46, P = 0.07, IN = 2 * (S - P);
    const Rd = [], Cr = [], Gl = [];
    Cr.push(box(1.0, 0.08, 1.0, 0, 0.04, 0));                          // plinth
    Rd.push(box(0.84, 0.012, 0.84, 0, 0.086, 0));                      // floor plate
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) Rd.push(box(P, 2.1, P, sx * (S - P / 2), 1.13, sz * (S - P / 2)));
    for (let k = 0; k < 4; k++) {
      const L = [], C = [], G = [];
      C.push(box(IN, 0.86, 0.024, 0, 0.53, S - 0.03));                  // lower panel
      C.push(box(IN - 0.12, 0.02, 0.012, 0, 0.2, S - 0.012), box(IN - 0.12, 0.02, 0.012, 0, 0.86, S - 0.012),
        box(0.02, 0.68, 0.012, -(IN - 0.12) / 2 + 0.01, 0.53, S - 0.012), box(0.02, 0.68, 0.012, (IN - 0.12) / 2 - 0.01, 0.53, S - 0.012));
      L.push(box(IN, 0.06, 0.04, 0, 0.11, S - 0.025));                  // kick rail
      L.push(box(IN + 0.02, 0.07, 0.05, 0, 0.995, S - 0.025));          // mid rail
      L.push(box(IN + 0.02, 0.05, 0.05, 0, 1.94, S - 0.025));           // top rail
      for (const bx of [-0.13, 0.13]) L.push(box(0.022, 0.885, 0.022, bx, 1.4725, S - 0.025));
      for (const by of [1.25, 1.47, 1.69]) L.push(box(IN, 0.022, 0.022, 0, by, S - 0.025));
      const pane = new THREE.PlaneGeometry(IN, 0.885); pane.translate(0, 1.4725, S - 0.028); G.push(pane);
      if (k === 0) {                                                   // the door: handle and hinges
        L.push(box(0.025, 0.2, 0.03, 0.32, 1.12, S + 0.005));
        for (const hy of [0.35, 1.7]) L.push(box(0.03, 0.09, 0.03, -0.375, hy, S));
      }
      for (const geo of [...L, ...C, ...G]) geo.rotateY(k * Math.PI / 2);
      Rd.push(...L); Cr.push(...C); Gl.push(...G);
    }
    Cr.push(box(0.34, 0.6, 0.02, 0, 1.38, -0.405));                     // backboard for the phone
    Cr.push(box(1.0, 0.025, 1.0, 0, 2.1775, 0));                        // cream trim under the roof
    Rd.push(box(1.04, 0.05, 1.04, 0, 2.215, 0));                        // roof slab
    const vault = new THREE.CylinderGeometry(0.47, 0.47, 0.98, low ? 12 : 20, 1, false, 0, Math.PI);
    vault.rotateZ(Math.PI / 2); vault.scale(1, 0.42, 1); vault.translate(0, 2.24, 0);
    Rd.push(vault);
    const stem = new THREE.CylinderGeometry(0.035, 0.05, 0.05, 12); stem.translate(0, 2.462, 0); Rd.push(stem);
    const cap = new THREE.CylinderGeometry(0.03, 0.042, 0.025, 12); cap.translate(0, 2.636, 0); Rd.push(cap);
    const redGeo = merge(Rd), creamGeo = merge(Cr);
    M.boxUV(redGeo); M.boxUV(creamGeo);
    mesh(redGeo, red, kiosk);
    mesh(creamGeo, cream, kiosk);
    mesh(merge(Gl), glassMat, kiosk, { cast: false, recv: false }).renderOrder = 2;

    // sign band + the note inside the door, one painted atlas
    const N = low ? 512 : 1024, k = N / 1024;
    const ac = makeCanvas(N, N), g = ac.getContext('2d'), R = mulberry(31337);
    g.fillStyle = '#efe3c6'; g.fillRect(0, 0, N, N);
    const band = (y0, text) => {
      g.strokeStyle = '#a3261d'; g.lineWidth = 7 * k; g.strokeRect(16 * k, (y0 + 16) * k, N - 32 * k, 186 * k);
      g.lineWidth = 2.5 * k; g.strokeRect(30 * k, (y0 + 30) * k, N - 60 * k, 158 * k);
      g.fillStyle = '#a3261d'; g.textBaseline = 'middle';
      g.font = `700 ${128 * k}px ${SERIF}`;
      const track = 26 * k, widths = [...text].map((ch) => g.measureText(ch).width);
      let x = N / 2 - (widths.reduce((a, b) => a + b, 0) + track * (widths.length - 1)) / 2;
      [...text].forEach((ch, i) => {                                   // sign-writer's hand: never quite even
        g.save(); g.translate(x, (y0 + 112) * k + (R() - 0.5) * 4 * k); g.rotate((R() - 0.5) * 0.03);
        g.globalAlpha = 0.95; g.fillText(ch, 0, 0); g.globalAlpha = 0.35; g.fillText(ch, 1.5 * k, 1 * k);
        g.restore(); x += widths[i] + track;
      });
      g.globalAlpha = 1;
    };
    band(0, 'HELLO?'); band(218, 'ALÔ?');
    // the note: region x 0..400, y 436..718
    g.save(); g.translate(200 * k, 577 * k); g.rotate(-0.02);
    g.fillStyle = '#fbf0b4'; g.fillRect(-190 * k, -131 * k, 380 * k, 262 * k);
    g.fillStyle = 'rgba(255,255,255,0.55)'; g.save(); g.rotate(0.06); g.fillRect(-60 * k, -150 * k, 120 * k, 38 * k); g.restore();
    g.fillStyle = '#2b47a8'; g.textBaseline = 'middle';
    handText(g, 'if it rings,', -160 * k, -40 * k, 64 * k, R, { jitter: 0.08 });
    handText(g, 'answer.', -110 * k, 50 * k, 70 * k, R, { jitter: 0.08 });
    g.strokeStyle = '#2b47a8'; g.lineWidth = 4 * k; g.lineCap = 'round';
    wobblyPath(g, [[-110 * k, 92 * k], [130 * k, 88 * k]], R, 3 * k, 12 * k, false);
    g.restore();
    const atlasTex = tex(ac);
    const atlasMat = new THREE.MeshStandardMaterial({ map: atlasTex, roughness: 0.55, emissive: 0xffffff, emissiveMap: atlasTex, emissiveIntensity: 0.16 });
    const remap = (geo, start, count, [x0, y0, x1, y1]) => {     // canvas rect (1024 space) → uv range
      const uv = geo.attributes.uv;
      const u0 = x0 / 1024, u1 = x1 / 1024, v0 = 1 - y1 / 1024, v1 = 1 - y0 / 1024;
      for (let i = start; i < start + count; i++) uv.setXY(i, u0 + uv.getX(i) * (u1 - u0), v0 + uv.getY(i) * (v1 - v0));
    };
    const bandGeo = new THREE.BoxGeometry(0.94, 0.2, 0.94);       // faces: +x −x +y −y +z −z, 4 vertices each
    remap(bandGeo, 0, 8, [0, 218, 1024, 436]);                       // ±x: ALÔ?
    remap(bandGeo, 8, 8, [600, 800, 1000, 1000]);                    // ±y: plain cream
    remap(bandGeo, 16, 8, [0, 0, 1024, 218]);                        // ±z: HELLO?
    bandGeo.translate(0, 2.065, 0);
    const note = new THREE.PlaneGeometry(0.17, 0.12);
    remap(note, 0, 4, [10, 446, 390, 708]);
    note.rotateZ(0.07); note.translate(0.26, 1.58, S - 0.04);
    mesh(merge([bandGeo, note]), atlasMat, kiosk);

    // the little lamp that blinks when it rings
    kioskLamp = new THREE.MeshStandardMaterial({ color: 0xffe9cc, emissive: 0xff9a3d, emissiveIntensity: 0.15, roughness: 0.25 });
    const globe = mesh(new THREE.SphereGeometry(0.068, 16, 12), kioskLamp, kiosk, { cast: false });
    globe.position.set(0, 2.555, 0);

    // the telephone on its backboard (rattles when ringing)
    phone = new THREE.Group(); phone.position.set(0, 0, -0.395); kiosk.add(phone);
    const BLACK = 0x161616;
    const ph = [];
    ph.push(paint(box(0.2, 0.26, 0.1, 0, 1.42, 0.05), BLACK), paint(box(0.16, 0.15, 0.08, 0, 1.2, 0.04), BLACK));
    const dial = new THREE.CylinderGeometry(0.058, 0.058, 0.012, 20); dial.rotateX(Math.PI / 2); dial.translate(0, 1.43, 0.106); ph.push(paint(dial, 0xefe3c6));
    const hub = new THREE.CylinderGeometry(0.018, 0.018, 0.016, 12); hub.rotateX(Math.PI / 2); hub.translate(0, 1.43, 0.11); ph.push(paint(hub, 0xa3261d));
    const handset = new THREE.CapsuleGeometry(0.024, 0.15, 4, 8); handset.rotateZ(Math.PI / 2); handset.translate(0, 1.588, 0.075); ph.push(paint(handset, BLACK));
    for (const sx of [-1, 1]) { const cup = new THREE.CylinderGeometry(0.038, 0.03, 0.035, 12); cup.translate(sx * 0.085, 1.57, 0.075); ph.push(paint(cup, BLACK)); }
    ph.push(paint(box(0.05, 0.008, 0.012, 0, 1.255, 0.082), 0x9a9a9a));
    class Coil extends THREE.Curve {
      getPoint(t, target = new THREE.Vector3()) {
        const bx = -0.095 + 0.012 * Math.sin(t * Math.PI), by = 1.55 - t * 0.36 - 0.06 * Math.sin(t * Math.PI), a = t * 22 * TAU;
        return target.set(bx - 0.018 * Math.sin(t * Math.PI) + Math.cos(a) * 0.009, by, 0.07 + Math.sin(a) * 0.009);
      }
    }
    ph.push(paint(new THREE.TubeGeometry(new Coil(), low ? 120 : 220, 0.0032, 4, false), BLACK));
    mesh(merge(ph, true), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.28, metalness: 0.05 }), phone);
  }

  // ================================================== 3. fortune vending machine ==
  const vend = new THREE.Group();
  vend.name = 'oddities-fortune-vending';
  vend.position.set(VEND.x, 0, VEND.z);
  vend.rotation.set(0, -Math.PI / 2, 0.012);                        // front (local +z) faces world −x; a tired lean
  vend.userData.action = { type: 'custom', id: 'odd-vending' };
  group.add(vend);
  pickables.push(vend);
  colliders.push({ minX: VEND.x - 0.38, maxX: VEND.x + 0.37, minZ: VEND.z - 0.47, maxZ: VEND.z + 0.47, minY: 0, maxY: 1.9 });
  let vendFront, card;
  {
    // body: painted steel with a few dents and grime from the ground up
    const body = new THREE.BoxGeometry(0.9, 1.84, 0.72, 6, 12, 5);
    body.translate(0, 0.92, 0);
    const pos = body.attributes.position, nor = body.attributes.normal;
    const DENTS = [[0.45, 1.22, 0.05, 0.11, 0.02], [-0.45, 0.62, -0.12, 0.14, 0.024], [0.45, 0.38, 0.16, 0.09, 0.014], [0.18, 1.84, 0.05, 0.13, 0.014], [-0.45, 1.5, 0.15, 0.08, 0.016]];
    for (let i = 0; i < pos.count; i++) {
      const nz = nor.getZ(i);
      if (nz > 0.5) continue;                                           // the front stays flat under the artwork
      const nx = nor.getX(i), ny = nor.getY(i), x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      let push = 0;
      for (const [dx, dy, dz, r, depth] of DENTS) push += depth * Math.exp(-((x - dx) ** 2 + (y - dy) ** 2 + (z - dz) ** 2) / (r * r));
      pos.setXYZ(i, x - nx * push, y - ny * push, z - nz * push);
    }
    body.computeVertexNormals();
    M.boxUV(body);
    const col = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      let k = 0.55 + 0.45 * smooth(0.0, 0.55, y);
      k *= 0.9 + 0.1 * Math.sin(x * 23 + z * 17 + y * 3);
      k *= 1 - 0.14 * Math.max(0, Math.sin(x * 41 + z * 37)) * smooth(1.0, 1.84, y);
      col[i * 3] = k * 1.02; col[i * 3 + 1] = k; col[i * 3 + 2] = k * 0.95;
    }
    body.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const bodyMat = M.get('plaster', { color: 0x83bca7, roughness: 0.42 }).clone();
    bodyMat.vertexColors = true;
    mesh(body, bodyMat, vend);

    // the painted front: window of fortune cards, keypad, stickers, a note, a cracked pane
    const AW = low ? 320 : 640, AH = Math.round(AW * 1.8 / 0.86), ppm = AW / 0.86;
    const c = makeCanvas(AW, AH), g = c.getContext('2d'), R = mulberry(777);
    const X = (m) => m * ppm, Y = (m) => AH - m * ppm;
    const rect = (x0, y0, x1, y1) => [X(x0), Y(y1), X(x1) - X(x0), Y(y0) - Y(y1)];
    let gr = g.createLinearGradient(0, 0, 0, AH); gr.addColorStop(0, '#93c9b4'); gr.addColorStop(1, '#6e9e8b');
    g.fillStyle = gr; g.fillRect(0, 0, AW, AH);
    for (let i = 0; i < 260; i++) {
      g.fillStyle = R() < 0.5 ? `rgba(255,255,255,${0.025 + R() * 0.04})` : `rgba(20,40,30,${0.025 + R() * 0.04})`;
      g.beginPath(); g.arc(R() * AW, R() * AH, X(0.006 + R() * 0.04), 0, TAU); g.fill();
    }
    gr = g.createLinearGradient(0, Y(0.4), 0, AH); gr.addColorStop(0, 'rgba(45,34,20,0)'); gr.addColorStop(1, 'rgba(45,34,20,0.6)');
    g.fillStyle = gr; g.fillRect(0, Y(0.4), AW, AH - Y(0.4));
    for (let i = 0; i < 10; i++) {
      const x = R() * AW, L = X(0.08 + R() * 0.35);
      gr = g.createLinearGradient(0, 0, 0, L); gr.addColorStop(0, 'rgba(125,62,24,0.5)'); gr.addColorStop(1, 'rgba(125,62,24,0)');
      g.fillStyle = gr; g.fillRect(x, 0, X(0.003 + R() * 0.006), L);
    }
    for (let i = 0; i < 38; i++) {                                     // chipped paint, mostly at the edges
      let x = R() * AW, y = R() * AH;
      if (R() < 0.65) { if (R() < 0.5) x = R() < 0.5 ? R() * X(0.03) : AW - R() * X(0.03); else y = R() < 0.5 ? R() * X(0.03) : AH - R() * X(0.03); }
      const r = X(0.004 + R() * 0.016);
      g.fillStyle = R() < 0.3 ? '#7d4524' : '#a3aaa7';
      g.beginPath();
      for (let k = 0; k < 7; k++) { const a = k / 7 * TAU, rr = r * (0.5 + R() * 0.7); if (k) g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); else g.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
      g.closePath(); g.fill();
    }
    // header
    g.fillStyle = '#f4ecd8'; g.fillRect(...rect(0.05, 1.6, 0.81, 1.765));
    g.textAlign = 'center'; g.textBaseline = 'middle';
    riso(g, (q) => { q.font = `900 ${X(0.088)}px ${HEAVY}`; q.fillText('FORTUNES', X(0.43), Y(1.7)); }, '#ff4fa0', '#1f6fd1', X(0.004), -X(0.0025));
    riso(g, (q) => { q.font = `700 ${X(0.022)}px ${MONO}`; q.fillText('sortes · 24h · no refunds', X(0.43), Y(1.626)); }, '#1f6fd1', '#1f6fd1', 0, 0);
    // window of cards
    const wx0 = 0.05, wx1 = 0.58, wy0 = 0.6, wy1 = 1.56;
    g.fillStyle = '#142422'; g.fillRect(...rect(wx0, wy0, wx1, wy1));
    gr = g.createLinearGradient(0, Y(wy1), 0, Y(wy0)); gr.addColorStop(0, 'rgba(235,245,225,0.32)'); gr.addColorStop(0.45, 'rgba(235,245,225,0.07)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(...rect(wx0, wy0, wx1, wy1));
    const PRICES = ['1 sigh', '2 wishes', '1 maybe', '1 nap', '3 hopes', '1 sorriso', '1 abraço', 'a hum', '1 secret', 'free*', '½ dream', 'sold out'];
    const CARDS = ['#ffd6e5', '#cfe8ff', '#fff2b3', '#d9f5d2', '#ffe0c2', '#e8dcff'];
    const SYM = [
      (q, s) => { q.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? s * 0.42 : s; q.lineTo(Math.cos(a) * r, Math.sin(a) * r); } q.closePath(); q.fill(); },
      (q, s) => { q.beginPath(); q.arc(0, 0, s, Math.PI * 0.35, Math.PI * 1.65); q.arc(s * 0.4, 0, s * 0.78, Math.PI * 1.55, Math.PI * 0.45, true); q.closePath(); q.fill(); },
      (q, s) => { q.lineWidth = s * 0.2; q.beginPath(); q.moveTo(-s, 0); q.quadraticCurveTo(0, -s, s, 0); q.quadraticCurveTo(0, s, -s, 0); q.stroke(); q.beginPath(); q.arc(0, 0, s * 0.3, 0, TAU); q.fill(); },
      (q, s) => { q.beginPath(); q.moveTo(0, s * 0.8); q.bezierCurveTo(-s * 1.3, -s * 0.1, -s * 0.5, -s * 1.05, 0, -s * 0.35); q.bezierCurveTo(s * 0.5, -s * 1.05, s * 1.3, -s * 0.1, 0, s * 0.8); q.fill(); },
      (q, s) => { q.lineWidth = s * 0.18; q.beginPath(); for (let i = 0; i <= 40; i++) { const a = i / 40 * 4 * Math.PI, r = s * i / 40; q.lineTo(Math.cos(a) * r, Math.sin(a) * r); } q.stroke(); },
      (q, s) => { q.font = `900 ${s * 2.2}px ${HEAVY}`; q.fillText('?', 0, s * 0.1); },
      (q, s) => { q.lineWidth = s * 0.2; q.beginPath(); q.arc(-s * 0.55, 0, s * 0.35, 0, TAU); q.moveTo(-s * 0.2, 0); q.lineTo(s, 0); q.moveTo(s * 0.6, 0); q.lineTo(s * 0.6, s * 0.3); q.moveTo(s * 0.88, 0); q.lineTo(s * 0.88, s * 0.3); q.stroke(); },
      (q, s) => { q.beginPath(); q.arc(-s * 0.45, s * 0.1, s * 0.4, 0, TAU); q.arc(0, -s * 0.15, s * 0.5, 0, TAU); q.arc(s * 0.45, s * 0.1, s * 0.38, 0, TAU); q.fill(); q.fillRect(-s * 0.8, s * 0.05, s * 1.6, s * 0.42); },
      (q, s) => { q.beginPath(); q.arc(0, 0, s * 0.45, 0, TAU); q.fill(); q.lineWidth = s * 0.16; q.beginPath(); for (let i = 0; i < 8; i++) { const a = i / 8 * TAU; q.moveTo(Math.cos(a) * s * 0.65, Math.sin(a) * s * 0.65); q.lineTo(Math.cos(a) * s, Math.sin(a) * s); } q.stroke(); },
      (q, s) => { q.lineWidth = s * 0.2; for (const o of [-0.3, 0.3]) { q.beginPath(); for (let i = 0; i <= 20; i++) { const x = -s + i / 20 * 2 * s; q.lineTo(x, o * s + Math.sin(i / 20 * TAU * 1.5) * s * 0.22); } q.stroke(); } },
      (q, s) => { q.beginPath(); q.ellipse(0, 0, s, s * 0.45, -0.6, 0, TAU); q.fill(); },
      null,
    ];
    const cellW = (wx1 - wx0) / 3, cellH = (wy1 - wy0) / 4;
    for (let r = 0; r < 4; r++) for (let cI = 0; cI < 3; cI++) {
      const i = r * 3 + cI, x = wx0 + cI * cellW, y = wy1 - (r + 1) * cellH, cx = x + cellW / 2;
      g.fillStyle = 'rgba(200,210,205,0.55)'; g.fillRect(...rect(x + 0.005, y + 0.045, x + cellW - 0.005, y + 0.05));
      if (SYM[i]) {
        for (let k = 2; k >= 0; k--) {                                  // a little stack of cards
          g.fillStyle = CARDS[(i + k) % CARDS.length];
          g.save(); g.translate(X(cx + k * 0.006), Y(y + 0.13 + k * 0.004)); g.rotate((R() - 0.5) * 0.08);
          g.fillRect(-X(0.05), -X(0.065), X(0.1), X(0.13)); g.restore();
        }
        g.save(); g.translate(X(cx), Y(y + 0.13));
        riso(g, (q) => SYM[i](q, X(0.026)), '#ff4fa0', '#1f6fd1', X(0.003), -X(0.002));
        g.restore();
      }
      g.strokeStyle = '#c9d0d0'; g.lineWidth = Math.max(1, X(0.003));
      for (let k = 0; k < 5; k++) { g.beginPath(); g.ellipse(X(cx - 0.05 + k * 0.025), Y(y + 0.075), X(0.011), X(0.032), 0.25, 0, TAU); g.stroke(); }
      g.fillStyle = '#f7f4ea'; g.fillRect(...rect(cx - 0.065, y + 0.008, cx + 0.065, y + 0.04));
      g.fillStyle = i === 11 ? '#d6262e' : '#1b1b1b'; g.font = `700 ${X(0.016)}px ${MONO}`;
      g.fillText(`${'ABCD'[r]}${cI + 1} ${PRICES[i]}`, X(cx), Y(y + 0.024));
    }
    g.strokeStyle = 'rgba(0,0,0,0.3)'; g.lineWidth = Math.max(1, X(0.0025));
    const crack = [[0.43, 1.52], [0.4, 1.42], [0.42, 1.33], [0.35, 1.2], [0.37, 1.08], [0.29, 0.97]];
    wobblyPath(g, crack.map(([x, y]) => [X(x) + 1, Y(y) + 1]), R, 1, 6, false);
    g.strokeStyle = 'rgba(255,255,255,0.8)';
    wobblyPath(g, crack.map(([x, y]) => [X(x), Y(y)]), R, 1, 6, false);
    for (const [x, y, dx, dy] of [[0.42, 1.33, 0.06, -0.03], [0.37, 1.08, -0.05, 0.02], [0.4, 1.42, 0.05, 0.04]]) wobblyPath(g, [[X(x), Y(y)], [X(x + dx), Y(y + dy)]], R, 1, 6, false);
    // right panel: display, keypad, coin slot, sticker, note
    g.fillStyle = '#0d2416'; g.fillRect(...rect(0.615, 1.43, 0.81, 1.53));
    g.fillStyle = '#86ffa8'; g.font = `700 ${X(0.024)}px ${MONO}`; g.fillText('INSERT DREAM', X(0.7125), Y(1.48));
    const KEYC = ['#ff6fae', '#ffd23f', '#4aa3ff'];
    for (let r = 0; r < 4; r++) for (let cI = 0; cI < 3; cI++) {
      const bx = 0.655 + cI * 0.057, by = 1.36 - r * 0.07;
      g.fillStyle = '#2a2d2c'; g.beginPath(); g.arc(X(bx), Y(by), X(0.026), 0, TAU); g.fill();
      g.fillStyle = KEYC[(r + cI) % 3]; g.beginPath(); g.arc(X(bx) - 1, Y(by) - 1, X(0.021), 0, TAU); g.fill();
      g.fillStyle = '#1b1b1b'; g.font = `700 ${X(0.017)}px ${MONO}`; g.fillText(`${'ABCD'[r]}${cI + 1}`, X(bx), Y(by));
    }
    g.fillStyle = '#b9c0bf'; g.fillRect(...rect(0.69, 1.0, 0.735, 1.08));
    g.fillStyle = '#0b0c0c'; g.fillRect(...rect(0.708, 1.012, 0.717, 1.068));
    g.fillStyle = '#1f3f9a'; g.font = `700 ${X(0.014)}px ${MONO}`; g.fillText('no coins needed', X(0.7125), Y(0.975));
    g.fillStyle = '#ffd23f'; g.beginPath(); g.arc(X(0.712), Y(0.84), X(0.058), 0, TAU); g.fill();
    g.fillStyle = '#fff6cf'; g.beginPath(); g.moveTo(X(0.75), Y(0.81)); g.lineTo(X(0.77), Y(0.83)); g.lineTo(X(0.745), Y(0.835)); g.closePath(); g.fill();
    g.save(); g.translate(X(0.712), Y(0.84)); g.rotate(-0.2);
    riso(g, (q) => { q.font = `900 ${X(0.021)}px ${HEAVY}`; q.fillText('SORTE!', 0, 0); }, '#d6262e', '#d6262e', 0, 0);
    g.restore();
    g.save(); g.translate(X(0.713), Y(0.6)); g.rotate(0.06);
    g.fillStyle = '#fff5b8'; g.fillRect(-X(0.094), -X(0.085), X(0.188), X(0.17));
    g.fillStyle = 'rgba(255,255,255,0.6)'; g.fillRect(-X(0.035), -X(0.1), X(0.07), X(0.03));
    g.fillStyle = '#2846a8'; g.textAlign = 'left';
    handText(g, 'fora de serviço', -X(0.085), -X(0.035), X(0.021), R, { jitter: 0.06 });
    handText(g, 'às terças', -X(0.07), X(0.012), X(0.023), R, { jitter: 0.06 });
    handText(g, '(às vezes)', -X(0.06), X(0.058), X(0.02), R, { jitter: 0.06 });
    g.restore(); g.textAlign = 'center';
    g.fillStyle = '#0f1312'; g.fillRect(...rect(0.1, 0.17, 0.52, 0.42));
    riso(g, (q) => { q.font = `900 ${X(0.024)}px ${HEAVY}`; q.fillText('TAKE YOUR FORTUNE', X(0.31), Y(0.46)); }, '#ff4fa0', '#1f6fd1', X(0.002), -X(0.0015));
    g.strokeStyle = 'rgba(255,255,255,0.22)'; g.lineWidth = 1;
    for (let i = 0; i < 46; i++) { const x = R() * AW, y = R() * AH, a = R() * TAU, L = X(0.01 + R() * 0.05); g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * L, y + Math.sin(a) * L); g.stroke(); }
    // what glows: the lit window and the little display
    const e = makeCanvas(AW, AH), ge = e.getContext('2d');
    ge.fillStyle = '#000'; ge.fillRect(0, 0, AW, AH);
    ge.globalAlpha = 0.6; ge.drawImage(c, X(wx0), Y(wy1), X(wx1 - wx0), Y(wy0) - Y(wy1), X(wx0), Y(wy1), X(wx1 - wx0), Y(wy0) - Y(wy1));
    ge.globalAlpha = 1; ge.fillStyle = '#3cff7a'; ge.textAlign = 'center'; ge.textBaseline = 'middle';
    ge.font = `700 ${X(0.024)}px ${MONO}`; ge.fillText('INSERT DREAM', X(0.7125), Y(1.48));
    const frontTex = tex(c), emTex = tex(e);
    vendFront = new THREE.MeshStandardMaterial({ map: frontTex, emissive: 0xffffff, emissiveMap: emTex, emissiveIntensity: 0.75, roughness: 0.48, metalness: 0.05 });
    const front = new THREE.PlaneGeometry(0.86, 1.8); front.translate(0, 0.92, 0.3605);
    mesh(front, vendFront, vend, { cast: false });
    const pane = new THREE.PlaneGeometry(wx1 - wx0, wy1 - wy0);
    pane.translate((wx0 + wx1) / 2 - 0.43, (wy0 + wy1) / 2 + 0.02, 0.374);
    mesh(pane, glassMat, vend, { cast: false, recv: false }).renderOrder = 2;
    // dark steel: window frame, kick plate, tray hood and flap, rain hood
    const ds = [];
    const fx = (wx0 + wx1) / 2 - 0.43, fy = (wy0 + wy1) / 2 + 0.02, fw = wx1 - wx0, fh = wy1 - wy0;
    ds.push(box(fw + 0.04, 0.02, 0.026, fx, fy + fh / 2 + 0.01, 0.37), box(fw + 0.04, 0.02, 0.026, fx, fy - fh / 2 - 0.01, 0.37),
      box(0.02, fh, 0.026, fx - fw / 2 - 0.01, fy, 0.37), box(0.02, fh, 0.026, fx + fw / 2 + 0.01, fy, 0.37));
    ds.push(box(0.86, 0.12, 0.014, 0, 0.08, 0.368));
    const tx = 0.31 - 0.43;
    ds.push(box(0.46, 0.024, 0.07, tx, 0.452, 0.393), box(0.02, 0.27, 0.07, tx - 0.22, 0.32, 0.393), box(0.02, 0.27, 0.07, tx + 0.22, 0.32, 0.393));
    const flap = box(0.4, 0.2, 0.01, 0, 0, 0); flap.rotateX(-0.18); flap.translate(tx, 0.33, 0.378); ds.push(flap);
    ds.push(box(0.42, 0.016, 0.075, tx, 0.198, 0.398));               // the lip the card lands on
    ds.push(box(0.94, 0.03, 0.78, 0, 1.855, 0.02));
    const dsGeo = merge(ds); M.boxUV(dsGeo);
    mesh(dsGeo, M.get('steel', { color: 0x5a5f61, tile: 0.45, roughness: 0.5 }), vend);
    // the card it hands you
    const cc = makeCanvas(256, 168), cg = cc.getContext('2d');
    cg.fillStyle = '#fbf3df'; cg.fillRect(0, 0, 256, 168);
    cg.strokeStyle = '#ff4fa0'; cg.lineWidth = 5; cg.strokeRect(10, 10, 236, 148);
    cg.textAlign = 'center'; cg.textBaseline = 'middle';
    cg.save(); cg.translate(128, 70); riso(cg, (q) => SYM[0](q, 34), '#ff4fa0', '#1f6fd1', 3, -2); cg.restore();
    riso(cg, (q) => { q.font = `900 22px ${HEAVY}`; q.fillText('YOUR FORTUNE', 128, 132); }, '#1f6fd1', '#ff4fa0', 2, 1);
    card = mesh(new THREE.PlaneGeometry(0.1, 0.066), new THREE.MeshStandardMaterial({ map: tex(cc, 4), roughness: 0.8, side: THREE.DoubleSide }), vend, { cast: false });
    card.position.set(tx, 0.24, 0.415); card.rotation.x = -1.2; card.visible = false;
  }

  // ======================================================= 4. the floating boulder ==
  let boulder, pebbles = null;
  const pebbleSpec = [[1.2, -0.5, 0.0, 0.09], [1.32, -0.62, 2.2, 0.065], [1.12, -0.4, 4.1, 0.11]];
  {
    let geo = new THREE.IcosahedronGeometry(1, low ? 3 : 4);
    geo.deleteAttribute('normal'); geo.deleteAttribute('uv');
    geo = mergeVertices(geo);
    const p = geo.attributes.position;
    const cuts = [[0.3, 0.9, 0.2, 0.86], [-0.7, 0.2, 0.6, 0.82], [0.1, -0.95, -0.2, 0.8], [0.8, -0.1, -0.5, 0.86], [-0.4, 0.3, -0.85, 0.88]]
      .map(([x, y, z, o]) => { const l = Math.hypot(x, y, z); return [x / l, y / l, z / l, o]; });
    for (let i = 0; i < p.count; i++) {
      let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const r = 1 + 0.36 * (fbm3(x * 1.3 + 5, y * 1.3, z * 1.3, 3) - 0.5) + 0.1 * (fbm3(x * 4.2, y * 4.2 + 9, z * 4.2, 2) - 0.5);
      x *= r; y *= r; z *= r;
      for (const [nx, ny, nz, o] of cuts) { const d = x * nx + y * ny + z * nz - o; if (d > 0) { x -= nx * d * 0.9; y -= ny * d * 0.9; z -= nz * d * 0.9; } }
      p.setXYZ(i, x * 0.86, y * 0.62, z * 0.7);
    }
    geo.computeVertexNormals();
    M.boxUV(geo);
    const nrm = geo.attributes.normal, col = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const cav = fbm3(x * 3 + 1, y * 3, z * 3, 2);
      let r = 0.8 + 0.34 * cav, gg = r, b = r * 0.97;
      const lich = fbm3(x * 2.6 + 11, y * 2.6, z * 2.6 - 4, 3);
      if (lich > 0.58 && nrm.getY(i) > -0.25) {                        // ochre and grey-green lichen
        const t = smooth(0.58, 0.66, lich), ochre = fbm3(x * 5, y * 5, z * 5, 1) > 0.5;
        const L = ochre ? [1.3, 1.02, 0.5] : [1.0, 1.08, 0.86];
        r += (L[0] - r) * t * 0.85; gg += (L[1] - gg) * t * 0.85; b += (L[2] - b) * t * 0.85;
      }
      col[i * 3] = r; col[i * 3 + 1] = gg; col[i * 3 + 2] = b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const rockBase = M.get('concreteFloor', { color: 0xc4beb2, tile: 1.1, roughness: 0.93 });
    const rockMat = rockBase.clone(); rockMat.vertexColors = true;
    // It moves under a shadow map rendered once, so it casts but does not receive (no stale self-shadow).
    boulder = mesh(geo, rockMat, group, { cast: true, recv: false });
    boulder.position.set(BOULDER.x, BOULDER.y, BOULDER.z);
    boulder.rotation.set(0.05, 0.35, -0.04);
    boulder.name = 'oddities-boulder';
    if (!low) {
      const pg = new THREE.DodecahedronGeometry(1, 0);
      M.boxUV(pg);
      pebbles = new THREE.InstancedMesh(pg, rockBase, pebbleSpec.length);
      pebbles.castShadow = false; pebbles.receiveShadow = false;
      pebbles.boundingSphere = new THREE.Sphere(new THREE.Vector3(BOULDER.x, BOULDER.y - 0.4, BOULDER.z), 2.2);
      group.add(pebbles);
    }
  }
  const dummy = new THREE.Object3D();
  function placePebbles(t) {                                        // t: seconds (called with no argument per frame)
    if (!pebbles) return;
    if (t === undefined) t = st.t;
    for (let i = 0; i < pebbleSpec.length; i++) {
      const sp = pebbleSpec[i], rad = sp[0], dy = sp[1], ph = sp[2], s = sp[3], a = ph + t * 0.22;
      dummy.position.set(BOULDER.x + Math.cos(a) * rad, boulder.position.y + dy + 0.05 * Math.sin(t * 0.9 + ph), BOULDER.z + Math.sin(a) * rad);
      dummy.rotation.set(t * 0.3 + ph, t * 0.2, ph);
      dummy.scale.set(s, s * 0.8, s);
      dummy.updateMatrix();
      pebbles.setMatrixAt(i, dummy.matrix);
    }
    pebbles.instanceMatrix.needsUpdate = true;
  }
  placePebbles(0);

  // ============================================== 5. the neon "?" in the ruin ==
  let neonMat, neonHalo;
  {
    // ruins.js: the fallen roof slab — position (-50, 2.3, -36), rotation (atan2(2.7, 11), 0, 0.04), 0.3 thick.
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.atan2(2.7, 11), 0, 0.04));
    const n = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
    const p0 = new THREE.Vector3(0, 0.15, 0).applyQuaternion(q).add(new THREE.Vector3(-50, 2.3, -36));
    const slabY = (x, z) => p0.y - (n.x * (x - p0.x) + n.z * (z - p0.z)) / n.y;
    const baseY = slabY(NEON.x, NEON.z);
    const yaw = Math.atan2(-0.75, 7);                                   // faces the gap in the south wall
    const N = new THREE.Group(); N.name = 'oddities-neon';
    N.position.set(NEON.x, baseY, NEON.z); N.rotation.y = yaw;
    group.add(N);
    const R = mulberry(2718), w = () => (R() - 0.5) * 0.016;
    const pts = [[-0.24, 0.86], [-0.225, 0.98], [-0.13, 1.08], [0.01, 1.12], [0.15, 1.08], [0.235, 0.975], [0.22, 0.855], [0.13, 0.76], [0.035, 0.68], [-0.005, 0.6], [0.0, 0.5], [0.002, 0.4]]
      .map(([x, y], i, a) => new THREE.Vector3(x + (i && i < a.length - 1 ? w() : 0), y + (i && i < a.length - 1 ? w() : 0), 0));
    const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
    const tube = new THREE.TubeGeometry(curve, low ? 48 : 96, 0.017, low ? 6 : 8, false);
    const dot = new THREE.TorusGeometry(0.026, 0.016, 8, 18); dot.translate(0.006, 0.24, 0);
    neonMat = new THREE.MeshStandardMaterial({ color: 0xff7ab8, emissive: 0xff2d95, emissiveIntensity: NEON_GLOW, roughness: 0.3, metalness: 0 });
    mesh(merge([tube, dot]), neonMat, N, { cast: true, recv: false });
    // black hardware: electrodes, raceway on the slab, rods and clips, transformer, a cable to a loose plug
    const hw = [];
    for (const t of [0, 1]) {
      const at = curve.getPoint(t), tg = curve.getTangent(t).multiplyScalar(t ? 1 : -1);
      const e = new THREE.CylinderGeometry(0.022, 0.022, 0.05, 10);
      e.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), tg));
      e.translate(at.x + tg.x * 0.02, at.y + tg.y * 0.02, 0); hw.push(e);
    }
    const race = box(0.62, 0.07, 0.12, 0, 0.035, 0);
    race.rotateX(Math.atan2(2.7, 11)); race.rotateZ(0.04); hw.push(race);
    for (const sx of [-0.17, 0.17]) {
      const rod = new THREE.CylinderGeometry(0.008, 0.008, 1.06, 6); rod.translate(sx, 0.6, -0.035); hw.push(rod);
    }
    for (const [x, y] of [[-0.17, 0.9], [0.17, 0.95], [0.0, 0.45]]) {
      const clip = new THREE.CylinderGeometry(0.006, 0.006, 0.04, 6); clip.rotateX(Math.PI / 2); clip.translate(x, y, -0.018); hw.push(clip);
    }
    hw.push(box(0.36, 0.012, 0.012, 0, 0.45, -0.035));
    hw.push(box(0.14, 0.09, 0.08, 0.19, 0.11, -0.08));
    const toLocalY = (lx, lz) => slabY(NEON.x + lx * Math.cos(yaw) + lz * Math.sin(yaw), NEON.z - lx * Math.sin(yaw) + lz * Math.cos(yaw)) - baseY;
    const cable = [[0.24, 0.1, -0.1], [0.32, null, -0.06], [0.42, null, 0.08], [0.5, null, 0.22], [0.6, null, 0.34]]
      .map(([x, y, z]) => new THREE.Vector3(x, y ?? toLocalY(x, z) + 0.012, z));
    hw.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(cable), 24, 0.008, 5, false));
    const plug = box(0.035, 0.022, 0.055, 0, 0, 0); plug.rotateY(0.6); plug.translate(0.64, toLocalY(0.64, 0.38) + 0.013, 0.38); hw.push(plug);
    for (const sx of [-0.008, 0.008]) { const pin = box(0.003, 0.003, 0.02, 0, 0, 0); pin.rotateY(0.6); pin.translate(0.656 + sx, toLocalY(0.656, 0.4) + 0.013, 0.405); hw.push(pin); }
    const hwGeo = merge(hw); M.boxUV(hwGeo);
    mesh(hwGeo, M.get('steel', { color: 0x1a1c1e, tile: 0.3, roughness: 0.55 }), N);
    neonHalo = glowSprite(0xff3d9a, 0.5, 1.5);
    neonHalo.position.set(0, 0.74, 0.03);
    N.add(neonHalo);
  }

  // ================================================== 6. the paper plane ==
  let plane;
  {
    const c = makeCanvas(low ? 128 : 256, low ? 128 : 256), g = c.getContext('2d'), S = c.width, R = mulberry(55);
    g.fillStyle = '#f8f5ec'; g.fillRect(0, 0, S, S);
    g.strokeStyle = 'rgba(80,130,200,0.45)'; g.lineWidth = Math.max(1, S / 256);
    for (let y = S * 0.08; y < S; y += S * 0.07) { g.beginPath(); g.moveTo(0, y); g.lineTo(S, y); g.stroke(); }
    g.strokeStyle = 'rgba(220,70,70,0.5)'; g.beginPath(); g.moveTo(S * 0.18, 0); g.lineTo(S * 0.18, S); g.stroke();
    g.strokeStyle = 'rgba(60,60,70,0.7)'; g.lineWidth = S / 128; g.lineCap = 'round';
    const starPts = [];
    for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + k * Math.PI / 5, r = k % 2 ? S * 0.035 : S * 0.08; starPts.push([S * 0.7 + Math.cos(a) * r, S * 0.42 + Math.sin(a) * r]); }
    wobblyPath(g, starPts, R, S / 300, S / 40, true);
    g.fillStyle = 'rgba(60,60,70,0.75)'; g.textBaseline = 'middle';
    handText(g, 'wheee', S * 0.28, S * 0.72, S * 0.09, R, { weight: 'normal' });
    const P = { N: [0, 0.004, 0.17], C: [0, 0, -0.11], WL: [0.118, 0.02, -0.125], WR: [-0.118, 0.02, -0.125], K: [0, -0.034, -0.105] };
    const tris = [P.N, P.WL, P.C, P.N, P.C, P.WR, P.N, P.K, P.C];
    const pos = new Float32Array(27), uv = new Float32Array(18);
    tris.forEach((v, i) => {
      pos.set(v, i * 3);
      if (i < 6) uv.set([0.5 + v[0] / 0.26, (v[2] + 0.13) / 0.31], i * 2);
      else uv.set([(v[2] + 0.13) / 0.31, 0.5 + v[1] * 4], i * 2);
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.computeVertexNormals();
    plane = mesh(geo, new THREE.MeshStandardMaterial({ map: tex(c, 4), side: THREE.DoubleSide, roughness: 0.85 }), group, { cast: false, recv: false });
    plane.name = 'oddities-paper-plane';
    plane.rotation.order = 'YXZ';
    if (calm) {                                                       // parked on the terrace's south rail (top y 8.326)
      plane.position.set(-2.2, 8.326 + 0.035, 17.25);
      plane.rotation.set(0, Math.PI / 2, 0.06);
    }
  }
  function placePlane(t) {
    if (t === undefined) t = st.t;
    const om = 0.3, th = t * om;
    const rr = 3.85 + 0.3 * Math.sin(t * 0.21), drr = 0.063 * Math.cos(t * 0.21);
    const cth = Math.cos(th), sth = Math.sin(th);
    const vx = drr * cth - rr * om * sth, vz = drr * sth + rr * om * cth;
    const vy = 0.176 * Math.cos(t * 0.55) + 0.17 * Math.cos(t * 1.7 + 1.3);
    plane.position.set(PLANE.x + rr * cth, PLANE.y + 0.32 * Math.sin(t * 0.55) + 0.1 * Math.sin(t * 1.7 + 1.3), PLANE.z + rr * sth);
    plane.rotation.set(-Math.atan2(vy, Math.sqrt(vx * vx + vz * vz)), Math.atan2(vx, vz), 0.32 + 0.08 * Math.sin(t * 0.9));
  }
  if (!calm) placePlane(0);

  // ======================================================== 7. the sleeping cat ==
  const cat = new THREE.Group();
  cat.name = 'oddities-cat';
  cat.position.set(CAT.x, CAT.y, CAT.z);
  cat.rotation.y = Math.PI / 2 + 0.25;                              // curled along the seat, nose to the bench end
  cat.userData.action = { type: 'custom', id: 'odd-cat' };
  group.add(cat);
  pickables.push(cat);
  let catBody, catHead, zzz = null;
  const HEAD_Y = 0.1;
  {
    const GINGER = new THREE.Color(0xdb843c), DARK = new THREE.Color(0xa6511c), CREAM = new THREE.Color(0xf4e0c4);
    const PINK = new THREE.Color(0xdb7d86), EYE = new THREE.Color(0x3a2416);
    const seg = low ? [10, 7] : [14, 10];
    const colorBy = (geo, fn) => {
      const p = geo.attributes.position, a = new Float32Array(p.count * 3), c = new THREE.Color();
      for (let i = 0; i < p.count; i++) { fn(p.getX(i), p.getY(i), p.getZ(i), c); a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
      geo.setAttribute('color', new THREE.BufferAttribute(a, 3));
      return geo;
    };
    const ellip = (rx, ry, rz, x, y, z) => { const g = new THREE.SphereGeometry(1, seg[0], seg[1]); g.scale(rx, ry, rz); g.translate(x, y, z); return g; };
    const tabby = (x, y, z, c) => {
      const s = Math.sin(Math.atan2(z, x) * 9 + y * 26);
      c.copy(s > 0.42 ? DARK : GINGER);
      if (y < 0.035 && x > 0.05) c.lerp(CREAM, 0.6);
    };
    const bodyParts = [
      colorBy(ellip(0.19, 0.1, 0.15, 0, 0.09, 0), tabby),
      colorBy(ellip(0.11, 0.085, 0.1, -0.08, 0.11, -0.05), tabby),
      colorBy(ellip(0.03, 0.022, 0.03, 0.15, 0.025, -0.03), (x, y, z, c) => c.copy(CREAM)),
      colorBy(ellip(0.03, 0.022, 0.03, 0.165, 0.025, 0.012), (x, y, z, c) => c.copy(CREAM)),
    ];
    const tail = new THREE.TorusGeometry(0.17, 0.026, 6, low ? 14 : 20, 3.4);
    tail.rotateX(Math.PI / 2); tail.translate(0, 0.03, 0);
    bodyParts.push(colorBy(tail, (x, y, z, c) => { const a = Math.atan2(z, x); c.copy(Math.sin(a * 11) > 0.35 || a < 0.35 ? DARK : GINGER); }));
    const catMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88, flatShading: true });
    catBody = mesh(merge(bodyParts, true), catMat, cat);
    // head on a neck pivot so it can flick an ear at you
    catHead = new THREE.Group(); catHead.position.set(0.115, HEAD_Y, 0.05); cat.add(catHead);
    const h = [0.045, 0.0, 0.025];
    const head = [colorBy(ellip(0.068, 0.058, 0.066, h[0], h[1], h[2]), (x, y, z, c) => {
      c.copy(GINGER);
      if (y > 0.022 && x > 0.03 && Math.sin(z * 120) > 0.2) c.copy(DARK);   // the tabby "M"
      if (y < -0.03) c.lerp(CREAM, 0.5);
    })];
    for (const sz of [-1, 1]) {
      const ear = new THREE.ConeGeometry(0.027, 0.052, 4);
      ear.rotateX(sz * 0.38); ear.rotateZ(0.22);
      ear.translate(h[0] - 0.008, h[1] + 0.056, h[2] + sz * 0.036);
      head.push(colorBy(ear, (x, y, z, c) => c.copy(y > h[1] + 0.07 ? DARK : GINGER)));
    }
    head.push(colorBy(ellip(0.024, 0.017, 0.03, h[0] + 0.055, h[1] - 0.018, h[2]), (x, y, z, c) => c.copy(CREAM)));
    head.push(colorBy(ellip(0.0085, 0.0065, 0.01, h[0] + 0.077, h[1] - 0.007, h[2]), (x, y, z, c) => c.copy(PINK)));
    for (const sz of [-1, 1]) {
      const eye = new THREE.TorusGeometry(0.012, 0.0028, 4, 8, Math.PI);
      eye.rotateZ(Math.PI); eye.rotateY(Math.PI / 2);
      eye.translate(h[0] + 0.06, h[1] + 0.014, h[2] + sz * 0.025);
      head.push(colorBy(eye, (x, y, z, c) => c.copy(EYE)));
    }
    const headMesh = mesh(merge(head, true), catMat, catHead);
    headMesh.rotation.z = -0.12;                                      // chin tucked down onto its paws
    headMesh.scale.setScalar(1.12);                                   // a slightly big head: cuter
    if (!low && !calm) {
      const zc = makeCanvas(128, 128), zg = zc.getContext('2d'), ZR = mulberry(12);
      zg.strokeStyle = '#9fd0ff'; zg.lineWidth = 11; zg.lineCap = 'round'; zg.lineJoin = 'round';
      wobblyPath(zg, [[34, 36], [94, 34], [36, 94], [96, 92]], ZR, 2, 8, false);
      zzz = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex(zc, 1), transparent: true, opacity: 0, depthWrite: false }));
      zzz.scale.set(0.08, 0.08, 1);
      zzz.visible = false;
      cat.add(zzz);
    }
  }
  // The cat has taken the bench's first place (furniture.js seat (13, 0.45, 34.4), chosen as the seat nearest
  // the click). An invisible box over that end of the bench — enclosing furniture's sit proxy there — catches
  // the clicks first, so nobody is sat down on top of it; clicks past z 34.74 still pick the middle seat.
  {
    const seatTaken = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.66, 0.7), new THREE.MeshBasicMaterial({ visible: false }));
    seatTaken.position.set(13.0, 0.33, 34.39);                      // x 12.70–13.30, y 0–0.66 (just over the cat), z 34.04–34.74
    seatTaken.castShadow = false; seatTaken.receiveShadow = false;
    seatTaken.name = 'oddities-cat-seat';
    seatTaken.userData.action = cat.userData.action;
    group.add(seatTaken);
    pickables.push(seatTaken);
  }

  if (!KEEP_FORTUNE) {
    group.remove(vend);
    pickables.splice(pickables.indexOf(vend), 1);
    const ci = colliders.findIndex((c) => c.minX === VEND.x - 0.38 && c.minZ === VEND.z - 0.47);
    if (ci >= 0) colliders.splice(ci, 1);
  }
  if (!KEEP_SLEEPING_CAT) {
    for (const o of group.children.filter((c) => c === cat || c.name === 'oddities-cat-seat')) {
      group.remove(o);
      const pi = pickables.indexOf(o);
      if (pi >= 0) pickables.splice(pi, 1);
    }
  }

  // ============================================= 8. the lamp at the edge of the world ==
  let lampGlassMat, lampGlow;
  {
    const gy = heightAt(LAMP.x, LAMP.z);
    const L = new THREE.Group(); L.name = 'oddities-edge-lamp';
    L.position.set(LAMP.x, gy, LAMP.z); L.rotation.set(0, 0.3, 0.025);   // a little tired, leaning
    group.add(L);
    const iron = M.get('plaster', { color: 0x1f2a24, roughness: 0.5 });
    const parts = [];
    const cyl = (r0, r1, h, y, s = 14) => { const g = new THREE.CylinderGeometry(r0, r1, h, s); g.translate(0, y, 0); return g; };
    parts.push(cyl(0.15, 0.2, 0.5, 0.1, 16), cyl(0.11, 0.13, 0.08, 0.38), cyl(0.055, 0.075, 3.0, 1.9), cyl(0.085, 0.07, 0.07, 3.43), cyl(0.12, 0.12, 0.025, 3.475, 4).rotateY(Math.PI / 4));
    const LB = 3.49, LH = 0.36;                                       // lantern bottom and height
    for (let k = 0; k < 4; k++) {
      const a = Math.PI / 4 + k * Math.PI / 2, b = new THREE.Vector3(Math.cos(a) * 0.1, LB, Math.sin(a) * 0.1), t = new THREE.Vector3(Math.cos(a) * 0.135, LB + LH, Math.sin(a) * 0.135);
      const bar = new THREE.CylinderGeometry(0.009, 0.009, b.distanceTo(t), 5);
      bar.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), t.clone().sub(b).normalize()));
      bar.translate((b.x + t.x) / 2, (b.y + t.y) / 2, (b.z + t.z) / 2); parts.push(bar);
    }
    const roof = new THREE.ConeGeometry(0.22, 0.17, 4); roof.rotateY(Math.PI / 4); roof.translate(0, LB + LH + 0.085, 0); parts.push(roof);
    const fin = new THREE.SphereGeometry(0.028, 10, 8); fin.translate(0, LB + LH + 0.19, 0); parts.push(fin);
    const ironGeo = merge(parts); M.boxUV(ironGeo);
    mesh(ironGeo, iron, L);
    lampGlassMat = new THREE.MeshStandardMaterial({ color: 0xf2efe6, emissive: 0xffb25e, emissiveIntensity: 0.04, roughness: 0.15 });
    const glass = new THREE.CylinderGeometry(0.128, 0.094, LH - 0.01, 4, 1); glass.rotateY(Math.PI / 4); glass.translate(0, LB + LH / 2, 0);
    mesh(glass, lampGlassMat, L, { cast: false });
    lampGlow = glowSprite(0xffb25e, 0, 2.6);
    lampGlow.position.set(0, LB + LH / 2, 0); lampGlow.visible = false;
    L.add(lampGlow);
    colliders.push({ minX: LAMP.x - 0.2, maxX: LAMP.x + 0.2, minZ: LAMP.z - 0.2, maxZ: LAMP.z + 0.2, minY: gy - 0.2, maxY: gy + 4 });

    // the sign, facing back toward the campus
    const sx = LAMP.x + 1.5, sz = LAMP.z - 0.35, sy = heightAt(sx, sz);
    const Sg = new THREE.Group(); Sg.name = 'oddities-edge-sign';
    Sg.position.set(sx, sy, sz); Sg.rotation.set(0, Math.PI - 0.12, 0.035);
    group.add(Sg);
    const wood = [box(0.075, 1.75, 0.075, -0.62, 0.575, -0.05), box(0.075, 1.7, 0.075, 0.62, 0.55, -0.05), box(1.72, 0.86, 0.04, 0, 1.06, 0)];
    const woodGeo = merge(wood); M.boxUV(woodGeo);
    mesh(woodGeo, M.get('oakPlanks', { color: 0x9b9184, tile: 1.4 }), Sg);
    const SW = low ? 512 : 1024, SH = SW / 2, k = SW / 1024;
    const c = makeCanvas(SW, SH), g = c.getContext('2d'), R = mulberry(1979);
    g.fillStyle = '#8a6a4a'; g.fillRect(0, 0, SW, SH);
    g.strokeStyle = 'rgba(60,40,25,0.5)'; g.lineWidth = 2 * k;
    for (let i = 0; i < 26; i++) { const y = R() * SH; g.beginPath(); g.moveTo(0, y); for (let x = 0; x <= SW; x += 40 * k) g.lineTo(x, y + Math.sin(x / (90 * k) + i) * 6 * k); g.stroke(); }
    for (let i = 0; i < 420; i++) {                                    // dry-brushed white paint, the edges left raw
      const y = 26 * k + R() * (SH - 52 * k), x0 = 18 * k + R() * 60 * k, x1 = SW - 18 * k - R() * 60 * k;
      g.strokeStyle = `rgba(242,238,228,${0.12 + R() * 0.2})`; g.lineWidth = (6 + R() * 16) * k;
      g.beginPath(); g.moveTo(x0, y); g.lineTo(x1, y + (R() - 0.5) * 8 * k); g.stroke();
    }
    g.fillStyle = '#23408e'; g.textBaseline = 'alphabetic';
    const l1 = handWidth(g, 'you found', 175 * k, HAND), l2 = handWidth(g, 'the edge', 190 * k, HAND);
    handText(g, 'you found', (SW - l1) / 2, 215 * k, 175 * k, R, { jitter: 0.07 });
    handText(g, 'the edge', (SW - l2) / 2 + 20 * k, 430 * k, 190 * k, R, { jitter: 0.07 });
    g.strokeStyle = '#23408e'; g.lineCap = 'round';
    for (let i = 0; i < 7; i++) {                                       // drips
      const x = SW * 0.2 + R() * SW * 0.6, y = (R() < 0.5 ? 220 : 435) * k, L = (14 + R() * 38) * k;
      g.lineWidth = (5 + R() * 4) * k; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (R() - 0.5) * 2 * k, y + L); g.stroke();
    }
    g.save(); g.globalCompositeOperation = 'destination-out';           // brush streaks through the letters
    for (let i = 0; i < 90; i++) { g.strokeStyle = `rgba(0,0,0,${0.1 + R() * 0.25})`; g.lineWidth = (1 + R() * 3) * k; const y = R() * SH; g.beginPath(); g.moveTo(R() * SW * 0.3, y); g.lineTo(SW * 0.7 + R() * SW * 0.3, y + (R() - 0.5) * 6 * k); g.stroke(); }
    g.restore();
    g.globalCompositeOperation = 'destination-over'; g.fillStyle = '#8a6a4a'; g.fillRect(0, 0, SW, SH); g.globalCompositeOperation = 'source-over';
    const face = new THREE.PlaneGeometry(1.7, 0.85); face.translate(0, 1.06, 0.0205);
    mesh(face, new THREE.MeshStandardMaterial({ map: tex(c, 8), roughness: 0.85 }), Sg, { cast: false });
    const sxw = Math.abs(Math.cos(Sg.rotation.y)) * 0.9 + 0.1, szw = Math.abs(Math.sin(Sg.rotation.y)) * 0.9 + 0.1;
    colliders.push({ minX: sx - sxw, maxX: sx + sxw, minZ: sz - szw, maxZ: sz + szw, minY: sy - 0.2, maxY: sy + 1.6 });
  }

  // ================================================================ behaviour ==
  const voices = shuffled(PHONE_VOICES), fortunes = shuffled(FORTUNES);
  let voiceI = 0, fortuneI = 0;
  // Per-frame numbers live on one object: doubles in closure variables would be boxed every frame.
  const st = {
    t: 0, clock: 0, ringIn: 18 + Math.random() * 10, ringT: -1, chimes: 0, neonNext: 5, neonStut: 0,
    vendNext: 9, vendStutter: 0, cardT: -1, twitch: 0, lampOn: false, lampT: 0, lampLevel: 0,
  };
  const RING = 3.9;
  const toast = (text) => { try { ctx.ui?.toast?.(text); } catch (e) { /* the joke is optional */ } };

  function update(dt, frame) {
    st.clock += dt;
    const t = st.t = frame && typeof frame.time === 'number' ? frame.time : st.clock;
    const cam = frame && frame.camera ? frame.camera.position : null;

    // 2 · the kiosk rings: two bursts, the lamp blinks, the phone rattles on its board
    st.ringIn -= dt;
    if (st.ringIn <= 0 && st.ringT < 0) { st.ringT = 0; st.chimes = 0; st.ringIn = 40 + Math.random() * 10; }
    if (st.ringT >= 0) {
      st.ringT += dt;
      const burst = st.ringT < 1.6 || (st.ringT > 2.2 && st.ringT < 3.8);
      // heard only out on the plaza near it (not from the hall, the pavilions or upstairs)
      const near = cam && cam.y < 6 && cam.z > 17.6 && (cam.x - KIOSK.x) * (cam.x - KIOSK.x) + (cam.z - KIOSK.z) * (cam.z - KIOSK.z) < 20 * 20;
      if (st.chimes === 0 || (st.chimes === 1 && st.ringT > 2.2)) { if (near) ctx.audio?.chime?.(); st.chimes++; }
      if (calm) kioskLamp.emissiveIntensity = 4;
      else {
        kioskLamp.emissiveIntensity = burst && ((st.ringT * 6) % 1) < 0.55 ? 6 : 0.2;
        phone.rotation.z = burst ? Math.sin(st.ringT * 80) * 0.014 : 0;
        phone.position.x = burst ? Math.sin(st.ringT * 57) * 0.002 : 0;
      }
      if (st.ringT > RING) { st.ringT = -1; kioskLamp.emissiveIntensity = 0.15; phone.rotation.z = 0; phone.position.x = 0; }
    }

    // 3 · the machine's tube stutters now and then; the card slides out
    if (!calm && KEEP_FORTUNE) {
      st.vendNext -= dt;
      if (st.vendNext <= 0) { st.vendStutter = 0.45; st.vendNext = 14 + Math.random() * 14; }
      if (st.vendStutter > 0) { st.vendStutter -= dt; vendFront.emissiveIntensity = Math.sin(st.vendStutter * 40) > 0 ? 0.15 : 0.75; }
      else vendFront.emissiveIntensity = 0.75;
    }
    if (st.cardT >= 0) {
      st.cardT += dt;
      const k = calm ? 1 : 1 - Math.pow(1 - Math.min(1, st.cardT / 0.5), 3);
      card.position.y = 0.33 - 0.09 * k; card.position.z = 0.4 + 0.015 * k;
      if (st.cardT > 7) { card.visible = false; st.cardT = -1; }
    }

    // 4 · the boulder breathes in the air
    if (!calm) {
      boulder.position.y = BOULDER.y + 0.1 * Math.sin(t * 0.84);
      boulder.rotation.set(0.05 + 0.03 * Math.sin(t * 0.5), 0.35 + t * 0.045, -0.04 + 0.025 * Math.sin(t * 0.37 + 1));
      placePebbles();
    }

    // 5 · the neon hums, and sometimes loses its nerve
    if (!calm) {
      st.neonNext -= dt;
      if (st.neonNext <= 0) { st.neonStut = 0.4; st.neonNext = 4 + Math.random() * 8; }
      let k = 1 + 0.045 * Math.sin(t * 2.1) + 0.025 * Math.sin(t * 6.3 + 1);
      if (st.neonStut > 0) { st.neonStut -= dt; k *= Math.sin(st.neonStut * 48) > 0.25 ? 0.22 : 0.9; }
      neonMat.emissiveIntensity = NEON_GLOW * k;
      neonHalo.material.opacity = 0.5 * k;
    }

    // 6 · lazy loops over the roof terrace, banking into the turn
    if (!calm) placePlane();

    // 7 · the cat breathes; a "z" drifts up when someone is near enough to see it
    if (!calm && KEEP_SLEEPING_CAT) {
      const b = Math.sin(t * 1.85);
      catBody.scale.set(1 + 0.018 * b, 1 + 0.035 * b, 1 + 0.012 * b);
      catHead.position.y = HEAD_Y + 0.003 * b;
      if (st.twitch > 0) { st.twitch = Math.max(0, st.twitch - dt); catHead.rotation.x = Math.sin(st.twitch * 30) * 0.08 * st.twitch; }
      if (zzz) {
        const near = cam && (cam.x - CAT.x) * (cam.x - CAT.x) + (cam.z - CAT.z) * (cam.z - CAT.z) < 12 * 12;
        const p = (t % 4.6) / 3.2;
        zzz.visible = !!near && p <= 1;
        if (zzz.visible) {
          zzz.position.set(0.16 + 0.05 * p + 0.015 * Math.sin(p * 7), 0.2 + 0.26 * p, 0.06);
          zzz.material.opacity = 0.9 * Math.sin(p * Math.PI);
          const s = 0.05 + 0.05 * p; zzz.scale.set(s, s, 1);
        }
      }
    }

    // 8 · the lamp at the edge wakes when someone comes near
    if (cam) {
      const dx = cam.x - LAMP.x, dz = cam.z - LAMP.z, d2 = dx * dx + dz * dz;
      if (!st.lampOn && d2 < LAMP_WAKE * LAMP_WAKE) { st.lampOn = true; st.lampT = 0; }
      else if (st.lampOn && d2 > LAMP_SLEEP * LAMP_SLEEP) { st.lampOn = false; st.lampT = 0; }
    }
    st.lampT += dt;
    let lv;
    if (calm) lv = st.lampOn ? 1 : 0;
    else if (st.lampOn) { const f = st.lampT; lv = f < 0.08 ? 0.9 : f < 0.22 ? 0.04 : f < 0.3 ? 0.6 : f < 0.5 ? 0.08 : Math.min(1, 0.3 + (f - 0.5) * 0.9); }
    else lv = Math.max(0, st.lampLevel - dt * 1.4);
    if (lv !== st.lampLevel) {
      st.lampLevel = lv;
      lampGlassMat.emissiveIntensity = 0.04 + 5.5 * lv;
      lampGlow.material.opacity = 0.85 * lv;
      lampGlow.visible = lv > 0.01;
    }
  }

  function onPick(object) {
    const id = object && object.userData && object.userData.action && object.userData.action.id;
    if (id === 'odd-phone') {
      if (st.ringT >= 0) { st.ringT = RING + 1; st.chimes = 2; }                 // answered: the next update hangs the bell up
      toast(`“${voices[voiceI++ % voices.length]}”`);
    } else if (id === 'odd-vending') {
      const [f, pt] = fortunes[fortuneI++ % fortunes.length];
      toast(`${pt ? 'A sua sorte' : 'Your fortune'}: “${f}”`);
      ctx.audio?.click?.();
      st.cardT = 0; card.visible = true;
    } else if (id === 'odd-cat') {
      toast('The cat ignores you. Correctly.');
      if (!calm) st.twitch = 0.5;
    }
  }

  return { group, regions: [], colliders, pickables, update, onPick };
}
