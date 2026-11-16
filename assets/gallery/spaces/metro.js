// The surface light-rail around the campus (BRIEF §6): closed loop, luminous cut-and-cover tunnel
// on the north straight, an east-side stop "Workshop · Garden", and a 3-car articulated LRV.
import * as BGU from 'three/addons/utils/BufferGeometryUtils.js';
import { heightAt } from './landscape.js';

// ---- route: rounded rectangle, x -84…86, z -56…98, radius 22 (analytic, arc-length param) ----
const R = 22, XA = -84, XB = 86, ZA = -56, ZB = 98;
const SA = (XB - XA - 2 * R), SB = (ZB - ZA - 2 * R), AR = Math.PI * 0.5 * R;
const C1 = SA, C2 = C1 + AR, C3 = C2 + SB, C4 = C3 + AR, C5 = C4 + SA, C6 = C5 + AR, C7 = C6 + SB, L = C7 + AR;
const S_STOP = C1 + AR + (29 - (ZA + R));          // station centre z = 29
const TUN0 = 22, TUN1 = 102;                        // tunnel x -40…40 on the north straight (s = x + 62)
const H_RAIL = 0.1, WIRE = 4.5, TUN_H = 5.0, TUN_W = 2.7;

function pathAt(s, o) {
  s = ((s % L) + L) % L;
  let cx, cz, a0, u;
  if (s < C1) { o.x = XA + R + s; o.z = ZA; o.tx = 1; o.tz = 0; return o; }
  if (s < C2) { u = s - C1; cx = XB - R; cz = ZA + R; a0 = -Math.PI / 2; }
  else if (s < C3) { o.x = XB; o.z = ZA + R + (s - C2); o.tx = 0; o.tz = 1; return o; }
  else if (s < C4) { u = s - C3; cx = XB - R; cz = ZB - R; a0 = 0; }
  else if (s < C5) { o.x = XB - R - (s - C4); o.z = ZB; o.tx = -1; o.tz = 0; return o; }
  else if (s < C6) { u = s - C5; cx = XA + R; cz = ZB - R; a0 = Math.PI / 2; }
  else if (s < C7) { o.x = XA; o.z = ZB - R - (s - C6); o.tx = 0; o.tz = -1; return o; }
  else { u = s - C7; cx = XA + R; cz = ZA + R; a0 = Math.PI; }
  const th = a0 + u / R;
  o.x = cx + R * Math.cos(th); o.z = cz + R * Math.sin(th); o.tx = -Math.sin(th); o.tz = Math.cos(th);
  return o;
}

// ---- elevation profile (rail base height), smoothed, graded <= 4%, pinned at the station ----
const N = Math.ceil(L), DS = L / N;
const YT = new Float32Array(N);
(function buildProfile() {
  const p = { x: 0, z: 0, tx: 0, tz: 0 }, raw = new Float32Array(N), tmp = new Float32Array(N);
  for (let i = 0; i < N; i++) { pathAt(i * DS, p); raw[i] = heightAt(p.x, p.z); }
  const sm = (src, dst, w) => { for (let i = 0; i < N; i++) { let a = 0; for (let k = -w; k <= w; k++) a += src[(i + k + N) % N]; dst[i] = a / (2 * w + 1); } };
  sm(raw, tmp, 10); sm(tmp, YT, 10);
  const pinned = new Uint8Array(N);
  const i0 = Math.round((TUN0 - 2) / DS), i1 = Math.round((TUN1 + 2) / DS);
  let m = 0; for (let i = i0; i <= i1; i++) m += YT[i]; m /= (i1 - i0 + 1);
  for (let i = i0; i <= i1; i++) { YT[i] = m; pinned[i] = 1; }
  const j0 = Math.round((S_STOP - 22) / DS), j1 = Math.round((S_STOP + 22) / DS);
  for (let i = j0; i <= j1; i++) { YT[i] = -0.03; pinned[i] = 1; }
  const g = 0.04 * DS;
  for (let it = 0; it < 4; it++) {
    for (let i = 1; i < 2 * N; i++) { const a = (i - 1) % N, b = i % N; if (!pinned[b]) YT[b] = Math.min(YT[a] + g, Math.max(YT[a] - g, YT[b])); }
    for (let i = 2 * N - 2; i >= 0; i--) { const a = (i + 1) % N, b = i % N; if (!pinned[b]) YT[b] = Math.min(YT[a] + g, Math.max(YT[a] - g, YT[b])); }
  }
})();
function yAt(s) {
  s = ((s % L) + L) % L; const f = s / DS, i = Math.floor(f), k = f - i;
  return YT[i % N] * (1 - k) + YT[(i + 1) % N] * k;
}

function label(THREE, text, w, h, fg, bg, font) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'); g.fillStyle = bg; g.fillRect(0, 0, w, h);
  g.fillStyle = fg; g.font = font; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, w / 2, h / 2 + 2);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}

export function build(ctx) {
  const { THREE, M, quality } = ctx;
  const low = quality === 'low';
  const group = new THREE.Group(); group.name = 'metro';
  const regions = [], colliders = [];
  const pickables = [], seats = [];   // sit contract: the station benches' pick proxies and person-places
  const T = { x: 0, z: 0, tx: 0, tz: 0 };
  const smoothstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

  const concrete = M.get('concreteWall'), slabMat = M.get('concreteFloor'), steel = M.get('steel');
  const gravel = M.get('gravel'), earth = M.get('terrain'), paving = M.get('paving');
  const dbl = (m) => { const c = m.clone(); c.side = THREE.DoubleSide; return c; };
  const concreteD = dbl(concrete), earthD = dbl(earth), slabD = dbl(slabMat), gravelD = dbl(gravel);
  const graphite = new THREE.MeshPhysicalMaterial({ color: 0x24272c, roughness: 0.35, metalness: 0.4, clearcoat: 0.6, clearcoatRoughness: 0.3 });
  const white = new THREE.MeshPhysicalMaterial({ color: 0xf3f5f7, roughness: 0.28, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.08 });
  const glass = new THREE.MeshPhysicalMaterial({ color: 0x0c1a24, roughness: 0.04, metalness: 0, clearcoat: 1, transparent: true, opacity: 0.45, depthWrite: false });
  const glow = (r, g, b) => { const m = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }); m.color.setRGB(r, g, b); return m; };
  const wireMat = new THREE.MeshBasicMaterial({ color: 0x15171a, side: THREE.DoubleSide });
  const mesh = (geo, mat, cast = true, recv = true) => { const m = new THREE.Mesh(geo, mat); m.castShadow = cast; m.receiveShadow = recv; return m; };
  const box = (w, h, d, mat, x, y, z, parent, cast = true) => { const g = new THREE.BoxGeometry(w, h, d); const m = mesh(g, mat, cast, true); m.position.set(x, y, z); (parent || group).add(m); return m; };

  // ---- sweep a 2D profile [lateral(+inward), vertical] along the route ----
  function sweep(s0, s1, step, polys, mat, taper) {
    const n = Math.max(1, Math.ceil((s1 - s0) / step));
    let vc = 0; for (const p of polys) vc += (n + 1) * p.length;
    const pos = new Float32Array(vc * 3), uv = new Float32Array(vc * 2), idx = [];
    let base = 0, w = 0, q = 0;
    for (const p of polys) {
      const m = p.length, cum = [0];
      for (let j = 1; j < m; j++) cum.push(cum[j - 1] + Math.hypot(p[j][0] - p[j - 1][0], p[j][1] - p[j - 1][1]));
      for (let k = 0; k <= n; k++) {
        const s = s0 + (s1 - s0) * k / n; pathAt(s, T); const y = yAt(s), rx = -T.tz, rz = T.tx;
        for (let j = 0; j < m; j++) {
          pos[w++] = T.x + rx * p[j][0]; pos[w++] = y + p[j][1]; pos[w++] = T.z + rz * p[j][0];
          uv[q++] = s; uv[q++] = cum[j];
        }
      }
      for (let k = 0; k < n; k++) for (let j = 0; j < m - 1; j++) { const a = base + k * m + j, b = a + m; idx.push(a, b, a + 1, b, b + 1, a + 1); }
      base += (n + 1) * m;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(idx); g.computeVertexNormals();
    const me = mesh(g, mat, true, true); group.add(me); return me;
  }

  // ---- track: slab, shoulders, rails, wire ----
  sweep(0, L, 1, [[[-1.6, 0], [1.6, 0]], [[1.6, 0], [1.6, -0.7]], [[-1.6, 0], [-1.6, -0.7]]], slabD);
  sweep(0, L, 1, [[[1.6, 0.0], [4.6, -1.5]], [[-1.6, 0.0], [-4.6, -1.5]]], gravelD);
  const rail = (c) => [[c - 0.07, 0], [c + 0.07, 0], [c + 0.07, 0.02], [c + 0.015, 0.03], [c + 0.015, 0.075], [c + 0.04, 0.082], [c + 0.04, H_RAIL], [c - 0.04, H_RAIL], [c - 0.04, 0.082], [c - 0.015, 0.075], [c - 0.015, 0.03], [c - 0.07, 0.02], [c - 0.07, 0]];
  sweep(0, L, 1, [rail(-0.7175), rail(0.7175)], steel);
  sweep(0, L, 2, [[[0, WIRE - 0.012], [0.012, WIRE], [0, WIRE + 0.012], [-0.012, WIRE], [0, WIRE - 0.012]]], wireMat);

  // ---- catenary masts every 25 m (not in the tunnel) ----
  {
    const pts = []; const d = new THREE.Object3D();
    for (let s = 12; s < L; s += 25) { if (s > TUN0 - 8 && s < TUN1 + 8) continue; pts.push(s); }
    const pole = new THREE.CylinderGeometry(0.07, 0.11, 6.2, 8); pole.translate(0, 3.1, 0);
    const arm = new THREE.BoxGeometry(2.9, 0.09, 0.09); arm.translate(1.45, 5.7, 0);
    const drop = new THREE.BoxGeometry(0.03, 1.2, 0.03); drop.translate(2.9, 4.95, 0);
    const mp = new THREE.InstancedMesh(BGU.mergeGeometries([pole, arm, drop]), graphite, pts.length);
    pts.forEach((s, i) => { pathAt(s, T); d.position.set(T.x + T.tz * 2.9, yAt(s), T.z - T.tx * 2.9); d.rotation.set(0, Math.atan2(T.tx, -T.tz), 0); d.updateMatrix(); mp.setMatrixAt(i, d.matrix); });
    mp.castShadow = true; group.add(mp);
  }

  // ---- tunnel (north straight, x -40…40) ----
  const yTun = yAt(60);
  sweep(TUN0, TUN1, 4, [[[-TUN_W, 0], [-TUN_W, TUN_H]], [[-TUN_W, TUN_H], [TUN_W, TUN_H]], [[TUN_W, TUN_H], [TUN_W, 0]]], concreteD);
  sweep(TUN0, TUN1, 4, [[[-TUN_W - 0.5, -0.6], [-TUN_W - 0.5, TUN_H + 0.5], [TUN_W + 0.5, TUN_H + 0.5], [TUN_W + 0.5, -0.6]]], concreteD);
  const hump = [[-13, -0.5], [-10, 1.0], [-7, 3.2], [-4, 5.6], [-1.5, 6.7], [0, 7.0], [1.5, 6.7], [4, 5.6], [7, 3.2], [10, 1.0], [13, -0.5]];
  sweep(TUN0, TUN1, 4, [hump], earthD);
  // low continuous light strips along the walls and a ridge strip in the ceiling
  const stripMat = glow(0.7, 1.4, 1.9);
  sweep(TUN0, TUN1, 4, [[[-TUN_W + 0.02, 0.45], [-TUN_W + 0.02, 0.6]], [[TUN_W - 0.02, 0.45], [TUN_W - 0.02, 0.6]], [[-0.25, TUN_H - 0.02], [0.25, TUN_H - 0.02]]], stripMat);
  // headwalls with clean concrete frames
  for (const e of [0, 1]) {
    const x = e ? 40 : -40, sg = e ? 1 : -1;
    const shape = new THREE.Shape(); shape.moveTo(hump[0][0], hump[0][1]);
    for (const p of hump) shape.lineTo(p[0], p[1]); shape.lineTo(13, -1.6); shape.lineTo(-13, -1.6);
    const hole = new THREE.Path(); hole.moveTo(-TUN_W, 0); hole.lineTo(TUN_W, 0); hole.lineTo(TUN_W, TUN_H); hole.lineTo(-TUN_W, TUN_H); shape.holes.push(hole);
    const g = new THREE.ShapeGeometry(shape); g.rotateY(-Math.PI / 2); M.boxUV(g);
    const hw = mesh(g, concreteD); hw.position.set(x, yTun, ZA); group.add(hw);
    const fx = x - sg * 0.15;
    box(0.5, 0.7, 2 * TUN_W + 1.6, concrete, fx, yTun + TUN_H + 0.35, ZA, null);
    box(0.5, TUN_H + 0.7, 0.55, concrete, fx, yTun + TUN_H / 2 - 0.0, ZA - TUN_W - 0.28, null);
    box(0.5, TUN_H + 0.7, 0.55, concrete, fx, yTun + TUN_H / 2 - 0.0, ZA + TUN_W + 0.28, null);
  }
  // light rings (pulse in a travelling wave)
  const nRing = low ? 20 : 39, ringS = low ? 4 : 2;
  const rg = BGU.mergeGeometries([
    new THREE.BoxGeometry(0.16, 4.1, 0.07).translate(0, 2.6, TUN_W - 0.06), new THREE.BoxGeometry(0.16, 4.1, 0.07).translate(0, 2.6, -TUN_W + 0.06),
    new THREE.BoxGeometry(0.16, 0.07, 2 * TUN_W - 0.1).translate(0, TUN_H - 0.05, 0)]);
  const ringMat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
  const rings = new THREE.InstancedMesh(rg, ringMat, nRing);
  { const d = new THREE.Object3D(), c0 = new THREE.Color(1, 1, 1);
    for (let i = 0; i < nRing; i++) { const x = -38 + i * ringS; d.position.set(x, yAt(x + 62), ZA); d.updateMatrix(); rings.setMatrixAt(i, d.matrix); rings.setColorAt(i, c0); } }
  rings.frustumCulled = false; group.add(rings);
  const ringTmp = new THREE.Color();
  // portal glow
  const gc = document.createElement('canvas'); gc.width = gc.height = 128; { const g = gc.getContext('2d'), gr = g.createRadialGradient(64, 64, 2, 64, 64, 62); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); }
  const gtex = new THREE.CanvasTexture(gc); gtex.colorSpace = THREE.SRGBColorSpace;
  const glows = [];
  for (const x of [-41.2, 41.2]) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: gtex, color: 0x66ccff, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false }));
    sp.scale.set(10, 7, 1); sp.position.set(x, yTun + 2.5, ZA); group.add(sp); glows.push(sp);
    if (!low) { const pl = new THREE.PointLight(0x66ccff, 6, 16, 2); pl.position.set(x * 0.985, yTun + 2.5, ZA); group.add(pl); glows.push(pl); }
  }

  // ---- station "Workshop · Garden" (platform x 81.08…84.58, z 14…44; canopy z 22…36) ----
  {
    const PX0 = 81.08, PX1 = 84.58, PZ0 = 14, PZ1 = 44;
    const slab = new THREE.BoxGeometry(PX1 - PX0, 0.38, PZ1 - PZ0); M.boxUV(slab);
    const sm = mesh(slab, paving); sm.position.set((PX0 + PX1) / 2, 0.16, (PZ0 + PZ1) / 2); group.add(sm);
    box(0.4, 0.012, PZ1 - PZ0, new THREE.MeshStandardMaterial({ color: 0xe6b422, roughness: 0.7 }), PX1 - 0.2, 0.356, (PZ0 + PZ1) / 2, null, false);
    // path from the garden gate + ramp
    const pg = new THREE.BoxGeometry(13, 0.03, 2.8); M.boxUV(pg); const pm = mesh(pg, paving); pm.position.set(70.5, -0.015, 29); group.add(pm);
    const rs = new THREE.Shape(); rs.moveTo(77, -0.03); rs.lineTo(PX0, -0.03); rs.lineTo(PX0, 0.35); rs.lineTo(77, 0); rs.closePath();
    const rgeo = new THREE.ExtrudeGeometry(rs, { depth: 2.8, bevelEnabled: false }); rgeo.translate(0, 0, 27.6); M.boxUV(rgeo);
    group.add(mesh(rgeo, paving));
    regions.push({ minX: 63, maxX: 77.2, minZ: 27.6, maxZ: 30.4, y: 0 });
    regions.push({ minX: 77, maxX: PX0 + 0.1, minZ: 27.6, maxZ: 30.4, y: 0, ramp: { axis: 'x', from: 77, to: PX0, y0: 0, y1: 0.35 } });
    regions.push({ minX: PX0, maxX: PX1, minZ: PZ0, maxZ: PZ1, y: 0.35 });
    // canopy
    const CY = 3.7, glassRoof = new THREE.MeshPhysicalMaterial({ color: 0x9fc4c8, roughness: 0.05, metalness: 0, transparent: true, opacity: 0.3, clearcoat: 1, side: THREE.DoubleSide, depthWrite: false });
    const roof = box(3.9, 0.04, 16, glassRoof, 82.9, CY, 29, null, false);
    for (const z of [21, 29, 37]) box(3.95, 0.1, 0.12, steel, 82.9, CY - 0.05, z, null);
    box(0.1, 0.12, 16, steel, 84.8, CY - 0.05, 29, null); box(0.1, 0.12, 16, steel, 81.0, CY - 0.05, 29, null);
    for (const z of [23, 26, 32, 35]) {
      box(0.2, CY - 0.35, 0.2, graphite, 81.55, 0.35 + (CY - 0.35) / 2, z, null);
      colliders.push({ minX: 81.45, maxX: 81.65, minZ: z - 0.1, maxZ: z + 0.1, minY: 0.35, maxY: CY });
    }
    // LED strip + sign
    box(0.12, 0.03, 15, glow(2, 2.1, 2.3), 83.0, CY - 0.12, 29, null, false);
    const signT = label(THREE, 'Workshop · Garden', 1024, 128, '#ffffff', '#0d3b47', '700 78px Helvetica, Arial, sans-serif');
    const signMat = new THREE.MeshBasicMaterial({ map: signT, toneMapped: false, side: THREE.DoubleSide }); signMat.color.setScalar(1.3);
    const fascia = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 0.8), signMat); fascia.position.set(84.86, CY + 0.35, 29); fascia.rotation.y = Math.PI / 2; group.add(fascia);
    const fascia2 = fascia.clone(); fascia2.position.x = 80.9; fascia2.rotation.y = -Math.PI / 2; group.add(fascia2);
    for (const z of [20.4, 37.6]) {
      box(0.2, 2.5, 0.2, graphite, 83.2, 0.35 + 1.25, z, null);
      const sg = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 0.225), signMat); sg.position.set(83.2, 0.35 + 2.3, z + (z < 29 ? -0.11 : 0.11)); sg.rotation.y = z < 29 ? Math.PI : 0; group.add(sg);
    }
    // benches
    const wood = M.get('oakPlanks');
    for (const z of [24.5, 33.5]) { box(0.5, 0.06, 1.8, wood, 82.0, 0.35 + 0.46, z, null); box(0.06, 0.45, 1.8, wood, 81.8, 0.35 + 0.7, z, null);
      box(0.4, 0.45, 0.06, graphite, 82.0, 0.35 + 0.22, z - 0.8, null); box(0.4, 0.45, 0.06, graphite, 82.0, 0.35 + 0.22, z + 0.8, null); }
    // sit contract: three 0.6 m person-places per 1.8 m bench (z −0.6, 0, +0.6) on the
    // seat top (centre 0.35 + 0.46 + half its 0.06 = 0.84), centred on the free seat
    // depth between the backrest face (81.8 + 0.03) and the front edge (82.0 + 0.25)
    // = 82.04, looking +x: away from the backrest, across the platform to the track.
    // One invisible pick proxy per bench encloses seat, back and legs (x 81.75…82.25,
    // y 0.345…1.275, z ±0.9) with a little to spare (clear of the canopy posts at
    // x ≤ 81.65), so any ray that reaches the bench meets the proxy first.
    const mm = (v) => Math.round(v * 1000) / 1000;
    const seatTop = mm(0.35 + 0.46 + 0.06 / 2), seatX = mm((81.8 + 0.06 / 2 + 82.0 + 0.5 / 2) / 2);
    const proxyGeo = new THREE.BoxGeometry(0.54, 0.96, 1.84), proxyMat = new THREE.MeshBasicMaterial({ visible: false });
    for (const z of [24.5, 33.5]) {
      const own = [-0.6, 0, 0.6].map((dz) => ({ x: seatX, y: seatTop, z: mm(z + dz), facing: [1, 0] }));
      const proxy = new THREE.Mesh(proxyGeo, proxyMat);
      proxy.name = 'station-bench-seat';
      proxy.position.set(82.0, 0.82, z);                     // x 81.73…82.27, y 0.34…1.30, z ±0.92
      proxy.userData.action = { type: 'sit', seats: own };
      group.add(proxy); pickables.push(proxy); seats.push(...own);
    }
  }

  // ---- the tram: 3 cars, local +z forward, origin at rail-head top ----
  const CL = 8.8, HL = CL / 2, GAP = 9.4;
  const doors = [];
  const roofShape = new THREE.Shape();
  roofShape.moveTo(-1.325, 2.5); roofShape.lineTo(1.325, 2.5); roofShape.lineTo(1.325, 2.85);
  roofShape.bezierCurveTo(1.325, 3.2, 0.9, 3.4, 0, 3.4); roofShape.bezierCurveTo(-0.9, 3.4, -1.325, 3.2, -1.325, 2.85); roofShape.closePath();
  const roofGeo = new THREE.ExtrudeGeometry(roofShape, { depth: CL, bevelEnabled: false, curveSegments: 10 }); roofGeo.translate(0, 0, -HL);
  const noseShape = new THREE.Shape(); [[4.4, 0.3], [6.0, 0.3], [6.3, 0.9], [6.15, 1.9], [5.5, 3.0], [4.9, 3.4], [4.4, 3.4]].forEach((p, i) => i ? noseShape.lineTo(p[0], p[1]) : noseShape.moveTo(p[0], p[1]));
  const noseGeo = new THREE.ExtrudeGeometry(noseShape, { depth: 2.64, bevelEnabled: false }); noseGeo.rotateY(-Math.PI / 2); noseGeo.translate(1.32, 0, 0);
  const seatA = new THREE.BoxGeometry(0.45, 0.08, 0.5), seatB = new THREE.BoxGeometry(0.06, 0.5, 0.5);
  const seatMat = new THREE.MeshStandardMaterial({ color: 0x2b6f7a, roughness: 0.8 });
  const ceilMat = glow(2.4, 2.3, 2.0), headMat = glow(6, 6, 5.5), tailMat = glow(4, 0.15, 0.1);
  const dispT = label(THREE, 'WORKSHOP CIRCULAR', 512, 64, '#ffb020', '#050505', '700 40px monospace');
  const dispMat = new THREE.MeshBasicMaterial({ map: dispT, toneMapped: false }); dispMat.color.setScalar(1.6);
  const segs = [[-HL, -3.0], [-1.6, 1.6], [3.0, HL]];

  function makeCar(idx) {
    const car = new THREE.Group();
    car.add(mesh(roofGeo, white));
    box(2.6, 0.06, CL, white, 0, 0.33, 0, car); box(2.5, 0.2, CL, graphite, 0, 0.2, 0, car);
    for (const z of [-3.4, 3.4]) box(2.68, 0.3, 2.0, graphite, 0, 0.19, z, car);
    box(2.55, 0.03, CL - 0.2, graphite, 0, 0.365, 0, car, false);
    box(0.35, 0.04, CL - 0.6, ceilMat, 0, 2.47, 0, car, false);
    box(2.5, 0.05, CL - 0.2, white, 0, 2.5, 0, car, false);
    for (const sx of [-1, 1]) {
      const x = sx * 1.3;
      // lower panels between door openings, window glass, pillars
      segs.forEach(([a, b]) => {
        box(0.07, 0.65, b - a, white, x, 0.65, (a + b) / 2, car);
        box(0.03, 1.5, b - a - 0.1, glass, x, 1.75, (a + b) / 2, car, false);
      });
      for (const z of [-4.35, -3.0, -1.6, 0, 1.6, 3.0, 4.35]) box(0.12, 1.55, z === 0 ? 0.25 : 0.12, graphite, x, 1.75, z, car);
      // door leaves (+x side stays shut, -x side slides open at the station)
      for (const dz of [-2.3, 2.3]) for (const k of [-1, 1]) {
        const leaf = box(0.035, 2.2, 0.7, glass, sx * 1.35, 1.4, dz + k * 0.35, car, false);
        const fr = box(0.04, 2.2, 0.05, graphite, sx * 1.35 + 0.0, 0, k * 0.33, leaf, false);
        if (sx < 0) doors.push({ m: leaf, z0: dz + k * 0.35, dir: k });
      }
    }
    // interior: seats
    const zs = [-4.15, -3.63, -1.3, -0.78, 0.78, 1.3, 3.63, 4.15];
    const si = new THREE.InstancedMesh(seatA, seatMat, zs.length * 2), sb = new THREE.InstancedMesh(seatB, seatMat, zs.length * 2), d = new THREE.Object3D();
    let n = 0;
    for (const sx of [-1, 1]) for (const z of zs) {
      d.position.set(sx * 0.95, 0.82, z); d.updateMatrix(); si.setMatrixAt(n, d.matrix);
      d.position.set(sx * 1.14, 1.1, z); d.updateMatrix(); sb.setMatrixAt(n, d.matrix); n++;
    }
    for (const x of [-0.95, 0.95]) { box(0.35, 0.5, 4.5, graphite, x * 1.0, 0.6, 0, car, false); }
    car.add(si, sb);
    box(2.6, 2.2, 0.06, white, 0, 1.4, -HL, car); box(2.6, 2.2, 0.06, white, 0, 1.4, HL, car);
    for (let i = -1; i <= 1; i += 2) box(0.04, 2.1, 0.04, new THREE.MeshStandardMaterial({ color: 0xe0b020, metalness: 0.6, roughness: 0.3 }), i * 0.4, 1.4, 0.0, car, false);
    if (idx < 2) box(2.4, 2.7, 0.62, graphite, 0, 1.65, -HL - 0.31, car);
    if (idx === 1) {   // pantograph
      const rod = (ax, ay, az, bx, by, bz) => { const a = new THREE.Vector3(ax, ay, az), b = new THREE.Vector3(bx, by, bz); const m = mesh(new THREE.BoxGeometry(0.06, 0.06, a.distanceTo(b)), graphite, true, false); m.position.copy(a).add(b).multiplyScalar(0.5); m.lookAt(b); car.add(m); };
      rod(-0.55, 3.4, -1.2, -0.55, 3.95, -0.1); rod(0.55, 3.4, -1.2, 0.55, 3.95, -0.1);
      rod(-0.55, 3.95, -0.1, -0.55, WIRE - H_RAIL - 0.04, -1.1); rod(0.55, 3.95, -0.1, 0.55, WIRE - H_RAIL - 0.04, -1.1);
      box(1.8, 0.05, 0.14, steel, 0, WIRE - H_RAIL - 0.02, -1.1, car, false);
    }
    const nose = (front) => {
      const g = new THREE.Group(); g.add(mesh(noseGeo, white));
      const ws = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 1.278), glass); ws.position.set(0, 2.45, 5.825); ws.position.z += 0.012; ws.rotation.x = -Math.atan2(0.65, 1.1) * 1; g.add(ws);
      const ws2 = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 0.2), front ? dispMat : graphite); ws2.position.set(0, 2.72, 5.64 + 0.02); ws2.rotation.x = ws.rotation.x; g.add(ws2);
      const lm = front ? headMat : tailMat;
      for (const sx of [-1, 1]) box(0.38, 0.12, 0.05, lm, sx * 0.85, 0.7, 6.29, g, false);
      box(1.2, 0.04, 0.05, lm, 0, 1.0, 6.24, g, false);
      if (!front) g.rotation.y = Math.PI;
      return g;
    };
    if (idx === 0) car.add(nose(true));
    if (idx === 2) car.add(nose(false));
    car.rotation.order = 'YXZ'; group.add(car); return car;
  }
  const cars = [makeCar(0), makeCar(1), makeCar(2)];
  const doorY = 1.4;

  // ---- simulation (no allocations per frame) ----
  const reduced = !!ctx.reducedMotion;
  const VMAX = reduced ? 5 : 12, ACC = reduced ? 0.6 : 1.1, BRK = reduced ? 0.55 : 1.0;
  let s = S_STOP - 160, v = 0, dwell = 0, dtime = 0, clock = 0;
  const P1 = { x: 0, z: 0, tx: 0, tz: 0 }, P2 = { x: 0, z: 0, tx: 0, tz: 0 };
  const position = new THREE.Vector3();
  const sink = {};

  function poseCars() {
    for (let i = 0; i < 3; i++) {
      const sc = s + (1 - i) * GAP;
      pathAt(sc + 3.6, P1); pathAt(sc - 3.6, P2);
      const y1 = yAt(sc + 3.6), y2 = yAt(sc - 3.6), dx = P1.x - P2.x, dz = P1.z - P2.z, hz = Math.hypot(dx, dz);
      const c = cars[i];
      c.position.set((P1.x + P2.x) * 0.5, (y1 + y2) * 0.5 + H_RAIL, (P1.z + P2.z) * 0.5);
      c.rotation.set(-Math.atan2(y1 - y2, hz), Math.atan2(dx, dz), 0);
      if (i === 1) position.copy(c.position);
    }
  }
  function setDoors(o) { const off = o * 0.7; for (let i = 0; i < doors.length; i++) { const dr = doors[i]; dr.m.position.z = dr.z0 + dr.dir * off; } }
  poseCars();

  let rideService = false;
  function setRideService(value) { rideService=!!value; for (const c of cars) c.visible=!rideService; }
  function update(dt) {
    if (rideService) return;
    dt = Math.min(dt || 0, 0.1); clock += dt;
    if (dwell > 0) {
      dwell -= dt; dtime += dt;
      setDoors(smoothstep(0.8, 2.3, dtime) * smoothstep(11.4, 9.9, dtime));
      if (dwell <= 0) { dwell = 0; v = 0; s = S_STOP + 0.01; setDoors(0); }
    } else if (dt > 0) {
      const d = (S_STOP - s + L) % L;
      if (d < 0.15 || (d < v * dt + 0.1 && v < 1.2)) { s = S_STOP; v = 0; dwell = 12; dtime = 0; }
      else {
        const vt = Math.min(VMAX, Math.sqrt(2 * BRK * 0.8 * d) + 0.15);
        v = v < vt ? Math.min(vt, v + ACC * dt) : Math.max(vt, v - BRK * 1.4 * dt);
        s += v * dt; if (s >= L) s -= L;
      }
    }
    poseCars();
    // tunnel light wave: pulses ahead of / around the tram
    const st = ((s % L) + L) % L;
    for (let i = 0; i < nRing; i++) {
      const rs = -38 + i * ringS + 62, dd = rs - st;
      const w = dd > 0 ? 16 : 7;
      const k = 0.75 + 0.25 * Math.sin(rs * 0.35 - clock * 2.2) + 4.2 * Math.exp(-(dd * dd) / (w * w));
      ringTmp.setRGB(0.55 * k, 1.0 * k, 1.35 * k); rings.setColorAt(i, ringTmp);
    }
    rings.instanceColor.needsUpdate = true;
    const near = Math.exp(-Math.pow((Math.min(Math.abs(st - TUN0), Math.abs(st - TUN1))) / 25, 2));
    for (let i = 0; i < glows.length; i++) { const g = glows[i]; if (g.isSprite) g.material.opacity = 0.45 + 0.4 * near; else g.intensity = 5 + 14 * near; }
  }

  return { group, regions, colliders, pickables, seats, update, onPick() {}, position, setRideService };
}
