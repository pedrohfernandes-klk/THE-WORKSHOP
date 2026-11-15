// school.js — EPI / ETIC, Lisbon: the long low cream-rendered building south of the plaza,
// its forecourt (limestone pavement, granite kerb, bollards) and two enterable classrooms.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

export function build(ctx) {
  const { M, quality } = ctx;
  const low = quality === 'low';
  const group = new THREE.Group(); group.name = 'school';
  const colliders = [], pickables = [], regions = [];
  const PI = Math.PI;

  // ---------- helpers ----------
  const _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(1, 1, 1);
  const Tm = (x = 0, y = 0, z = 0, ry = 0, rx = 0, rz = 0) => { _e.set(rx, ry, rz, 'YXZ'); _q.setFromEuler(_e); return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), _q, _s); };
  const mul = (a, b) => new THREE.Matrix4().multiplyMatrices(a, b);
  const buckets = new Map();
  function P(mat, geo, m, uv = true) {
    if (m) geo.applyMatrix4(m);
    if (uv) M.boxUV(geo);
    let b = buckets.get(mat); if (!b) { b = []; buckets.set(mat, b); } b.push(geo);
  }
  const BX = (mat, w, h, d, x, y, z, m = null) => { const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y, z); P(mat, g, m); };
  const CY = (mat, r, h, x, y, z, m = null, seg = 20) => { const g = new THREE.CylinderGeometry(r, r, h, low ? 10 : seg); g.translate(x, y, z); P(mat, g, m); };
  function flush() {
    for (const [mat, geos] of buckets) {
      for (const g of geos) for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
      const anyIdx = geos.some(g => g.index), allIdx = geos.every(g => g.index);
      const list = anyIdx && !allIdx ? geos.map(g => g.index ? g.toNonIndexed() : g) : geos;
      const merged = mergeGeometries(list, false);
      if (!merged) continue;
      const mesh = new THREE.Mesh(merged, mat);
      mesh.castShadow = !mat.userData.noShadow; mesh.receiveShadow = true;
      group.add(mesh);
    }
    buckets.clear();
  }
  const insts = new Map();
  function I(key, geo, mat, m) { let e = insts.get(key); if (!e) { e = { geo, mat, ms: [] }; insts.set(key, e); } e.ms.push(m); }
  function flushInst() {
    for (const e of insts.values()) {
      const im = new THREE.InstancedMesh(e.geo, e.mat, e.ms.length);
      e.ms.forEach((m, i) => im.setMatrixAt(i, m));
      im.castShadow = !e.mat.userData.noShadow; im.receiveShadow = true; im.instanceMatrix.needsUpdate = true;
      group.add(im);
    }
  }
  function addPlane(mat, w, h, m, { shadow = false } = {}) {
    const g = new THREE.PlaneGeometry(w, h); g.applyMatrix4(m);
    const mesh = new THREE.Mesh(g, mat); mesh.receiveShadow = true; mesh.castShadow = shadow; group.add(mesh); return mesh;
  }
  const col = (minX, maxX, minZ, maxZ, minY = 0, maxY = 3.6) => colliders.push({ minX, maxX, minZ, maxZ, minY, maxY });

  // ---------- sit contract (main.js seats the visitor on the listed place nearest the click) ----------
  // A place is { x, y (seat top), z, facing: [fx, fz] } in world metres. Every chair gets one pick
  // proxy (invisible MATERIAL, visible object) boxing its seat, backrest and legs, so a ray that
  // reaches the chair meets the proxy first; it carries { type: 'sit', seats: [its place] }.
  const seats = [];
  const sitMat = new THREE.MeshBasicMaterial({ visible: false });
  const mm = v => Math.round(v * 1000) / 1000 || 0;   // drop float noise (and -0)
  // box in the chair's own frame: w along room u (the chair's depth), d along room lz, from y0 to y1
  const sitBox = (w, d, y0, y1) => new THREE.BoxGeometry(w, y1 - y0, d).translate(0, (y0 + y1) / 2, 0);
  function sitProxy(geo, m, place, name) {
    const p = new THREE.Mesh(geo, sitMat);
    p.name = name; p.applyMatrix4(m);
    p.userData.action = { type: 'sit', seats: [place] };
    group.add(p); pickables.push(p); seats.push(place);
  }
  // student chair: seat 0.42 x 0.42 centred on the place, backrest 0.2 behind it, top 0.79 -> 2-3 cm to spare
  const chairBox = sitBox(0.47, 0.46, 0, 0.82);

  // ---------- fonts + canvas textures ----------
  const redraws = [];
  function canvasTex(w, h, draw, { text = false, repeat = null, srgb = true } = {}) {
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    const g = cv.getContext('2d'); draw(g, w, h);
    const t = new THREE.CanvasTexture(cv);
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.anisotropy = 8;
    if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
    if (text) redraws.push(() => { g.clearRect(0, 0, w, h); draw(g, w, h); t.needsUpdate = true; });
    return t;
  }
  try {
    const defs = [
      ['Instrument Sans', '../../fonts/instrument-sans-variable.woff2', { weight: '400 700' }],
      ['Instrument Serif', '../../fonts/instrument-serif-400.woff2', {}],
      ['Instrument Serif', '../../fonts/instrument-serif-400-italic.woff2', { style: 'italic' }],
    ];
    Promise.all(defs.map(([n, u, d]) => new FontFace(n, `url(${new URL(u, import.meta.url)})`, d).load().then(f => { document.fonts.add(f); })))
      .then(() => redraws.forEach(r => r())).catch(() => {});
  } catch (e) { /* fonts optional */ }
  let seed = 7; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const SANS = '"Instrument Sans", Helvetica, Arial, sans-serif', SERIF = '"Instrument Serif", Georgia, serif';

  // ---------- materials ----------
  const render = M.get('plaster', { color: 0xe8e1d2 });
  render.color.setRGB(1.9, 1.78, 1.45);
  const renderIn = M.get('plaster', { color: 0xf1ece1 });
  renderIn.color.setRGB(2.4, 2.2, 1.85);
  const renderBlue = M.get('plaster', { color: 0x7d97ad });
  const ceilMat = M.get('plaster', { color: 0xf6f4ee });
  ceilMat.color.setRGB(2.6, 2.5, 2.3);
  const ironMat = M.get('steel', { color: 0x1a1c1f, roughness: 0.45 });
  const whiteSteel = M.get('steel', { color: 0xeeeeea, roughness: 0.5 });
  const steel = M.get('steel', { color: 0x9aa0a6, roughness: 0.35 });
  const granite = M.get('concreteWall', { color: 0x6f7173, roughness: 0.6 });
  const asphalt = M.get('gravel', { color: 0x2b2c2e, roughness: 0.95 });
  const oakM = M.get('oak');
  const darkWood = M.get('darkWood');
  const terrazzo = M.get('terrazzo');
  const resinFloor = M.get('concreteFloor', { color: 0xb9bec2, roughness: 0.4 });
  const plankFloor = M.get('oakPlanks');
  const laminate = new THREE.MeshStandardMaterial({ color: 0xd9c7a3, roughness: 0.45 });
  const plasticBlue = new THREE.MeshStandardMaterial({ color: 0x3a6ea5, roughness: 0.5 });
  const plasticGrey = new THREE.MeshStandardMaterial({ color: 0x59636b, roughness: 0.5 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x15171a, roughness: 0.5 });
  const glassMat = new THREE.MeshPhysicalMaterial({ color: 0x9fb6c2, roughness: 0.04, metalness: 0, transparent: true, opacity: 0.28, envMapIntensity: 1.6, clearcoat: 1 });
  glassMat.userData.noShadow = true;
  const ledMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff4e0, emissiveIntensity: 2.6, roughness: 0.4 });
  ledMat.userData.noShadow = true;

  // ---------- 1. FAÇADE (z = 56 face, facing -z) ----------
  const ZF = 56, ZI = 56.5, H = 7.0, XE = 21.65;
  function panelWall(x0, x1, y0, y1, z0, z1, holes, mat) {
    const hs = holes.map(h => ({ x0: h.x0, x1: h.x1, y0: Math.max(h.y0, y0), y1: Math.min(h.y1, y1) })).sort((a, b) => a.x0 - b.x0);
    const d = z1 - z0, zc = (z0 + z1) / 2; let cur = x0;
    for (const h of hs) {
      if (h.x0 > cur + 1e-4) BX(mat, h.x0 - cur, y1 - y0, d, (cur + h.x0) / 2, (y0 + y1) / 2, zc);
      if (h.y0 > y0 + 1e-4) BX(mat, h.x1 - h.x0, h.y0 - y0, d, (h.x0 + h.x1) / 2, (y0 + h.y0) / 2, zc);
      if (h.y1 < y1 - 1e-4) BX(mat, h.x1 - h.x0, y1 - h.y1, d, (h.x0 + h.x1) / 2, (h.y1 + y1) / 2, zc);
      cur = h.x1;
    }
    if (x1 > cur + 1e-4) BX(mat, x1 - cur, y1 - y0, d, (cur + x1) / 2, (y0 + y1) / 2, zc);
  }
  const glassCx = [3.4, 10, 16.6], rCx = [6.7, 13.3, 19.9], pilCx = [1.5, 5.3, 8.1, 11.9, 14.7, 18.5];
  const fHoles = [{ x0: -0.95, x1: 0.95, y0: -1, y1: 2.6 }];
  for (const s of [-1, 1]) {
    for (const c of glassCx) fHoles.push({ x0: c - 1.6, x1: c + 1.6, y0: 0.2, y1: 3.5 }.constructor === Object ? { x0: s * c - 1.6, x1: s * c + 1.6, y0: 0.2, y1: 3.5 } : null);
    for (const c of rCx) fHoles.push({ x0: s * c - 1.1, x1: s * c + 1.1, y0: 0.2, y1: 3.5 });
  }
  panelWall(-XE, XE, 0, H, ZF, ZI, fHoles, render);
  // recessed plain render panels
  for (const s of [-1, 1]) for (const c of rCx) BX(render, 2.2, 3.3, 0.35, s * c, 1.85, 56.325);
  // glass-block panels (recessed 0.15 m)
  const glassBlockTex = canvasTex(512, 512, (g, w, h) => {
    const n = 16, c = w / n; g.fillStyle = 'rgba(205,210,205,1)'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const x = i * c, y = j * c, k = (Math.sin(i * 12.9 + j * 78.2) * 43758.5) % 1;
      const gr = g.createLinearGradient(x, y, x + c, y + c);
      gr.addColorStop(0, `rgba(${215 + k * 10 | 0},240,${225 + k * 8 | 0},0.78)`); gr.addColorStop(0.5, 'rgba(228,248,238,0.62)'); gr.addColorStop(1, 'rgba(180,215,205,0.78)');
      g.fillStyle = gr; g.fillRect(x + 2.5, y + 2.5, c - 5, c - 5);
      g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 1.5; g.strokeRect(x + 6, y + 6, c - 12, c - 12);
    }
  });
  const glassBlockMat = new THREE.MeshStandardMaterial({ map: glassBlockTex, transparent: true, roughness: 0.12, metalness: 0.05, emissive: 0xcfeee0, emissiveMap: glassBlockTex, emissiveIntensity: 0.28, envMapIntensity: 1.4, side: THREE.DoubleSide });
  const gbDims = (w, h) => { glassBlockTex.repeat.set(w / 3.2, h / 3.3); };
  gbDims(3.2, 3.3); glassBlockTex.wrapS = glassBlockTex.wrapT = THREE.RepeatWrapping;
  for (const s of [-1, 1]) for (const c of glassCx) {
    // 3.2 m x 3.3 m = 16 x 16.5 blocks of 0.2 m (texture is 16x16 squares over 3.2 x 3.2 + slight stretch)
    addPlane(glassBlockMat, 3.2, 3.3, Tm(s * c, 1.85, 56.2, PI));
    BX(whiteSteel, 3.2, 0.04, 0.12, s * c, 0.2, 56.2); BX(whiteSteel, 3.2, 0.04, 0.12, s * c, 3.5, 56.2);
  }
  // cylindrical pilasters + caps
  for (const s of [-1, 1]) for (const c of pilCx) {
    CY(render, 0.3, 3.7, s * c, 1.85, ZF, null, 28);
    CY(render, 0.34, 0.1, s * c, 3.62, ZF, null, 28); CY(render, 0.34, 0.12, s * c, 0.06, ZF, null, 28);
  }
  // rounded corners (front and back)
  for (const sx of [-1, 1]) {
    CY(render, 0.35, H, sx * XE, H / 2, 56.35, null, 24);
    CY(render, 0.35, H, sx * XE, H / 2, 71.65, null, 24);
  }
  // roof slab and plain parapet coping
  const roofMat = M.get('concreteFloor', { color: 0x6c6a66 });
  BX(roofMat, 43, 0.3, 15.5, 0, H - 0.5, 64);
  BX(render, 43.3, 0.1, 0.52, 0, H + 0.04, 56.25); // plain coping line
  // doorway: dark recess behind the glass door
  BX(dark, 1.9, 2.6, 0.04, 0, 1.3, 56.48);
  BX(ironMat, 0.06, 2.6, 0.5, -0.95, 1.3, 56.25); BX(ironMat, 0.06, 2.6, 0.5, 0.95, 1.3, 56.25); BX(ironMat, 1.96, 0.06, 0.5, 0, 2.63, 56.25);
  const doorLeaf = (hx, ang) => { // glass door leaf pivoting at hx
    const m = Tm(hx, 0, 56.3, ang);
    BX(ironMat, 0.9, 0.08, 0.05, hx > 0 ? -0.45 : 0.45, 2.45, 0, m); BX(ironMat, 0.9, 0.08, 0.05, hx > 0 ? -0.45 : 0.45, 0.15, 0, m);
    BX(ironMat, 0.06, 2.5, 0.05, hx > 0 ? -0.03 : 0.03, 1.3, 0, m); BX(ironMat, 0.06, 2.5, 0.05, hx > 0 ? -0.87 : 0.87, 1.3, 0, m);
    BX(glassMat, 0.84, 2.3, 0.015, hx > 0 ? -0.45 : 0.45, 1.3, 0, m);
    BX(steel, 0.03, 0.7, 0.05, hx > 0 ? -0.8 : 0.8, 1.1, -0.03, m);
  };
  doorLeaf(-0.95, -0.35); doorLeaf(0.95, 0.0);
  // wall-mounted details
  // Plain panels with an abstract mark (no names: the building stays unidentified).
  const signTex = (variant) => canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#f4f4f1'; g.fillRect(0, 0, w, h); g.strokeStyle = '#2a2b2d'; g.lineWidth = 6; g.strokeRect(12, 12, w - 24, h - 24);
    g.fillStyle = '#111'; g.strokeStyle = '#111'; g.lineWidth = 10; g.lineCap = 'round';
    if (variant === 0) { g.beginPath(); g.arc(w * 0.42, h * 0.48, 30, 0, Math.PI * 2); g.stroke(); g.beginPath(); g.moveTo(w * 0.58, h * 0.66); g.lineTo(w * 0.74, h * 0.66); g.stroke(); }
    else { for (let i = 0; i < 3; i++) { g.beginPath(); g.moveTo(w * (0.36 + i * 0.14), h * 0.34); g.lineTo(w * (0.36 + i * 0.14), h * 0.66); g.stroke(); } }
  }, { text: true });
  const signMat = t => new THREE.MeshStandardMaterial({ map: t, roughness: 0.4 });
  addPlane(signMat(signTex(0)), 0.75, 0.75, Tm(0.78, 3.15, 55.985, PI));
  addPlane(signMat(signTex(1)), 0.75, 0.75, Tm(0.0, 3.15, 55.985, PI));
  { const g = new THREE.SphereGeometry(0.09, 16, 8, 0, PI * 2, 0, PI / 2); g.rotateX(-PI / 2); g.translate(-1.0, 3.35, 56);
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: 0xc62222, roughness: 0.35 })); m.castShadow = true; group.add(m);
    CY(whiteSteel, 0.12, 0.03, -0.45, 3.4, 55.97, Tm(0, 0, 0, 0, PI / 2), 20); }
  // mural: notebook page across the upper band
  const muralTex = canvasTex(low ? 3072 : 6144, low ? 230 : 460, (g, w, h) => {
    const k = w / 6144; g.scale(k, k);
    const W = 6144, Hh = 460, ls = 44.6;
    g.lineWidth = 1.6; g.strokeStyle = 'rgba(141,138,132,0.38)';
    for (let y = 18; y < Hh; y += ls) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
    g.strokeStyle = 'rgba(196,72,72,0.55)'; g.lineWidth = 2.2; g.beginPath(); g.moveTo(430, 0); g.lineTo(430, Hh); g.stroke();
    g.strokeStyle = 'rgba(141,138,132,0.55)'; g.lineWidth = 1.6; // far-left scribbles
    for (let s = 0; s < 3; s++) { g.beginPath(); const cx = 90 + s * 110, cy = 120 + s * 110; for (let a = 0; a < 26; a += 0.2) { const r = 3 + a * 3.6; g.lineTo(cx + Math.cos(a) * r * 1.2, cy + Math.sin(a) * r); } g.stroke(); }
    g.beginPath(); for (let t = 0; t < 40; t += 0.1) g.lineTo(60 + t * 8, 380 + Math.sin(t) * 28 * (1 + t / 30)); g.stroke();
    let sd = 3; const r2 = () => { sd = (sd * 16807) % 2147483647; return sd / 2147483647; };
    const hand = (txt, x, y, size) => {
      g.font = `italic ${size}px ${SERIF}`; g.textBaseline = 'alphabetic'; g.lineWidth = 1.5; g.strokeStyle = 'rgba(141,138,132,0.62)'; g.lineJoin = 'round';
      for (const ch of txt) { const dy = (r2() - 0.5) * 7, rot = (r2() - 0.5) * 0.08; g.save(); g.translate(x, y + dy); g.rotate(rot); g.strokeText(ch, 0, 0); g.restore(); x += g.measureText(ch).width * 1.04 + (r2() - 0.5) * 3; }
      return x;
    };
    void hand; // the handwriting is abstracted: loops and strokes along the lines, no words
    const scribble = (x0, x1, y, amp, seed) => {
      sd = seed; g.lineWidth = 1.6; g.strokeStyle = 'rgba(141,138,132,0.6)'; g.lineJoin = 'round'; g.beginPath(); g.moveTo(x0, y);
      for (let x = x0; x < x1; x += 6) {
        const loop = r2() < 0.08;
        if (loop) { const r = amp * (0.4 + r2() * 0.5); for (let a = 0; a < Math.PI * 2; a += 0.35) g.lineTo(x + Math.sin(a) * r * 0.6, y - r + Math.cos(a) * r); }
        g.lineTo(x, y + Math.sin(x * 0.045 + seed) * amp * 0.35 + (r2() - 0.5) * amp * 0.25);
      }
      g.stroke();
    };
    scribble(520, 2600, 120, 46, 11); scribble(2800, 5400, 122, 44, 23);
    scribble(700, 4300, 258, 48, 37); scribble(3300, 5600, 398, 52, 41);
  }, { text: true });
  const muralMat = new THREE.MeshStandardMaterial({ map: muralTex, transparent: true, roughness: 0.95, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
  addPlane(muralMat, 2 * (XE - 0.35), 3.3, Tm(0, 5.35, 55.992, PI));
  // faint weathering streaks over the render
  const streakTex = canvasTex(1024, 256, (g, w, h) => {
    for (let i = 0; i < 160; i++) { const x = rnd() * w, len = 40 + rnd() * 200, a = 0.02 + rnd() * 0.05, wd = 1 + rnd() * 4;
      const gr = g.createLinearGradient(0, 0, 0, len); gr.addColorStop(0, `rgba(90,80,60,${a})`); gr.addColorStop(1, 'rgba(90,80,60,0)'); g.fillStyle = gr; g.fillRect(x, rnd() * 20, wd, len); }
  });
  addPlane(new THREE.MeshStandardMaterial({ map: streakTex, transparent: true, depthWrite: false, roughness: 1, polygonOffset: true, polygonOffsetFactor: -1 }), 2 * (XE - 0.35), 3.3, Tm(0, 5.35, 55.99, PI));
  // backfill so upper band is solid; side, back walls
  const sideH = H;
  BX(render, 0.5, sideH, 16.0, -21.75, sideH / 2, 64); BX(render, 0.5, sideH, 16.0, 21.75, sideH / 2, 64);
  const backHoles = [];
  for (const s of [-1, 1]) for (const c of [7.0, 10.0, 13.0]) backHoles.push({ x0: s * c - 0.8, x1: s * c + 0.8, y0: 0.95, y1: 3.15 });
  panelWall(-XE, XE, 0, H, 71.6, 72, backHoles, render);
  const gl = [];
  for (const h of backHoles) {
    const cx = (h.x0 + h.x1) / 2, wm = Tm(cx, 0, 71.8);
    BX(ironMat, 1.6, 0.06, 0.1, 0, 0.98, 0, wm); BX(ironMat, 1.6, 0.06, 0.1, 0, 3.12, 0, wm); BX(ironMat, 0.06, 2.2, 0.1, -0.77, 2.05, 0, wm); BX(ironMat, 0.06, 2.2, 0.1, 0.77, 2.05, 0, wm);
    BX(ironMat, 0.05, 2.2, 0.1, 0, 2.05, 0, wm); BX(ironMat, 1.6, 0.05, 0.1, 0, 2.5, 0, wm);
    BX(glassMat, 1.5, 2.15, 0.012, 0, 2.05, 0, wm);
    BX(whiteSteel, 1.7, 0.05, 0.2, 0, 0.93, -0.1, wm);
  }

  // ---------- 2. FORECOURT ----------
  const slabTex = canvasTex(1024, 1024, (g, w, h) => {
    g.fillStyle = '#7e7f7b'; g.fillRect(0, 0, w, h);
    const sw = 256, sh = 128; // slab 1.0 x 0.5 m at 256 px/m
    for (let r = 0; r < h / sh; r++) for (let c = -1; c < w / sw; c++) {
      const x = c * sw + (r % 2) * sw / 2, y = r * sh, v = 188 + rnd() * 22;
      g.fillStyle = `rgb(${v | 0},${(v - 1) | 0},${(v - 6) | 0})`; g.fillRect(x + 3, y + 3, sw - 6, sh - 6);
      for (let i = 0; i < 260; i++) { g.fillStyle = `rgba(${rnd() < 0.5 ? '110,108,100' : '250,248,240'},${0.05 + rnd() * 0.1})`; g.fillRect(x + 3 + rnd() * (sw - 6), y + 3 + rnd() * (sh - 6), 1 + rnd() * 3, 1 + rnd() * 3); }
    }
  }, { repeat: [44 / 4, 3.2 / 4] });
  const slabBump = slabTex.clone(); slabBump.needsUpdate = true;
  const pave = new THREE.MeshStandardMaterial({ map: slabTex, roughness: 0.85, bumpMap: slabBump, bumpScale: 1.0 });
  { const m = addPlane(pave, 44, 2.8, Tm(0, 0.02, 54.6).multiply(new THREE.Matrix4().makeRotationX(-PI / 2))); } // z 53.2 .. 56
  addPlane(pave, 4, 0.4, Tm(0, 0.016, 52.2).multiply(new THREE.Matrix4().makeRotationX(-PI / 2)));
  BX(asphalt, 44, 0.03, 0.6, 0, 0.015, 52.7); // road strip z 52.4..53.0
  BX(granite, 44, 0.16, 0.2, 0, 0.08 + 0.0, 53.1); // kerb 53.0..53.2
  const bollGeo = new THREE.CylinderGeometry(0.05, 0.05, 0.84, 14); M.boxUV(bollGeo);
  const bollCap = new THREE.SphereGeometry(0.05, 14, 8, 0, PI * 2, 0, PI / 2); M.boxUV(bollCap);
  const bollBand = new THREE.CylinderGeometry(0.053, 0.053, 0.04, 14);
  for (let x = -21; x <= 21; x += 2) {
    if (Math.abs(x) < 1.5) continue;
    I('bollard', bollGeo, ironMat, Tm(x, 0.02 + 0.42, 53.45));
    I('bollcap', bollCap, ironMat, Tm(x, 0.02 + 0.84, 53.45));
    I('bollband', bollBand, steel, Tm(x, 0.02 + 0.7, 53.45));
    col(x - 0.07, x + 0.07, 53.38, 53.52, 0, 0.9);
  }

  // ---------- 3. INTERIOR SHELL ----------
  const ZP0 = 60.3, ZP1 = 60.5, ZB = 71.6, ZC = (ZP1 + ZB) / 2; // classroom z 60.5..71.6
  const CH = 3.4;
  BX(terrazzo, 43, 0.3, 15.1, 0, -0.13 + 0.0 - 0.0, 64.05, null); // under floor filler
  // corridor floor
  BX(terrazzo, 43, 0.06, ZP0 - ZI, 0, -0.01, (ZI + ZP0) / 2);
  BX(resinFloor, 9.8, 0.06, 11.1, -10, -0.01, ZC); BX(plankFloor, 9.8, 0.06, 11.1, 10, -0.01, ZC);
  BX(ceilMat, 43, 0.3, 15.1, 0, CH + 0.15, 64.05); // ceiling slab (underside visible)
  // inner faces: corridor lining
  BX(renderIn, 0.04, CH, ZP0 - ZI, -21.48, CH / 2, (ZI + ZP0) / 2); BX(renderIn, 0.04, CH, ZP0 - ZI, 21.48, CH / 2, (ZI + ZP0) / 2);
  const dHoles = [{ x0: -7.1, x1: -5.9, y0: -1, y1: 2.2 }, { x0: 5.9, x1: 7.1, y0: -1, y1: 2.2 }];
  panelWall(-21.5, 21.5, 0, CH, ZP0, ZP1, dHoles, renderIn);
  panelWall(-21.5, 21.5, 0, 1.0, 60.2, 60.3, dHoles, renderBlue); // blue dado
  // partitions and room walls
  for (const s of [-1, 1]) {
    BX(renderIn, 0.2, CH, ZB - ZP1, s * 5, CH / 2, ZC);
    BX(renderIn, 0.3, CH, ZB - ZP1, s * 15.05, CH / 2, ZC);
    BX(renderIn, 0.04, CH, 0.1, s * 7.0, CH / 2, ZP1); // keep merge uniform
    // door frame architrave
    const cx = s * 6.5;
    BX(darkWood, 0.06, 2.25, 0.26, cx - 0.63, 1.12, 60.4); BX(darkWood, 0.06, 2.25, 0.26, cx + 0.63, 1.12, 60.4); BX(darkWood, 1.32, 0.06, 0.26, cx, 2.22, 60.4);
    // open door leaf swung into the room
    BX(oakM, 0.04, 2.1, 1.0, s * 6.5 + (s > 0 ? 0.55 : -0.55), 1.05, 61.0);
  }
  col(-21.5, -7.1, ZP0, ZP1, 0, CH); col(-5.9, 5.9, ZP0, ZP1, 0, CH); col(7.1, 21.5, ZP0, ZP1, 0, CH);
  col(-5.9 + 0.0 - 0.0, -5.9, ZP0, ZP1, 0, 0); colliders.pop();
  col(-7.1, -5.9, ZP1 + 0.0, 61.55, 0, 0.0); colliders.pop();
  for (const s of [-1, 1]) {
    col(s * 5 - 0.1, s * 5 + 0.1, ZP1, ZB, 0, CH); col(Math.min(s * 14.9, s * 15.2), Math.max(s * 14.9, s * 15.2), ZP1, ZB, 0, CH);
  }
  col(-22, 22, 55.99, 56.5, 0, H); colliders.pop();
  col(-22, -0.95, 55.9, ZI, 0, H); col(0.95, 22, 55.9, ZI, 0, H);
  col(-22.3, -21.45, 55.9, 72.1, 0, H); col(21.45, 22.3, 55.9, 72.1, 0, H); col(-22, 22, ZB, 72.1, 0, H);
  // entrance mat
  BX(dark, 2.2, 0.012, 1.2, 0, 0.03, 57.3);
  // upper-floor mass over corridor not needed (solid)

  // ---------- canvases: photos, boards, plates, lockers ----------
  function photoPaint(style) {
    return (g, w, h) => {
      g.fillStyle = '#f6f4ee'; g.fillRect(0, 0, w, h);
      const m = Math.round(w * 0.07), x0 = m, y0 = m, pw = w - 2 * m, ph = h - 2 * m;
      g.save(); g.beginPath(); g.rect(x0, y0, pw, ph); g.clip();
      if (style === 0) {
        const s = g.createLinearGradient(0, y0, 0, y0 + ph); s.addColorStop(0, '#2a3f66'); s.addColorStop(0.55, '#e48a4c'); s.addColorStop(1, '#f6c77a'); g.fillStyle = s; g.fillRect(x0, y0, pw, ph);
        const sun = g.createRadialGradient(x0 + pw * 0.65, y0 + ph * 0.6, 0, x0 + pw * 0.65, y0 + ph * 0.6, pw * 0.3); sun.addColorStop(0, 'rgba(255,245,200,1)'); sun.addColorStop(1, 'rgba(255,200,120,0)'); g.fillStyle = sun; g.fillRect(x0, y0, pw, ph);
        for (let L = 0; L < 3; L++) { g.fillStyle = `rgb(${20 + L * 18},${24 + L * 16},${40 + L * 14})`; g.beginPath(); g.moveTo(x0, y0 + ph); for (let x = 0; x <= pw; x += 8) g.lineTo(x0 + x, y0 + ph * (0.62 + L * 0.1) - Math.sin(x * 0.01 + L * 2) * ph * 0.08 - Math.sin(x * 0.037 + L) * ph * 0.03); g.lineTo(x0 + pw, y0 + ph); g.fill(); }
      } else if (style === 1) {
        const bg = g.createRadialGradient(x0 + pw / 2, y0 + ph * 0.4, 10, x0 + pw / 2, y0 + ph / 2, pw * 0.8); bg.addColorStop(0, '#b8b8b8'); bg.addColorStop(1, '#161616'); g.fillStyle = bg; g.fillRect(x0, y0, pw, ph);
        g.fillStyle = '#222'; g.beginPath(); g.ellipse(x0 + pw / 2, y0 + ph * 0.42, pw * 0.17, ph * 0.22, 0, 0, PI * 2); g.fill();
        g.beginPath(); g.ellipse(x0 + pw / 2, y0 + ph * 1.05, pw * 0.4, ph * 0.38, 0, 0, PI * 2); g.fill();
        g.fillStyle = 'rgba(255,255,255,0.35)'; g.beginPath(); g.ellipse(x0 + pw * 0.43, y0 + ph * 0.36, pw * 0.05, ph * 0.1, 0.4, 0, PI * 2); g.fill();
      } else if (style === 2) {
        const s = g.createLinearGradient(0, y0, 0, y0 + ph); s.addColorStop(0, '#79a8d6'); s.addColorStop(1, '#f1e6d0'); g.fillStyle = s; g.fillRect(x0, y0, pw, ph);
        for (let i = 0; i < 16; i++) { const bw = pw / 10 + rnd() * 20, bx = x0 + i * pw / 14 - 10, bh = ph * (0.25 + rnd() * 0.3); g.fillStyle = ['#d9b79a', '#c98a62', '#e8d6b4', '#b96b4a'][i % 4]; g.fillRect(bx, y0 + ph - bh, bw, bh); g.fillStyle = '#b4522f'; g.beginPath(); g.moveTo(bx - 3, y0 + ph - bh); g.lineTo(bx + bw / 2, y0 + ph - bh - 16); g.lineTo(bx + bw + 3, y0 + ph - bh); g.fill(); g.fillStyle = 'rgba(40,40,50,0.6)'; for (let wy = 0; wy < 2; wy++) g.fillRect(bx + 6, y0 + ph - bh + 10 + wy * 26, 8, 14); }
        g.fillStyle = '#f2c230'; g.fillRect(x0, y0 + ph - 16, pw, 10);
      } else {
        g.fillStyle = '#d4d4d4'; g.fillRect(x0, y0, pw, ph);
        for (let i = 0; i < 14; i++) { g.fillStyle = `rgb(${255 - i * 17},${255 - i * 17},${255 - i * 17})`; g.beginPath(); g.moveTo(x0, y0 + ph); g.lineTo(x0 + pw * (i / 14), y0 + ph); g.lineTo(x0 + pw * (i / 14) + pw * 0.2, y0); g.lineTo(x0 + pw * ((i - 1) / 14) + pw * 0.2, y0); g.fill(); }
      }
      const gi = g.getImageData(x0, y0, pw, ph);
      if (style === 1 || style === 3) for (let i = 0; i < gi.data.length; i += 4) { const v = (gi.data[i] + gi.data[i + 1] + gi.data[i + 2]) / 3 + (rnd() - 0.5) * 30; gi.data[i] = gi.data[i + 1] = gi.data[i + 2] = v; }
      else for (let i = 0; i < gi.data.length; i += 4) { const n = (rnd() - 0.5) * 20; gi.data[i] += n; gi.data[i + 1] += n; gi.data[i + 2] += n; }
      g.putImageData(gi, x0, y0);
      g.restore(); g.strokeStyle = 'rgba(0,0,0,0.15)'; g.lineWidth = 2; g.strokeRect(x0, y0, pw, ph);
    };
  }
  const photoTexs = [0, 1, 2, 3].map(i => canvasTex(300, 220, photoPaint(i)));
  const photoTexsP = [1, 0, 3].map(i => canvasTex(220, 300, photoPaint(i)));
  const matCache = new Map();
  const texMat = (t, o = {}) => { if (!matCache.has(t)) matCache.set(t, new THREE.MeshStandardMaterial({ map: t, roughness: 0.5, ...o })); return matCache.get(t); };
  function hang(m, w, h, tex, frame = dark) { BX(frame, w + 0.06, h + 0.06, 0.03, 0, 0, 0.015, m); addPlane(texMat(tex), w, h, mul(m, Tm(0, 0, 0.032))); }

  function corkBoard(variant) {
    return canvasTex(1024, 640, (g, w, h) => {
      g.fillStyle = '#b98a5a'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 6000; i++) { g.fillStyle = `rgba(${rnd() < 0.5 ? '90,55,25' : '230,190,140'},0.18)`; g.fillRect(rnd() * w, rnd() * h, 2 + rnd() * 3, 2 + rnd() * 3); }
      const titles = variant ? ['Open Day', 'Horários 2026/27', 'Bolsa de Estudo', 'Sala de Estudo'] : ['Fotografia', 'Exposição Final', 'Bem-vindos', 'Cursos'];
      const subs = variant ? ['12 de maio · entrada livre', 'turmas · salas · docentes', 'candidaturas até junho', 'biblioteca · 2.º piso'] : ['Imagem · Luz · Olhar', 'galeria da escola', 'ano letivo 2026/2027', 'Foto · Vídeo · Design'];
      const cols = ['#e9d35b', '#f4f1ea', '#6fa8c7', '#e98b73', '#a5d1a0', '#d9d0f0'];
      for (let i = 0; i < 4; i++) {
        const x = 40 + (i % 2) * 480 + rnd() * 30, y = 30 + Math.floor(i / 2) * 300 + rnd() * 20, pw = 400 + rnd() * 40, ph = 270;
        g.save(); g.translate(x + pw / 2, y + ph / 2); g.rotate((rnd() - 0.5) * 0.06);
        g.shadowColor = 'rgba(0,0,0,0.4)'; g.shadowBlur = 8; g.shadowOffsetY = 4; g.fillStyle = cols[(i + variant * 2) % 6]; g.fillRect(-pw / 2, -ph / 2, pw, ph); g.shadowColor = 'transparent';
        g.fillStyle = 'rgba(20,20,30,0.85)'; g.font = `400 52px ${SERIF}`; g.textAlign = 'left'; g.fillText(titles[i], -pw / 2 + 24, -ph / 2 + 80);
        g.font = `500 24px ${SANS}`; g.fillText(subs[i], -pw / 2 + 24, -ph / 2 + 124);
        g.fillStyle = 'rgba(20,20,30,0.25)'; g.beginPath(); g.arc(pw / 2 - 90, ph / 2 - 70, 50, 0, PI * 2); g.fill(); g.fillRect(-pw / 2 + 24, ph / 2 - 60, 140, 8); g.fillRect(-pw / 2 + 24, ph / 2 - 40, 100, 8);
        g.fillStyle = '#c62828'; g.beginPath(); g.arc(0, -ph / 2 + 12, 8, 0, PI * 2); g.fill();
        g.restore();
      }
    }, { text: true });
  }
  function plateTex(txt) {
    return canvasTex(512, 192, (g, w, h) => {
      g.fillStyle = '#e9ecee'; g.fillRect(0, 0, w, h); g.strokeStyle = '#4b5a66'; g.lineWidth = 8; g.strokeRect(6, 6, w - 12, h - 12);
      g.fillStyle = '#1c2630'; g.font = `600 64px ${SANS}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(txt, w / 2, h / 2 + 3);
    }, { text: true });
  }
  const lockerTex = canvasTex(192, 384, (g, w, h) => {
    const cols = ['#2f6f86', '#c9a43a', '#3f7f6a'];
    for (let i = 0; i < 3; i++) {
      const x = i * 64; g.fillStyle = cols[i]; g.fillRect(x, 0, 64, h);
      g.fillStyle = 'rgba(0,0,0,0.35)'; for (let k = 0; k < 6; k++) g.fillRect(x + 12, 20 + k * 7, 40, 3);
      g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(x, 0, 64, 4);
      g.fillStyle = '#d8dadb'; g.fillRect(x + 25, 170, 14, 40); g.fillStyle = '#222'; g.fillRect(x + 28, 120, 8, 12);
      g.fillStyle = '#f4f4f4'; g.fillRect(x + 22, 70, 20, 14); g.fillStyle = '#222'; g.font = `600 12px ${SANS}`; g.textAlign = 'center'; g.fillText(String(101 + i), x + 32, 81);
      g.strokeStyle = 'rgba(0,0,0,0.55)'; g.lineWidth = 2; g.strokeRect(x + 1, 1, 62, h - 2);
    }
  }, { text: true, repeat: [13, 1] });
  const lockerMat = new THREE.MeshStandardMaterial({ map: lockerTex, roughness: 0.4, metalness: 0.3 });

  // ---------- corridor dressing ----------
  // lockers along the back wall, either side of the classroom doors
  for (const [a, b] of [[-20.6, -8.9], [8.9, 20.6]]) {
    const len = b - a, cx = (a + b) / 2;
    BX(M.get('steel', { color: 0x44555d, roughness: 0.5 }), len, 1.85, 0.4, cx, 0.93, 60.1);
    BX(M.get('steel', { color: 0x44555d, roughness: 0.5 }), len, 0.05, 0.42, cx, 1.88, 60.09);
    const lt = lockerTex.clone(); lt.repeat.set(len / 0.9, 1); lt.needsUpdate = true;
    addPlane(new THREE.MeshStandardMaterial({ map: lt, roughness: 0.4, metalness: 0.3 }), len, 1.8, Tm(cx, 0.95, 59.895, PI));
    col(a, b, 59.9, 60.3, 0, 1.9);
  }
  // notice boards and photos on the core wall (z=60.3 face, facing -z)
  const boardMat = (v) => new THREE.MeshStandardMaterial({ map: corkBoard(v), roughness: 0.9 });
  for (const [cx, v] of [[-3.0, 0], [3.0, 1]]) {
    BX(whiteSteel, 2.4, 1.5, 0.03, cx, 1.65, 60.285);
    addPlane(boardMat(v), 2.3, 1.4, Tm(cx, 1.65, 60.265, PI));
  }
  addPlane(texMat(plateTex('Escadas')), 0.7, 0.26, Tm(0, 2.6, 60.28, PI));
  BX(dark, 1.0, 2.1, 0.04, 0, 1.05, 60.28);
  // door plates
  for (const [cx, txt] of [[-8.1, 'Sala Lente'], [8.1, 'Sala de Português']]) addPlane(texMat(plateTex(txt)), 0.8, 0.3, Tm(cx, 1.55, 60.29, PI));
  // framed photographs between the glass panels (front wall inner face, facing +z)
  [[-6.7, 0], [-13.3, 1], [-19.9, 2], [6.7, 3], [13.3, 1], [19.9, 0]].forEach(([x, i]) => hang(Tm(x, 1.7, ZI, 0), 1.0, 0.73, photoTexs[i]));
  [-9.0, 9.0].forEach((x, i) => hang(Tm(x, 2.6, 60.3, PI), 0.8, 0.6, photoTexs[i + 1]));
  // fire extinguisher
  CY(new THREE.MeshStandardMaterial({ color: 0xc02020, roughness: 0.4 }), 0.07, 0.5, 20.9, 0.75, 56.65); BX(dark, 0.14, 0.02, 0.14, 20.9, 1.02, 56.65);

  // ---------- ceiling LEDs + light pools ----------
  const ledGeo = new THREE.BoxGeometry(0.6, 0.03, 0.6);
  const glowTex = canvasTex(128, 128, (g, w, h) => { const r = g.createRadialGradient(64, 64, 0, 64, 64, 64); r.addColorStop(0, 'rgba(255,240,215,0.5)'); r.addColorStop(1, 'rgba(255,240,215,0)'); g.fillStyle = r; g.fillRect(0, 0, w, h); });
  const glowMat = new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.55 });
  glowMat.userData.noShadow = true;
  const glowGeo = new THREE.PlaneGeometry(1, 1); glowGeo.rotateX(-PI / 2);
  const led = (x, z, sc = 2.6) => { I('led', ledGeo, ledMat, Tm(x, CH - 0.015, z)); I('glow', glowGeo, glowMat, new THREE.Matrix4().compose(new THREE.Vector3(x, 0.03, z), new THREE.Quaternion(), new THREE.Vector3(sc, 1, sc))); };
  for (let x = -19; x <= 19; x += 3.8) { led(x, 57.7, 3.0); led(x, 59.2, 3.0); }
  const rooms = [];
  function makeRoom(s) {
    const x0 = s * 14.9, rot = s > 0 ? PI : 0;
    const roomM = Tm(x0, 0, ZC, rot);
    const L = (u, y, lz, ry = 0, rx = 0) => mul(roomM, Tm(u, y, lz, ry, rx));
    const worldXZ = (u, lz) => [x0 + (s > 0 ? -u : u), ZC + (s > 0 ? -lz : lz)];
    const aabb = (u0, u1, l0, l1, y1 = 0.8, y0 = 0) => { const a = worldXZ(u0, l0), b = worldXZ(u1, l1); col(Math.min(a[0], b[0]), Math.max(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[1], b[1]), y0, y1); };
    // sit place at room-local (u, lz), seat top y, looking along room u by k (+1 / -1); proxy box geo
    const sit = (geo, u, lz, y, k, name) => { const [wx, wz] = worldXZ(u, lz); sitProxy(geo, L(u, 0, lz), { x: mm(wx), y: mm(y), z: mm(wz), facing: [s > 0 ? -k : k, 0] }, name); };
    const R = { s, x0, roomM, L, worldXZ, aabb, sit };
    rooms.push(R);
    // ceiling LEDs
    for (const u of [2.2, 4.9, 7.6]) for (const lz of [-3.4, 0, 3.4]) { const [wx, wz] = worldXZ(u, lz); led(wx, wz, 2.4); }
    // radiators + blinds on window wall (world z 71.6)
    for (const c of [7.0, 10.0, 13.0]) {
      const wx = s * c;
      BX(whiteSteel, 1.1, 0.55, 0.09, wx, 0.42, 71.5); BX(whiteSteel, 1.12, 0.03, 0.11, wx, 0.72, 71.5);
      for (let k = 0; k < 9; k++) BX(whiteSteel, 0.02, 0.5, 0.1, wx - 0.5 + k * 0.125, 0.42, 71.45);
      addPlane(blindMat, 1.5, 0.75, Tm(wx, 2.72, 71.64, PI)); // half-lowered venetian blind (visible both sides)
    }
    // student furniture
    const rowsU = s < 0 ? [3.0, 4.4, 5.8, 7.2] : [3.7, 5.0, 6.3, 7.6];
    const topGeo = new RoundedBoxGeometry(0.5, 0.028, 0.7, 2, 0.01);
    const legGeo = new THREE.CylinderGeometry(0.014, 0.014, 0.72, 8);
    const railGeo = new THREE.BoxGeometry(0.46, 0.025, 0.025);
    const seatGeo = new RoundedBoxGeometry(0.42, 0.04, 0.42, 2, 0.015);
    const backGeo = new RoundedBoxGeometry(0.025, 0.22, 0.4, 2, 0.01);
    const cLegGeo = new THREE.CylinderGeometry(0.012, 0.012, 0.44, 8);
    for (const u of rowsU) for (const g of [-2.1, 2.1]) {
      aabb(u - 0.26, u + 0.26, g - 0.74, g + 0.74, 0.76);
      for (const o of [-0.36, 0.36]) {
        const lz = g + o;
        I('top', topGeo, laminate, L(u, 0.735, lz));
        for (const [dx, dz] of [[-0.22, -0.31], [0.22, -0.31], [-0.22, 0.31], [0.22, 0.31]]) I('leg', legGeo, steel, L(u + dx, 0.36, lz + dz));
        I('rail', railGeo, steel, L(u, 0.15, lz - 0.31)); I('rail', railGeo, steel, L(u, 0.15, lz + 0.31));
        const cu = u + 0.62;
        I('seat', seatGeo, s < 0 ? plasticBlue : plasticGrey, L(cu, 0.45, lz));
        I('back', backGeo, s < 0 ? plasticBlue : plasticGrey, L(cu + 0.2, 0.68, lz));
        for (const [dx, dz] of [[-0.17, -0.17], [0.17, -0.17], [-0.17, 0.17], [0.17, 0.17]]) I('cleg', cLegGeo, steel, L(cu + dx, 0.22, lz + dz));
        // sit: seat top 0.45 + 0.02, looking at the board (-u, away from the backrest at cu + 0.2)
        sit(chairBox, cu, lz, 0.45 + 0.02, -1, `school-${s < 0 ? 'lente' : 'portugues'}-chair-r${rowsU.indexOf(u) + 1}c${(g < 0 ? 1 : 3) + (o < 0 ? 0 : 1)}`);
      }
    }
    return R;
  }
  const blindTex = canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = '#d8d2c4'; g.fillRect(0, 0, w, h);
    for (let y = 0; y < h - 8; y += 6) { const gr = g.createLinearGradient(0, y, 0, y + 6); gr.addColorStop(0, '#f1ece0'); gr.addColorStop(1, '#bfb8a8'); g.fillStyle = gr; g.fillRect(0, y, w, 5); }
    g.fillStyle = '#9a9384'; g.fillRect(0, h - 8, w, 8); g.fillRect(30, 0, 1, h); g.fillRect(98, 0, 1, h);
  });
  const blindMat = new THREE.MeshStandardMaterial({ map: blindTex, roughness: 0.7, side: THREE.DoubleSide });
  const A = makeRoom(-1), B = makeRoom(1);

  // texture painters for room content
  const lenteCard = (g, w, h) => {
    const bg = g.createLinearGradient(0, 0, w, h); bg.addColorStop(0, '#0d1826'); bg.addColorStop(1, '#23405f'); g.fillStyle = bg; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(160,200,235,0.35)'; g.lineWidth = w * 0.004;
    const cx = w * 0.78, cy = h * 0.5; for (let i = 1; i <= 6; i++) { g.beginPath(); g.arc(cx, cy, h * 0.07 * i, 0, PI * 2); g.stroke(); }
    for (let i = 0; i < 8; i++) { const a = i * PI / 4; g.beginPath(); g.moveTo(cx + Math.cos(a) * h * 0.07, cy + Math.sin(a) * h * 0.07); g.lineTo(cx + Math.cos(a + 0.5) * h * 0.42, cy + Math.sin(a + 0.5) * h * 0.42); g.stroke(); }
    g.fillStyle = '#f2ede2'; g.textBaseline = 'alphabetic'; g.font = `400 ${h * 0.34}px ${SERIF}`; g.fillText('Lente', w * 0.07, h * 0.52);
    g.font = `400 ${h * 0.09}px ${SERIF}`; g.fillStyle = '#c9d8e8'; g.fillText('Lente · EPI 2026/2027', w * 0.075, h * 0.68);

  };
  const lenteTex = canvasTex(1280, 720, lenteCard, { text: true });
  const lapTex = canvasTex(512, 320, lenteCard, { text: true });
  const emissiveScreen = (t) => new THREE.MeshStandardMaterial({ map: t, emissiveMap: t, emissive: 0xffffff, emissiveIntensity: 0.9, roughness: 0.3, color: 0x111111 });
  const wbTex = canvasTex(1536, 512, (g, w, h) => {
    g.fillStyle = '#f7f8f6'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(150,160,170,${0.03 + rnd() * 0.05})`; g.beginPath(); g.ellipse(rnd() * w, rnd() * h, 40 + rnd() * 120, 10 + rnd() * 25, rnd() * 3, 0, PI * 2); g.fill(); }
    g.lineJoin = 'round';
    const write = (txt, x, y, size, color) => { g.font = `italic ${size}px ${SERIF}`; g.fillStyle = color; g.strokeStyle = color; g.lineWidth = size * 0.02;
      for (const ch of txt) { const dy = (rnd() - 0.5) * size * 0.07; g.save(); g.translate(x, y + dy); g.rotate((rnd() - 0.5) * 0.07); g.fillText(ch, 0, 0); g.strokeText(ch, 0, 0); g.restore(); x += g.measureText(ch).width * 1.03; } return x; };
    const xe = write('Português · EPI', 90, 150, 150, '#1b4fa8');
    g.strokeStyle = '#c0392b'; g.lineWidth = 7; g.beginPath(); g.moveTo(90, 180); g.bezierCurveTo(400, 200, 700, 165, xe, 185); g.stroke();
    write('ler · escrever · ouvir · falar', 100, 285, 82, '#222');
    write('A língua é a nossa casa.', 100, 380, 82, '#1f7a4d');
    write('Os Lusíadas — Camões, 1572', 100, 465, 62, '#222');
    write('eu falei · tu falaste', 860, 285, 62, '#b03a2e'); write('ele falou · nós falámos', 860, 360, 62, '#b03a2e');
  }, { text: true });
  const screenTex = canvasTex(640, 400, (g, w, h) => {
    g.fillStyle = '#f3f3f0'; g.fillRect(0, 0, w, h); g.fillStyle = '#1b4fa8'; g.font = `400 70px ${SERIF}`; g.textAlign = 'center'; g.fillText('Português · EPI', w / 2, h / 2); g.font = `500 24px ${SANS}`; g.fillStyle = '#555'; g.fillText('projeção · toque para abrir', w / 2, h / 2 + 50);
  }, { text: true });
  const pts = [[-8.85, 41.87], [-8.83, 41.7], [-8.7, 41.15], [-8.7, 40.65], [-8.87, 40.15], [-9.07, 39.6], [-9.38, 39.35], [-9.5, 38.78], [-9.2, 38.7], [-8.9, 38.5], [-8.78, 38.0], [-8.99, 37.02], [-8.67, 37.1], [-7.93, 37.02], [-7.42, 37.17], [-7.5, 37.7], [-7.27, 38.2], [-7.17, 38.85], [-7.0, 39.3], [-7.1, 39.7], [-6.9, 40.0], [-7.0, 40.3], [-6.95, 40.8], [-6.8, 41.05], [-6.55, 41.5], [-6.2, 41.57], [-6.55, 41.95], [-7.2, 41.9], [-8.2, 42.15]];
  const mapTex = canvasTex(700, 1000, (g, w, h) => {
    const sea = g.createLinearGradient(0, 0, 0, h); sea.addColorStop(0, '#2c6a99'); sea.addColorStop(1, '#4b8dbd'); g.fillStyle = sea; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(255,255,255,0.12)'; g.lineWidth = 1; for (let i = 0; i < 20; i++) { g.beginPath(); g.moveTo(0, i * 50); g.lineTo(w, i * 50); g.stroke(); g.beginPath(); g.moveTo(i * 50, 0); g.lineTo(i * 50, h); g.stroke(); }
    const pj = (lo, la) => [150 + (lo + 9.7) * 120, 90 + (42.3 - la) * 150];
    g.beginPath(); pts.forEach(([lo, la], i) => { const [x, y] = pj(lo, la); i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.closePath();
    g.shadowColor = 'rgba(0,0,0,0.4)'; g.shadowBlur = 14; g.fillStyle = '#e9dcb4'; g.fill(); g.shadowColor = 'transparent'; g.strokeStyle = '#8a7a4a'; g.lineWidth = 3; g.stroke();
    g.fillStyle = '#9a1c1c'; g.strokeStyle = '#fff'; g.lineWidth = 2; g.font = `500 22px ${SANS}`;
    for (const [n, lo, la] of [['Porto', -8.61, 41.15], ['Coimbra', -8.42, 40.2], ['Lisboa', -9.14, 38.72], ['Faro', -7.93, 37.02], ['Évora', -7.9, 38.57], ['Braga', -8.42, 41.55]]) { const [x, y] = pj(lo, la); g.beginPath(); g.arc(x, y, 6, 0, PI * 2); g.fill(); g.stroke(); g.fillStyle = '#222'; g.fillText(n, x + 12, y + 7); g.fillStyle = '#9a1c1c'; }
    g.fillStyle = '#f4f1ea'; g.font = `italic 68px ${SERIF}`; g.fillText('Portugal', 40, 70); g.font = `500 20px ${SANS}`; g.fillStyle = '#dbe8f2'; g.fillText('Mapa de Portugal continental', 44, 100);
    g.fillStyle = '#e9dcb4'; g.beginPath(); g.ellipse(80, 900, 36, 18, 0.3, 0, PI * 2); g.fill(); g.beginPath(); g.ellipse(150, 880, 22, 10, 0.2, 0, PI * 2); g.fill(); g.fillStyle = '#f4f1ea'; g.font = `18px ${SANS}`; g.fillText('Açores', 50, 940); g.fillText('Madeira', 138, 920);
  }, { text: true });

  // --- Sala Lente (A, west) ---
  {
    const { L, aabb } = A;
    BX(dark, 0.06, 1.45, 2.5, 0, 0, 0, L(0.03, 1.65, 0.3));
    const sc = addPlane(emissiveScreen(lenteTex), 2.4, 1.35, L(0.07, 1.65, 0.3, PI / 2));
    sc.userData.action = { type: 'app', url: 'https://pedrohfernandes-klk.github.io/lente/', title: 'Lente · EPI 2026/2027' }; pickables.push(sc);
    // teacher desk + chair + laptop
    BX(laminate, 0.8, 0.04, 1.6, 0, 0, 0, L(1.9, 0.74, -2.3)); BX(whiteSteel, 0.76, 0.7, 0.04, 0, 0, 0, L(1.9, 0.37, -3.05)); BX(whiteSteel, 0.76, 0.7, 0.04, 0, 0, 0, L(1.9, 0.37, -1.55));
    aabb(1.5, 2.3, -3.1, -1.5, 0.8);
    const lm = L(1.85, 0.76, -2.3, PI / 2 * 0 + 0.0);
    BX(steel, 0.23, 0.015, 0.33, 0, 0.008, 0, lm);
    // Screen just in front of the lid's back (x 0.119–0.131), facing the teacher's chair (−x): inside the box it was hidden and unclickable.
    const lid = addPlane(emissiveScreen(lapTex), 0.31, 0.19, mul(lm, Tm(0.112, 0.13, 0, -PI / 2, -0.0, 0).multiply(new THREE.Matrix4().makeRotationZ(0))));
    BX(dark, 0.012, 0.21, 0.33, 0.125, 0.13, 0, lm);
    lid.userData.action = { type: 'app', url: 'https://pedrohfernandes-klk.github.io/lente/', title: 'Lente · EPI 2026/2027' }; pickables.push(lid);
    I('seat', new RoundedBoxGeometry(0.45, 0.05, 0.45, 2, 0.02), plasticGrey, L(1.05, 0.48, -2.3)); I('back', new RoundedBoxGeometry(0.04, 0.4, 0.42, 2, 0.015), plasticGrey, L(0.84, 0.74, -2.3));
    CY(steel, 0.025, 0.46, 0, 0, 0, L(1.05, 0.23, -2.3));
    // sit: the teacher looks at the class (+u, away from the backrest at 0.84). Seat top 0.48 + 0.02: the
    // shared 'seat' instance key draws this seat with the students' 0.04 m seat; the box also covers the
    // declared 0.45 seat and 0.4 m backrest (top 0.94).
    A.sit(sitBox(0.5, 0.49, 0, 0.97), 1.05, -2.3, 0.48 + 0.02, 1, 'school-lente-chair-teacher');
    // wall photographs on the door wall and partition
    hang(L(2.2, 1.8, -5.545, 0), 1.0, 0.73, photoTexs[0]); hang(L(4.0, 1.8, -5.545, 0), 1.0, 0.73, photoTexs[2]);
    hang(L(9.78, 1.7, -2.2, -PI / 2), 0.8, 1.1, photoTexsP[0]); hang(L(9.78, 1.7, 0.0, -PI / 2), 0.8, 1.1, photoTexsP[1]); hang(L(9.78, 1.7, 2.2, -PI / 2), 0.8, 1.1, photoTexsP[2]);
    BX(M.get('steel', { color: 0xb8bcc0 }), 0.04, 0.04, 2.0, 0, 0, 0, L(0.05, 0.9, 0.3)); // sound bar / ledge
    // cabinet by door wall
    BX(whiteSteel, 0.5, 1.8, 1.2, 0, 0, 0, L(9.4, 0.9, -4.7)); aabb(9.15, 9.8, -5.3, -4.1, 1.8);
    const pl = plateTex('Sala Lente'); addPlane(texMat(pl), 0.4, 0.15, L(8.4, 1.55, -5.54, 0));
  }
  // --- Sala de Português (B, east) ---
  {
    const { L, aabb } = B;
    BX(oakM, 2.6, 0.15, 8.8, 0, 0, 0, L(1.3, 0.075, 0.2)); // dais top at 0.15
    BX(oakM, 0.08, 0.15, 8.8, 0, 0, 0, L(2.62, 0.075, 0.2));
    const wb = addPlane(new THREE.MeshStandardMaterial({ map: wbTex, roughness: 0.25, metalness: 0 }), 3.6, 1.2, L(0.07, 1.55, 1.7, PI / 2));
    BX(whiteSteel, 0.04, 1.3, 3.7, 0, 0, 0, L(0.03, 1.55, 1.7)); BX(whiteSteel, 0.1, 0.06, 3.7, 0, 0, 0, L(0.07, 0.9, 1.7));
    wb.userData.action = { type: 'app', url: 'https://pedrohfernandes-klk.github.io/pt/', title: 'Português · EPI' }; pickables.push(wb);
    BX(whiteSteel, 0.05, 1.45, 2.3, 0, 0, 0, L(0.04, 2.0, -2.6)); // projector screen case + fabric
    const ps = addPlane(new THREE.MeshStandardMaterial({ map: screenTex, roughness: 0.8, emissive: 0x333333, emissiveMap: screenTex, emissiveIntensity: 0.5 }), 2.2, 1.35, L(0.075, 2.0, -2.6, PI / 2));
    ps.userData.action = { type: 'app', url: 'https://pedrohfernandes-klk.github.io/pt/', title: 'Português · EPI' }; pickables.push(ps);
    // teacher desk on dais + chair
    BX(darkWood, 0.8, 0.05, 1.6, 0, 0, 0, L(1.6, 0.9, -0.2)); BX(darkWood, 0.76, 0.72, 0.06, 0, 0, 0, L(1.6, 0.51, -0.95)); BX(darkWood, 0.76, 0.72, 0.06, 0, 0, 0, L(1.6, 0.51, 0.55)); BX(darkWood, 0.04, 0.72, 1.4, 0, 0, 0, L(1.22, 0.51, -0.2));
    aabb(0.0, 2.7, -4.3, 4.7, 0.15); colliders.pop(); // dais is walkable
    aabb(1.15, 2.05, -1.05, 0.65, 0.95, 0.0);
    I('seat', new RoundedBoxGeometry(0.45, 0.05, 0.45, 2, 0.02), plasticGrey, L(0.85, 0.65, -0.2)); I('back', new RoundedBoxGeometry(0.04, 0.4, 0.42, 2, 0.015), plasticGrey, L(0.63, 0.92, -0.2));
    // sit: on the dais (top 0.15), looking at the class (+u); seat top 0.65 + 0.02 (drawn 0.04 thick, as in Lente)
    B.sit(sitBox(0.5, 0.49, 0.15, 1.15), 0.85, -0.2, 0.65 + 0.02, 1, 'school-portugues-chair-teacher');
    BX(new THREE.MeshStandardMaterial({ color: 0xf0f0f0 }), 0.2, 0.01, 0.3, 0, 0, 0, L(1.55, 0.93, 0.2)); // papers
    // wall map of Portugal (door wall, world z = 60.5)
    BX(oakM, 1.5, 2.1, 0.03, 0, 0, 0, L(4.2, 1.7, 5.54));
    const mp = addPlane(new THREE.MeshStandardMaterial({ map: mapTex, roughness: 0.6 }), 1.4, 2.0, L(4.2, 1.7, 5.52, PI));
    mp.userData.action = { type: 'app', url: 'https://pedrohfernandes-klk.github.io/pt-mapa/', title: 'Português na EPI: mapa' }; pickables.push(mp);
    hang(L(9.78, 1.7, 0, -PI / 2), 1.0, 0.73, photoTexs[3]);
    // bookcase + books
    BX(oakM, 0.35, 1.9, 1.4, 0, 0, 0, L(9.62, 0.95, 4.4)); aabb(9.45, 9.8, 3.7, 5.1, 1.9);
    const bookGeo = new THREE.BoxGeometry(0.22, 0.28, 0.035); const bcols = [0x8a2b2b, 0x2b4a8a, 0x2b6b4a, 0xc9a43a, 0x5a3a7a, 0xd9d2c0];
    for (let r = 0; r < 4; r++) for (let k = 0; k < 14; k++) I('book' + (k % 6), bookGeo, new THREE.MeshStandardMaterial({ color: bcols[k % 6], roughness: 0.7 }), L(9.5, 0.28 + r * 0.42, 3.78 + k * 0.095));
    addPlane(texMat(plateTex('Sala de Português')), 0.4, 0.15, L(8.4, 1.55, 5.54, PI));
  }

  // ---------- QUEDA PCs ----------
  const quedaTex = canvasTex(640, 360, (g, w, h) => {
    g.fillStyle = '#0b1020'; g.fillRect(0, 0, w, h);
    const cols = ['#e63946', '#f4a261', '#e9c46a', '#2a9d8f', '#4aa3df', '#8d5cf6', '#ff6fb5'];
    const c = 30; let sd = 5; const r = () => { sd = (sd * 16807) % 2147483647; return sd / 2147483647; };
    for (let i = 0; i < 20; i++) for (let j = 0; j < 12; j++) { const hgt = 3 + Math.floor(r() * 5); if (j < 12 - hgt) continue; g.fillStyle = cols[Math.floor(r() * 7)]; g.fillRect(i * c + 40 - 40 + 20, j * c - 8, c - 3, c - 3); }
    g.fillStyle = 'rgba(11,16,32,0.55)'; g.fillRect(0, 70, w, 120);
    g.fillStyle = '#fff'; g.font = `700 104px ${SANS}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('QUEDA', w / 2, 130);
  }, { text: true });
  const quedaMat = emissiveScreen(quedaTex);
  const quedaAction = () => ({ type: 'app', url: 'assets/apps/blocks.html', title: 'QUEDA \u00b7 jogo de blocos' });
  const pcMat = M.get('steel', { color: 0x2a2c30, roughness: 0.5 });
  function addPC(m) { // local +z faces the user; origin on the desk surface
    BX(pcMat, 0.56, 0.34, 0.03, 0, 0.36, 0, m); BX(pcMat, 0.04, 0.2, 0.03, 0, 0.1, -0.03, m); BX(pcMat, 0.22, 0.012, 0.16, 0, 0.006, 0, m);
    BX(pcMat, 0.44, 0.02, 0.14, 0, 0.01, 0.32, m); BX(pcMat, 0.06, 0.025, 0.1, 0.32, 0.012, 0.32, m);
    const sc = addPlane(quedaMat, 0.52, 0.3, mul(m, Tm(0, 0.36, 0.0165)));
    sc.userData.action = quedaAction(); pickables.push(sc);
  }
  {
    const { L, aabb } = A;
    BX(laminate, 3.8, 0.04, 0.6, 0, 0, 0, L(5.1, 0.72, -5.2)); BX(whiteSteel, 3.8, 0.7, 0.03, 0, 0, 0, L(5.1, 0.36, -5.48));
    BX(whiteSteel, 0.03, 0.7, 0.55, 0, 0, 0, L(3.22, 0.36, -5.2)); BX(whiteSteel, 0.03, 0.7, 0.55, 0, 0, 0, L(6.98, 0.36, -5.2));
    aabb(3.2, 7.0, -5.5, -4.9, 0.78);
    for (const u of [3.9, 5.1, 6.3]) addPC(L(u, 0.74, -5.3, 0));
  }
  { const { L } = B; addPC(L(1.45, 0.925, 0.45, -PI / 2)); }

  // ---------- room lights (2 real-time) ----------
  for (const x of [-10, 10]) { const pl = new THREE.PointLight(0xfff0dc, 22, 14, 1.6); pl.position.set(x, 3.0, ZC); pl.castShadow = false; group.add(pl); }

  { const hl = new THREE.HemisphereLight(0xfff4e4, 0x8a8478, 0.5); hl.position.set(0, 3, 60); group.add(hl); }
  flush(); flushInst();
  group.traverse(o => { if (o.isMesh) o.receiveShadow = true; });

  // ---------- regions ----------
  regions.push(
    { minX: -1.4, maxX: 1.4, minZ: 51, maxZ: 53.5, y: 0 },
    { minX: -21.5, maxX: 21.5, minZ: 52.8, maxZ: 55.6, y: 0 },
    { minX: -1.4, maxX: 1.4, minZ: 55.4, maxZ: 57.2, y: 0 },
    { minX: -20.9, maxX: 20.9, minZ: 56.9, maxZ: 60.6, y: 0 },
    { minX: -14.5, maxX: -5.6, minZ: 60.4, maxZ: 71.2, y: 0 },
    { minX: 5.6, maxX: 14.5, minZ: 60.4, maxZ: 71.2, y: 0 },
  );
  // dais step in Português: region plateau
  regions.push({ minX: 12.4, maxX: 14.5, minZ: 61.0, maxZ: 70.8, y: 0.15 });
  regions.pop(); // keep flat (dais is 0.15 m, stepped over)

  return { group, regions, colliders, pickables, seats, update() {}, onPick() {} };
}
