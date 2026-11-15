// Skyliner — detachable gondola cable car (BRIEF §6). Valley station (-78,-10) -> mountain station on distant hill.
import * as BGU from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { heightAt } from './landscape.js';

export function build(ctx) {
  const { THREE, M, quality } = ctx;
  const low = quality === 'low';
  const reduced = !!ctx.reducedMotion;
  const group = new THREE.Group();
  group.name = 'skyliner';

  // ---------- line ----------
  const P0 = { x: -78, z: -10 };
  let P1 = { x: -270, z: -360 }, bestSc = -1e9;      // nearest high ground toward (-330,-380)
  for (let x = -400; x <= -260; x += 10) for (let z = -450; z <= -310; z += 10) {
    const sc = heightAt(x, z) - 0.05 * Math.hypot(x + 330, z + 380);
    if (sc > bestSc) { bestSc = sc; P1 = { x, z }; }
  }
  const L = Math.hypot(P1.x - P0.x, P1.z - P0.z);
  const Dx = (P1.x - P0.x) / L, Dz = (P1.z - P0.z) / L, Nx = -Dz, Nz = Dx;
  const LINE_YAW = Math.atan2(-Dz, Dx);               // rotY(LINE_YAW) maps local +x onto the line direction
  const R = 2.5;                                      // half rope spacing = bullwheel radius
  const yV = heightAt(P0.x, P0.z), yT = heightAt(P1.x, P1.z) + 1.0;
  const ropeV = yV + 4.7, ropeT = yT + 4.7;

  // towers
  const TFR = [0.22, 0.42, 0.62, 0.80], TH = [40, 38, 42, 38];
  const towers = TFR.map((f, i) => {
    const s = f * L, x = P0.x + Dx * s, z = P0.z + Dz * s, g = heightAt(x, z);
    return { s, x, z, g, H: TH[i], top: g + TH[i] };
  });
  const nodesS = [0, ...towers.map((t) => t.s), L];
  const nodesY = [ropeV, ...towers.map((t) => t.top), ropeT];
  const TAB_N = Math.ceil(L) + 2;
  const ropeTab = new Float32Array(TAB_N);            // rope height every 1 m (catenary-ish parabola per span)
  for (let i = 0; i < TAB_N; i++) {
    const s = Math.min(i, L);
    let k = 0; while (k < nodesS.length - 2 && s > nodesS[k + 1]) k++;
    const a = nodesS[k], b = nodesS[k + 1], t = (s - a) / (b - a), span = b - a;
    ropeTab[i] = nodesY[k] + (nodesY[k + 1] - nodesY[k]) * t - 4 * (span / 45) * t * (1 - t);
  }
  const ropeAt = (s) => {
    const f = s < 0 ? 0 : s > L ? L : s, i = f | 0, u = f - i;
    return ropeTab[i] + (ropeTab[i + 1] - ropeTab[i]) * u;
  };

  // ---------- materials ----------
  const steel = M.get('steel');
  const concrete = M.get('concreteWall');
  const paint = new THREE.MeshStandardMaterial({ color: 0xe9ecef, roughness: 0.35, metalness: 0.25, side: THREE.DoubleSide });
  const dark = new THREE.MeshStandardMaterial({ color: 0x15181b, roughness: 0.4, metalness: 0.7 });
  const ropeMat = new THREE.MeshStandardMaterial({ color: 0x2b2e31, roughness: 0.5, metalness: 0.8 });
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x9fc4d4, roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.26, envMapIntensity: 1.6, depthWrite: false, side: THREE.DoubleSide });
  const glowMat = new THREE.MeshStandardMaterial({ color: 0x2a2418, emissive: 0xffd08a, emissiveIntensity: 2.4, roughness: 0.6 });
  const redMat = new THREE.MeshStandardMaterial({ color: 0x300000, emissive: 0xff1a10, emissiveIntensity: 2.0 });
  const mats = { steel, concrete, paint, dark, glass: glassMat, glow: glowMat, red: redMat };

  // ---------- geometry buckets (world-baked, merged per material) ----------
  const buckets = {};
  const clean = (g) => {
    const n = g.index ? g.toNonIndexed() : g;
    for (const k of Object.keys(n.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') n.deleteAttribute(k);
    if (!n.attributes.uv) n.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n.attributes.position.count * 2), 2));
    return n;
  };
  const put = (key, g, m4) => { if (m4) g.applyMatrix4(m4); (buckets[key] ||= []).push(clean(g)); };
  const bx = (key, w, h, d, x, y, z, m4, uv = true) => {
    const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y, z); if (uv) M.boxUV(g); put(key, g, m4);
  };
  const _up = new THREE.Vector3(0, 1, 0), _a = new THREE.Vector3(), _b = new THREE.Vector3(), _q = new THREE.Quaternion();
  const _m = new THREE.Matrix4(), _s1 = new THREE.Vector3(1, 1, 1);
  const strut = (key, ax, ay, az, bx_, by, bz, r, m4) => {
    _a.set(ax, ay, az); _b.set(bx_, by, bz);
    const len = _a.distanceTo(_b);
    const g = new THREE.CylinderGeometry(r, r, len, 5, 1);
    _q.setFromUnitVectors(_up, _b.clone().sub(_a).normalize());
    _m.compose(_a.clone().add(_b).multiplyScalar(0.5), _q, _s1);
    g.applyMatrix4(_m); put(key, g, m4);
  };
  const frameM = (x, z, yaw) => new THREE.Matrix4().makeRotationY(yaw).setPosition(x, 0, z);

  // ---------- towers (lattice, 35-45 m) ----------
  const redPts = [];
  for (const T of towers) {
    const m4 = frameM(T.x, T.z, LINE_YAW);
    const c = Math.cos(LINE_YAW), s = Math.sin(LINE_YAW);
    const yb = T.g - 1.0, yTop = T.top - 1.0;          // frame top just under the crossarm
    const bh = 3.2, th = 0.9, levels = 7;
    const half = (y) => bh + (th - bh) * ((y - yb) / (yTop - yb));
    const corners = [[1, 1], [1, -1], [-1, -1], [-1, 1]];
    const legBase = corners.map(([sx, sz]) => {
      const lx = sx * bh, lz = sz * bh;
      const wx = T.x + lx * c + lz * s, wz = T.z - lx * s + lz * c;
      return heightAt(wx, wz) - 1.2;
    });
    for (let i = 0; i < 4; i++) strut('steel', corners[i][0] * bh, legBase[i], corners[i][1] * bh, corners[i][0] * th, yTop, corners[i][1] * th, 0.16, m4);
    for (let k = 1; k <= levels; k++) {
      const y0 = yb + (yTop - yb) * (k - 1) / levels, y1 = yb + (yTop - yb) * k / levels;
      const h0 = half(y0), h1 = half(y1);
      for (let i = 0; i < 4; i++) {
        const [sx, sz] = corners[i], [nx, nz] = corners[(i + 1) % 4];
        if (k > 1 || true) strut('steel', sx * h1, y1, sz * h1, nx * h1, y1, nz * h1, 0.07, m4);
        if (!low) {   // X-brace per face, alternating hand
          const f = k % 2 ? 0 : 1;
          strut('steel', (f ? nx : sx) * h0, y0, (f ? nz : sz) * h0, (f ? sx : nx) * h1, y1, (f ? sz : nz) * h1, 0.05, m4);
        }
      }
    }
    // crossarm + sheave batteries
    bx('steel', 1.2, 0.5, 11, 0, T.top - 1.3, 0, m4, false);
    bx('steel', 2.4, 0.6, 2.4, 0, yTop - 0.2, 0, m4, false);
    for (const lat of [R, -R]) {
      bx('dark', 2.2, 0.3, 0.5, 0, T.top - 0.85, lat, m4, false);
      for (const dx of [-0.8, 0.8]) {
        const g = new THREE.CylinderGeometry(0.32, 0.32, 0.22, 14); g.rotateX(Math.PI / 2); g.translate(dx, T.top - 0.3, lat); put('dark', g, m4);
      }
      bx('steel', 0.1, 0.5, 0.5, 0, T.top - 0.5, lat, m4, false);
    }
    // aviation light on a short mast
    strut('steel', 0, T.top - 0.7, 0, 0, T.top + 2.2, 0, 0.06, m4);
    const sg = new THREE.SphereGeometry(0.38, 10, 8); sg.translate(0, T.top + 2.5, 0); put('red', sg, m4);
  }

  // ---------- stations ----------
  const colliders = [];
  const signCanvasTex = (() => {
    if (typeof document === 'undefined') return null;
    const c = document.createElement('canvas'); c.width = 1024; c.height = 192;
    const g = c.getContext('2d');
    g.fillStyle = '#0d1114'; g.fillRect(0, 0, 1024, 192);
    g.strokeStyle = '#ff7a1a'; g.lineWidth = 6; g.strokeRect(10, 10, 1004, 172);
    g.fillStyle = '#ffffff'; g.font = '700 118px "Helvetica Neue", Arial, sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    if ('letterSpacing' in g) g.letterSpacing = '14px';
    g.fillText('SKYLINER', 512, 100);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
  })();
  const signs = [];

  function station(wx, wz, yBase, yaw, withSign) {
    const m4 = frameM(wx, wz, yaw);
    const slabTop = yBase + 1.2, ropeY = yBase + 4.7;
    const X0 = -16.2, X1 = 3.6, W = 6.4;
    // plinth / platform
    bx('concrete', X1 - X0, slabTop - (yBase - 12), 2 * W, (X0 + X1) / 2, (slabTop + yBase - 12) / 2, 0, m4);
    bx('steel', X1 - X0 - 0.4, 0.12, 2 * W - 0.4, (X0 + X1) / 2, slabTop + 0.06, 0, m4, false);
    // bullwheel (horizontal) + housing
    const disc = new THREE.CylinderGeometry(2.9, 2.9, 0.4, 32); disc.translate(0, ropeY - 0.35, 0); put('dark', disc, m4);
    const col = new THREE.CylinderGeometry(0.6, 0.8, ropeY - slabTop, 12); col.translate(0, (ropeY + slabTop) / 2, 0); put('steel', col, m4);
    const shroud = new THREE.CylinderGeometry(3.25, 3.25, 1.3, 28, 1, true, Math.PI, Math.PI); shroud.translate(0, ropeY - 0.3, 0); put('paint', shroud, m4);
    bx('paint', 4.2, 3.2, 5, -7, slabTop + 1.6, 0, m4, false);            // drive machine room
    bx('glow', 0.06, 0.5, 3.2, -4.88, slabTop + 2.4, 0, m4, false);
    // columns + edge beams
    for (const x of [-15.6, -10.2, -4.8, 0.6, 3.2]) for (const z of [-5.9, 5.9]) bx('steel', 0.32, 7.0, 0.32, x, slabTop + 3.5, z, m4, false);
    for (const z of [-6.4, 6.4]) bx('paint', X1 - X0 + 0.6, 0.4, 0.5, (X0 + X1) / 2, yBase + 7.7, z, m4, false);
    // curved canopy + ribs
    const roof = new THREE.CylinderGeometry(1, 1, 20.2, 32, 1, true, 0, Math.PI);
    roof.rotateZ(Math.PI / 2); roof.scale(1, 2.4, 6.7); roof.translate(-6.3, yBase + 7.7, 0); put('paint', roof, m4);
    for (let x = -16; x <= 3.4; x += 4.85) {
      const rb = new THREE.TorusGeometry(1, 0.05, 6, 24, Math.PI); rb.rotateY(Math.PI / 2); rb.scale(1, 2.4, 6.7); rb.translate(x, yBase + 7.7, 0); put('steel', rb, m4);
    }
    // glazing: side walls + back wall, mullions
    const gh = 7.0, gy = slabTop + gh / 2;
    for (const z of [-5.9, 5.9]) {
      bx('glass', X1 - X0 - 0.4, gh, 0.05, (X0 + X1) / 2, gy, z, m4, false);
      for (let x = -16; x <= 3.5; x += 3.2) bx('dark', 0.1, gh, 0.14, x, gy, z, m4, false);
      bx('dark', X1 - X0 - 0.4, 0.1, 0.14, (X0 + X1) / 2, slabTop + 2.4, z, m4, false);
    }
    bx('glass', 0.05, gh, 2 * 5.9, -16, gy, 0, m4, false);
    for (let z = -5; z <= 5; z += 2.5) bx('dark', 0.14, gh, 0.1, -16, gy, z, m4, false);
    // lit interior
    for (const z of [-2.2, 2.2]) bx('glow', 17, 0.07, 0.18, -6.3, yBase + 9.0, z, m4, false);
    for (const z of [-1.5, 1.5]) bx('glow', 17, 0.03, 0.12, -6.3, slabTop + 0.14, z, m4, false);
    for (const z of [-3.6, 0, 3.6]) bx('glow', 0.05, 2.2, 1.6, -15.85, slabTop + 2.3, z, m4, false);
    for (const x of [-12, -8.5]) bx('paint', 2.4, 0.5, 0.7, x, slabTop + 0.5, 4.4, m4, false);   // benches
    // aviation light on the canopy
    const sg = new THREE.SphereGeometry(0.3, 8, 6); sg.translate(-6.3, yBase + 10.4, 0); put('red', sg, m4);
    if (withSign && signCanvasTex) {
      const mk = (x, z, ry, y) => {
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(9, 9 * 192 / 1024), new THREE.MeshBasicMaterial({ map: signCanvasTex, toneMapped: false }));
        mesh.position.set(x, y, z); mesh.rotation.y = ry; mesh.applyMatrix4(m4); mesh.updateMatrix();
        // applyMatrix4 on a Mesh bakes into position/rotation/scale
        group.add(mesh); signs.push(mesh);
      };
      mk(-16.5, 0, -Math.PI / 2, yBase + 5.2);
      mk(-6.3, 6.8, 0, yBase + 8.2);
      mk(-6.3, -6.8, Math.PI, yBase + 8.2);
      bx('dark', 0.15, 2.0, 9.4, -16.4, yBase + 5.2, 0, m4, false);
    }
    // footprint AABB (world)
    return { m4, X0, X1, W };
  }
  const vs = station(P0.x, P0.z, yV, LINE_YAW, true);
  station(P1.x, P1.z, yT, LINE_YAW + Math.PI, false);
  {
    let mnx = 1e9, mxx = -1e9, mnz = 1e9, mxz = -1e9;
    for (const [lx, lz] of [[vs.X0, -vs.W], [vs.X0, vs.W], [vs.X1, -vs.W], [vs.X1, vs.W]]) {
      const c = Math.cos(LINE_YAW), s = Math.sin(LINE_YAW);
      const x = P0.x + lx * c + lz * s, z = P0.z - lx * s + lz * c;
      mnx = Math.min(mnx, x); mxx = Math.max(mxx, x); mnz = Math.min(mnz, z); mxz = Math.max(mxz, z);
    }
    colliders.push({ minX: mnx, maxX: mxx, minZ: mnz, maxZ: mxz, minY: 0, maxY: 8 });
  }

  // flush buckets to meshes
  for (const key of Object.keys(buckets)) {
    const geo = BGU.mergeGeometries(buckets[key], false);
    const mesh = new THREE.Mesh(geo, mats[key]);
    mesh.castShadow = key !== 'glass' && key !== 'glow' && key !== 'red';
    mesh.receiveShadow = key !== 'glass';
    mesh.name = 'skyliner-' + key;
    group.add(mesh);
  }

  // ---------- haul ropes (instanced segments) ----------
  {
    const STEP = 5, n = Math.ceil(L / STEP);
    const im = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.045, 0.045, 1, 4, 1), ropeMat, n * 2);
    im.frustumCulled = false; im.castShadow = false;
    const pa = new THREE.Vector3(), pb = new THREE.Vector3(), mid = new THREE.Vector3(), sc = new THREE.Vector3();
    let k = 0;
    for (const lat of [R, -R]) for (let i = 0; i < n; i++) {
      const sa = i * STEP, sb = Math.min(L, sa + STEP);
      pa.set(P0.x + Dx * sa + Nx * lat, ropeAt(sa), P0.z + Dz * sa + Nz * lat);
      pb.set(P0.x + Dx * sb + Nx * lat, ropeAt(sb), P0.z + Dz * sb + Nz * lat);
      mid.copy(pa).add(pb).multiplyScalar(0.5);
      _q.setFromUnitVectors(_up, pb.clone().sub(pa).normalize());
      sc.set(1, pa.distanceTo(pb) + 0.02, 1);
      _m.compose(mid, _q, sc); im.setMatrixAt(k++, _m);
    }
    group.add(im);
  }

  // ---------- cabins ----------
  const NC = low ? 12 : 24;
  const cabParts = {};
  {
    const rb = (w, h, d, r, seg, x, y, z) => { const g = new RoundedBoxGeometry(w, h, d, seg, r); g.translate(x, y, z); return clean(g); };
    const b = (w, h, d, x, y, z) => { const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y, z); return clean(g); };
    const arm = [b(0.34, 0.26, 0.34, 0, 0.02, 0), b(0.16, 0.12, 1.5, 0, -0.18, 0)];
    const cyl = new THREE.CylinderGeometry(0.045, 0.045, 1.1, 6); cyl.translate(0, -0.7, 0); arm.push(clean(cyl));
    const frame = [rb(2.0, 0.14, 2.2, 0.05, 2, 0, -1.27, 0), rb(2.0, 0.2, 2.2, 0.06, 2, 0, -3.24, 0)];
    for (const sx of [-0.96, 0.96]) for (const sz of [-1.06, 1.06]) frame.push(b(0.08, 1.8, 0.08, sx, -2.24, sz));
    for (const sz of [-0.78, 0.78]) { frame.push(b(1.4, 0.1, 0.46, 0, -2.95, sz)); frame.push(b(1.4, 0.5, 0.08, 0, -2.75, sz * 1.25)); }
    cabParts.arm = BGU.mergeGeometries(arm, false);
    cabParts.frame = BGU.mergeGeometries(frame, false);
    cabParts.glass = clean(new RoundedBoxGeometry(1.96, 1.8, 2.16, 3, 0.2).translate(0, -2.24, 0));
    cabParts.glow = b(1.5, 0.04, 1.8, 0, -1.37, 0);
  }
  const cabInst = [
    ['arm', dark, true], ['frame', dark, true], ['glass', glassMat, false], ['glow', glowMat, false],
  ].map(([k, mat, cast]) => {
    const im = new THREE.InstancedMesh(cabParts[k], mat, NC);
    im.frustumCulled = false; im.castShadow = cast; im.name = 'cabin-' + k;
    group.add(im); return im;
  });

  const TLOOP = 2 * L + 2 * Math.PI * R;
  const dPos = new Float32Array(NC), phase = new Float32Array(NC);
  for (let i = 0; i < NC; i++) { dPos[i] = (i / NC) * TLOOP; phase[i] = i * 2.399; }
  const VMAX = reduced ? 1.5 : 5, VMIN = reduced ? 0.5 : 0.5;
  const C_TOP = L + Math.PI * R / 2, C_BOT = TLOOP - Math.PI * R / 2, HALF_ARC = Math.PI * R / 2;
  const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const _pos = new THREE.Vector3(), _scl = new THREE.Vector3(1, 1, 1), _eul = new THREE.Euler(0, 0, 0, 'YXZ'), _qq = new THREE.Quaternion(), _mm = new THREE.Matrix4();
  let time = 0;

  function place(i) {
    const d = dPos[i];
    let s, lat, tS, tL;
    if (d < L) { s = d; lat = R; tS = 1; tL = 0; }
    else if (d < L + Math.PI * R) { const p = (d - L) / R; s = L + R * Math.sin(p); lat = R * Math.cos(p); tS = Math.cos(p); tL = -Math.sin(p); }
    else if (d < 2 * L + Math.PI * R) { s = L - (d - L - Math.PI * R); lat = -R; tS = -1; tL = 0; }
    else { const p = (d - 2 * L - Math.PI * R) / R; s = -R * Math.sin(p); lat = -R * Math.cos(p); tS = -Math.cos(p); tL = Math.sin(p); }
    const vx = Dx * tS + Nx * tL, vz = Dz * tS + Nz * tL;
    const yaw = Math.atan2(-vz, vx);
    const v = VMIN + (VMAX - VMIN) * sstep(6, 40, Math.min(Math.abs(d - C_TOP), Math.abs(d - C_BOT), d + HALF_ARC));
    const k = reduced ? 0 : (0.25 + 0.75 * (v / VMAX));
    const roll = k * 0.05 * Math.sin(time * 1.15 + phase[i]);
    const pitch = k * 0.035 * Math.sin(time * 0.85 + phase[i] * 1.7);
    _pos.set(P0.x + Dx * s + Nx * lat, ropeAt(s), P0.z + Dz * s + Nz * lat);
    _eul.set(roll, yaw, pitch, 'YXZ'); _qq.setFromEuler(_eul);
    _mm.compose(_pos, _qq, _scl);
    for (let j = 0; j < 4; j++) cabInst[j].setMatrixAt(i, _mm);
    return v;
  }
  for (let i = 0; i < NC; i++) place(i);
  for (let j = 0; j < 4; j++) cabInst[j].instanceMatrix.needsUpdate = true;

  function update(dt) {
    dt = Math.min(dt || 0, 0.1);
    time += dt;
    for (let i = 0; i < NC; i++) {
      const d = dPos[i];
      const v = VMIN + (VMAX - VMIN) * sstep(6, 40, Math.min(Math.abs(d - C_TOP), Math.abs(d - C_BOT), d + HALF_ARC));
      let nd = d + v * dt; if (nd >= TLOOP) nd -= TLOOP;
      dPos[i] = nd;
      place(i);
    }
    for (let j = 0; j < 4; j++) cabInst[j].instanceMatrix.needsUpdate = true;
    redMat.emissiveIntensity = (time % 1.6) < 0.5 ? 3.0 : 0.15;     // slow aviation beacon blink
  }

  return { group, regions: [], colliders, pickables: [], update };
}
