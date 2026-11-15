// trees.js — procedural trees for THE WORKSHOP campus (BRIEF §6).
// Recursive branch generator (taper, gravitropism, multi-stem) -> 5 templates
// (London plane, silver birch, birch multi-stem, olive, oak), each merged into one
// bark mesh + one leaf-card mesh per variant, placed with InstancedMesh.
// Leaves: canvas-painted leaf-cluster alpha cards, alpha-tested, leaf-shaped
// shadows (customDepthMaterial), wind sway in the vertex shader, cheap
// backlit translucency. Static when ctx.reducedMotion.

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ------------------------------------------------------------------ species */
const SPECIES = {
  plane: {
    bark: 0xd8d2bd, H: 11, leaf: { tex: 'plane', n: 14, inner: 5, size: [1.3, 2.0] },
    levels: [
      { len: 7.0, r0: 0.27, end: 0.5, segs: 9, grav: 0.03, wob: 0.025, n: 7, start: 0.4, ang: [0.6, 1.05], f: [0.6, 0.9], radF: 0.5, rad: 8 },
      { segs: 5, end: 0.35, grav: 0.1, wob: 0.12, n: 5, start: 0.25, ang: [0.55, 1.1], f: [0.5, 0.8], radF: 0.55, rad: 6 },
      { segs: 3, end: 0.3, grav: 0.06, wob: 0.15, n: 4, start: 0.3, ang: [0.4, 1.0], f: [0.5, 0.8], radF: 0.6, rad: 4 },
      { segs: 2, end: 0.2, grav: 0.02, wob: 0.15, rad: 4 },
    ],
  },
  birch: {
    bark: 0xf4f1e8, birchBands: true, H: 8.5, leaf: { tex: 'birch', n: 9, inner: 0, size: [0.6, 0.95] },
    levels: [
      { len: 7.5, r0: 0.13, end: 0.3, segs: 8, grav: 0.03, wob: 0.045, n: 10, start: 0.3, ang: [0.35, 0.75], f: [0.2, 0.4], radF: 0.38, rad: 6 },
      { segs: 4, end: 0.3, grav: 0.05, wob: 0.1, n: 4, start: 0.25, ang: [0.4, 0.9], f: [0.4, 0.65], radF: 0.5, rad: 4 },
      { segs: 3, end: 0.25, grav: -0.1, wob: 0.1, rad: 3 },
    ],
  },
  birchMulti: null,
  olive: {
    bark: 0x9a9082, H: 5.2, stems: 3, stemLean: 0.38, leaf: { tex: 'olive', n: 12, inner: 4, size: [0.55, 0.85] },
    levels: [
      { len: 3.4, r0: 0.12, end: 0.4, segs: 6, grav: 0.04, wob: 0.2, n: 5, start: 0.3, ang: [0.5, 1.0], f: [0.5, 0.8], radF: 0.5, rad: 6 },
      { segs: 3, end: 0.35, grav: 0.06, wob: 0.22, n: 4, start: 0.3, ang: [0.4, 1.0], f: [0.4, 0.7], radF: 0.55, rad: 4 },
      { segs: 2, end: 0.3, grav: 0.03, wob: 0.18, rad: 3 },
    ],
  },
  oak: {
    bark: 0x7a7064, H: 12.5, leaf: { tex: 'oak', n: 13, inner: 5, size: [1.4, 2.1] },
    levels: [
      { len: 5.2, r0: 0.46, end: 0.55, segs: 8, grav: 0.02, wob: 0.04, n: 5, start: 0.45, ang: [0.85, 1.35], f: [0.75, 1.05], radF: 0.5, rad: 8 },
      { segs: 5, end: 0.35, grav: 0.07, wob: 0.16, n: 5, start: 0.2, ang: [0.5, 1.1], f: [0.4, 0.65], radF: 0.5, rad: 6 },
      { segs: 3, end: 0.3, grav: 0.05, wob: 0.18, n: 3, start: 0.3, ang: [0.4, 1.0], f: [0.45, 0.7], radF: 0.6, rad: 4 },
      { segs: 2, end: 0.2, grav: 0.02, wob: 0.15, rad: 4 },
    ],
  },
};
SPECIES.birchMulti = { ...SPECIES.birch, stems: 3, stemLean: 0.22, H: 8 };

/* ------------------------------------------------------------ geometry merge */
class GeoB {
  constructor() { this.pos = []; this.nor = []; this.uv = []; this.col = []; this.sw = []; this.idx = []; this.n = 0; }
  vert(x, y, z, nx, ny, nz, u, v, r, g, b, s0, s1) {
    this.pos.push(x, y, z); this.nor.push(nx, ny, nz); this.uv.push(u, v); this.col.push(r, g, b); this.sw.push(s0, s1);
    return this.n++;
  }
  build(THREE) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('aSway', new THREE.Float32BufferAttribute(this.sw, 2));
    g.setIndex(this.n > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
    g.computeBoundingSphere(); g.computeBoundingBox();
    return g;
  }
}

/* ------------------------------------------------------------ tree generator */
function genTree(THREE, cfg, seed, q) {
  const rnd = rng(seed);
  const R = (a, b) => a + (b - a) * rnd();
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const UP = V(0, 1, 0), DOWN = V(0, -1, 0);
  const bark = new GeoB();
  const leafReq = [];
  const last = cfg.levels.length - 1;

  function perp(d) {
    const a = Math.abs(d.y) < 0.9 ? UP : V(1, 0, 0);
    const u = new THREE.Vector3().crossVectors(d, a).normalize();
    const v = new THREE.Vector3().crossVectors(d, u).normalize();
    return [u, v];
  }

  function tube(pts, radii, level, radial) {
    const n = Math.max(3, radial);
    const circ = Math.max(1, Math.round(Math.PI * 2 * radii[0]));
    const base = bark.n;
    let nrm = null;
    let vDist = 0;
    const lw = last ? level / last : 1;
    const bandBase = cfg.birchBands ? rnd() : 0;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      const t = new THREE.Vector3().subVectors(pts[Math.min(i + 1, pts.length - 1)], pts[Math.max(i - 1, 0)]).normalize();
      if (!nrm) nrm = perp(t)[0]; else { nrm = nrm.clone().addScaledVector(t, -nrm.dot(t)).normalize(); }
      const bn = new THREE.Vector3().crossVectors(t, nrm).normalize();
      if (i > 0) vDist += p.distanceTo(pts[i - 1]);
      const sw = Math.min(1, Math.pow(Math.max(p.y, 0) / cfg.H, 1.3)) * (0.25 + 0.75 * lw);
      let shade = 1;
      if (cfg.birchBands) { const band = Math.sin(vDist * 7.3 + bandBase * 20) * Math.sin(vDist * 2.1 + bandBase * 9); shade = band > 0.45 ? 0.25 : (level > 0 ? 0.55 : 0.92); }
      const r = radii[i];
      for (let j = 0; j <= n; j++) {
        const a = (j / n) * Math.PI * 2;
        const ca = Math.cos(a), sa = Math.sin(a);
        const nx = nrm.x * ca + bn.x * sa, ny = nrm.y * ca + bn.y * sa, nz = nrm.z * ca + bn.z * sa;
        bark.vert(p.x + nx * r, p.y + ny * r, p.z + nz * r, nx, ny, nz, (j / n) * circ, vDist, shade, shade, shade, sw, 0);
      }
    }
    for (let i = 0; i < pts.length - 1; i++) {
      for (let j = 0; j < n; j++) {
        const a = base + i * (n + 1) + j, b = a + n + 1;
        bark.idx.push(a, b, a + 1, a + 1, b, b + 1);
      }
    }
  }

  function branch(p0, dir, len, r0, L) {
    const C = cfg.levels[L];
    const segs = Math.max(2, Math.round(C.segs * (q.simple ? 0.7 : 1)));
    const step = len / segs;
    const pts = [p0.clone()], dirs = [dir.clone()], radii = [];
    const d = dir.clone();
    const rAt = (t) => r0 * (1 - (1 - C.end) * t);
    for (let i = 1; i <= segs; i++) {
      d.x += (rnd() - 0.5) * 2 * C.wob; d.y += (rnd() - 0.5) * 2 * C.wob; d.z += (rnd() - 0.5) * 2 * C.wob;
      if (C.grav >= 0) d.lerp(UP, C.grav); else d.lerp(DOWN, -C.grav);
      d.normalize();
      pts.push(pts[i - 1].clone().addScaledVector(d, step));
      dirs.push(d.clone());
    }
    for (let i = 0; i <= segs; i++) {
      let r = rAt(i / segs);
      if (L === 0) r *= i === 0 ? 1.45 : i === 1 ? 1.14 : 1;
      radii.push(Math.max(r, 0.006));
    }
    radii[segs] = Math.max(radii[segs] * 0.35, 0.005);
    tube(pts, radii, L, q.simple ? Math.max(3, C.rad - 2) : C.rad);

    const at = (t) => {
      const f = t * segs, i = Math.min(segs - 1, Math.floor(f)), k = f - i;
      return [pts[i].clone().lerp(pts[i + 1], k), dirs[i].clone().lerp(dirs[i + 1], k).normalize()];
    };
    if (L < last) {
      const n = Math.max(1, Math.round(C.n * (q.simple ? 0.75 : 1)));
      const phi0 = rnd() * 6.28;
      for (let k = 0; k < n; k++) {
        const t = C.start + (1 - C.start) * (k + rnd() * 0.8) / n;
        const [p, pd] = at(Math.min(t, 0.98));
        const [u, v] = perp(pd);
        const a = R(C.ang[0], C.ang[1]), phi = phi0 + k * 2.39996 + (rnd() - 0.5) * 0.6;
        const cd = pd.clone().multiplyScalar(Math.cos(a)).addScaledVector(u, Math.cos(phi) * Math.sin(a)).addScaledVector(v, Math.sin(phi) * Math.sin(a)).normalize();
        const taper = 1 - 0.35 * (t - C.start) / (1 - C.start + 1e-3);
        branch(p, cd, len * R(C.f[0], C.f[1]) * taper, Math.min(rAt(t) * C.radF, r0 * 0.9), L + 1);
      }
      // terminal leader continues the crown on the trunk/limbs: a short upward tip
      if (L === 0 || L === last - 1) {
        const tipLeaf = cfg.leaf.n * 0.5;
        if (L === last - 1 && cfg.leaf.inner) for (let i = 0; i < cfg.leaf.inner * q.cards; i++) pushLeaf(...at(R(0.35, 1)));
        void tipLeaf;
      }
    } else {
      const cnt = Math.max(1, Math.round(cfg.leaf.n * q.cards));
      for (let i = 0; i < cnt; i++) pushLeaf(...at(i === 0 ? 1 : R(0.2, 1)));
    }
  }

  function pushLeaf(p, d) {
    const s = R(cfg.leaf.size[0], cfg.leaf.size[1]) * q.size;
    leafReq.push({ p: p.clone().add(V(R(-0.15, 0.15), R(-0.1, 0.15), R(-0.15, 0.15))), d, s, sw: Math.min(1, Math.pow(Math.max(p.y, 0) / cfg.H, 1.2)) });
  }

  const stems = cfg.stems || 1;
  for (let s = 0; s < stems; s++) {
    const C0 = cfg.levels[0];
    let p0, dir;
    if (stems > 1) {
      const phi = (s / stems) * 6.283 + rnd() * 0.8, lean = cfg.stemLean * R(0.7, 1.2);
      p0 = V(Math.cos(phi) * 0.12, 0, Math.sin(phi) * 0.12);
      dir = V(Math.sin(lean) * Math.cos(phi), Math.cos(lean), Math.sin(lean) * Math.sin(phi)).normalize();
    } else {
      p0 = V(0, 0, 0);
      dir = V((rnd() - 0.5) * 0.08, 1, (rnd() - 0.5) * 0.08).normalize();
    }
    branch(p0, dir, C0.len * R(0.92, 1.08), C0.r0 * R(0.92, 1.08), 0);
  }

  // ---- leaf cards
  const leaf = new GeoB();
  const c = V(0, 0, 0);
  for (const l of leafReq) c.add(l.p);
  c.multiplyScalar(1 / Math.max(1, leafReq.length));
  let Rmax = 0.001;
  for (const l of leafReq) Rmax = Math.max(Rmax, l.p.distanceTo(c));
  const tint = cfg.leafTint || [1, 1, 1];
  for (const l of leafReq) {
    const out = l.p.clone().sub(c);
    const d01 = Math.min(1, out.length() / Rmax);
    out.normalize();
    const rs = V(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).normalize();
    const n = out.clone().multiplyScalar(0.6).addScaledVector(rs, 0.8).add(V(0, 0.35, 0)).normalize();
    const a = new THREE.Vector3().crossVectors(n, V(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5)).normalize();
    const b = new THREE.Vector3().crossVectors(n, a).normalize();
    const h = l.s * 0.5;
    const vn = out.clone().multiplyScalar(0.8).add(V(0, 0.35, 0)).addScaledVector(n, 0.2).normalize();
    const shade = (0.5 + 0.42 * Math.pow(d01, 0.8) + 0.1 * out.y) * R(0.85, 1.05);
    const cr = shade * tint[0] * R(0.93, 1.05), cg = shade * tint[1] * R(0.95, 1.05), cb = shade * tint[2] * R(0.9, 1.05);
    const base = leaf.n;
    const corners = [[-1, -1, 0, 0], [1, -1, 1, 0], [1, 1, 1, 1], [-1, 1, 0, 1]];
    for (const [sx, sy, u, v] of corners) {
      leaf.vert(l.p.x + (a.x * sx + b.x * sy) * h, l.p.y + (a.y * sx + b.y * sy) * h, l.p.z + (a.z * sx + b.z * sy) * h,
        vn.x, vn.y, vn.z, u, v, cr, cg, cb, l.sw, 1);
    }
    leaf.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  return { bark: bark.build(THREE), leaf: leaf.build(THREE) };
}

/* ------------------------------------------------------------ leaf textures */
function makeLeafTexture(THREE, kind, renderer) {
  const S = 512;
  const cv = document.createElement('canvas'); cv.width = cv.height = S;
  const g = cv.getContext('2d');
  const r = rng(kind.length * 977 + 13);
  const R = (a, b) => a + (b - a) * r();
  const P = {
    plane: { n: 4, len: 175, wid: 0, hue: [86, 46, 30], hs: 6, profile: 'palm' },
    birch: { n: 22, len: 86, wid: 40, hue: [96, 52, 40], hs: 7, profile: 'birch' },
    olive: { n: 26, len: 120, wid: 15, hue: [78, 20, 38], hs: 6, profile: 'olive' },
    oak: { n: 10, len: 130, wid: 46, hue: [98, 46, 23], hs: 5, profile: 'oak' },
  }[kind];
  const avg = `hsl(${P.hue[0]},${P.hue[1]}%,${P.hue[2]}%)`;

  function outline(len, wid, prof) {
    const pts = [];
    for (let i = 0; i <= 24; i++) {
      const t = i / 24;
      let w;
      if (prof === 'olive') w = wid * Math.pow(Math.sin(Math.PI * Math.pow(t, 0.85)), 0.8);
      else if (prof === 'birch') w = wid * Math.pow(Math.sin(Math.PI * Math.pow(t, 0.7)), 0.9) * (1 + 0.07 * Math.sin(t * 70));
      else if (prof === 'oak') w = wid * Math.pow(Math.sin(Math.PI * t), 0.6) * (0.72 + 0.28 * Math.cos(t * Math.PI * 7));
      else w = wid * Math.pow(Math.sin(Math.PI * t), 0.9);
      pts.push([t * len, w]);
    }
    g.beginPath(); g.moveTo(0, 0);
    for (const [x, w] of pts) g.lineTo(x, -w);
    for (let i = pts.length - 1; i >= 0; i--) g.lineTo(pts[i][0], pts[i][1]);
    g.closePath();
  }
  function oneLeaf(x, y, ang, len, wid, prof, light) {
    g.save(); g.translate(x, y); g.rotate(ang);
    const hh = P.hue[0] + R(-6, 6), ss = P.hue[1] + R(-8, 8), ll = P.hue[2] + R(-P.hs, P.hs) + (light || 0);
    const grad = g.createLinearGradient(0, -wid, 0, wid);
    grad.addColorStop(0, `hsl(${hh},${ss}%,${ll + 7}%)`); grad.addColorStop(1, `hsl(${hh},${ss}%,${ll - 5}%)`);
    g.fillStyle = grad; g.strokeStyle = `hsl(${hh},${ss}%,${ll - 11}%)`; g.lineWidth = 1.5;
    if (prof === 'palm') {
      for (let k = -2; k <= 2; k++) { g.save(); g.rotate(k * 0.62); const l = len * (1 - Math.abs(k) * 0.2); outline(l, l * 0.17, 'oak'); g.fill(); g.stroke(); g.restore(); }
    } else { outline(len, wid, prof); g.fill(); g.stroke(); }
    g.strokeStyle = `hsla(${hh},${ss - 10}%,${ll + 18}%,0.65)`; g.lineWidth = prof === 'olive' ? 1.4 : 2;
    g.beginPath(); g.moveTo(0, 0); g.lineTo(len * (prof === 'palm' ? 0.95 : 0.9), 0); g.stroke();
    if (prof === 'palm') for (let k = -2; k <= 2; k++) { g.save(); g.rotate(k * 0.62); g.beginPath(); g.moveTo(0, 0); g.lineTo(len * (1 - Math.abs(k) * 0.2) * 0.9, 0); g.stroke(); g.restore(); }
    else if (prof !== 'olive') {
      g.strokeStyle = `hsla(${hh},${ss}%,${ll - 8}%,0.35)`; g.lineWidth = 1;
      for (let i = 1; i < 6; i++) for (const sgn of [-1, 1]) { g.beginPath(); g.moveTo(len * i * 0.15, 0); g.lineTo(len * (i * 0.15 + 0.12), sgn * wid * 0.75 * Math.sin(Math.PI * i * 0.15)); g.stroke(); }
    }
    g.restore();
  }
  // hub twig
  g.strokeStyle = 'hsl(30,25%,24%)'; g.lineWidth = 3; g.lineCap = 'round';
  const hub = [S / 2, S / 2];
  const items = [];
  for (let i = 0; i < P.n; i++) {
    const a = r() * 6.283, d = P.profile === 'palm' ? R(0, 130) : R(10, 170);
    const x = hub[0] + Math.cos(a) * d * 0.9, y = hub[1] + Math.sin(a) * d * 0.9;
    items.push({ x, y, ang: P.profile === 'palm' ? R(0, 6.283) : a + R(-0.8, 0.8), light: R(-3, 4) });
  }
  if (P.profile !== 'palm') for (const it of items) { g.beginPath(); g.moveTo(hub[0], hub[1]); g.lineTo(it.x, it.y); g.stroke(); }
  for (const it of items) {
    const lenv = P.len * R(0.8, 1.1);
    if (P.profile === 'olive' && r() < 0.35) { g.globalAlpha = 1; const sv = P.hue[2]; P.hue[2] = sv + 14; oneLeaf(it.x, it.y, it.ang, lenv, P.wid, 'olive', 0); P.hue[2] = sv; }
    else oneLeaf(it.x, it.y, it.ang, lenv, P.wid || lenv * 0.2, P.profile, it.light);
  }
  // un-premultiply & fill the colour of transparent texels (no dark fringes in mips)
  const img = g.getImageData(0, 0, S, S);
  const d = img.data;
  const m = avg.match(/\d+/g).map(Number);
  const c = new THREE.Color().setHSL(m[0] / 360, m[1] / 100, m[2] / 100, THREE.SRGBColorSpace);
  const fr = Math.round(c.r * 255), fg = Math.round(c.g * 255), fb = Math.round(c.b * 255);
  for (let i = 0; i < d.length; i += 4) if (d[i + 3] < 6) { d[i] = fr; d[i + 1] = fg; d[i + 2] = fb; }
  const tex = new THREE.DataTexture(new Uint8Array(d.buffer.slice(0)), S, S, THREE.RGBAFormat);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.generateMipmaps = true; tex.minFilter = THREE.LinearMipmapLinearFilter; tex.magFilter = THREE.LinearFilter;
  tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  tex.needsUpdate = true;
  return tex;
}

/* -------------------------------------------------------------------- build */
export function build(ctx) {
  const { THREE, M, quality, renderer } = ctx;
  const low = quality === 'low';
  const q = { simple: low, cards: low ? 0.6 : 1, size: low ? 1.3 : 1 };
  const group = new THREE.Group(); group.name = 'trees';
  const colliders = [];

  const uTime = { value: 0 };
  const uWind = { value: ctx.reducedMotion ? 0 : 1 };
  const uSunV = { value: new THREE.Vector3(0.4, 0.8, 0.4) };

  const windVertex = (shader) => {
    shader.uniforms.uTime = uTime; shader.uniforms.uWind = uWind;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 aSway;\nuniform float uTime;\nuniform float uWind;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
      {
        vec3 ip = vec3(0.0);
        #ifdef USE_INSTANCING
          ip = instanceMatrix[3].xyz;
        #endif
        float ph = ip.x * 0.31 + ip.z * 0.47;
        float gust = 0.55 + 0.45 * sin(uTime * 0.45 + ph * 0.7);
        float sw = aSway.x * aSway.x * uWind;
        transformed.x += sin(uTime * 1.15 + ph + position.y * 0.35) * 0.11 * sw * gust;
        transformed.z += cos(uTime * 0.93 + ph * 1.3 + position.y * 0.3) * 0.09 * sw * gust;
        transformed.y += sin(uTime * 1.7 + ph) * 0.02 * sw;
        float fl = aSway.y * uWind * (0.35 + gust);
        transformed += vec3(sin(uTime * 6.5 + position.x * 8.0 + position.y * 5.0 + ph),
                            cos(uTime * 5.7 + position.z * 7.0 + position.y * 3.0),
                            sin(uTime * 5.1 + position.y * 6.0 + position.x * 4.0)) * 0.03 * fl;
      }`);
  };
  const depthMat = (map) => {
    const m = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: map || null, alphaTest: map ? 0.5 : 0 });
    m.onBeforeCompile = windVertex;
    return m;
  };
  const barkMats = new Map();
  const barkMat = (hex) => {
    if (!barkMats.has(hex)) {
      const m = M.get('bark', { color: hex }).clone();
      // clone() loses nothing: map/normal views are shared texture objects
      m.vertexColors = true; m.onBeforeCompile = windVertex;
      barkMats.set(hex, m);
    }
    return barkMats.get(hex);
  };
  const barkDepth = depthMat(null);
  const leafMats = new Map();
  const leafMat = (kind) => {
    if (!leafMats.has(kind)) {
      const tex = makeLeafTexture(THREE, kind, renderer);
      const m = new THREE.MeshStandardMaterial({ map: tex, vertexColors: true, side: THREE.DoubleSide, alphaTest: 0.5, roughness: 0.62, metalness: 0, envMapIntensity: 0.9 });
      m.alphaToCoverage = true;
      m.onBeforeCompile = (shader) => {
        windVertex(shader);
        shader.uniforms.uSunV = uSunV;
        shader.fragmentShader = shader.fragmentShader
          .replace('#include <common>', '#include <common>\nuniform vec3 uSunV;')
          .replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\n  normal = normalize(vNormal);')
          .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
          {
            float bl = pow(clamp(dot(-normalize(vViewPosition), uSunV), 0.0, 1.0), 4.0);
            totalEmissiveRadiance += diffuseColor.rgb * (0.05 + 0.32 * bl);
          }`);
      };
      leafMats.set(kind, { mat: m, depth: depthMat(tex) });
    }
    return leafMats.get(kind);
  };

  /* ----- templates (variants) ----- */
  const VARIANTS = { plane: 2, birch: 2, birchMulti: 1, olive: 2, oak: 3 };
  const templates = {};
  let seedBase = 1000;
  for (const key of Object.keys(VARIANTS)) {
    templates[key] = [];
    for (let v = 0; v < VARIANTS[key]; v++) templates[key].push({ ...genTree(THREE, SPECIES[key], seedBase += 7919, q), instances: [] });
  }

  /* ----- placements ----- */
  const place = [];
  const add = (key, x, z, scale = 1, extra = {}) => place.push({ key, x, z, scale, ...extra });
  for (const x of [-18, 18]) for (const z of [21, 24.5, 28, 31.5, 35]) add('plane', x, z, 0.95 + ((x * 7 + z * 13) % 5) * 0.03);
  add('birchMulti', 36, 21, 1.0);
  add('olive', 56, 21, 1.0);
  add('oak', 36, 42, 0.72);
  add('birch', 60, 46, 1.05);
  for (let i = 0; i < 8; i++) {
    const z = 14 + i * (32 / 7), x = -66 - Math.sin((i / 7) * Math.PI) * 4 + ((i * 5) % 3 - 1) * 0.8;
    if (i % 2) add('oak', x, z, 0.62 + (i % 3) * 0.05); else add('olive', x, z, 1.05 + (i % 3) * 0.1);
  }
  add('olive', -34, 12, 1.0); add('olive', -34, 48, 1.1);
  for (let i = 0; i < 10; i++) {
    const x = -27 + i * 6 + ((i * 7) % 5 - 2) * 0.9, z = -24 - ((i * 37) % 17) - (i % 2) * 2;
    add('oak', x, z, 1.15 + ((i * 3) % 4) * 0.1);
  }
  [[-20, 76, 'oak', 0.8], [-11, 80, 'plane', 1.0], [9, 75, 'birch', 1.1], [16, 81, 'oak', 0.85], [23, 77, 'plane', 1.0]].forEach(([x, z, k, s]) => add(k, x, z, s));
  // keep the axis x +-4 clear
  for (const p of place) if (p.z > 72 && Math.abs(p.x) < 4.5) p.x = p.x < 0 ? -5 : 5;

  const dummy = new THREE.Object3D();
  place.forEach((p, i) => {
    const vs = templates[p.key];
    const v = vs[(i * 5 + (p.key === 'oak' ? 2 : 0)) % vs.length];
    const r = rng(i * 131 + 7);
    v.instances.push({ x: p.x, z: p.z, s: p.scale * (0.92 + r() * 0.16), ry: r() * 6.283, tx: (r() - 0.5) * 0.04, tz: (r() - 0.5) * 0.04, c: 0.9 + r() * 0.2 });
    colliders.push({ minX: p.x - 0.3, maxX: p.x + 0.3, minZ: p.z - 0.3, maxZ: p.z + 0.3, minY: 0, maxY: 3 });
  });

  const col = new THREE.Color();
  for (const key of Object.keys(templates)) {
    const sp = SPECIES[key];
    const tex = { plane: 'plane', birch: 'birch', birchMulti: 'birch', olive: 'olive', oak: 'oak' }[key];
    for (const t of templates[key]) {
      const n = t.instances.length;
      if (!n) continue;
      const bm = new THREE.InstancedMesh(t.bark, barkMat(sp.bark), n);
      bm.name = 'tree-bark-' + key; bm.userData.kind = 'tree';
      const lm = leafMat(tex);
      const lmesh = new THREE.InstancedMesh(t.leaf, lm.mat, n);
      bm.customDepthMaterial = barkDepth; lmesh.customDepthMaterial = lm.depth;
      t.instances.forEach((o, i) => {
        dummy.position.set(o.x, 0, o.z);
        dummy.rotation.set(o.tx, o.ry, o.tz);
        dummy.scale.setScalar(o.s);
        dummy.updateMatrix();
        bm.setMatrixAt(i, dummy.matrix); lmesh.setMatrixAt(i, dummy.matrix);
        lmesh.setColorAt(i, col.setRGB(o.c, o.c * (0.97 + (i % 3) * 0.02), o.c * 0.96));
      });
      for (const m of [bm, lmesh]) { m.castShadow = true; m.receiveShadow = true; m.instanceMatrix.needsUpdate = true; m.frustumCulled = false; group.add(m); }
      lmesh.instanceColor.needsUpdate = true;
    }
  }

  /* ----- sun for the translucency term ----- */
  let sun = null, scanned = 0;
  const sv = new THREE.Vector3(), tv = new THREE.Vector3();
  const findSun = () => { ctx.scene.traverse((o) => { if (!sun && o.isDirectionalLight) sun = o; }); };

  return {
    group, regions: [], colliders, pickables: [],
    update(dt, frame) {
      if (!ctx.reducedMotion) uTime.value += dt;
      if (!sun && scanned++ % 60 === 0) findSun();
      if (sun && frame && frame.camera) {
        sun.getWorldPosition(sv); sun.target.getWorldPosition(tv); sv.sub(tv).normalize();
        uSunV.value.copy(sv).transformDirection(frame.camera.matrixWorldInverse);
      }
    },
    onPick() {},
  };
}
