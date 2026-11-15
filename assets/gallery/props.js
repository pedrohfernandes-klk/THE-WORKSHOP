// props.js — the furniture and small real-world details of THE WORKSHOP hall.
// Lectern + printed catalogue (interactive), attendant's chair, exit sign,
// extinguisher, sprinkler heads, smoke detectors, floor grilles.
// Everything is procedural: canvas textures, bevelled boxes, lathes, instancing.
import * as THREE from 'three';

const DEG = Math.PI / 180;
const TAU = Math.PI * 2;

/* ------------------------------------------------------------------ */
/* geometry helpers                                                    */
/* ------------------------------------------------------------------ */

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3(1, 1, 1);

/** Transform a geometry in place: position + euler rotation. */
function put(g, x, y, z, rx = 0, ry = 0, rz = 0) {
  _e.set(rx, ry, rz);
  _q.setFromEuler(_e);
  _p.set(x, y, z);
  _m.compose(_p, _q, _s);
  g.applyMatrix4(_m);
  return g;
}

function roundedRectShape(w, h, r) {
  const s = new THREE.Shape();
  const x = -w / 2, y = -h / 2;
  r = Math.max(1e-4, Math.min(r, w / 2, h / 2));
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.absarc(x + w - r, y + r, r, -Math.PI / 2, 0, false);
  s.lineTo(x + w, y + h - r);
  s.absarc(x + w - r, y + h - r, r, 0, Math.PI / 2, false);
  s.lineTo(x + r, y + h);
  s.absarc(x + r, y + h - r, r, Math.PI / 2, Math.PI, false);
  s.lineTo(x, y + r);
  s.absarc(x + r, y + r, r, Math.PI, Math.PI * 1.5, false);
  return s;
}

/** Box w×h×d (x,y,z) with eased edges of radius r, centred on the origin. */
function rbox(w, h, d, r = 0.003) {
  r = Math.min(r, w / 2 - 1e-4, h / 2 - 1e-4, d / 2 - 1e-4);
  const id = Math.max(d - 2 * r, 1e-4);
  const g = new THREE.ExtrudeGeometry(roundedRectShape(w - 2 * r, h - 2 * r, r * 0.8), {
    depth: id,
    bevelEnabled: true,
    bevelThickness: r,
    bevelSize: r,
    bevelSegments: 2,
    curveSegments: 3,
  });
  g.translate(0, 0, -id / 2);
  return g;
}

/** Beam between two points in the y-z plane (square-ish section w × t). */
function beamYZ(x, y0, z0, y1, z1, w, t, r = 0.003) {
  const len = Math.hypot(y1 - y0, z1 - z0);
  const g = rbox(w, len, t, r);
  return put(g, x, (y0 + y1) / 2, (z0 + z1) / 2, Math.atan2(z1 - z0, y1 - y0), 0, 0);
}

/** Tapered square leg (top side a, bottom side b), axis vertical. */
function taperLeg(x, z, y0, y1, a, b) {
  const g = new THREE.CylinderGeometry(a / Math.SQRT2, b / Math.SQRT2, y1 - y0, 4, 1);
  g.rotateY(Math.PI / 4);
  return put(g, x, (y0 + y1) / 2, z);
}

/** Wood-grain UVs in metres: grain runs along the part's longest axis. */
function grain(g, seed = 0) {
  g.computeBoundingBox();
  const sz = new THREE.Vector3();
  g.boundingBox.getSize(sz);
  const dims = [sz.x, sz.y, sz.z];
  let a = 0;
  if (dims[1] > dims[a]) a = 1;
  if (dims[2] > dims[a]) a = 2;
  const P = g.attributes.position, N = g.attributes.normal;
  let uv = g.attributes.uv;
  if (!uv) {
    uv = new THREE.BufferAttribute(new Float32Array(P.count * 2), 2);
    g.setAttribute('uv', uv);
  }
  const p = [0, 0, 0];
  for (let i = 0; i < P.count; i++) {
    const nx = Math.abs(N.getX(i)), ny = Math.abs(N.getY(i)), nz = Math.abs(N.getZ(i));
    const na = nx >= ny && nx >= nz ? 0 : ny >= nz ? 1 : 2;
    p[0] = P.getX(i); p[1] = P.getY(i); p[2] = P.getZ(i);
    let ua = a, va;
    if (na === a) {
      ua = a === 0 ? 1 : 0;
      va = a === 2 ? 1 : 2;
    } else {
      va = 3 - a - na;
    }
    uv.setXY(i, p[ua] + seed, p[va] * 2 + seed * 0.37);
  }
  uv.needsUpdate = true;
  return g;
}

/** Merge non-instanced geometries sharing one material (position/normal/uv). */
function merge(list) {
  const parts = list.map((g) => (g.index ? g.toNonIndexed() : g));
  let n = 0;
  for (const g of parts) n += g.attributes.position.count;
  const P = new Float32Array(n * 3), N = new Float32Array(n * 3), U = new Float32Array(n * 2);
  let o = 0;
  for (const g of parts) {
    const c = g.attributes.position.count;
    P.set(g.attributes.position.array, o * 3);
    N.set(g.attributes.normal.array, o * 3);
    if (g.attributes.uv) U.set(g.attributes.uv.array, o * 2);
    o += c;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(P, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(N, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(U, 2));
  out.computeBoundingBox();
  out.computeBoundingSphere();
  return out;
}

function lathe(points, segs) {
  return new THREE.LatheGeometry(points.map((p) => new THREE.Vector2(p[0], p[1])), segs);
}

/* ------------------------------------------------------------------ */
/* canvas textures                                                     */
/* ------------------------------------------------------------------ */

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

function srgbTex(c, aniso = 8) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = aniso;
  return t;
}

/** Oiled-oak grain, tileable; 1 UV unit = 1 m along the grain, 0.5 m across. */
function makeWoodTexture(W) {
  const H = W / 2;
  const c = canvas(W, H);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(W, H);
  const d = img.data;
  const R = rng(7);
  const rows = new Float32Array(1024);
  for (let i = 0; i < rows.length; i++) rows[i] = R();
  for (let y = 0; y < H; y++) {
    const v = y / H;
    for (let x = 0; x < W; x++) {
      const u = x / W;
      const r = v * 26 + 2.6 * Math.sin(TAU * (u + 2 * v)) + 1.3 * Math.sin(TAU * (3 * u + 5 * v + 0.3)) + 0.6 * Math.sin(TAU * (7 * u + 11 * v));
      const t = r - Math.floor(r);
      const late = Math.pow(t, 2.8);
      const streak = rows[(y * 7 + (x >> 5) * 13) & 1023] * 0.6 + rows[(y * 3 + (x >> 4) * 29 + 5) & 1023] * 0.4;
      const px = (R() - 0.5) * 0.05;
      const k = 1 - 0.13 * late - 0.14 * streak + px + 0.03 + (rows[(y * 5) & 1023] - 0.5) * 0.08;
      const i = (y * W + x) * 4;
      d[i] = Math.min(255, 158 * k);
      d[i + 1] = Math.min(255, 112 * k);
      d[i + 2] = Math.min(255, 68 * k);
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const t = srgbTex(c, 8);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** Soft rounded-rect shadow blob with alpha (black). */
function makeShadowTexture(w, h, inset, blur) {
  const c = canvas(w, h);
  const ctx = c.getContext('2d');
  ctx.shadowColor = '#000';
  ctx.shadowBlur = blur;
  ctx.shadowOffsetX = 10000;
  ctx.fillStyle = '#000';
  const rx = inset, ry = inset, rw = w - inset * 2, rh = h - inset * 2, rad = Math.min(rw, rh) * 0.18;
  ctx.beginPath();
  ctx.moveTo(rx + rad - 10000, ry);
  ctx.arcTo(rx + rw - 10000, ry, rx + rw - 10000, ry + rh, rad);
  ctx.arcTo(rx + rw - 10000, ry + rh, rx - 10000, ry + rh, rad);
  ctx.arcTo(rx - 10000, ry + rh, rx - 10000, ry, rad);
  ctx.arcTo(rx - 10000, ry, rx + rw - 10000, ry, rad);
  ctx.closePath();
  ctx.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function shadowPlane(tex, w, d, opacity, flat = true) {
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(w, d),
    new THREE.MeshBasicMaterial({
      map: tex, color: 0x000000, transparent: true, opacity,
      depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    })
  );
  if (flat) m.rotation.x = -Math.PI / 2;
  m.renderOrder = 1;
  return m;
}

/* ---- fonts ---- */

let fontsPromise = null;
function loadFonts() {
  if (fontsPromise) return fontsPromise;
  if (typeof FontFace === 'undefined' || typeof document === 'undefined' || !document.fonts) {
    fontsPromise = Promise.resolve();
    return fontsPromise;
  }
  const base = new URL('../fonts/', import.meta.url);
  const defs = [
    ['Instrument Serif', 'instrument-serif-400.woff2', '400'],
    ['Instrument Sans', 'instrument-sans-variable.woff2', '400 700'],
  ];
  fontsPromise = Promise.all(
    defs.map(([fam, file, weight]) => {
      const ff = new FontFace(fam, `url(${new URL(file, base).href})`, { weight, style: 'normal' });
      return ff.load().then((f) => { document.fonts.add(f); }).catch(() => {});
    })
  ).then(() => {});
  return fontsPromise;
}

/* ---- catalogue cover ---- */

const DEFAULT_PALETTE = [
  { hex: '#9c4a2f', share: 0.3 }, { hex: '#cf8d52', share: 0.22 }, { hex: '#2c2320', share: 0.2 },
  { hex: '#d9c8a6', share: 0.16 }, { hex: '#5d6e5c', share: 0.12 },
];

function wrapLines(ctx, text, maxW) {
  const words = String(text).trim().split(/\s+/);
  const lines = [];
  let cur = '';
  for (const w of words) {
    const t = cur ? cur + ' ' + w : w;
    if (ctx.measureText(t).width <= maxW || !cur) cur = t;
    else { lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  return lines;
}

function drawCover(c, title, palette) {
  const W = c.width, H = c.height, k = W / 1024;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#f4efe6';
  ctx.fillRect(0, 0, W, H);
  // paper tooth
  const R = rng(11);
  for (let i = 0; i < 9000 * k; i++) {
    ctx.fillStyle = R() > 0.5 ? 'rgba(120,98,66,0.035)' : 'rgba(255,255,255,0.25)';
    const s = (1 + R() * 1.5) * k;
    ctx.fillRect(R() * W, R() * H, s, s);
  }
  // hinge groove along the spine side
  ctx.fillStyle = 'rgba(70,52,30,0.10)';
  ctx.fillRect(58 * k, 0, 3 * k, H);
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.fillRect(61 * k, 0, 2 * k, H);

  const M = 96 * k;
  const ink = '#15120e';
  const sans = '"Instrument Sans", system-ui, sans-serif';
  const serif = '"Instrument Serif", Georgia, serif';

  // imprint
  ctx.fillStyle = ink;
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  if ('letterSpacing' in ctx) ctx.letterSpacing = `${4.2 * k}px`;
  ctx.font = `600 ${23 * k}px ${sans}`;
  ctx.fillText('THE WORKSHOP · HrM', M, 128 * k);
  ctx.fillStyle = 'rgba(21,18,14,0.16)';
  ctx.fillRect(M, 156 * k, W - 2 * M, 2 * k);

  // title, anchored above the band
  ctx.fillStyle = ink;
  if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
  const maxW = W - 2 * M;
  let size = 184 * k, lines = [];
  for (; size >= 84 * k; size -= 8 * k) {
    ctx.font = `400 ${size}px ${serif}`;
    lines = wrapLines(ctx, title || 'Your exhibition', maxW);
    const widest = Math.max(...lines.map((l) => ctx.measureText(l).width));
    if (lines.length <= 4 && widest <= maxW) break;
  }
  const lh = size * 0.98;
  const lastBase = H - 318 * k;
  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i], M - 4 * k, lastBase - (lines.length - 1 - i) * lh);
  }

  // palette band, proportional
  const pal = (palette && palette.length ? palette : DEFAULT_PALETTE).filter((p) => p && p.share > 0);
  const total = pal.reduce((a, p) => a + p.share, 0) || 1;
  const by = H - 262 * k, bh = 34 * k;
  let x = M;
  for (let i = 0; i < pal.length; i++) {
    const w = i === pal.length - 1 ? M + maxW - x : (pal[i].share / total) * maxW;
    ctx.fillStyle = pal[i].hex;
    ctx.fillRect(x, by, w + (i < pal.length - 1 ? 0.5 : 0), bh);
    x += w;
  }

  // caption
  ctx.fillStyle = 'rgba(21,18,14,0.58)';
  if ('letterSpacing' in ctx) ctx.letterSpacing = `${3.4 * k}px`;
  ctx.font = `500 ${19 * k}px ${sans}`;
  ctx.fillText('EXHIBITION CATALOGUE', M, H - 176 * k);
  if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
}

/* ---- pictograms ---- */

function makeExitTexture() {
  const W = 1024, H = 350;
  const c = canvas(W, H);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#05703d';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#fff';
  ctx.strokeStyle = '#fff';
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // running figure
  const cx = 330, cy = 172;
  ctx.beginPath(); ctx.arc(cx + 34, cy - 100, 27, 0, TAU); ctx.fill();
  ctx.lineWidth = 30;
  const poly = (pts) => { ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]); ctx.stroke(); };
  poly([[cx + 24, cy - 52], [cx - 12, cy + 28]]);                         // torso
  poly([[cx + 20, cy - 44], [cx + 68, cy - 6], [cx + 104, cy - 38]]);     // front arm
  poly([[cx + 18, cy - 44], [cx - 28, cy - 14], [cx - 64, cy - 44]]);     // back arm
  poly([[cx - 12, cy + 28], [cx + 44, cy + 52], [cx + 30, cy + 112]]);    // front leg
  poly([[cx - 12, cy + 28], [cx - 46, cy + 80], [cx - 100, cy + 60]]);    // back leg

  // arrow
  ctx.lineWidth = 24;
  poly([[520, cy], [640, cy]]);
  ctx.beginPath(); ctx.moveTo(636, cy - 52); ctx.lineTo(706, cy); ctx.lineTo(636, cy + 52); ctx.closePath(); ctx.fill();

  // door
  ctx.lineWidth = 22;
  ctx.lineJoin = 'miter';
  ctx.lineCap = 'butt';
  poly([[748, 306], [748, 52], [900, 52], [900, 306]]);
  ctx.beginPath(); ctx.moveTo(748, 306); ctx.lineTo(748, 66); ctx.lineTo(820, 92); ctx.lineTo(820, 290); ctx.closePath(); ctx.fill();
  return srgbTex(c, 8);
}

function makeFireSignTexture() {
  const S = 256;
  const c = canvas(S, S);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#c3201b';
  ctx.fillRect(0, 0, S, S);
  ctx.fillStyle = '#fff';
  ctx.strokeStyle = '#fff';
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  // extinguisher
  ctx.beginPath(); ctx.roundRect(62, 104, 62, 112, 18); ctx.fill();       // body
  ctx.fillRect(81, 80, 24, 28);                                           // neck
  ctx.beginPath(); ctx.moveTo(78, 80); ctx.lineTo(112, 68); ctx.lineTo(142, 76); ctx.lineTo(142, 88); ctx.lineTo(108, 84); ctx.lineTo(80, 94); ctx.closePath(); ctx.fill();
  ctx.lineWidth = 8;
  ctx.beginPath(); ctx.moveTo(82, 90); ctx.bezierCurveTo(46, 94, 38, 130, 44, 168); ctx.stroke(); // hose
  // flame
  ctx.beginPath();
  ctx.moveTo(196, 214);
  ctx.bezierCurveTo(160, 206, 158, 164, 182, 140);
  ctx.bezierCurveTo(182, 158, 192, 160, 196, 150);
  ctx.bezierCurveTo(200, 126, 190, 118, 192, 98);
  ctx.bezierCurveTo(226, 124, 238, 168, 226, 196);
  ctx.bezierCurveTo(222, 206, 210, 214, 196, 214);
  ctx.closePath();
  ctx.fill();
  // jet
  ctx.lineWidth = 6;
  ctx.setLineDash([2, 10]);
  ctx.beginPath(); ctx.moveTo(44, 172); ctx.lineTo(150, 196); ctx.stroke();
  return srgbTex(c, 8);
}

function drawExtLabel(c) {
  const W = c.width, H = c.height, k = W / 384;
  const ctx = c.getContext('2d');
  const sans = '"Instrument Sans", system-ui, sans-serif';
  ctx.fillStyle = '#efece4';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#16140f';
  ctx.fillRect(0, 0, W, 78 * k);
  ctx.fillStyle = '#f4efe6';
  ctx.textAlign = 'center';
  ctx.font = `700 ${40 * k}px ${sans}`;
  ctx.fillText('ABC POWDER', W / 2, 54 * k);
  ctx.fillStyle = '#c3201b';
  ctx.beginPath();
  ctx.moveTo(W / 2, 100 * k);
  ctx.bezierCurveTo(W / 2 - 58 * k, 150 * k, W / 2 - 50 * k, 210 * k, W / 2, 226 * k);
  ctx.bezierCurveTo(W / 2 + 50 * k, 210 * k, W / 2 + 58 * k, 150 * k, W / 2, 100 * k);
  ctx.fill();
  ctx.fillStyle = '#16140f';
  ctx.font = `700 ${46 * k}px ${sans}`;
  ctx.fillText('6 kg', W / 2, 290 * k);
  ctx.fillStyle = 'rgba(22,20,15,0.55)';
  const R = rng(5);
  for (let i = 0; i < 9; i++) {
    const w = (120 + R() * 110) * k;
    ctx.fillRect((W - w) / 2, (318 + i * 20) * k, w, 6 * k);
  }
  ctx.textAlign = 'left';
}

function makeGaugeTexture() {
  const c = canvas(128, 128);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#e8e6df';
  ctx.beginPath(); ctx.arc(64, 64, 62, 0, TAU); ctx.fill();
  ctx.lineWidth = 12;
  ctx.strokeStyle = '#c3201b';
  ctx.beginPath(); ctx.arc(64, 64, 44, 0.75 * Math.PI, 1.0 * Math.PI); ctx.stroke();
  ctx.strokeStyle = '#1f8f4a';
  ctx.beginPath(); ctx.arc(64, 64, 44, 1.0 * Math.PI, 1.9 * Math.PI); ctx.stroke();
  ctx.strokeStyle = '#c3201b';
  ctx.beginPath(); ctx.arc(64, 64, 44, 1.9 * Math.PI, 2.25 * Math.PI); ctx.stroke();
  ctx.strokeStyle = '#111';
  ctx.lineWidth = 5;
  ctx.beginPath(); ctx.moveTo(64, 64); ctx.lineTo(64 + 38 * Math.cos(1.45 * Math.PI), 64 + 38 * Math.sin(1.45 * Math.PI)); ctx.stroke();
  return srgbTex(c, 4);
}

/* ------------------------------------------------------------------ */
/* createProps                                                         */
/* ------------------------------------------------------------------ */

export function createProps(scene, { quality = 'high', reducedMotion = false } = {}) {
  const hi = quality !== 'low';
  const root = new THREE.Group();
  root.name = 'props';
  scene.add(root);

  const colliders = [];
  const pickables = [];
  const seats = []; // places to sit (sit contract): { x, y, z, facing: [fx, fz] }, world metres
  const disposables = [];

  /* ---- shared materials ---- */
  const woodTex = makeWoodTexture(hi ? 1024 : 512);
  disposables.push(woodTex);
  const oakMat = new THREE.MeshStandardMaterial({ map: woodTex, color: 0xffffff, roughness: 0.55, metalness: 0 });
  const steelMat = new THREE.MeshStandardMaterial({ color: 0x232325, metalness: 1, roughness: 0.45 });
  const brassMat = new THREE.MeshStandardMaterial({ color: 0xb8924f, metalness: 1, roughness: 0.34 });
  const bronzeMat = new THREE.MeshStandardMaterial({ color: 0x7a5a36, metalness: 1, roughness: 0.4 });
  const whiteMat = new THREE.MeshStandardMaterial({ color: 0xf1efea, metalness: 0, roughness: 0.5 });
  const rubberMat = new THREE.MeshStandardMaterial({ color: 0x0e0e0e, metalness: 0, roughness: 0.7 });
  disposables.push(oakMat, steelMat, brassMat, whiteMat, rubberMat);

  const shadowBlob = makeShadowTexture(128, 128, 36, 22);
  disposables.push(shadowBlob);

  const meshOf = (geo, mat, name) => {
    const m = new THREE.Mesh(geo, mat);
    m.name = name;
    disposables.push(geo);
    return m;
  };

  /* ================================================================ */
  /* 1. Lectern + catalogue                                            */
  /* ================================================================ */
  const LEC = { x: -2.4, z: 11.4, rotY: 0.75 };
  const TH = 15 * DEG;
  const SLAB = { w: 0.55, d: 0.42, t: 0.03 };
  const FRONT_H = 1.05;
  const pivotY = FRONT_H + (SLAB.d / 2) * Math.sin(TH);
  const TILT = new THREE.Matrix4()
    .makeTranslation(0, pivotY, 0)
    .multiply(new THREE.Matrix4().makeRotationX(TH));

  const lec = new THREE.Group();
  lec.name = 'catalogue-lectern';
  lec.position.set(LEC.x, 0, LEC.z);
  lec.rotation.y = LEC.rotY;
  root.add(lec);

  {
    const oak = [], steel = [], brass = [];
    const tiltOak = (g, seed) => { grain(g, seed); g.applyMatrix4(TILT); oak.push(g); };

    // oak reading top (tilt-local: y=0 is the top surface, +z runs downhill to the reader)
    tiltOak(put(rbox(SLAB.w, SLAB.t, SLAB.d, 0.005), 0, -SLAB.t / 2, 0), 1.3);
    // book ledge at the lower edge
    tiltOak(put(rbox(SLAB.w, 0.024, 0.022, 0.0055), 0, 0.012, SLAB.d / 2 - 0.011), 2.1);
    // under-top steel mounting plate
    {
      const g = put(rbox(0.3, 0.008, 0.22, 0.002), 0, -SLAB.t - 0.004, 0.0);
      g.applyMatrix4(TILT); steel.push(g);
    }
    // blackened-steel base, collar and column (lectern-local, not tilted)
    steel.push(put(rbox(0.42, 0.02, 0.32, 0.005), 0, 0.013, 0));
    steel.push(put(rbox(0.11, 0.1, 0.075, 0.005), 0, 0.073, -0.01));
    steel.push(put(rbox(0.07, 0.98, 0.05, 0.004), 0, 0.59, -0.01));
    steel.push(put(rbox(0.1, 0.04, 0.07, 0.004), 0, 1.045, -0.01));
    // brass band + four brass screws
    brass.push(put(rbox(0.076, 0.016, 0.056, 0.002), 0, 0.92, -0.01));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      brass.push(put(new THREE.CylinderGeometry(0.0065, 0.0065, 0.004, 12), sx * 0.18, 0.025, sz * 0.13));
    }

    const oakMesh = meshOf(merge(oak), oakMat, 'lectern-oak');
    const steelMesh = meshOf(merge(steel), steelMat, 'lectern-steel');
    const brassMesh = meshOf(merge(brass), brassMat, 'lectern-brass');
    lec.add(oakMesh, steelMesh, brassMesh);
    pickables.push(oakMesh, steelMesh, brassMesh);
  }

  // soft contact shadow on the floor
  {
    const s = shadowPlane(shadowBlob, 0.98, 0.86, 0.5);
    s.position.set(0, 0.0015, -0.01);
    lec.add(s);
  }

  // the tilted frame that carries the book
  const tiltG = new THREE.Group();
  tiltG.position.y = pivotY;
  tiltG.rotation.x = TH;
  lec.add(tiltG);

  // catalogue book (portrait, 245 × 305 mm, ~18 mm thick)
  const COVER_W = 0.245, COVER_H = 0.305;
  const coverCanvas = canvas(hi ? 1536 : 1024, hi ? 1912 : 1274);
  const coverTex = new THREE.CanvasTexture(coverCanvas);
  coverTex.colorSpace = THREE.SRGBColorSpace;
  coverTex.anisotropy = 16;
  disposables.push(coverTex);
  const coverMat = new THREE.MeshStandardMaterial({
    map: coverTex, color: 0xd9d3c8, roughness: 0.72, metalness: 0,
    emissive: 0xffc98a, emissiveMap: coverTex, emissiveIntensity: 0.05,
  });
  disposables.push(coverMat);

  let coverState = { title: 'Your exhibition', palette: DEFAULT_PALETTE };
  const redrawCover = () => {
    drawCover(coverCanvas, coverState.title, coverState.palette);
    coverTex.needsUpdate = true;
  };
  redrawCover();

  {
    const book = new THREE.Group();
    book.name = 'catalogue-book';
    book.position.set(0.004, 0, SLAB.d / 2 - 0.022 - COVER_H / 2 - 0.004);
    book.rotation.y = 0.045;
    tiltG.add(book);

    const y0 = 0.0004;
    const boardMat = new THREE.MeshStandardMaterial({ color: 0xd8d0c0, roughness: 0.8 });
    const pageC = canvas(8, 128);
    {
      const x = pageC.getContext('2d');
      x.fillStyle = '#ece5d4'; x.fillRect(0, 0, 8, 128);
      for (let i = 0; i < 128; i += 2) { x.fillStyle = i % 4 ? 'rgba(150,130,95,0.28)' : 'rgba(255,255,255,0.35)'; x.fillRect(0, i, 8, 1); }
    }
    const pageTex = srgbTex(pageC, 4);
    const pageMat = new THREE.MeshStandardMaterial({ map: pageTex, roughness: 0.92 });
    disposables.push(boardMat, pageMat, pageTex);

    const boards = [];
    boards.push(put(rbox(COVER_W, 0.0026, COVER_H, 0.0008), 0, y0 + 0.0013, 0));
    boards.push(put(rbox(COVER_W, 0.0026, COVER_H, 0.0008), 0, y0 + 0.0026 + 0.0125 + 0.0013, 0));
    boards.push(put(rbox(0.0045, 0.0178, COVER_H, 0.0016), -COVER_W / 2 + 0.00225, y0 + 0.0089, 0));
    const boardMesh = meshOf(merge(boards), boardMat, 'catalogue-boards');
    const pages = meshOf(new THREE.BoxGeometry(COVER_W - 0.013, 0.0125, COVER_H - 0.007), pageMat, 'catalogue-pages');
    pages.position.set(0.0015, y0 + 0.0026 + 0.00625, 0);
    const coverTop = y0 + 0.0026 * 2 + 0.0125;
    const cover = meshOf(new THREE.PlaneGeometry(COVER_W, COVER_H), coverMat, 'catalogue-cover');
    cover.rotation.x = -Math.PI / 2;
    cover.position.y = coverTop + 0.0001;
    const bs = shadowPlane(shadowBlob, COVER_W + 0.05, COVER_H + 0.05, 0.55, false);
    bs.rotation.x = -Math.PI / 2;
    bs.position.y = 0.0002;
    book.add(boardMesh, pages, cover, bs);
    pickables.push(boardMesh, pages, cover);
  }

  // generous invisible pick proxy around lectern + book
  {
    const proxy = new THREE.Mesh(
      new THREE.BoxGeometry(0.66, 1.3, 0.56),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    proxy.position.set(0, 0.65, 0);
    proxy.name = 'catalogue-pick';
    lec.add(proxy);
    disposables.push(proxy.geometry, proxy.material);
    pickables.push(proxy);
  }
  for (const o of pickables) o.userData.prop = 'catalogue';

  // collider: top + base footprint, rotated into world, +0.25 m
  function footprintAABB(cx, cz, rotY, rects, margin) {
    const c = Math.cos(rotY), s = Math.sin(rotY);
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const [x0, x1, z0, z1] of rects) {
      for (const lx of [x0, x1]) for (const lz of [z0, z1]) {
        const wx = cx + lx * c + lz * s;
        const wz = cz - lx * s + lz * c;
        if (wx < minX) minX = wx; if (wx > maxX) maxX = wx;
        if (wz < minZ) minZ = wz; if (wz > maxZ) maxZ = wz;
      }
    }
    return { minX: minX - margin, maxX: maxX + margin, minZ: minZ - margin, maxZ: maxZ + margin };
  }
  colliders.push(footprintAABB(LEC.x, LEC.z, LEC.rotY, [
    [-SLAB.w / 2, SLAB.w / 2, -SLAB.d / 2 * Math.cos(TH), SLAB.d / 2 * Math.cos(TH)],
    [-0.21, 0.21, -0.16, 0.16],
  ], 0.25));

  /* ================================================================ */
  /* 2. Attendant's chair                                              */
  /* ================================================================ */
  const CH = { x: 5.75, z: -15.8, rotY: -0.61 };
  {
    const oak = [];
    const add = (g, seed) => { grain(g, seed); oak.push(g); };
    const SEAT_Y = 0.45;
    const LX = 0.18;

    add(put(rbox(0.44, 0.032, 0.42, 0.009), 0, SEAT_Y - 0.016, 0.005), 0.4);
    // front legs (tapered)
    for (const sx of [-1, 1]) add(taperLeg(sx * LX, 0.165, 0, SEAT_Y - 0.02, 0.036, 0.024), sx);
    // rear legs (slightly splayed) rising into raked back posts
    const rake = -0.065 / 0.41;
    const zAt = (y) => -0.175 + (y - SEAT_Y) * rake;
    for (const sx of [-1, 1]) {
      add(beamYZ(sx * LX, 0, -0.205, SEAT_Y, -0.175, 0.034, 0.03, 0.004), sx + 3);
      add(beamYZ(sx * LX, SEAT_Y - 0.01, zAt(SEAT_Y - 0.01), 0.86, zAt(0.86), 0.03, 0.028, 0.0045), sx + 5);
    }
    // seat aprons
    add(put(rbox(0.34, 0.06, 0.022, 0.003), 0, SEAT_Y - 0.032 - 0.03, 0.165), 1.7);
    add(put(rbox(0.34, 0.06, 0.022, 0.003), 0, SEAT_Y - 0.032 - 0.03, -0.172), 2.7);
    for (const sx of [-1, 1]) add(put(rbox(0.022, 0.06, 0.31, 0.003), sx * LX, SEAT_Y - 0.032 - 0.03, -0.004), 3.7 + sx);
    // low stretchers
    for (const sx of [-1, 1]) add(put(rbox(0.02, 0.026, 0.36, 0.003), sx * LX, 0.17, -0.0125), 8 + sx);
    add(put(rbox(0.34, 0.022, 0.02, 0.003), 0, 0.17, 0.165), 9.1);
    add(put(rbox(0.34, 0.022, 0.02, 0.003), 0, 0.17, -0.194), 9.9);
    // back: two slats and a top rail, all on the rake
    const rakeAng = Math.atan2(-0.065, 0.41);
    for (const [yy, hh, tt, sd] of [[0.595, 0.05, 0.016, 11], [0.685, 0.05, 0.016, 12.5], [0.80, 0.08, 0.024, 13.5]]) {
      add(put(rbox(0.36, hh, tt, 0.004), 0, yy, zAt(yy), rakeAng, 0, 0), sd);
    }
    const chair = new THREE.Group();
    chair.name = 'attendant-chair';
    chair.position.set(CH.x, 0, CH.z);
    chair.rotation.y = CH.rotY;
    const mesh = meshOf(merge(oak), oakMat, 'chair-oak');
    chair.add(mesh);
    const s = shadowPlane(shadowBlob, 0.82, 0.86, 0.42);
    s.position.set(0, 0.0015, -0.01);
    chair.add(s);
    root.add(chair);
    colliders.push(footprintAABB(CH.x, CH.z, CH.rotY, [[-0.23, 0.23, -0.26, 0.23]], 0.2));

    // Sitting (sit contract): one place at the centre of the seat slab
    // (chair-local z = 0.005, top y = SEAT_Y), facing where the chair faces —
    // local +z, away from the raked back — rotated into world as footprintAABB
    // does. An invisible pick proxy a little larger than the whole chair is hit
    // before the oak, so a click anywhere on the chair sits the visitor down.
    const SEAT_CZ = 0.005;
    const cosY = Math.cos(CH.rotY), sinY = Math.sin(CH.rotY);
    const chairSeat = { x: CH.x + SEAT_CZ * sinY, y: SEAT_Y, z: CH.z + SEAT_CZ * cosY, facing: [sinY, cosY] };
    seats.push(chairSeat);
    const proxy = new THREE.Mesh(
      new THREE.BoxGeometry(0.48, 0.9, 0.5),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    proxy.position.set(0, 0.45, -0.02);
    proxy.name = 'chair-sit-pick';
    proxy.userData.action = { type: 'sit', seats: [chairSeat] };
    chair.add(proxy);
    disposables.push(proxy.geometry, proxy.material);
    pickables.push(proxy);
  }

  /* ================================================================ */
  /* 3. Exit sign                                                      */
  /* ================================================================ */
  {
    const tex = makeExitTexture();
    disposables.push(tex);
    const grp = new THREE.Group();
    grp.name = 'exit-sign';
    grp.position.set(0, 3.95, 16.96);
    const body = meshOf(rbox(0.4, 0.15, 0.05, 0.004), whiteMat, 'exit-body');
    const faceMat = new THREE.MeshStandardMaterial({
      map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 1.5, roughness: 0.4, metalness: 0,
    });
    disposables.push(faceMat);
    const face = meshOf(new THREE.PlaneGeometry(0.378, 0.128), faceMat, 'exit-face');
    face.rotation.y = Math.PI;               // faces into the hall (-z)
    face.position.z = -0.0252;
    // slim wall bracket
    const br = meshOf(rbox(0.05, 0.024, 0.012, 0.002), steelMat, 'exit-bracket');
    br.position.set(0, 0.0, 0.028);
    grp.add(body, face, br);
    root.add(grp);
    const sh = shadowPlane(shadowBlob, 0.62, 0.3, 0.22, false);
    sh.rotation.y = Math.PI;
    sh.position.set(0, 3.95, 16.9985);
    root.add(sh);
  }

  /* ================================================================ */
  /* 4. Fire extinguisher + sign                                       */
  /* ================================================================ */
  let extLabelCanvas, extLabelTex;
  {
    const EX = { x: 1.75, y: 0.15, z: 16.912 };
    const g = new THREE.Group();
    g.name = 'extinguisher';
    g.position.set(EX.x, EX.y, EX.z);
    root.add(g);

    const redMat = new THREE.MeshPhysicalMaterial({ color: 0xb01218, roughness: 0.36, metalness: 0.1, clearcoat: 0.6, clearcoatRoughness: 0.3 });
    const chromeMat = new THREE.MeshStandardMaterial({ color: 0xc9c9c9, metalness: 1, roughness: 0.28 });
    const greyMat = new THREE.MeshStandardMaterial({ color: 0x9a9ca0, metalness: 0.85, roughness: 0.42 });
    disposables.push(redMat, chromeMat, greyMat);
    const segs = hi ? 48 : 24;

    // body: lathe with rolled base, long straight wall, domed shoulder, neck
    const prof = [[0, 0.014], [0.04, 0.014], [0.052, 0.005], [0.0665, 0.0], [0.0735, 0.007], [0.0755, 0.022], [0.0755, 0.33]];
    for (let i = 1; i <= 12; i++) {
      const a = (i / 12) * Math.PI / 2;
      prof.push([0.032 + 0.0435 * Math.cos(a), 0.33 + 0.1 * Math.sin(a)]);
    }
    prof.push([0.032, 0.445]);
    const redParts = [lathe(prof, segs)];

    // levers (extruded side profile, handles toward +x)
    const leverShape = (pts) => {
      const s = new THREE.Shape();
      s.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) s.lineTo(pts[i][0], pts[i][1]);
      s.closePath();
      return s;
    };
    const ext = (pts, depth) => {
      const geo = new THREE.ExtrudeGeometry(leverShape(pts), { depth, bevelEnabled: true, bevelThickness: 0.0015, bevelSize: 0.0015, bevelSegments: 1 });
      geo.translate(0, 0, -depth / 2);
      return geo;
    };
    redParts.push(ext([[-0.02, 0.484], [-0.016, 0.506], [0.07, 0.51], [0.106, 0.494], [0.104, 0.485], [0.07, 0.492], [0.0, 0.489]], 0.016));
    redParts.push(ext([[-0.018, 0.466], [0.0, 0.47], [0.062, 0.471], [0.1, 0.462], [0.098, 0.454], [0.06, 0.458], [0.0, 0.455]], 0.016));
    const redMesh = meshOf(merge(redParts), redMat, 'ext-red');

    // valve in brass
    const valve = [];
    valve.push(put(new THREE.CylinderGeometry(0.03, 0.03, 0.016, 24), 0, 0.438, 0));
    valve.push(put(new THREE.CylinderGeometry(0.022, 0.024, 0.05, 24), 0, 0.47, 0));
    valve.push(put(new THREE.CylinderGeometry(0.0105, 0.0105, 0.05, 16), -0.03, 0.462, 0, 0, 0, Math.PI / 2)); // hose outlet
    valve.push(put(new THREE.CylinderGeometry(0.006, 0.006, 0.024, 12), 0.0, 0.452, -0.03, Math.PI / 2, 0, 0)); // gauge stem
    const valveMesh = meshOf(merge(valve), brassMat, 'ext-valve');

    // label
    extLabelCanvas = canvas(384, 576);
    drawExtLabel(extLabelCanvas);
    extLabelTex = srgbTex(extLabelCanvas, 8);
    disposables.push(extLabelTex);
    const labelGeo = new THREE.CylinderGeometry(0.0762, 0.0762, 0.2, 32, 1, true, Math.PI - 55 * DEG, 110 * DEG);
    const label = meshOf(labelGeo, new THREE.MeshStandardMaterial({ map: extLabelTex, roughness: 0.5 }), 'ext-label');
    label.position.y = 0.205;

    // gauge face
    const gTex = makeGaugeTexture();
    disposables.push(gTex);
    const gauge = meshOf(new THREE.CircleGeometry(0.0185, 24), new THREE.MeshStandardMaterial({ map: gTex, roughness: 0.3 }), 'ext-gauge');
    gauge.rotation.y = Math.PI;
    gauge.position.set(0, 0.452, -0.0435);
    const gaugeRim = meshOf(new THREE.CylinderGeometry(0.0205, 0.0205, 0.012, 24), chromeMat, 'ext-gauge-rim');
    gaugeRim.rotation.x = Math.PI / 2;
    gaugeRim.position.set(0, 0.452, -0.0385);

    // hose: from valve outlet down the left of the body, nozzle horn at the end
    const hoseCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.052, 0.462, 0.0),
      new THREE.Vector3(-0.092, 0.452, -0.012),
      new THREE.Vector3(-0.108, 0.41, -0.03),
      new THREE.Vector3(-0.104, 0.34, -0.046),
      new THREE.Vector3(-0.094, 0.27, -0.052),
      new THREE.Vector3(-0.082, 0.235, -0.058),
    ]);
    const hose = meshOf(new THREE.TubeGeometry(hoseCurve, 40, 0.0085, 10, false), rubberMat, 'ext-hose');
    const endP = hoseCurve.getPoint(1), tan = hoseCurve.getTangent(1);
    const horn = meshOf(new THREE.CylinderGeometry(0.017, 0.008, 0.06, 16, 1, true), rubberMat, 'ext-horn');
    horn.material = rubberMat.clone(); horn.material.side = THREE.DoubleSide; disposables.push(horn.material);
    horn.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tan);
    horn.position.copy(endP).addScaledVector(tan, 0.026);
    // safety pin + ring
    const pin = meshOf(new THREE.TorusGeometry(0.011, 0.0015, 8, 20), chromeMat, 'ext-pin');
    pin.position.set(0.036, 0.482, 0.0);
    pin.rotation.x = Math.PI / 2;

    // wall bracket: back plate, strap ring, base tray
    const brk = [];
    brk.push(put(rbox(0.064, 0.34, 0.006, 0.002), 0, 0.16, 0.085));
    brk.push(put(rbox(0.05, 0.03, 0.02, 0.002), 0, 0.29, 0.074));
    brk.push(put(rbox(0.05, 0.022, 0.03, 0.002), 0, 0.0, 0.072));
    brk.push(lathe([[0.0762, -0.016], [0.0805, -0.016], [0.0805, 0.016], [0.0762, 0.016]], segs).translate(0, 0.29, 0));
    brk.push(lathe([[0.0, -0.008], [0.0825, -0.008], [0.0825, 0.014], [0.0782, 0.014], [0.0782, -0.003], [0.0, -0.003]], segs));
    const brkMesh = meshOf(merge(brk), greyMat, 'ext-bracket');

    g.add(redMesh, valveMesh, label, gauge, gaugeRim, hose, horn, pin, brkMesh);

    // soft wall contact shadow behind
    const ws = shadowPlane(shadowBlob, 0.4, 0.78, 0.22, false);
    ws.rotation.y = Math.PI;
    ws.position.set(EX.x, 0.42, 16.9985);
    root.add(ws);

    // sign above
    const sTex = makeFireSignTexture();
    disposables.push(sTex);
    const sg = new THREE.Group();
    sg.name = 'extinguisher-sign';
    sg.position.set(EX.x, 1.5, 16.9985);
    const plate = meshOf(rbox(0.15, 0.15, 0.004, 0.002), whiteMat, 'sign-plate');
    plate.position.z = -0.0005;
    const face = meshOf(new THREE.PlaneGeometry(0.144, 0.144), new THREE.MeshStandardMaterial({ map: sTex, roughness: 0.45 }), 'sign-face');
    face.rotation.y = Math.PI;
    face.position.z = -0.0026;
    sg.add(plate, face);
    root.add(sg);
    const ss = shadowPlane(shadowBlob, 0.26, 0.26, 0.28, false);
    ss.rotation.y = Math.PI;
    ss.position.set(EX.x, 1.5, 16.999);
    root.add(ss);
  }

  /* ================================================================ */
  /* 5. Ceiling: sprinkler heads + smoke detectors                     */
  /* ================================================================ */
  {
    const segs = hi ? 20 : 10;
    const escGeo = lathe([[0.0, 0.0006], [0.036, 0.0006], [0.036, -0.0035], [0.028, -0.0062], [0.0165, -0.0062], [0.0165, -0.0075], [0.0, -0.0075]], segs);
    const headGeo = merge([
      lathe([[0.0, -0.0062], [0.0095, -0.0062], [0.0095, -0.021], [0.0072, -0.0215], [0.0072, -0.0265], [0.0, -0.0265]], segs),
      lathe([[0.0072, -0.0265], [0.0072, -0.0305], [0.0185, -0.0325], [0.0185, -0.0345], [0.0, -0.0345]], segs),
    ]);
    const xs = [-5.45, -3.1, 3.1, 5.45];
    const zs = [];
    for (let z = -15; z <= 12; z += 3) zs.push(z);
    const n = xs.length * zs.length;
    const esc = new THREE.InstancedMesh(escGeo, whiteMat, n);
    const head = new THREE.InstancedMesh(headGeo, brassMat, n);
    const M = new THREE.Matrix4();
    let i = 0;
    for (const x of xs) for (const z of zs) {
      M.makeTranslation(x, 6.4, z);
      esc.setMatrixAt(i, M); head.setMatrixAt(i, M); i++;
    }
    esc.frustumCulled = head.frustumCulled = false;
    esc.name = 'sprinkler-escutcheons'; head.name = 'sprinkler-heads';
    root.add(esc, head);
    disposables.push(escGeo, headGeo);

    const detGeo = lathe([[0.0, 0.0006], [0.056, 0.0006], [0.056, -0.011], [0.051, -0.018], [0.034, -0.0255], [0.0, -0.027]], hi ? 32 : 16);
    const detGeo2 = lathe([[0.0, -0.027], [0.012, -0.027], [0.012, -0.0285], [0.0, -0.0285]], 12);
    const dets = [[-3.1, -10.5], [3.1, -4.5], [-3.1, 4.5], [3.1, 10.5]];
    const det = new THREE.InstancedMesh(detGeo, whiteMat, dets.length);
    const detL = new THREE.InstancedMesh(detGeo2, new THREE.MeshStandardMaterial({ color: 0xd8d6d0, roughness: 0.4 }), dets.length);
    dets.forEach(([x, z], k) => { M.makeTranslation(x, 6.4, z); det.setMatrixAt(k, M); detL.setMatrixAt(k, M); });
    det.frustumCulled = detL.frustumCulled = false;
    det.name = 'smoke-detectors'; detL.name = 'smoke-detector-caps';
    root.add(det, detL);
    disposables.push(detGeo, detGeo2, detL.material);
  }

  /* ================================================================ */
  /* 6. Floor grilles                                                  */
  /* ================================================================ */
  {
    const GL = 1.6, GW = 0.12, BORDER = 0.012;
    const outer = roundedRectShape(GW, GL, 0.003);
    const hole = new THREE.Path();
    const hw = GW / 2 - BORDER, hl = GL / 2 - BORDER;
    hole.moveTo(-hw, -hl); hole.lineTo(-hw, hl); hole.lineTo(hw, hl); hole.lineTo(hw, -hl); hole.closePath();
    outer.holes.push(hole);
    const frameGeo = new THREE.ExtrudeGeometry(outer, { depth: 0.0035, bevelEnabled: false });
    frameGeo.rotateX(-Math.PI / 2);
    const voidGeo = new THREE.PlaneGeometry(GW, GL);
    voidGeo.rotateX(-Math.PI / 2);
    const finGeo = new THREE.BoxGeometry(GW - 2 * BORDER + 0.004, 0.0028, 0.0085);
    const PITCH = 0.0225;
    const nFins = Math.floor((GL - 2 * BORDER) / PITCH);
    const spots = [[-6.05, -14.5], [-6.05, 14.5], [6.05, -14.5], [6.05, 14.5]];
    const frames = new THREE.InstancedMesh(frameGeo, bronzeMat, spots.length);
    const voidMat = new THREE.MeshStandardMaterial({ color: 0x080605, roughness: 1, metalness: 0 });
    const voids = new THREE.InstancedMesh(voidGeo, voidMat, spots.length);
    const finMat = new THREE.MeshStandardMaterial({ color: 0x6f5232, metalness: 1, roughness: 0.45 });
    const fins = new THREE.InstancedMesh(finGeo, finMat, spots.length * nFins);
    const M = new THREE.Matrix4();
    let fi = 0;
    spots.forEach(([x, z], k) => {
      M.makeTranslation(x, 0.0, z); frames.setMatrixAt(k, M);
      M.makeTranslation(x, 0.0014, z); voids.setMatrixAt(k, M);
      for (let j = 0; j < nFins; j++) {
        M.makeTranslation(x, 0.0019, z - ((nFins - 1) / 2) * PITCH + j * PITCH);
        fins.setMatrixAt(fi++, M);
      }
    });
    frames.frustumCulled = voids.frustumCulled = fins.frustumCulled = false;
    frames.name = 'grille-frames'; voids.name = 'grille-voids'; fins.name = 'grille-fins';
    root.add(frames, voids, fins);
    disposables.push(frameGeo, voidGeo, finGeo, voidMat, finMat);
  }

  /* ---- fonts: redraw text-bearing canvases when they arrive ---- */
  loadFonts().then(() => {
    redrawCover();
    drawExtLabel(extLabelCanvas);
    extLabelTex.needsUpdate = true;
  });

  /* ---- API ---- */
  let warm = 0.05;
  const lx = LEC.x, lz = LEC.z;

  return {
    colliders,
    pickables,
    seats,
    setCatalogueCover({ title, palette } = {}) {
      coverState = {
        title: title || coverState.title,
        palette: palette && palette.length ? palette : coverState.palette,
      };
      redrawCover();
    },
    update(dt, camera) {
      // the catalogue catches a slightly warmer light as you approach
      const dx = camera.position.x - lx, dz = camera.position.z - lz;
      const target = dx * dx + dz * dz < 12 ? 0.12 : 0.05;
      warm += (target - warm) * Math.min(1, dt * 2.5);
      coverMat.emissiveIntensity = warm;
    },
    dispose() {
      scene.remove(root);
      for (const d of disposables) d.dispose && d.dispose();
    },
  };
}
