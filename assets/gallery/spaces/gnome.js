// gnome.js — "O Gnomo Nómada": a 40 cm glazed-terracotta garden gnome that only
// ever moves while nobody is looking at it (the hall's own trick, as a prank).
//
// Whenever it has been outside the camera's frustum for a few seconds it hops,
// unseen, to another perch a little closer to the visitor — a bench end, a hedge
// top, the fountain's coping, a gate pier, the plaza's low wall — and at last to
// the edge of the path just behind them. It is always found upright, facing you,
// perfectly still. Click it: a tiny shrug (the only time it moves in view), a
// ceramic "tok", a muttered "hm." — and at the next look-away it goes home, to
// the birch in the far corner of the garden, and starts over.
//
// Budget: 3 draw calls (glazed body, glazed arms, contact shadow; the pick proxy
// is invisible). It casts no real shadow on purpose: the sun's shadow map is
// rendered once (environment.js), so a caster that moves would leave its shadow
// behind. update() is a distance test, one Frustum from one reused Matrix4 and a
// sphere test; it does nothing beyond 60 m and allocates nothing.
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

const FAR2 = 60 * 60;   // beyond 60 m: nothing is evaluated
const ACT = 45;         // it stalks a visitor within 45 m
const VIEW_R = 0.32;    // bounding sphere of the figure (centre 0.2 m above its feet)
const SAFE_R = 0.6;     // a destination must be at least this far outside the view
const BEHIND = 2.3;     // the punchline: this far behind the visitor, at the path's edge
const ARM_Y = 0.205;    // shoulder line (pivot of the shrug)
const LINES = ['hm.', 'hm.', 'hm…', 'hm. Não me mexi.'];

export function build(ctx) {
  const { THREE } = ctx;
  const low = ctx.quality === 'low';
  const reduced = !!ctx.reducedMotion;
  const group = new THREE.Group();
  group.name = 'gnome';

  // =============================================================== the figure ==
  // Local frame: feet at the origin, +y up, +z is the way it faces.
  const SEG = low ? 18 : 32;
  const C = (hex) => new THREE.Color(hex);          // sRGB in, linear out
  const PAL = {
    hat: C(0xb3151c), hatTip: C(0x7e0f16), beard: C(0xf2efe7), groove: C(0xb9b2a4),
    skin: C(0xf0b597), cheek: C(0xe2786f), nose: C(0xe6887a), eye: C(0x15110e), white: C(0xf3f0e8),
    coat: C(0x1f4d96), belt: C(0x3a2314), buckle: C(0xd4a33a), trousers: C(0x6b4a2b),
    boots: C(0x1d1714), moss: C(0x58712f), soil: C(0x5a4630),
  };
  const v3 = new THREE.Vector3(), q4 = new THREE.Quaternion(), Z = new THREE.Vector3(0, 0, 1);
  const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

  // only position + normal, seams welded so deformed parts stay smooth
  const prep = (g) => {
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
    const m = mergeVertices(g, 1e-5); g.dispose(); return m;
  };
  const deform = (g, fn) => {
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { v3.fromBufferAttribute(p, i); fn(v3); p.setXYZ(i, v3.x, v3.y, v3.z); }
    g.computeVertexNormals();
    return g;
  };
  // vertex colour + chip zone (0 = sound glaze … 1 = chipped edges) for every vertex
  const out = new THREE.Color();
  const paint = (list, g, fn) => {
    const p = g.attributes.position, n = g.attributes.normal;
    const col = new Float32Array(p.count * 3), zone = new Float32Array(p.count);
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      zone[i] = fn(x, y, z, n.getY(i), n.getZ(i));
      const hand = 0.95 + 0.05 * Math.sin(x * 91 + y * 57) * Math.sin(z * 83 - y * 39);   // hand-painted unevenness
      col[i * 3] = out.r * hand; col[i * 3 + 1] = out.g * hand; col[i * 3 + 2] = out.b * hand;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('zone', new THREE.BufferAttribute(zone, 1));
    list.push(g);
  };
  const lathe = (pts, seg = SEG) =>
    prep(new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg, Math.PI));   // seam at the back
  const blob = (r, x, y, z, sx, sy, sz, seg = 14) => {
    const g = prep(new THREE.SphereGeometry(1, seg, Math.max(6, seg - 4)));
    g.scale(sx * r, sy * r, sz * r); g.translate(x, y, z); return g;
  };

  // the coat's silhouette, and the front surface of coat + head (beard and hands rest on it)
  const COAT = [[0, 0.098], [0.07, 0.1], [0.082, 0.092], [0.088, 0.094], [0.091, 0.104], [0.094, 0.122],
    [0.0955, 0.14], [0.093, 0.16], [0.086, 0.18], [0.075, 0.198], [0.062, 0.212], [0.048, 0.222],
    [0.036, 0.23], [0.026, 0.236], [0, 0.24]];
  const coatR = (y) => {
    if (y < 0.094 || y > 0.236) return 0;
    for (let i = 3; i < 13; i++) {
      const [r0, y0] = COAT[i], [r1, y1] = COAT[i + 1];
      if (y <= y1) return r0 + (r1 - r0) * (y - y0) / (y1 - y0);
    }
    return 0;
  };
  const belly = (y) => 1 + 0.12 * Math.exp(-(((y - 0.125) / 0.04) ** 2));
  const front = (x, y) => {
    const r = coatR(y);
    let z = Math.abs(x) < r ? Math.sqrt(r * r - x * x) * belly(y) + (y > 0.12 && y < 0.136 ? 0.005 : 0) : 0;
    const hy = (y - 0.262) / 0.96, h2 = 0.0025 - x * x - hy * hy;
    if (h2 > 0) z = Math.max(z, 0.004 + Math.sqrt(h2));
    return z;
  };

  const body = [], arms = [];

  // round base: a glazed mossy mound on an earthy rim
  paint(body, deform(lathe([[0, 0], [0.098, 0], [0.104, 0.005], [0.106, 0.014], [0.101, 0.022], [0.09, 0.026], [0.05, 0.028], [0, 0.029]]),
    (v) => { if (v.y > 0.02) v.y += 0.0025 * Math.sin(v.x * 140) * Math.sin(v.z * 120 + 1); }),
  (x, y, z, ny) => {
    out.copy(PAL.soil).lerp(PAL.moss, smooth(0.012, 0.024, y));
    if (ny > 0.5 && Math.hypot(x, z) < 0.075) out.multiplyScalar(0.85);
    return Math.hypot(x, z) > 0.095 ? 0.9 : 0.15;
  });

  // boots, toes splayed and turned up
  for (const s of [-1, 1]) {
    const g = prep(new THREE.SphereGeometry(1, 14, 10));
    deform(g, (v) => {
      let x = v.x * 0.027, y = v.y * 0.021, z = v.z * 0.043;
      y = Math.max(y, -0.017) + 3.5 * Math.max(0, z - 0.01) ** 2;
      const a = s * 0.18, c = Math.cos(a), sn = Math.sin(a);
      v.set(x * c + z * sn + s * 0.034, y + 0.045, -x * sn + z * c + 0.02);
    });
    paint(body, g, (x, y, z) => { out.copy(PAL.boots); return z > 0.05 ? 1 : 0.15; });
  }

  // trouser legs (mostly in the coat's shade)
  for (const s of [-1, 1]) {
    const g = prep(new THREE.CylinderGeometry(0.024, 0.026, 0.065, 12, 1, true));
    g.translate(s * 0.033, 0.075, 0.004);
    paint(body, g, (x, y) => { out.copy(PAL.trousers).multiplyScalar(0.55 + 0.25 * smooth(0.1, 0.05, y)); return 0.1; });
  }

  // the coat: pear-shaped, a round belly, a few sculpted folds at the hem
  paint(body, deform(lathe(COAT), (v) => {
    const th = Math.atan2(v.x, v.z), fold = 1 + 0.025 * Math.sin(th * 9) * smooth(0.13, 0.095, v.y);
    v.x *= fold; v.z *= fold;
    v.z *= v.z > 0 ? belly(v.y) : 0.96;
  }), (x, y, z, ny) => {
    out.copy(PAL.coat);
    if (ny < -0.4) out.multiplyScalar(0.45);
    else if (y < 0.1) out.multiplyScalar(0.8);
    if (z > 0 && Math.abs(x) < 0.05 && y > 0.14 && y < 0.22) out.multiplyScalar(0.82);      // under the beard
    if (Math.abs(x) > 0.065 && y > 0.14 && y < 0.2) out.multiplyScalar(0.85);              // under the arms
    return y < 0.097 ? 0.7 : 0.12;
  });

  // belt and buckle
  paint(body, deform(lathe([[0.0965, 0.121], [0.0995, 0.1225], [0.1, 0.128], [0.0995, 0.1335], [0.0962, 0.135]]),
    (v) => { v.z *= v.z > 0 ? belly(v.y) : 0.96; }),
  () => { out.copy(PAL.belt); return 0.3; });
  {
    const bz = 0.1 * belly(0.128) + 0.0012, parts = [];
    for (const [w, h, x, y] of [[0.03, 0.006, 0, 0.0115], [0.03, 0.006, 0, -0.0115], [0.006, 0.023, 0.012, 0], [0.006, 0.023, -0.012, 0]]) {
      const g = new THREE.BoxGeometry(w, h, 0.005); g.translate(x, 0.128 + y, bz); parts.push(prep(g));
    }
    const g = mergeGeometries(parts); parts.forEach((p) => p.dispose());
    paint(body, g, () => { out.copy(PAL.buckle); return 0.6; });
  }

  // head, ears, rosy cheeks
  paint(body, blob(0.05, 0, 0.262, 0.004, 1, 0.96, 1, low ? 16 : 24), (x, y, z) => {
    out.copy(PAL.skin);
    for (const s of [-1, 1]) {
      const d2 = (x - s * 0.028) ** 2 + (y - 0.256) ** 2 + (z - 0.04) ** 2;
      out.lerp(PAL.cheek, 0.75 * Math.exp(-d2 / 0.00018));
    }
    if (y > 0.272) out.multiplyScalar(0.88);   // in the brim's shade
    return 0.08;
  });
  for (const s of [-1, 1]) paint(body, blob(1, s * 0.0495, 0.263, -0.004, 0.008, 0.016, 0.011, 10), () => { out.copy(PAL.skin).multiplyScalar(0.92); return 0.5; });

  // nose, eyes, brows
  paint(body, blob(0.0175, 0, 0.258, 0.054, 1, 0.92, 1.05, 16), (x, y, z) => { out.copy(PAL.nose); return z > 0.066 ? 1 : 0.2; });
  for (const s of [-1, 1]) {
    paint(body, blob(0.0075, s * 0.0185, 0.273, 0.0445, 1, 1, 1, 10), () => { out.copy(PAL.white); return 0; });
    paint(body, blob(0.0045, s * 0.0185, 0.2735, 0.0488, 1, 1, 1, 8), () => { out.copy(PAL.eye); return 0; });
    const brow = prep(new THREE.SphereGeometry(1, 10, 6));
    brow.scale(0.013, 0.0045, 0.006); brow.rotateZ(-s * 0.25); brow.translate(s * 0.02, 0.2825, 0.0475);
    paint(body, brow, () => { out.copy(PAL.beard); return 0.3; });
  }

  // the beard: draped over chest and belly, sculpted in locks; moustache; sideburns
  const lockOf = (x, y) => Math.sin(x * 230 + Math.sin(y * 70) * 1.2);
  const beardPaint = (x, y, z) => {
    out.copy(PAL.beard).lerp(PAL.groove, 0.55 * smooth(-0.2, -0.9, lockOf(x, y)));
    return y < 0.13 ? 0.7 : 0.12;
  };
  paint(body, deform(prep(new THREE.SphereGeometry(1, low ? 18 : 28, low ? 14 : 20)), (v) => {
    const ux = v.x, uy = v.y, uz = v.z, k = Math.max(0, -uy);
    const x = ux * 0.058 * (1 - 0.6 * k * k) * (1 + 0.1 * Math.max(0, uy));
    const y = 0.185 + uy * 0.07 - 0.01 * k * k;
    let z = 0.046 + uz * 0.045 * (1 - 0.2 * k);
    if (uz > -0.3) z = Math.max(z, front(x, y) + 0.003 + 0.01 * Math.max(0, uz));
    if (uz > 0) z += 0.0022 * lockOf(x, y) * uz;
    v.set(x, y, z);
  }), beardPaint);
  for (const s of [-1, 1]) {
    const m = prep(new THREE.SphereGeometry(1, 12, 8));
    m.scale(0.022, 0.0095, 0.012); m.rotateZ(s * 0.3); m.rotateY(s * 0.35); m.translate(s * 0.017, 0.2465, 0.057);
    paint(body, m, beardPaint);
    paint(body, deform(prep(new THREE.SphereGeometry(1, 12, 9)), (v) => {
      const x = s * 0.038 + v.x * 0.013, y = 0.244 + v.y * 0.024;
      v.set(x, y, Math.max(0.026 + v.z * 0.018, v.z > -0.2 ? front(x, y) + 0.004 * Math.max(0.2, v.z) : -1));
    }), beardPaint);
  }

  // the pointed red hat, tip bent back, set slightly back on the head
  paint(body, deform(lathe([[0.04, 0.281], [0.058, 0.277], [0.0615, 0.281], [0.06, 0.287], [0.055, 0.296],
    [0.049, 0.312], [0.041, 0.332], [0.032, 0.352], [0.022, 0.372], [0.012, 0.389], [0.005, 0.4], [0, 0.405]]), (v) => {
    const t = smooth(0.28, 0.405, v.y), th = Math.atan2(v.x, v.z), crumple = 1 + 0.018 * Math.sin(th * 3 + v.y * 80) * t;
    v.x = v.x * crumple + 0.008 * t * t * t; v.z = v.z * crumple - 0.03 * t ** 2.2;
    const a = -0.12, y = v.y - 0.28, z = v.z;
    v.y = 0.28 + y * Math.cos(a) - z * Math.sin(a); v.z = y * Math.sin(a) + z * Math.cos(a);
  }), (x, y, z, ny) => {
    const t = smooth(0.29, 0.4, y);
    out.copy(PAL.hat).lerp(PAL.hatTip, 0.6 * t * t);
    if (ny < -0.3) out.multiplyScalar(0.55);
    else if (y < 0.286) out.multiplyScalar(0.85);
    return t > 0.88 ? 1 : y < 0.285 ? 0.8 : 0.14;
  });

  // arms: sleeves from the shoulders, cuffs, mitten hands resting on the belly
  for (const s of [-1, 1]) {
    const path = new THREE.CatmullRomCurve3([
      new THREE.Vector3(s * 0.062, 0.208, 0), new THREE.Vector3(s * 0.092, 0.188, 0.012),
      new THREE.Vector3(s * 0.105, 0.16, 0.04), new THREE.Vector3(s * 0.055, 0.143, 0.1),
    ]);
    const TS = low ? 10 : 16, RS = low ? 8 : 12;
    const tube = new THREE.TubeGeometry(path, TS, 0.02, RS, false);
    {
      const p = tube.attributes.position, c = new THREE.Vector3();
      for (let i = 0; i < p.count; i++) {
        const t = Math.floor(i / (RS + 1)) / TS;
        path.getPointAt(t, c);
        const k = (0.021 - 0.005 * t) / 0.02;
        v3.fromBufferAttribute(p, i).sub(c).multiplyScalar(k).add(c);
        p.setXYZ(i, v3.x, v3.y, v3.z);
      }
    }
    paint(arms, deform(prep(tube), () => {}), (x, y) => { out.copy(PAL.coat); if (y < 0.155) out.multiplyScalar(0.9); return 0.12; });
    paint(arms, blob(0.023, s * 0.062, 0.208, 0, 1, 1, 1, 12), () => { out.copy(PAL.coat); return 0.12; });
    const end = path.getPointAt(1), tan = path.getTangentAt(1);
    q4.setFromUnitVectors(Z, tan);
    const cuff = prep(new THREE.TorusGeometry(0.0172, 0.0042, 8, 16));
    cuff.applyQuaternion(q4); cuff.translate(end.x, end.y, end.z);
    paint(arms, cuff, () => { out.copy(PAL.coat).multiplyScalar(1.12); return 0.5; });
    const hand = prep(new THREE.SphereGeometry(1, 12, 9));
    hand.scale(0.0175, 0.015, 0.019); hand.applyQuaternion(q4);
    hand.translate(end.x + tan.x * 0.014, end.y + tan.y * 0.014, end.z + tan.z * 0.014);
    paint(arms, hand, (x, y, z) => { out.copy(PAL.skin); return z > 0.118 ? 0.8 : 0.2; });
  }

  // ---- glazed ceramic: clearcoat over enamel; chips of bare terracotta, in-shader
  const glaze = new THREE.MeshPhysicalMaterial({
    vertexColors: true, roughness: 0.5, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.1,
  });
  glaze.name = 'gnome-glaze';
  glaze.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float zone;\nvarying float vZone;\nvarying vec3 vObj;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvZone = zone;\nvObj = position;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
varying float vZone;
varying vec3 vObj;
float gnH(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float gnN(vec3 x) {
  vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(gnH(i), gnH(i + vec3(1, 0, 0)), f.x), mix(gnH(i + vec3(0, 1, 0)), gnH(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(gnH(i + vec3(0, 0, 1)), gnH(i + vec3(1, 0, 1)), f.x), mix(gnH(i + vec3(0, 1, 1)), gnH(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
float gnn = gnN(vObj * 70.0) * 0.6 + gnN(vObj * 210.0 + 7.0) * 0.4;
float gnT = 0.8 - 0.27 * vZone;
float gnChip = smoothstep(gnT, gnT + 0.012, gnn);
float gnRim = smoothstep(gnT - 0.035, gnT, gnn) - gnChip;
vec3 gnClay = mix(vec3(0.46, 0.17, 0.08), vec3(0.6, 0.28, 0.15), gnN(vObj * 400.0));
diffuseColor.rgb = mix(diffuseColor.rgb * (1.0 - 0.35 * gnRim), gnClay, gnChip);`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.9, gnChip);')
      .replace('#include <lights_physical_fragment>', '#include <lights_physical_fragment>\n#ifdef USE_CLEARCOAT\nmaterial.clearcoat *= 1.0 - gnChip;\n#endif');
  };
  glaze.customProgramCacheKey = () => 'gnome-glaze-1';

  const root = new THREE.Group();
  root.name = 'gnome-figure';
  root.userData.action = { type: 'custom', id: 'gnome', label: 'Cumprimentar o gnomo' };
  group.add(root);

  const bodyMesh = new THREE.Mesh(mergeGeometries(body), glaze);
  body.forEach((g) => g.dispose());
  const armGeo = mergeGeometries(arms); arms.forEach((g) => g.dispose());
  armGeo.translate(0, -ARM_Y, 0);
  const armMesh = new THREE.Mesh(armGeo, glaze);
  armMesh.position.y = ARM_Y;
  for (const m of [bodyMesh, armMesh]) { m.castShadow = false; m.receiveShadow = true; root.add(m); }

  // contact shadow: a soft disc in vertex alpha (no texture)
  const shadow = (() => {
    const R = [0, 0.07, 0.12, 0.17, 0.22], A = [0.5, 0.42, 0.2, 0.06, 0], S = 24;
    const pos = [], col = [], idx = [];
    for (let j = 0; j < R.length; j++) for (let i = 0; i < S; i++) {
      const a = (i / S) * Math.PI * 2;
      pos.push(Math.cos(a) * R[j], 0, Math.sin(a) * R[j]); col.push(0, 0, 0, A[j]);
    }
    for (let j = 0; j < R.length - 1; j++) for (let i = 0; i < S; i++) {
      const a = j * S + i, b = j * S + ((i + 1) % S), c = a + S, d = b + S;
      idx.push(a, b, c, b, d, c);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 4));
    g.setIndex(idx);
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({
      vertexColors: true, transparent: true, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    }));
    m.position.y = 0.004; m.renderOrder = 1; m.name = 'gnome-contact-shadow';
    return m;
  })();
  root.add(shadow);

  // generous invisible pick target (not drawn: its material is invisible)
  const proxy = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.46, 8).translate(0, 0.23, 0),
    new THREE.MeshBasicMaterial({ visible: false }));
  proxy.name = 'gnome-pick';
  root.add(proxy);

  // ================================================================== perches ==
  // Surfaces read off garden.js (benches, hedges, tree pits, sculpture pad, gate
  // piers), fountain.js (coping), pergola.js (posts), plaza.js (east wall, piers)
  // and trees.js (the four specimen trees).
  const perches = [];
  const perch = (x, y, z, kind) => perches.push({
    x, y, z, min: kind === 'bench' ? 1.0 : 1.6, blob: kind === 'hedge' ? 0 : kind === 'bench' ? 0.8 : 1, deep: x > 30,
  });
  perch(59.05, 0.012, 45.4, 'ground');                          // HOME: the birch's tree pit, far corner
  perch(36.8, 0.012, 21.83, 'ground');                          // under the multi-stem birch
  perch(55.15, 0.012, 21.8, 'ground');                          // under the olive
  perch(36.9, 0.012, 41.3, 'ground');                           // under the oak
  perch(55.0, 0.012, 37.25, 'ground');                          // the sculpture pad, admiring the corten
  for (const [bx, bz, a] of [[33, 25.75, Math.PI], [33, 32.25, 0], [42.9, 19, -Math.PI / 2],
    [49.1, 19, Math.PI / 2], [49.1, 40, Math.PI / 2], [42.9, 40, -Math.PI / 2]]) {
    for (const lx of [-0.6, 0.6]) {                             // bench ends, on the slats (seat top 0.47)
      const c = Math.cos(a), s = Math.sin(a);
      perch(bx + lx * c + 0.04 * s, 0.47, bz - lx * s + 0.04 * c, 'bench');
    }
  }
  for (const deg of [30, 90, 150, 210, 270, 330]) {             // the fountain's coping (flat top 0.50, r 2.98–3.42)
    const t = deg * Math.PI / 180;
    perch(46 + 3.2 * Math.cos(t), 0.5, 29 + 3.2 * Math.sin(t), 'ledge');
  }
  {                                                             // clipped-yew hedge tops, on a mesh vertex
    const RES = low ? 0.4 : 0.2;
    const dsp = (x, y, z) => 0.035 * Math.sin(x * 2.3 + y * 1.7) * Math.sin(z * 2.9 - y * 2.1) + 0.02 * Math.sin(x * 6.7 + z * 5.3 + y * 4.1);
    const top = (x0, x1, z0, z1, at) => {
      const w = x1 - x0, d = z1 - z0;
      let x = (x0 + x1) / 2, z = (z0 + z1) / 2;
      if (d > w) { const s = d / Math.max(2, Math.ceil(d / RES)); z = z0 + Math.round((at - z0) / s) * s; }
      else { const s = w / Math.max(1, Math.ceil(w / RES)); x = x0 + Math.round((at - x0) / s) * s; }
      perch(x, 1.6 + dsp(x, 1.6, z) - 0.015, z, 'hedge');
    };
    top(28, 28.7, 14.3, 26.45, 24.4); top(28, 28.7, 31.55, 49.7, 33.6);
    top(63.3, 64, 14.3, 26.45, 24.4); top(63.3, 64, 31.55, 49.7, 33.6);
    top(28, 64, 14, 14.7, 40); top(28, 64, 14, 14.7, 54);
    top(28, 64, 49.3, 50, 38); top(28, 64, 49.3, 50, 52);
  }
  for (const x of [28.35, 63.65]) for (const z of [26.725, 31.275]) perch(x, 2.2, z, 'ledge');   // gate pier caps
  perch(53.0, 0.005, 26.85, 'ground'); perch(59.0, 0.005, 31.15, 'ground');                      // beside pergola posts
  perch(23.78, 0.6, 25.3, 'ledge'); perch(23.78, 0.6, 32.7, 'ledge');                            // plaza's low east wall
  perch(24.17, 1.83, 26.65, 'ledge'); perch(24.17, 1.83, 31.35, 'ledge');                        // plaza's east gate piers

  // ==================================================================== state ==
  const frustum = new THREE.Frustum(), pv = new THREE.Matrix4(), sphere = new THREE.Sphere();
  const spot = { x: 0, y: 0, z: 0 };
  let gx = 0, gy = 0, gz = 0, cur = 0;
  let hidden = 0, seen = false, wait = 3, homing = false, far = true, shrugT = -1, clicks = 0;
  let seed = 20261115;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);

  function placeAt(x, y, z, b) {
    gx = x; gy = y; gz = z;
    root.position.set(x, y, z);
    shadow.visible = b > 0;
    if (b > 0) shadow.scale.setScalar(b);
  }
  const face = (cp) => { root.rotation.y = Math.atan2(cp.x - gx, cp.z - gz); };
  const sync = (cam) => { pv.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse); frustum.setFromProjectionMatrix(pv); };
  const seenAt = (x, y, z, r) => { sphere.center.set(x, y + 0.2, z); sphere.radius = r; return frustum.intersectsSphere(sphere); };
  const dist = (cp, x, y, z) => { const a = cp.x - x, b = cp.y - y - 0.2, c = cp.z - z; return Math.sqrt(a * a + b * b + c * c); };
  placeAt(perches[0].x, perches[0].y, perches[0].z, perches[0].blob);
  root.rotation.y = Math.atan2(28 - gx, 29 - gz);              // watching the west gate

  // The last hop: just behind the visitor, at the edge of the main path (or its
  // connector, or a cross path) — out of the walking line, never on the crossing.
  function behind(cam) {
    const e = cam.matrixWorld.elements, cp = cam.position;
    let fx = -e[8], fz = -e[10];
    const l = Math.sqrt(fx * fx + fz * fz);
    if (l < 1e-3) return false;
    fx /= l; fz /= l;
    const bx = cp.x - fx * BEHIND, bz = cp.z - fz * BEHIND;
    if (bx > 23.4 && bx < 63.2 && bz > 26 && bz < 32 && cp.z > 26.5 && cp.z < 31.5) {
      if ((bx - 46) ** 2 + (bz - 29) ** 2 < 6.2 * 6.2) return false;
      const conn = bx < 28.8;
      spot.x = bx; spot.y = 0.008; spot.z = bz < 29 ? (conn ? 27.88 : 27.78) : (conn ? 30.12 : 30.22);
      return true;
    }
    if (bx > 43.8 && bx < 48.2 && cp.x > 44 && cp.x < 48 && ((bz > 15.2 && bz < 23.3) || (bz > 34.7 && bz < 48.8))) {
      spot.x = bx < 46 ? 44.78 : 47.22; spot.y = 0.008; spot.z = bz;
      return true;
    }
    return false;
  }

  // Choose and take the next perch (never one in view). Rare: a few times a minute.
  function hop(cam) {
    cam.updateMatrixWorld();
    sync(cam);
    const cp = cam.position, dCur = dist(cp, gx, gy, gz);
    let best = -2, score = Infinity;
    for (let i = 0; i < perches.length; i++) {
      if (i === cur) continue;
      const p = perches[i];
      const d = dist(cp, p.x, p.y, p.z);
      let s;
      if (homing) {                                            // back to the garden: home, else the farthest unseen
        if (!p.deep || d < 8) continue;
        s = i === 0 ? -1e9 : -d;
      } else {                                                 // a little closer, about 40 % of the way
        if (d > dCur - 1.2 || d < p.min) continue;
        s = Math.abs(d - dCur * 0.6);
      }
      if (s < score && !seenAt(p.x, p.y, p.z, SAFE_R)) { score = s; best = i; }
    }
    if (!homing && dCur < 14 && dCur > BEHIND + 1.1 && behind(cam)) {
      const d = dist(cp, spot.x, spot.y, spot.z);
      const s = Math.abs(d - dCur * 0.6) - 0.6;                // a soft preference for the punchline
      if (d >= 1.6 && d < dCur - 0.8 && s < score && !seenAt(spot.x, spot.y, spot.z, SAFE_R)) { score = s; best = -1; }
    }
    if (best === -2) return false;
    if (best === -1) placeAt(spot.x, spot.y, spot.z, 1);
    else { const p = perches[best]; placeAt(p.x, p.y, p.z, p.blob); }
    cur = best;
    face(cp);
    return true;
  }

  // ---------------------------------------------------------------- the shrug --
  function shrug(dt) {
    shrugT += dt;
    const t = shrugT;
    let k;
    if (t < 0.16) k = 1 - (1 - t / 0.16) ** 2;                 // shoulders up
    else if (t < 0.46) k = 1;                                  // held: hm.
    else if (t < 0.58) k = 1 - ((t - 0.46) / 0.12) ** 2;       // and down — tok
    else { k = 0; shrugT = -1; }
    armMesh.position.y = ARM_Y + 0.012 * k;
    armMesh.rotation.x = -0.22 * k;
    armMesh.scale.x = 1 + 0.12 * k;
    bodyMesh.scale.y = 1 - 0.015 * k;
  }

  // ------------------------------------------------------------------ sound --
  let noise = null;
  function voice(atS, gain) {
    const au = ctx.audio;
    if (!au || au.muted) return;
    const ac = au.context, bus = au.bus;
    if (!ac || !bus || ac.state === 'closed') return;
    try {
      const t0 = ac.currentTime + 0.02, out = ac.createGain();
      out.gain.value = gain; out.connect(bus);
      // the mutter: a closed-mouth "hm", falling
      {
        const o = ac.createOscillator(), f = ac.createBiquadFilter(), g = ac.createGain();
        o.type = 'triangle'; o.frequency.setValueAtTime(138, t0); o.frequency.exponentialRampToValueAtTime(112, t0 + 0.32);
        f.type = 'lowpass'; f.frequency.value = 430; f.Q.value = 2.5;
        g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.07, t0 + 0.05);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.34);
        o.connect(f); f.connect(g); g.connect(out); o.start(t0); o.stop(t0 + 0.36);
      }
      // the tok: three inharmonic modes of a small hollow glazed shell, and the contact click
      const t1 = t0 + atS;
      for (const [hz, dur, amp] of [[430, 0.075, 0.16], [1170, 0.05, 0.1], [2650, 0.028, 0.05]]) {
        const o = ac.createOscillator(), g = ac.createGain();
        o.frequency.setValueAtTime(hz, t1); o.frequency.exponentialRampToValueAtTime(hz * 0.985, t1 + dur);
        g.gain.setValueAtTime(0.0001, t1); g.gain.exponentialRampToValueAtTime(amp, t1 + 0.002);
        g.gain.exponentialRampToValueAtTime(0.0001, t1 + dur);
        o.connect(g); g.connect(out); o.start(t1); o.stop(t1 + dur + 0.02);
      }
      if (!noise) {
        const n = Math.round(ac.sampleRate * 0.02);
        noise = ac.createBuffer(1, n, ac.sampleRate);
        const d = noise.getChannelData(0);
        for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n) ** 4;
      }
      const src = ac.createBufferSource(), bp = ac.createBiquadFilter(), ng = ac.createGain();
      src.buffer = noise; bp.type = 'bandpass'; bp.frequency.value = 3200; bp.Q.value = 1.2; ng.gain.value = 0.12;
      src.connect(bp); bp.connect(ng); ng.connect(out); src.start(t1);
      setTimeout(() => { try { out.disconnect(); } catch (e) { /* gone */ } }, (atS + 0.8) * 1000);
    } catch (e) { /* audio unavailable */ }
  }

  return {
    group,
    regions: [],
    colliders: [],
    pickables: [root],
    update(dt, frame) {
      const cam = frame && frame.camera;
      if (!cam) return;
      const cp = cam.position, dx = cp.x - gx, dz = cp.z - gz, d2 = dx * dx + dz * dz;
      if (d2 > FAR2) { far = true; return; }
      if (far) { far = false; face(cp); }                      // it was already looking your way
      if (shrugT >= 0) shrug(dt);
      sync(cam);
      // someone standing (or sitting) right where it stands: it simply isn't there any more
      const crowded = d2 < 0.2 && Math.abs(cp.y - gy) < 1.7;
      if (!crowded && seenAt(gx, gy, gz, VIEW_R)) { hidden = 0; if (d2 < 1600) seen = true; return; }
      face(cp);
      if (shrugT >= 0 || frame.level !== 0 || cp.y > 4) return;
      hidden += dt;
      if (crowded) homing = true;
      const need = crowded ? 0 : homing ? 1.6 : seen ? wait : wait * 3;
      if (hidden < need || (!homing && d2 > ACT * ACT)) return;
      if (hop(cam)) {
        hidden = 0; seen = false;
        wait = homing ? 16 + 8 * rnd() : 2.4 + 1.4 * rnd();
        homing = false;
      } else hidden = need - 0.5;                              // nowhere unseen to go: look again shortly
    },
    onPick() {
      if (shrugT >= 0) return;
      clicks++;
      homing = true; hidden = 0;
      if (!reduced) shrugT = 0;
      if (ctx.ui && ctx.ui.toast) ctx.ui.toast(LINES[(clicks - 1) % LINES.length]);
      const cp = ctx.scene && ctx.scene.userData && ctx.scene.userData.camera;   // optional; distance unknown otherwise
      voice(reduced ? 0.03 : 0.56, cp ? 1 : 0.9);
    },
  };
}
