// garden.js — the east garden's hard landscape and ground (BRIEF §6.1: x 28–64, z 14–50, y 0).
// Gravel paths with sandstone edging, the paved crossing, mown lawns, raised
// border beds, the clipped yew perimeter with its gates, benches, pit rings
// and the sculpture pad. Trees, flowers, fountain, pergola, grass blades and
// the sculpture itself belong to other modules and stand in the spots left clear.
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const X0 = 28, X1 = 64, Z0 = 14, Z1 = 50;
const CX = 46, CZ = 29, CROSS_R = 5.5;
const PATH_Z0 = 27.5, PATH_Z1 = 30.5, PATH_X0 = 44.5, PATH_X1 = 47.5;
const HEDGE_T = 0.7, HEDGE_H = 1.6;
const TREES = [[36, 21], [56, 21], [36, 42], [60, 46]];
const PAD = [55, 40], PAD_R = 3.2;

export function build(ctx) {
  const { THREE, M } = ctx;
  const low = ctx.quality === 'low';
  const group = new THREE.Group();
  group.name = 'garden';
  const colliders = [];

  // ---- materials ----------------------------------------------------------
  function mat(name, opts, extra = {}) {
    const m = M.get(name, opts).clone();
    if (extra.vc) m.vertexColors = true;
    if (extra.po) { m.polygonOffset = true; m.polygonOffsetFactor = -extra.po; m.polygonOffsetUnits = -extra.po; }
    if (extra.double) m.side = THREE.DoubleSide;
    return m;
  }
  const mBase = mat('gravel', { color: 0xb4ad9c });
  const mLawn = mat('grass', { roughness: 1 }, { vc: true, po: 1 });
  const mGravel = mat('gravel', { color: 0xd0cabd }, { vc: true, po: 2 });
  const mPaving = mat('paving', {}, { po: 3 });
  const mMarble = mat('marble', { tile: 1.5 }, { po: 4 });
  const mPad = mat('gravel', { color: 0xdad3c2 }, { po: 3 });
  const mMulch = mat('leaves', { color: 0x5a4030, tile: 1.0 }, { po: 3 });
  const mStone = M.get('whiteSandstone');
  const mStoneD = mat('whiteSandstone', {}, { double: true });
  const mSoil = M.get('leaves', { color: 0x3a2a1e, tile: 0.9, roughness: 1 });
  const mSteel = M.get('steel', { color: 0x44484c });
  const mSteelD = mat('steel', { color: 0x44484c }, { double: true });
  const mHedge = M.get('leaves', { color: 0x4f7a38, tile: 1.1, roughness: 0.95 });
  const mWood = M.get('oak', { color: 0xc99a62, tile: 1.0, roughness: 0.7 });

  const mesh = (geo, material, { cast = false, recv = true } = {}) => {
    const m = new THREE.Mesh(geo, material);
    m.castShadow = cast; m.receiveShadow = recv;
    group.add(m);
    return m;
  };
  const nonIdx = (g) => (g.index ? g.toNonIndexed() : g);
  const merge = (list) => {
    const g = mergeGeometries(list.map((x) => { const n = nonIdx(x); for (const k of Object.keys(n.attributes)) if (!['position', 'normal', 'uv'].includes(k)) n.deleteAttribute(k); return n; }));
    list.forEach((x) => x.dispose());
    return g;
  };
  // box in world coordinates, UVs in metres
  const box = (x0, x1, y0, y1, z0, z1) => {
    const g = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0);
    g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    return M.boxUV(g);
  };

  // ---- noise ---------------------------------------------------------------
  const macro = (x, z) =>
    0.5 * Math.sin(x * 0.13 + 1.3) * Math.sin(z * 0.17 + 0.4) +
    0.3 * Math.sin(x * 0.31 + z * 0.23) + 0.2 * Math.sin(z * 0.51 - x * 0.11 + 2.0);

  // ---- gridded ground patch (vertex-coloured, optionally clipped) -----------
  function grid(x0, x1, z0, z1, y, step, colorFn, clip) {
    const nx = Math.max(1, Math.ceil((x1 - x0) / step)), nz = Math.max(1, Math.ceil((z1 - z0) / step));
    const pos = new Float32Array((nx + 1) * (nz + 1) * 3), nor = new Float32Array(pos.length);
    const uv = new Float32Array((nx + 1) * (nz + 1) * 2), col = new Float32Array(pos.length);
    const idx = [];
    for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) {
      const k = j * (nx + 1) + i;
      let x = x0 + (x1 - x0) * i / nx, z = z0 + (z1 - z0) * j / nz;
      if (clip) [x, z] = clip(x, z);
      pos.set([x, y, z], k * 3); nor.set([0, 1, 0], k * 3); uv.set([x, z], k * 2);
      const c = colorFn(x, z); col.set(c, k * 3);
      if (i < nx && j < nz) { idx.push(k, k + nx + 1, k + 1, k + 1, k + nx + 1, k + nx + 2); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setIndex(idx);
    return g;
  }

  // base: sandstone gravel under everything, including the strip inside the hedge
  {
    const g = new THREE.PlaneGeometry(X1 - X0, Z1 - Z0);
    g.rotateX(-Math.PI / 2); g.translate((X0 + X1) / 2, 0.002, (Z0 + Z1) / 2);
    mesh(M.boxUV(g), mBase);
  }

  // lawns: four quadrants, run out to the path edges (beds sit on top), cut round the crossing
  const lawnColor = (x, z) => {
    const n = macro(x, z), n2 = macro(x * 1.7 + 9, z * 1.4 - 3);
    const stripe = 0.045 * Math.sin(z * Math.PI * 2 / 2.4 + Math.sin(x * 0.2) * 0.4);
    const b = 0.9 + 0.1 * n + stripe;
    return [b * 0.74 * (1 + 0.08 * n2), b * 1.02, b * 0.66 * (1 - 0.12 * n2)];
  };
  const clipCross = (x, z) => {
    const dx = x - CX, dz = z - CZ, d = Math.hypot(dx, dz);
    if (d < CROSS_R) { if (d < 1e-4) return [x + CROSS_R, z]; const s = CROSS_R / d; return [CX + dx * s, CZ + dz * s]; }
    return [x, z];
  };
  const lawnStep = low ? 0.55 : 0.25;
  const LAWNS = [
    [29.5, PATH_X0, 15, PATH_Z0], [PATH_X1, 63, 15, PATH_Z0],
    [29.5, PATH_X0, PATH_Z1, 49], [PATH_X1, 63, PATH_Z1, 49],
  ];
  for (const [a, b, c, d] of LAWNS) mesh(grid(a, b, c, d, 0.005, lawnStep, lawnColor, clipCross), mLawn);

  // gravel paths: segments never overlap so nothing z-fights
  const gravelColor = (x, z) => {
    const n = macro(x * 2.3, z * 2.3), b = 0.93 + 0.07 * n;
    return [b, b * 0.99, b * 0.96];
  };
  const gStep = low ? 0.7 : 0.35;
  mesh(grid(23, X0, 27.6, 30.4, 0.008, gStep, gravelColor), mGravel);                // connector
  mesh(grid(X0, X1, PATH_Z0, PATH_Z1, 0.008, gStep, gravelColor), mGravel);          // main path
  mesh(grid(PATH_X0, PATH_X1, Z0, PATH_Z0, 0.008, gStep, gravelColor), mGravel);     // cross path N
  mesh(grid(PATH_X0, PATH_X1, PATH_Z1, Z1, 0.008, gStep, gravelColor), mGravel);     // cross path S

  // paved crossing with marble inlay rings
  {
    const g = new THREE.CircleGeometry(CROSS_R, 96); g.rotateX(-Math.PI / 2); g.translate(CX, 0.012, CZ);
    mesh(M.boxUV(g), mPaving);
    for (const [r0, r1] of [[4.3, 4.45], [3.6, 3.68]]) {
      const rg = new THREE.RingGeometry(r0, r1, 96); rg.rotateX(-Math.PI / 2); rg.translate(CX, 0.0135, CZ);
      mesh(M.boxUV(rg), mMarble);
    }
  }

  // ---- stone edging --------------------------------------------------------
  const edge = [];
  const EW = 0.16, EH = 0.07;
  const eX = (xa, xb, zc) => edge.push(box(xa, xb, -0.06, EH, zc - EW / 2, zc + EW / 2));
  const eZ = (za, zb, xc) => edge.push(box(xc - EW / 2, xc + EW / 2, -0.06, EH, za, zb));
  const mouth = CROSS_R - 0.6;                  // edges stop just inside the paved ring
  for (const zc of [PATH_Z0 - EW / 2, PATH_Z1 + EW / 2]) { eX(X0, CX - mouth, zc); eX(CX + mouth, X1, zc); }
  for (const xc of [PATH_X0 - EW / 2, PATH_X1 + EW / 2]) { eZ(Z0 + HEDGE_T, CZ - mouth, xc); eZ(CZ + mouth, Z1 - HEDGE_T, xc); }
  eX(24, X0, 27.6 - EW / 2); eX(24, X0, 30.4 + EW / 2);                                // connector
  mesh(merge(edge), mStone, { cast: true });

  // arcs of kerb round the crossing, broken where the paths enter
  {
    const half = Math.asin(1.5 / CROSS_R) + 0.04, parts = [];
    for (let q = 0; q < 4; q++) {
      const a0 = q * Math.PI / 2 + half, a1 = (q + 1) * Math.PI / 2 - half, r0 = CROSS_R - 0.05, r1 = CROSS_R + 0.13;
      const s = new THREE.Shape();
      const P = (r, a) => [r * Math.cos(a), -r * Math.sin(a)];
      s.moveTo(...P(r0, a0));
      const n = 14;
      for (let i = 1; i <= n; i++) s.lineTo(...P(r0, a0 + (a1 - a0) * i / n));
      for (let i = n; i >= 0; i--) s.lineTo(...P(r1, a0 + (a1 - a0) * i / n));
      s.closePath();
      const g = new THREE.ExtrudeGeometry(s, { depth: EH + 0.06, bevelEnabled: false });
      g.rotateX(-Math.PI / 2); g.translate(CX, -0.06, CZ);
      parts.push(M.boxUV(g));
    }
    mesh(merge(parts), mStone, { cast: true });
  }

  // ---- border beds ---------------------------------------------------------
  const soilGeos = [], steelGeos = [];
  function bed(x0, x1, z0, z1, steel) {
    const nx = Math.ceil((x1 - x0) / 0.3), nz = Math.ceil((z1 - z0) / 0.3);
    const g = new THREE.BoxGeometry(x1 - x0, 0.14, z1 - z0, nx, 1, nz);
    g.translate((x0 + x1) / 2, 0.01, (z0 + z1) / 2);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) if (p.getY(i) > 0.05) p.setY(i, 0.08 + 0.018 * Math.sin(p.getX(i) * 4.1) * Math.sin(p.getZ(i) * 3.3 + 1) + 0.008 * Math.sin(p.getX(i) * 11 + p.getZ(i) * 9));
    g.computeVertexNormals();
    soilGeos.push(M.boxUV(g));
    const T = 0.014, top = 0.12;
    if (steel.z0) steelGeos.push(box(x0, x1, -0.05, top, z0, z0 + T));
    if (steel.z1) steelGeos.push(box(x0, x1, -0.05, top, z1 - T, z1));
    if (steel.x0) steelGeos.push(box(x0, x0 + T, -0.05, top, z0, z1));
    if (steel.x1) steelGeos.push(box(x1 - T, x1, -0.05, top, z0, z1));
    colliders.push({ minX: x0, maxX: x1, minZ: z0, maxZ: z1, minY: 0, maxY: 0.3 });
  }
  bed(29.5, 40.5, 26.3, 27.5, { z0: 1, x0: 1, x1: 1 });
  bed(29.5, 40.5, 30.5, 31.7, { z1: 1, x0: 1, x1: 1 });
  for (const [za, zb] of [[15, 23.5], [34.5, 49]]) {
    bed(43.3, 44.5, za, zb, { x0: 1, z0: 1, z1: 1 });
    bed(47.5, 48.7, za, zb, { x1: 1, z0: 1, z1: 1 });
  }
  mesh(merge(soilGeos), mSoil);
  mesh(merge(steelGeos), mSteel, { cast: true });

  // ---- tree pits and the sculpture pad --------------------------------------
  for (const [tx, tz] of TREES) {
    const g = new THREE.CircleGeometry(1.5, 40); g.rotateX(-Math.PI / 2); g.translate(tx, 0.012, tz);
    mesh(M.boxUV(g), mMulch);
    const l = new THREE.LatheGeometry([new THREE.Vector2(1.5, -0.04), new THREE.Vector2(1.5, 0.09), new THREE.Vector2(1.52, 0.09), new THREE.Vector2(1.52, -0.04)], 48);
    l.translate(tx, 0, tz);
    mesh(M.boxUV(l), mSteelD, { cast: true });
  }
  {
    const g = new THREE.CircleGeometry(PAD_R, 64); g.rotateX(-Math.PI / 2); g.translate(PAD[0], 0.012, PAD[1]);
    mesh(M.boxUV(g), mPad);
    const l = new THREE.LatheGeometry([new THREE.Vector2(PAD_R, -0.05), new THREE.Vector2(PAD_R, 0.06), new THREE.Vector2(PAD_R + 0.16, 0.06), new THREE.Vector2(PAD_R + 0.16, -0.05)], 96);
    l.translate(PAD[0], 0, PAD[1]);
    mesh(M.boxUV(l), mStoneD, { cast: true });
  }

  // ---- clipped yew hedge -----------------------------------------------------
  function hedge(x0, x1, z0, z1) {
    const w = x1 - x0, d = z1 - z0, h = HEDGE_H + 0.1, r = 0.17, res = low ? 0.4 : 0.2;
    const g = new THREE.BoxGeometry(w, h, d, Math.max(1, Math.ceil(w / res)), Math.ceil(h / res), Math.max(2, Math.ceil(d / res)));
    const cx = (x0 + x1) / 2, cy = HEDGE_H / 2 - 0.05, cz = (z0 + z1) / 2;
    const hx = w / 2 - r, hy = h / 2 - r, hz = d / 2 - r;
    const p = g.attributes.position, v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      v.set(p.getX(i), p.getY(i), p.getZ(i));
      const qx = Math.max(-hx, Math.min(hx, v.x)), qy = Math.max(-hy, Math.min(hy, v.y)), qz = Math.max(-hz, Math.min(hz, v.z));
      let nx = v.x - qx, ny = v.y - qy, nz = v.z - qz;
      const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
      const wx = qx + nx * r + cx, wy = qy + ny * r + cy, wz = qz + nz * r + cz;
      // slightly irregular clipping: soft undulation + fine shear
      const dsp = 0.035 * Math.sin(wx * 2.3 + wy * 1.7) * Math.sin(wz * 2.9 - wy * 2.1) + 0.02 * Math.sin(wx * 6.7 + wz * 5.3 + wy * 4.1);
      p.setXYZ(i, wx + nx * dsp, wy + ny * dsp, wz + nz * dsp);
    }
    g.computeVertexNormals();
    colliders.push({ minX: x0, maxX: x1, minZ: z0, maxZ: z1, minY: 0, maxY: HEDGE_H });
    return M.boxUV(g, { scale: 0.9 });
  }
  const GA = 26.45, GB = 31.55;                         // hedge stops at the gate piers
  mesh(merge([
    hedge(X0, X1, Z0, Z0 + HEDGE_T), hedge(X0, X1, Z1 - HEDGE_T, Z1),
    hedge(X0, X0 + HEDGE_T, Z0 + 0.3, GA), hedge(X0, X0 + HEDGE_T, GB, Z1 - 0.3),
    hedge(X1 - HEDGE_T, X1, Z0 + 0.3, GA), hedge(X1 - HEDGE_T, X1, GB, Z1 - 0.3),
  ]), mHedge, { cast: true });

  // sandstone gate piers at both openings
  {
    const parts = [];
    for (const [xa, xb] of [[X0 + 0.02, X0 + 0.68], [X1 - 0.68, X1 - 0.02]]) {
      for (const [za, zb] of [[GA, 27.0], [31.0, GB]]) {
        parts.push(box(xa + 0.03, xb - 0.03, 0, 2.0, za, zb));
        parts.push(box(xa - 0.03, xb + 0.03, 2.0, 2.12, za - 0.03, zb + 0.03));
        parts.push(box(xa + 0.08, xb - 0.08, 2.12, 2.2, za + 0.05, zb - 0.05));
        colliders.push({ minX: xa, maxX: xb, minZ: za, maxZ: zb, minY: 0, maxY: 2.2 });
      }
    }
    mesh(merge(parts), mStone, { cast: true });
  }

  // ---- benches ---------------------------------------------------------------
  // local frame: seat faces +z, backrest at -z
  const wood = [], steel = [];
  const wbox = (sx, sy, sz, x, y, z, rx = 0) => {
    const g = new THREE.BoxGeometry(sx, sy, sz);
    if (rx) g.rotateX(rx);
    g.translate(x, y, z);
    wood.push(M.boxUV(g));
  };
  const sbox = (sx, sy, sz, x, y, z, rx = 0) => {
    const g = new THREE.BoxGeometry(sx, sy, sz);
    if (rx) g.rotateX(rx);
    g.translate(x, y, z);
    steel.push(M.boxUV(g));
  };
  {
    const tilt = 12 * Math.PI / 180, s = Math.sin(tilt), c = Math.cos(tilt);
    for (let i = 0; i < 5; i++) wbox(1.8, 0.03, 0.07, 0, 0.455, -0.16 + i * 0.1);
    for (let k = 0; k < 3; k++) { const dd = 0.12 + k * 0.13; wbox(1.8, 0.095, 0.025, 0, 0.47 + dd * c, -0.21 - dd * s, -tilt); }
    for (const sx of [-0.78, 0.78]) {
      sbox(0.045, 0.66, 0.05, sx, 0.33, 0.21);                       // front leg to armrest
      sbox(0.045, 0.43, 0.05, sx, 0.215, -0.22);                     // rear leg
      sbox(0.04, 0.52, 0.03, sx, 0.42 + 0.26 * c, -0.21 - 0.26 * s, -tilt);   // back post
      sbox(0.05, 0.028, 0.56, sx, 0.66, 0.0);                        // armrest
      sbox(0.045, 0.03, 0.5, sx, 0.425, 0);                          // seat runner
      sbox(0.05, 0.02, 0.58, sx, 0.01, 0);                           // foot
    }
  }
  const woodGeo = merge(wood), steelGeo = merge(steel);
  const BENCHES = [                          // x, z, facing (radians about y; +z = 0)
    [33, 25.75, Math.PI], [33, 32.25, 0],
    [42.9, 19, -Math.PI / 2], [49.1, 19, Math.PI / 2],
    [49.1, 40, Math.PI / 2], [42.9, 40, -Math.PI / 2],
  ];
  const bw = new THREE.InstancedMesh(woodGeo, mWood, BENCHES.length);
  const bs = new THREE.InstancedMesh(steelGeo, mSteel, BENCHES.length);
  const dummy = new THREE.Object3D(), padGeos = [];
  BENCHES.forEach(([x, z, a], i) => {
    dummy.position.set(x, 0, z); dummy.rotation.set(0, a, 0); dummy.updateMatrix();
    bw.setMatrixAt(i, dummy.matrix); bs.setMatrixAt(i, dummy.matrix);
    const alongX = Math.abs(Math.sin(a)) < 0.5;
    const hx = alongX ? 0.95 : 0.55, hz = alongX ? 0.55 : 0.95;
    colliders.push({ minX: x - hx + 0.05, maxX: x + hx - 0.05, minZ: z - hz + 0.05, maxZ: z + hz - 0.05, minY: 0, maxY: 0.95 });
    const px = alongX ? 1.1 : 0.65, pz = alongX ? 0.65 : 1.1;
    padGeos.push(box(x - px, x + px, 0, 0.022, z - pz, z + pz));
  });
  for (const m of [bw, bs]) { m.castShadow = true; m.receiveShadow = true; group.add(m); }
  mesh(merge(padGeos), M.get('paving', { tile: 1.2 }), { cast: false });

  // ---- walkable regions --------------------------------------------------------
  const regions = [
    { minX: X0 + HEDGE_T, maxX: X1 - HEDGE_T, minZ: Z0 + HEDGE_T, maxZ: Z1 - HEDGE_T, y: 0 },   // lawns, paths, crossing, strip
    { minX: 23, maxX: 29, minZ: 27.6, maxZ: 30.4, y: 0 },                                         // connector overlapping the plaza
    { minX: 28, maxX: 65, minZ: 27.6, maxZ: 30.4, y: 0 },                                         // main path through the east gate
  ];

  return { group, regions, colliders, pickables: [], update() {}, onPick() {} };
}
