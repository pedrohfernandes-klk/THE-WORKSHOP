// Amphitheatre (west) — BRIEF §6.1/6.2. Sunken open-air bowl: rim y = 0, orchestra y = -4.2.
// Centre of the orchestra C = (-50, -4.2, 30). Seating tiers on the EAST half face west to the stage.
import * as BGU from 'three/addons/utils/BufferGeometryUtils.js';

const CX = -50, CZ = 30;
const FLOOR = -4.2, RIM = 0.02;
const N_TIERS = 10, R_IN = 7, TREAD = 0.8;
const RISER = (RIM - FLOOR) / N_TIERS;          // 0.422
const R_OUT = R_IN + N_TIERS * TREAD;            // 15
const AISLE_STEPS = 24;
const VIDEO_URL = new URL('../../extracted/hall-fireworks-video.mp4', import.meta.url).href;

export function build(ctx) {
  const { THREE, M, quality } = ctx;
  const low = quality === 'low';
  const group = new THREE.Group();
  group.name = 'amphitheatre';
  const regions = [], colliders = [], pickables = [];

  const rad = (d) => d * Math.PI / 180;
  const buckets = {};                        // material key -> geometry list
  const put = (key, g) => { (buckets[key] ||= []).push(g); };
  const flat = (g) => (g.index ? g.toNonIndexed() : g);
  function box(key, w, h, d, x, y, z, ry = 0) {  // x,y,z = centre
    let g = new THREE.BoxGeometry(w, h, d);
    if (ry) g.rotateY(ry);
    g.translate(x, y, z);
    M.boxUV(g);
    put(key, flat(g));
  }
  // Extruded polygon in plan (pts = [[x,z]...] world), from yBot to yTop, optional small bevel.
  function prism(key, pts, yBot, yTop, bevel = 0) {
    const s = new THREE.Shape();
    pts.forEach(([x, z], i) => (i ? s.lineTo(x - CX, -(z - CZ)) : s.moveTo(x - CX, -(z - CZ))));
    const h = yTop - yBot;
    const bt = bevel;
    const g = new THREE.ExtrudeGeometry(s, {
      depth: h - 2 * bt, bevelEnabled: bt > 0, bevelThickness: bt, bevelSize: bt, bevelSegments: 1, steps: 1, curveSegments: 1,
    });
    g.rotateX(-Math.PI / 2);
    g.translate(CX, yBot + bt, CZ);
    g.clearGroups();
    M.boxUV(g);
    put(key, flat(g));
  }
  // Plan polygon for an annular sector with angle limits that may depend on radius.
  function sectorPts(r0, r1, lo, hi, step = 3) {
    const pts = [];
    const n = Math.max(2, Math.ceil((hi(r1) - lo(r1)) / rad(step)));
    for (let j = 0; j <= n; j++) { const t = lo(r1) + (hi(r1) - lo(r1)) * j / n; pts.push([CX + r1 * Math.cos(t), CZ + r1 * Math.sin(t)]); }
    const m = Math.max(2, Math.ceil((hi(r0) - lo(r0)) / rad(step)));
    for (let j = m; j >= 0; j--) { const t = lo(r0) + (hi(r0) - lo(r0)) * j / m; pts.push([CX + r0 * Math.cos(t), CZ + r0 * Math.sin(t)]); }
    return pts;
  }
  const P = (r, t) => [CX + r * Math.cos(t), CZ + r * Math.sin(t)];

  // ---------------------------------------------------------------- seating
  // Aisles: centre (axis-parallel strip, 2.0 m) and two end aisles at +-75 deg (1.4 m).
  const aisles = [{ a: 0, hw: 1.0 }, { a: rad(75), hw: 0.7 }, { a: rad(-75), hw: 0.7 }];
  const dl = (a) => (r) => a.a - Math.asin(a.hw / r), dh = (a) => (r) => a.a + Math.asin(a.hw / r);
  const lim = [
    [() => rad(-90), dl(aisles[2])],
    [dh(aisles[2]), dl(aisles[0])],
    [dh(aisles[0]), dl(aisles[1])],
    [dh(aisles[1]), () => rad(90)],
  ];
  for (let i = 0; i < N_TIERS; i++) {
    const r0 = R_IN + i * TREAD, r1 = r0 + TREAD, top = FLOOR + RISER * (i + 1);
    for (const [lo, hi] of lim) prism('sandstone', sectorPts(r0, r1, lo, hi), FLOOR, top, 0.02);
  }
  // Aisle stairs: 24 narrow steps, riser 0.176
  const SR = (R_OUT - R_IN) / AISLE_STEPS;
  for (const a of aisles) {
    for (let k = 0; k < AISLE_STEPS; k++) {
      const ra = R_IN + k * SR, rb = ra + SR + 0.01, top = FLOOR + (RIM - FLOOR) * (k + 1) / AISLE_STEPS;
      const nx = -Math.sin(a.a), nz = Math.cos(a.a);
      const [ax, az] = P(ra, a.a), [bx, bz] = P(rb, a.a);
      prism('whiteSandstone', [[ax - nx * a.hw, az - nz * a.hw], [bx - nx * a.hw, bz - nz * a.hw], [bx + nx * a.hw, bz + nz * a.hw], [ax + nx * a.hw, az + nz * a.hw]], FLOOR, top);
    }
  }

  // Rim parapet (r 15.0 → 15.55) with openings at the aisles, piers + coping.
  const PR0 = R_OUT, PR1 = R_OUT + 0.55, PH = 0.95;
  const open = [[0, 1.0], [rad(75), 0.7], [rad(-75), 0.7]].map(([a, hw]) => [a - Math.asin((hw + 0.55) / 15.3), a + Math.asin((hw + 0.55) / 15.3), a, hw]);
  open.sort((p, q) => p[0] - q[0]);
  const segs = [];
  let cur = rad(-90);
  for (const o of open) { segs.push([cur, o[0]]); cur = o[1]; }
  segs.push([cur, rad(90)]);
  for (const [a0, a1] of segs) {
    prism('sandstone', sectorPts(PR0 + 0.02, PR1 - 0.02, () => a0, () => a1, 2.5), RIM, RIM + PH - 0.1);
    prism('whiteSandstone', sectorPts(PR0 - 0.07, PR1 + 0.07, () => a0, () => a1, 2.5), RIM + PH - 0.1, RIM + PH, 0.012);
    // collider boxes along the arc
    const n = Math.max(1, Math.ceil((a1 - a0) / rad(4)));
    for (let j = 0; j < n; j++) {
      const t0 = a0 + (a1 - a0) * j / n, t1 = a0 + (a1 - a0) * (j + 1) / n;
      const p = [P(PR0, t0), P(PR1, t0), P(PR0, t1), P(PR1, t1)];
      colliders.push({
        minX: Math.min(...p.map(q => q[0])), maxX: Math.max(...p.map(q => q[0])),
        minZ: Math.min(...p.map(q => q[1])), maxZ: Math.max(...p.map(q => q[1])), minY: RIM, maxY: RIM + PH,
      });
    }
  }
  const pierPts = [];                          // lantern positions
  for (const o of open) {
    for (const side of [-1, 1]) {
      const a = o[2], hw = o[3] + 0.275;
      const [px, pz] = P(15.28, a);
      const x = px + (-Math.sin(a)) * hw * side, z = pz + Math.cos(a) * hw * side;
      box('sandstone', 0.55, 1.15, 0.55, x, RIM + 0.575, z, -a);
      box('whiteSandstone', 0.7, 0.12, 0.7, x, RIM + 1.21, z, -a);
      pierPts.push([x, RIM + 1.34, z]);
      colliders.push({ minX: x - 0.3, maxX: x + 0.3, minZ: z - 0.3, maxZ: z + 0.3, minY: RIM, maxY: RIM + 1.3 });
    }
  }

  // ---------------------------------------------------------------- stage + backdrop
  box('sandstone', 6, 0.85, 16, -54, FLOOR + 0.425, 30);
  box('whiteSandstone', 6.1, 0.1, 16.2, -53.95, -3.3, 30);            // nosing slab
  box('whiteSandstone', 1.2, 0.5, 4, -50.3, -3.95, 30);              // step (top -3.7)
  box('whiteSandstone', 0.6, 0.5, 4, -50.6, -3.95, 30);
  // backdrop wall (front face x = -57), plinth, pilasters, cornice
  box('sandstone', 1.0, 11.6, 16, -57.5, 1.6, 30);
  box('whiteSandstone', 0.3, 1.1, 16, -56.85, -2.65, 30);            // plinth band
  box('whiteSandstone', 1.5, 0.45, 16.5, -57.55, 7.62, 30);          // cornice
  box('whiteSandstone', 1.3, 0.14, 16.8, -57.55, 7.92, 30);
  for (const z of [23, 37]) {
    box('whiteSandstone', 0.45, 10.2, 1.0, -56.78, 1.9, z);
    box('whiteSandstone', 0.6, 0.3, 1.25, -56.78, 7.1, z);
    box('whiteSandstone', 0.6, 0.35, 1.25, -56.78, -2.4, z);
  }
  colliders.push({ minX: -58.2, maxX: -56.7, minZ: 21.8, maxZ: 38.2, minY: FLOOR, maxY: 7.9 });
  colliders.push({ minX: -51.0, maxX: -50.85, minZ: 21.9, maxZ: 28, minY: FLOOR, maxY: -3.2 });
  colliders.push({ minX: -51.0, maxX: -50.85, minZ: 32, maxZ: 38.1, minY: FLOOR, maxY: -3.2 });
  colliders.push({ minX: -57, maxX: -50.9, minZ: 21.7, maxZ: 22.0, minY: FLOOR, maxY: -3.2 });
  colliders.push({ minX: -57, maxX: -50.9, minZ: 38.0, maxZ: 38.3, minY: FLOOR, maxY: -3.2 });

  // ---------------------------------------------------------------- materials & merge
  const mats = {
    sandstone: M.get('sandstone', { tile: 2.0 }),
    whiteSandstone: M.get('whiteSandstone', { tile: 2.0 }),
  };
  function flush() {
    for (const k of Object.keys(buckets)) {
      const geo = BGU.mergeGeometries(buckets[k], false);
      const m = new THREE.Mesh(geo, mats[k] || M.get(k));
      m.castShadow = true; m.receiveShadow = true; m.name = 'amph-' + k;
      group.add(m);
      buckets[k].forEach(g => g.dispose());
    }
  }
  flush();

  // ---------------------------------------------------------------- ground surfaces (polar meshes)
  function polar(mat, r0, r1, a0, a1, nr, na, yfn, name, shadows = true) {
    const pos = [], uv = [], idx = [];
    for (let i = 0; i <= nr; i++) {
      const r = r0 + (r1 - r0) * i / nr;
      for (let j = 0; j <= na; j++) {
        const t = a0 + (a1 - a0) * j / na;
        const x = CX + r * Math.cos(t), z = CZ + r * Math.sin(t);
        pos.push(x, yfn(r), z); uv.push(x, z);
      }
    }
    for (let i = 0; i < nr; i++) for (let j = 0; j < na; j++) {
      const a = i * (na + 1) + j, b = a + 1, c = a + na + 1, d = c + 1;
      idx.push(a, b, c, c, b, d);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx); g.computeVertexNormals();
    const m = new THREE.Mesh(g, mat);
    m.receiveShadow = shadows; m.name = name;
    group.add(m);
    return m;
  }
  const aSeg = low ? 40 : 96;
  const paving = M.get('paving', { tile: 2.4 });
  // orchestra: full disc r 7 + west half to r 9.5
  polar(paving, 0.001, R_IN, 0, Math.PI * 2, 14, aSeg, () => FLOOR, 'orchestra');
  polar(paving, R_IN, 9.5, Math.PI / 2, Math.PI * 1.5, 4, aSeg / 2, () => FLOOR, 'orchestra-west');
  // inlay rings (own material instance so polygonOffset is safe)
  const inlay = M.get('terrazzo', { tile: 1.6, color: 0xfffffe });
  inlay.polygonOffset = true; inlay.polygonOffsetFactor = -2; inlay.polygonOffsetUnits = -2;
  const ringsHalf = (r0, r1) => polar(inlay, r0, r1, Math.PI / 2, Math.PI * 2.5, 1, aSeg, () => FLOOR + 0.012, 'inlay');
  ringsHalf(6.35, 6.6); ringsHalf(3.0, 3.12); ringsHalf(0.0001, 1.1);
  // west slope (grass) r 9.5 → 17.4
  const grass = M.get('grass', { tile: 2.2 });
  const SL0 = 9.5, SL1 = 17.4;
  const slopeY = (r) => { const t = Math.min(1, Math.max(0, (r - SL0) / (SL1 - SL0))); const s = t * t * (3 - 2 * t); return FLOOR + (RIM - FLOOR) * (0.5 * t + 0.5 * s); };
  polar(grass, SL0, SL1, Math.PI / 2, Math.PI * 1.5, low ? 10 : 24, aSeg / 2, slopeY, 'slope-west');
  // rim ground ring: paving east (promenade), grass west
  polar(paving, R_OUT + 0.55, 18.5, -Math.PI / 2, Math.PI / 2, 2, aSeg / 2, () => RIM, 'rim-east');
  polar(grass, SL1 - 0.05, 18.6, Math.PI / 2, Math.PI * 1.5, 2, aSeg / 2, () => RIM, 'rim-west');
  // paving ring band along the promenade
  polar(inlay, 17.7, 17.9, -Math.PI / 2, Math.PI / 2, 1, aSeg / 2, () => RIM + 0.012, 'rim-band');
  // approach path (3 m, y 0.02) from plaza opening to the rim
  {
    const g = new THREE.BoxGeometry(11.0, 0.08, 3.0); g.translate(-28.5 - 0.5, RIM - 0.04, 29.5); M.boxUV(g);
    const m = new THREE.Mesh(g, paving); m.receiveShadow = true; m.name = 'path'; group.add(m);
    for (const z of [27.9, 31.1]) { // flush stone edging
      const e = new THREE.Mesh(new THREE.BoxGeometry(10.6, 0.1, 0.2), mats.whiteSandstone); e.position.set(-29, RIM - 0.01, z);
      e.receiveShadow = true; e.castShadow = true; group.add(e);
    }
  }
  // stage deck (own mesh)
  {
    const g = new THREE.BoxGeometry(5.85, 0.05, 15.7); g.translate(-54.075, -3.225, 30); M.boxUV(g);
    const m = new THREE.Mesh(g, M.get('deck', { tile: 2.0 })); m.receiveShadow = true; m.castShadow = true; m.name = 'stage-deck'; group.add(m);
  }

  // ---------------------------------------------------------------- outdoor screen
  const SCR_W = 12, SCR_H = 6.75, SCR_Y = 3.175, SCR_X = -56.97;
  const video = document.createElement('video');
  video.muted = true; video.defaultMuted = true; video.loop = true; video.playsInline = true;
  video.setAttribute('playsinline', ''); video.setAttribute('muted', '');
  video.crossOrigin = 'anonymous'; video.preload = 'none'; video.src = VIDEO_URL;
  const vtex = new THREE.VideoTexture(video);
  vtex.colorSpace = THREE.SRGBColorSpace; vtex.minFilter = THREE.LinearFilter; vtex.generateMipmaps = false;
  // standby picture shown until the film is playing
  const cv = document.createElement('canvas'); cv.width = 512; cv.height = 288;
  { const c = cv.getContext('2d'); const gr = c.createLinearGradient(0, 0, 0, 288); gr.addColorStop(0, '#0b1020'); gr.addColorStop(1, '#1d2440'); c.fillStyle = gr; c.fillRect(0, 0, 512, 288); }
  const standby = new THREE.CanvasTexture(cv); standby.colorSpace = THREE.SRGBColorSpace;
  const screenMat = new THREE.MeshBasicMaterial({ map: standby, toneMapped: false });
  let playing = false, failed = false;
  video.addEventListener('error', () => { failed = true; screenMat.map = standby; screenMat.needsUpdate = true; });
  video.addEventListener('playing', () => { if (!failed) { screenMat.map = vtex; screenMat.needsUpdate = true; } });
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(SCR_W, SCR_H), screenMat);
  screen.rotation.y = Math.PI / 2; screen.position.set(SCR_X, SCR_Y, 30); screen.name = 'screen';
  group.add(screen);
  // bezel
  {
    const steel = M.get('steel', { color: 0x1a1c20, roughness: 0.5 });
    const bz = [[0.25, SCR_H + 0.5, 0, SCR_W / 2 + 0.125], [0.25, SCR_H + 0.5, 0, -SCR_W / 2 - 0.125]];
    const parts = [];
    for (const s of [-1, 1]) parts.push([SCR_W + 0.5, 0.25, 0, s * (SCR_H / 2 + 0.125)]);
    const mk = (w, h, d, x, y, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), steel); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; group.add(m); };
    for (const s of [-1, 1]) {
      mk(0.18, 0.25, SCR_W + 0.5, -56.9, SCR_Y + s * (SCR_H / 2 + 0.125), 30);
      mk(0.18, SCR_H + 0.5, 0.25, -56.9, SCR_Y, 30 + s * (SCR_W / 2 + 0.125));
    }
    void bz; void parts;
  }

  // ---------------------------------------------------------------- step lights & lanterns
  const lightMat = new THREE.MeshStandardMaterial({ color: 0x2a2018, emissive: 0xffc27a, emissiveIntensity: 3.2, roughness: 0.6 });
  const spots = [];
  for (const a of aisles) {
    for (let i = 0; i < N_TIERS; i++) {
      const r = R_IN + i * TREAD, y = FLOOR + RISER * (i + 1) - 0.12;
      for (const s of [-1, 1]) {
        const off = (a.hw + 0.22) * s;
        const nx = -Math.sin(a.a), nz = Math.cos(a.a);
        const [px, pz] = P(r - 0.015, a.a);
        spots.push([px + nx * off, y, pz + nz * off, -a.a - Math.PI / 2, 0.3, 0.05, 0.03]);
      }
    }
  }
  for (const [x, y, z] of pierPts) spots.push([x, y, z, 0, 0.16, 0.16, 0.16]);
  for (const z of [22.3, 37.7]) spots.push([-51.0, -3.5, z + (z < 30 ? 0.0 : 0), 0, 0.03, 0.04, 0.5]);
  {
    const im = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), lightMat, spots.length);
    const d = new THREE.Object3D();
    spots.forEach((s, i) => { d.position.set(s[0], s[1], s[2]); d.rotation.set(0, s[3], 0); d.scale.set(s[4], s[5], s[6]); d.updateMatrix(); im.setMatrixAt(i, d.matrix); });
    im.name = 'step-lights'; group.add(im);
  }

  // ---------------------------------------------------------------- benches on the promenade
  {
    const wood = M.get('darkWood', { tile: 1.5 }), steel = M.get('steel', { color: 0x2a2d31 });
    const bw = [], bs = [];
    for (const deg of [-55, -30, 30, 55]) {
      const t = rad(deg), [x, z] = P(17.0, t), ry = -t - Math.PI / 2 + Math.PI;     // faces the bowl
      for (const [w, h, d, ox, oy, oz, tgt] of [
        [1.7, 0.05, 0.22, 0, 0.45, -0.12, bw], [1.7, 0.05, 0.22, 0, 0.45, 0.12, bw],
        [1.7, 0.05, 0.2, 0, 0.78, 0.22, bw], [1.7, 0.05, 0.2, 0, 0.62, 0.22, bw],
        [0.06, 0.45, 0.5, -0.75, 0.22, 0, bs], [0.06, 0.45, 0.5, 0.75, 0.22, 0, bs],
      ]) {
        const g = new THREE.BoxGeometry(w, h, d); g.translate(ox, oy, oz); g.rotateY(ry); g.translate(x, RIM, z); M.boxUV(g); tgt.push(flat(g));
      }
      colliders.push({ minX: x - 0.9, maxX: x + 0.9, minZ: z - 0.9, maxZ: z + 0.9, minY: RIM, maxY: RIM + 0.9 });
    }
    for (const [list, mat] of [[bw, wood], [bs, steel]]) { const m = new THREE.Mesh(BGU.mergeGeometries(list, false), mat); m.castShadow = true; m.receiveShadow = true; group.add(m); }
  }

  // ---------------------------------------------------------------- planting on the slope
  {
    let seed = 7;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const nS = low ? 30 : 110, nT = low ? 5 : 11;
    const leaves = M.get('leaves', { tile: 1.4, color: 0x6f8f4a });
    const shrubs = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), leaves, nS);
    const d = new THREE.Object3D();
    for (let i = 0; i < nS; i++) {
      const a = Math.PI / 2 + rnd() * Math.PI, r = 11.5 + rnd() * 5.3, s = 0.5 + rnd() * 0.7;
      const [x, z] = P(r, a);
      d.position.set(x, slopeY(r) + s * 0.35, z); d.rotation.set(0, rnd() * 6, 0); d.scale.set(s * 1.3, s * 0.8, s * 1.3); d.updateMatrix(); shrubs.setMatrixAt(i, d.matrix);
    }
    shrubs.castShadow = true; shrubs.receiveShadow = true; shrubs.name = 'shrubs'; group.add(shrubs);
    const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.14, 0.22, 1, 7), M.get('bark', { tile: 1.2 }), nT);
    const crowns = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 2), M.get('leaves', { tile: 1.4, color: 0x58783a }), nT * 3);
    for (let i = 0; i < nT; i++) {
      const side = i % 2 ? 1 : -1, a = Math.PI + side * rad(38 + rnd() * 42), r = 13.2 + rnd() * 2.6;
      const [x, z] = P(r, a), y0 = slopeY(r), h = 3.0 + rnd() * 1.5;
      d.position.set(x, y0 + h / 2, z); d.rotation.set(0, 0, 0); d.scale.set(1, h, 1); d.updateMatrix(); trunks.setMatrixAt(i, d.matrix);
      for (let k = 0; k < 3; k++) {
        const s = 1.5 + rnd() * 0.9;
        d.position.set(x + (rnd() - 0.5) * 1.6, y0 + h + 0.6 + k * 0.5, z + (rnd() - 0.5) * 1.6); d.scale.set(s, s * 0.85, s); d.updateMatrix(); crowns.setMatrixAt(i * 3 + k, d.matrix);
      }
    }
    for (const m of [trunks, crowns]) { m.castShadow = true; m.receiveShadow = true; group.add(m); }
  }

  // ---------------------------------------------------------------- regions
  regions.push({ minX: -34.5, maxX: -23.5, minZ: 28, maxZ: 31, y: 0 });                       // approach path
  regions.push({ minX: -35, maxX: -30.5, minZ: 16, maxZ: 44, y: 0 });                          // rim promenade
  regions.push({ minX: -43, maxX: -35, minZ: 29, maxZ: 31, y: 0, ramp: { axis: 'x', from: -35, to: -43, y0: 0, y1: FLOOR } }); // centre aisle stair
  regions.push({ minX: -50.3, maxX: -44, minZ: 26, maxZ: 34, y: FLOOR });                       // orchestra
  regions.push({ minX: -50.9, maxX: -50.3, minZ: 28, maxZ: 32, y: -3.7 });                      // stage step
  regions.push({ minX: -57, maxX: -50.9, minZ: 22.2, maxZ: 37.8, y: -3.2 });                    // stage

  // ---------------------------------------------------------------- update: film plays only when close
  let acc = 0;
  const sx = -57, sy = 3, sz = 30;
  function update(dt, frame) {
    acc += dt;
    if (acc < 0.4) return;
    acc = 0;
    const p = frame.camera.position;
    const dx = p.x - sx, dy = p.y - sy, dz = p.z - sz;
    const near = dx * dx + dy * dy + dz * dz < 3600;
    if (near && !playing && !failed) { playing = true; const pr = video.play(); if (pr && pr.catch) pr.catch(() => { playing = false; }); }
    else if (!near && playing) { playing = false; video.pause(); }
  }
  screen.onBeforeRender = () => { /* VideoTexture self-updates via requestVideoFrameCallback */ };

  return { group, regions, colliders, pickables, update, onPick() {} };
}
