// facade.js — the EXTERIOR skin of the museum building (BRIEF §5–§6).
// Lower volume: board-formed pale concrete, honed sandstone fascia, bronze door reveal,
// cantilevered canopy, pin-mounted bronze name, plaque. Upper volume: bronze fins.
// World metres, y up. Interiors belong to other modules.
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export async function build(ctx) {
  const { THREE, M, quality } = ctx;
  const low = quality === 'low';
  const group = new THREE.Group();
  group.name = 'facade';

  // ---------- constants ----------
  const X = 6.9, Z = 17.4, ROOF = 7.2, WALL_TOP = 6.4;
  const UP_TOP = 13.6, UP_Z0 = -17.4, UP_Z1 = 5.4;
  const DOOR = 1.3, DOOR_H = 3.6, LINE = 0.03;
  const PLINTH_H = 0.3;
  const BRONZE = 0xd9a062;

  // ---------- materials ----------
  const concrete = M.get('concreteWall', { color: 0xe9e6e0 }).clone();
  concrete.vertexColors = true;
  concrete.name = 'facadeConcrete';
  const concretePlain = M.get('concreteWall', { color: 0xdedad2 });
  const sandstone = M.get('whiteSandstone', { color: 0xfaf6ee, roughness: 0.6, tile: 4 }).clone();
  sandstone.normalScale.set(0.3, 0.3);
  const plinthMat = M.get('whiteSandstone', { color: 0xa39b8e, tile: 4 }).clone();
  const bronze = new THREE.MeshStandardMaterial({ color: 0x8c6a42, metalness: 0.92, roughness: 0.34, envMapIntensity: 1.8 });
  const bronzeDark = new THREE.MeshStandardMaterial({ color: 0x4a3420, metalness: 0.85, roughness: 0.45, envMapIntensity: 1.5 });
  plinthMat.normalScale.set(0.25, 0.25);
  const marble = M.get('marble', { color: 0xe6e0d6 });
  const backing = new THREE.MeshStandardMaterial({ color: 0x2b251d, roughness: 1, metalness: 0 });
  const roofing = M.get('concreteFloor', { color: 0x4a4743, roughness: 0.9 });
  const grooveMat = new THREE.MeshStandardMaterial({ color: 0x4b463e, roughness: 1 });
  const holeMat = new THREE.MeshStandardMaterial({ color: 0x2b2824, roughness: 1 });

  const dummy = new THREE.Object3D();
  const add = (m, cast = true, recv = true) => { m.castShadow = cast; m.receiveShadow = recv; group.add(m); return m; };
  const box = (x0, x1, y0, y1, z0, z1, mat, { cast = true, uv = true } = {}) => {
    const g = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0);
    g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    if (uv) M.boxUV(g);
    return add(new THREE.Mesh(g, mat), cast, true);
  };

  // ---------- cheap value noise for staining ----------
  const h1 = (n) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
  const vn = (x) => { const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f); return h1(i) * (1 - u) + h1(i + 1) * u; };
  const vn2 = (x, y) => vn(x + vn(y * 1.7) * 9.0 + y * 0.37);
  const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

  // stained concrete wall slab (vertex-colour weathering: base soiling, rain streaks under fascia, mottling)
  function wallBox(x0, x1, y0, y1, z0, z1) {
    const cell = low ? 0.8 : 0.35;
    const g = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0,
      Math.max(1, Math.ceil((x1 - x0) / cell)), Math.max(1, Math.ceil((y1 - y0) / cell)), Math.max(1, Math.ceil((z1 - z0) / cell)));
    g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    const p = g.attributes.position, col = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const u = x + z * 1.13;
      const base = 0.8 * Math.exp(-y / 0.9) * (0.6 + 0.8 * vn(u * 3.1 + y * 1.3));
      const streak = vn(u * 2.7) * vn(u * 9.3 + 4) * 0.55 * Math.exp(-(WALL_TOP - y) / 2.2);
      const long = vn(u * 6.1 + 11) > 0.72 ? 0.12 * sstep(0.0, 4.5, y) * sstep(WALL_TOP, WALL_TOP - 3.2, y) : 0;
      const mott = (vn2(u * 0.55, y * 0.6) - 0.5) * 0.14;
      const d = Math.min(0.75, base + streak * 0.9 + long * 1.6);
      const k = 1 - d + mott;
      col[i * 3] = k; col[i * 3 + 1] = k * (1 - 0.012 * d * 8); col[i * 3 + 2] = k * (1 - 0.035 * d * 8);
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    M.boxUV(g);
    return add(new THREE.Mesh(g, concrete));
  }

  // ---------- LOWER VOLUME WALLS (y PLINTH_H .. WALL_TOP) ----------
  const T = 0.4, DJ = DOOR + LINE;
  wallBox(-X, -X + T, PLINTH_H, WALL_TOP, -Z, Z);               // west
  wallBox(X - T, X, PLINTH_H, WALL_TOP, -Z, Z);                 // east
  wallBox(-X + T, X - T, PLINTH_H, WALL_TOP, -Z, -Z + T);       // north (back)
  wallBox(-X + T, -DJ, PLINTH_H, WALL_TOP, Z - T, Z);           // front, left of door
  wallBox(DJ, X - T, PLINTH_H, WALL_TOP, Z - T, Z);             // front, right of door
  wallBox(-DJ, DJ, DOOR_H + LINE, WALL_TOP, Z - T, Z);          // front, over door
  // narrow strips beside door jambs below the plinth line are covered by lining

  // plinth (dark stone course with shadow gap above)
  const PO = 0.05;
  box(-X - PO, -X + T, 0, PLINTH_H, -Z - PO, Z + PO, plinthMat);
  box(X - T, X + PO, 0, PLINTH_H, -Z - PO, Z + PO, plinthMat);
  box(-X + T, X - T, 0, PLINTH_H, -Z - PO, -Z + T, plinthMat);
  box(-X + T, -DJ, 0, PLINTH_H, Z - T, Z + PO, plinthMat);
  box(DJ, X - T, 0, PLINTH_H, Z - T, Z + PO, plinthMat);
  // drip kerb: slim bronze flashing on top of the plinth
  box(-X - PO - 0.01, -X + T, PLINTH_H, PLINTH_H + 0.02, -Z - PO - 0.01, Z + PO + 0.01, bronzeDark, { cast: false });
  box(X - T, X + PO + 0.01, PLINTH_H, PLINTH_H + 0.02, -Z - PO - 0.01, Z + PO + 0.01, bronzeDark, { cast: false });

  // ---------- ROOF SLAB FASCIA (y 6.4 .. 7.2), outset 0.06, honed sandstone ----------
  const FO = 0.06, FI = X - 0.46;
  box(-X - FO, -FI, WALL_TOP, ROOF, -Z - FO, Z + FO, sandstone);
  box(FI, X + FO, WALL_TOP, ROOF, -Z - FO, Z + FO, sandstone);
  box(-FI, FI, WALL_TOP, ROOF, -Z - FO, -Z + 0.46, sandstone);
  box(-FI, FI, WALL_TOP, ROOF, Z - 0.46, Z + FO, sandstone);
  // drip-edge strip under the fascia
  const DE = FO + 0.015;
  box(-X - DE, -FI, WALL_TOP - 0.02, WALL_TOP, -Z - DE, Z + DE, bronzeDark, { cast: false });
  box(FI, X + DE, WALL_TOP - 0.02, WALL_TOP, -Z - DE, Z + DE, bronzeDark, { cast: false });
  box(-FI, FI, WALL_TOP - 0.02, WALL_TOP, -Z - DE, -Z + 0.46, bronzeDark, { cast: false });
  box(-FI, FI, WALL_TOP - 0.02, WALL_TOP, Z - 0.46, Z + DE, bronzeDark, { cast: false });

  // ---------- JOINTS + TIE HOLES (instanced) ----------
  // faces: outward normal rotation about y, plane offset, tangent range
  const faces = [
    { rot: 0, nx: 0, nz: 1, pos: Z, u0: -X, u1: X, frontFace: true },
    { rot: Math.PI, nx: 0, nz: -1, pos: -Z, u0: -X, u1: X },
    { rot: Math.PI / 2, nx: 1, nz: 0, pos: X, u0: -Z, u1: Z },
    { rot: -Math.PI / 2, nx: -1, nz: 0, pos: -X, u0: -Z, u1: Z },
  ];
  const place = (f, u, y, off) => {
    // world position for tangent u on face f (tangent = +x for z faces, z-direction for x faces so that -x/+x mirror)
    if (f.nz !== 0) dummy.position.set(f.nz > 0 ? u : -u, y, f.pos + f.nz * off);
    else dummy.position.set(f.pos + f.nx * off, y, f.nx > 0 ? -u : u);
    dummy.rotation.set(0, f.rot, 0);
  };
  // For +x faces rotation pi/2: local +x -> world -z. For -x faces: local +x -> world +z. For back: local +x -> -x. Handled above.
  const grooves = [], holes = [];
  const gY0 = PLINTH_H, gY1 = WALL_TOP;
  for (const f of faces) {
    let cuts;
    if (f.frontFace) cuts = [-3.9, 3.9];
    else if (f.nz) { cuts = []; for (let k = 1; k < 6; k++) cuts.push(-X + 2.3 * k); }
    else { cuts = []; for (let k = 1; k < 14; k++) cuts.push(-Z + (2 * Z / 14) * k); }
    for (const c of cuts) grooves.push({ f, u: c, y: (gY0 + gY1) / 2, w: 0.025, h: gY1 - gY0 });
    // pour line
    if (f.frontFace) {
      grooves.push({ f, u: (-DJ - 0.1 - X) / 2 + 0, y: 3.35, w: X - DJ - 0.1 + 0.0, h: 0.022, horiz: true, ucen: (-X + -DJ - 0.1) / 2, len: X - DJ - 0.1 });
      grooves.push({ f, u: 0, y: 3.35, horiz: true, ucen: (X + DJ + 0.1) / 2, len: X - DJ - 0.1, h: 0.022 });
    } else grooves.push({ f, y: 3.35, horiz: true, ucen: (f.u0 + f.u1) / 2, len: f.u1 - f.u0, h: 0.022 });
    // tie holes between joints
    const edges = [f.u0, ...cuts, f.u1];
    for (let i = 0; i < edges.length - 1; i++) {
      const a = edges[i], b = edges[i + 1];
      const n = Math.max(1, Math.floor((b - a - 0.6) / 1.2) + 1), step = n > 1 ? (b - a - 0.6) / (n - 1) : 0;
      for (let k = 0; k < n; k++) {
        const u = n > 1 ? a + 0.3 + step * k : (a + b) / 2;
        for (const y of [0.85, 1.75, 2.65, 4.0, 4.9, 5.8]) {
          if (f.frontFace && Math.abs(u) < 1.75 && y < 4.0) continue;
          if (f.frontFace && Math.abs(u) < 4.9 && y > 4.7 && y < 6.1) continue; // letters zone
          holes.push({ f, u, y });
        }
      }
    }
  }
  {
    const gm = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 0.012), grooveMat, grooves.length);
    grooves.forEach((g, i) => {
      place(g.f, g.horiz ? g.ucen : g.u, g.y, 0.003);
      // horizontal grooves: local x is the tangent already
      dummy.scale.set(g.horiz ? g.len : g.w, g.horiz ? g.h : g.h, 1);
      dummy.updateMatrix(); gm.setMatrixAt(i, dummy.matrix);
    });
    dummy.scale.set(1, 1, 1);
    gm.instanceMatrix.needsUpdate = true;
    add(gm, false, true);
    if (!low) {
      const hg = new THREE.CircleGeometry(0.024, 10);
      const hm = new THREE.InstancedMesh(hg, holeMat, holes.length);
      holes.forEach((h, i) => { place(h.f, h.u, h.y, 0.002); dummy.scale.set(1, 1, 1); dummy.updateMatrix(); hm.setMatrixAt(i, dummy.matrix); });
      hm.instanceMatrix.needsUpdate = true;
      add(hm, false, true);
    }
  }

  // ---------- DOOR REVEAL: bronze lining through the 0.4 wall, marble threshold ----------
  const zi = Z - T, LT = LINE;
  box(-DJ, -DOOR, 0, DOOR_H + LT, zi, Z, bronze);                // west jamb
  box(DOOR, DJ, 0, DOOR_H + LT, zi, Z, bronze);                  // east jamb
  box(-DJ, DJ, DOOR_H, DOOR_H + LT, zi, Z, bronze);              // head
  // exterior surround (flat bar frame proud of the face)
  box(-DJ - 0.1, -DJ, 0.0, DOOR_H + 0.14, Z, Z + 0.03, bronzeDark);
  box(DJ, DJ + 0.1, 0.0, DOOR_H + 0.14, Z, Z + 0.03, bronzeDark);
  box(-DJ - 0.1, DJ + 0.1, DOOR_H + LT, DOOR_H + 0.14, Z, Z + 0.03, bronzeDark);
  // marble threshold + apron stone
  box(-DJ, DJ, -0.25, 0.012, zi + 0.05, Z + 0.9, marble);
  // recessed soffit light strip
  const strip = new THREE.Mesh(new THREE.PlaneGeometry(2.1, 0.06), new THREE.MeshBasicMaterial({ color: 0xffe6bd }));
  strip.rotation.x = Math.PI / 2; strip.position.set(0, DOOR_H - 0.002, Z - 0.2); group.add(strip);

  // ---------- CANOPY ----------
  const CX = 4.5, CZ0 = Z, CZ1 = 20.4, CY0 = 4.4, CY1 = 4.75;
  box(-CX, CX, CY0, CY1, CZ0 - 0.1, CZ1, concretePlain);
  // bronze edge band
  const EB = 0.025;
  box(-CX - EB, CX + EB, CY0 - 0.01, CY1 + 0.01, CZ1, CZ1 + EB, bronze);
  box(-CX - EB, -CX, CY0 - 0.01, CY1 + 0.01, CZ0, CZ1 + EB, bronze);
  box(CX, CX + EB, CY0 - 0.01, CY1 + 0.01, CZ0, CZ1 + EB, bronze);
  // recessed downlights
  const dlMat = new THREE.MeshBasicMaterial({ color: 0xffe9c6 });
  const dlTrim = bronzeDark;
  const dlPos = [];
  for (const zz of [18.1, 19.6]) for (let i = 0; i < 6; i++) dlPos.push([-3.75 + i * 1.5, zz]);
  const dlGeo = new THREE.CircleGeometry(0.085, 20); dlGeo.rotateX(Math.PI / 2);
  const trimGeo = new THREE.RingGeometry(0.085, 0.115, 20); trimGeo.rotateX(Math.PI / 2);
  const dl = new THREE.InstancedMesh(dlGeo, dlMat, dlPos.length);
  const tr = new THREE.InstancedMesh(trimGeo, dlTrim, dlPos.length);
  dlPos.forEach((p, i) => {
    dummy.position.set(p[0], CY0 - 0.003, p[1]); dummy.rotation.set(0, 0, 0); dummy.scale.set(1, 1, 1); dummy.updateMatrix();
    dl.setMatrixAt(i, dummy.matrix);
    dummy.position.y = CY0 - 0.002; dummy.updateMatrix(); tr.setMatrixAt(i, dummy.matrix);
  });
  group.add(dl, tr);

  // ---------- light textures (additive pools / wall washes) ----------
  const mkCanvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
  function glowTexture(kind) {
    const w = kind === 'wash' ? 64 : 128, h = kind === 'wash' ? 256 : 128;
    const c = mkCanvas(w, h), g = c.getContext('2d'), im = g.createImageData(w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let v;
      if (kind === 'wash') {
        const t = 1 - y / (h - 1), nx = (x / (w - 1)) * 2 - 1, hw = 0.16 + 0.75 * t;
        v = Math.pow(1 - t, 1.7) * Math.pow(Math.max(0, 1 - (nx / hw) * (nx / hw)), 1.6);
      } else {
        const nx = (x / (w - 1)) * 2 - 1, ny = (y / (h - 1)) * 2 - 1, r = Math.sqrt(nx * nx + ny * ny);
        v = Math.pow(Math.max(0, 1 - r), 2.2);
      }
      const b = Math.min(255, v * 255), i = (y * w + x) * 4;
      im.data[i] = im.data[i + 1] = im.data[i + 2] = b; im.data[i + 3] = 255;
    }
    g.putImageData(im, 0, 0);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  }
  const glowMat = (tex, op) => new THREE.MeshBasicMaterial({ map: tex, color: 0xffc98f, blending: THREE.AdditiveBlending, transparent: true, opacity: op, depthWrite: false, toneMapped: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  if (!low) {
    // pools of light on the apron under the canopy
    const poolG = new THREE.PlaneGeometry(2.4, 2.4); poolG.rotateX(-Math.PI / 2);
    const pools = new THREE.InstancedMesh(poolG, glowMat(glowTexture('pool'), 0.32), dlPos.length);
    dlPos.forEach((p, i) => { dummy.position.set(p[0], 0.014, p[1]); dummy.rotation.set(0, 0, 0); dummy.scale.set(1, 1, 1); dummy.updateMatrix(); pools.setMatrixAt(i, dummy.matrix); });
    pools.renderOrder = 5; group.add(pools);
  }

  // ---------- BASE WALL WASHERS ----------
  const washers = [];
  [-5.4, -3.6, -2.3, 2.3, 3.6, 5.4].forEach((u) => washers.push({ f: faces[0], u }));
  [-12.5, -6.5, 0, 6.5, 12.5].forEach((u) => { washers.push({ f: faces[2], u }); washers.push({ f: faces[3], u }); });
  [-4.5, 0, 4.5].forEach((u) => washers.push({ f: faces[1], u }));
  const houseG = new THREE.BoxGeometry(0.2, 0.06, 0.12);
  const house = new THREE.InstancedMesh(houseG, bronzeDark, washers.length);
  const lensG = new THREE.PlaneGeometry(0.16, 0.012);
  const lens = new THREE.InstancedMesh(lensG, new THREE.MeshBasicMaterial({ color: 0xfff0d2 }), washers.length);
  const washG = new THREE.PlaneGeometry(1.5, 3.6); washG.translate(0, 1.8, 0);
  const wash = low ? null : new THREE.InstancedMesh(washG, glowMat(glowTexture('wash'), 0.38), washers.length);
  washers.forEach((w, i) => {
    place(w.f, w.u, 0.045, 0.19 + 0.05); dummy.scale.set(1, 1, 1); dummy.updateMatrix(); house.setMatrixAt(i, dummy.matrix);
    place(w.f, w.u, 0.078, 0.19 + 0.05 - 0.062); dummy.rotation.x = -0.0; dummy.updateMatrix(); lens.setMatrixAt(i, dummy.matrix);
    if (wash) { place(w.f, w.u, 0.1, 0.008); dummy.updateMatrix(); wash.setMatrixAt(i, dummy.matrix); }
  });
  group.add(house, lens);
  if (wash) { wash.renderOrder = 4; group.add(wash); }
  house.castShadow = true;

  // ---------- DOWNPIPES + SCUPPERS ----------
  {
    const parts = [];
    const pipe = (px, pz, nxOut, nzOut) => {
      const r = 0.05, off = 0.12;
      const cx = px + nxOut * off, cz = pz + nzOut * off;
      const g = new THREE.CylinderGeometry(r, r, WALL_TOP - 0.1 - 0.08, 14); g.translate(cx, (WALL_TOP - 0.1 + 0.08) / 2, cz); parts.push(g);
      for (let y = 0.9; y < WALL_TOP - 0.3; y += 1.35) {
        const c = new THREE.CylinderGeometry(r + 0.012, r + 0.012, 0.05, 14); c.translate(cx, y, cz); parts.push(c);
        const arm = new THREE.BoxGeometry(nzOut ? 0.04 : off, 0.04, nzOut ? off : 0.04);
        arm.translate(px + nxOut * off / 2, y, pz + nzOut * off / 2); parts.push(arm);
      }
      // scupper box through fascia and hopper head
      const sc = new THREE.BoxGeometry(nxOut ? off + 0.12 : 0.22, 0.14, nzOut ? off + 0.12 : 0.22);
      sc.translate(px + nxOut * (off + 0.12) / 2 - nxOut * 0.0, WALL_TOP - 0.07, pz + nzOut * (off + 0.12) / 2); parts.push(sc);
      const hop = new THREE.CylinderGeometry(0.08, 0.05, 0.1, 14); hop.translate(cx, WALL_TOP - 0.15, cz); parts.push(hop);
    };
    const e = X + FO, f = Z + FO;
    pipe(e, -16.6, 1, 0); pipe(-e, -16.6, -1, 0); pipe(e, 16.6, 1, 0); pipe(-e, 16.6, -1, 0);
    pipe(-5.6, -Z - FO, 0, -1); pipe(5.6, -Z - FO, 0, -1);
    for (const g of parts) { g.deleteAttribute('uv'); }
    const merged = mergeGeometries(parts.map((g) => g.index ? g.toNonIndexed() : g));
    M.boxUV(merged);
    add(new THREE.Mesh(merged, bronze));
  }

  // ---------- UPPER VOLUME: bronze fins over a dark backing ----------
  const FIN0 = ROOF + 0.15, FIN1 = UP_TOP - 0.3;
  box(-X + 0.05, -X + 0.28 + 0.0, ROOF, UP_TOP - 0.3, UP_Z0, UP_Z1, backing, { uv: false });
  box(X - 0.28, X - 0.05, ROOF, UP_TOP - 0.3, UP_Z0, UP_Z1, backing, { uv: false });
  box(-X + 0.28, X - 0.28, ROOF, UP_TOP - 0.3, UP_Z0 + 0.05, UP_Z0 + 0.28, backing, { uv: false });
  // base rail
  box(-X, X, ROOF, FIN0, UP_Z0, UP_Z1, bronzeDark, { cast: true });
  // roof slab: bronze fascia band (sides), dark roofing (top), parapet
  {
    const mats = [bronze, bronze, roofing, bronzeDark, bronze, bronze];
    const g = new THREE.BoxGeometry(2 * X + 0.06, 0.3, UP_Z1 - UP_Z0 + 0.06);
    g.translate(0, UP_TOP - 0.15, (UP_Z0 + UP_Z1) / 2); M.boxUV(g);
    add(new THREE.Mesh(g, mats));
    // parapet (slim) — flush with fin faces
    const P = 0.14, PH = 0.32;
    box(-X, -X + P, UP_TOP, UP_TOP + PH, UP_Z0, UP_Z1, bronze);
    box(X - P, X, UP_TOP, UP_TOP + PH, UP_Z0, UP_Z1, bronze);
    box(-X + P, X - P, UP_TOP, UP_TOP + PH, UP_Z0, UP_Z0 + P, bronze);
    box(-X + P, X - P, UP_TOP, UP_TOP + PH, UP_Z1 - P, UP_Z1, bronze);
    // coping caps
    box(-X - 0.02, -X + P + 0.02, UP_TOP + PH, UP_TOP + PH + 0.025, UP_Z0 - 0.02, UP_Z1 + 0.02, bronzeDark, { cast: false });
    box(X - P - 0.02, X + 0.02, UP_TOP + PH, UP_TOP + PH + 0.025, UP_Z0 - 0.02, UP_Z1 + 0.02, bronzeDark, { cast: false });
    box(-X + P, X - P, UP_TOP + PH, UP_TOP + PH + 0.025, UP_Z0 - 0.02, UP_Z0 + P + 0.02, bronzeDark, { cast: false });
    box(-X + P, X - P, UP_TOP + PH, UP_TOP + PH + 0.025, UP_Z1 - P - 0.02, UP_Z1 + 0.02, bronzeDark, { cast: false });
  }
  // fins
  {
    const finH = FIN1 - FIN0, cy = (FIN0 + FIN1) / 2, depth = 0.14, w = 0.12;
    const nZ = 33, nX = 54;
    const gx = new THREE.BoxGeometry(depth, finH, w); M.boxUV(gx);   // on ±x faces (long axis along z)
    const gz = new THREE.BoxGeometry(w, finH, depth); M.boxUV(gz);   // on −z face
    const fx = new THREE.InstancedMesh(gx, bronze, nX * 2);
    const fz = new THREE.InstancedMesh(gz, bronze, nZ);
    const c = new THREE.Color();
    const spZ = (UP_Z1 - UP_Z0) / nX, spX = (2 * X) / nZ;
    let k = 0;
    for (let i = 0; i < nX; i++) {
      const z = UP_Z0 + (i + 0.5) * spZ;
      for (const s of [-1, 1]) {
        dummy.position.set(s * (X - depth / 2), cy, z); dummy.rotation.set(0, 0, 0); dummy.scale.set(1, 1, 1); dummy.updateMatrix();
        fx.setMatrixAt(k, dummy.matrix); const v = 0.86 + h1(k * 3.7) * 0.28; c.setRGB(v, v * 0.98, v * 0.95); fx.setColorAt(k, c); k++;
      }
    }
    for (let i = 0; i < nZ; i++) {
      const x = -X + (i + 0.5) * spX;
      dummy.position.set(x, cy, UP_Z0 + depth / 2); dummy.updateMatrix(); fz.setMatrixAt(i, dummy.matrix);
      const v = 0.86 + h1(i * 5.3 + 2) * 0.28; c.setRGB(v, v * 0.98, v * 0.95); fz.setColorAt(i, c);
    }
    fx.instanceMatrix.needsUpdate = fz.instanceMatrix.needsUpdate = true;
    add(fx); add(fz);
    // end returns at the glazed face (z = 5.4): slim bronze plates closing the backing edge
    box(-X, -X + 0.3, FIN0, FIN1, UP_Z1 - 0.025, UP_Z1, bronzeDark, { cast: false });
    box(X - 0.3, X, FIN0, FIN1, UP_Z1 - 0.025, UP_Z1, bronzeDark, { cast: false });
  }

  // ---------- NAME + PLAQUE (canvas textures) ----------
  try {
    const url = new URL('../../fonts/instrument-serif-400.woff2', import.meta.url).href;
    const ff = new FontFace('Instrument Serif', `url(${url})`);
    await ff.load(); document.fonts.add(ff);
  } catch (e) { console.warn('facade: font load failed', e); }
  const FONT = '"Instrument Serif", "Times New Roman", serif';
  const aniso = Math.min(8, ctx.renderer.capabilities.getMaxAnisotropy());
  {
    const PPM = 512, W = 4096, H = 512; // 8 m x 1 m
    const text = 'THE WORKSHOP';
    const draw = (cv, mode) => {
      const g = cv.getContext('2d');
      g.clearRect(0, 0, W, H);
      g.font = `400 560px ${FONT}`; g.textBaseline = 'alphabetic'; g.textAlign = 'center';
      if ('letterSpacing' in g) g.letterSpacing = '50px';
      const cx = W / 2 + 25, by = H / 2 + 190;
      if (mode === 'letters') {
        const gr = g.createLinearGradient(0, by - 390, 0, by);
        gr.addColorStop(0, '#d9ac6b'); gr.addColorStop(0.45, '#a8773e'); gr.addColorStop(1, '#6f4a25');
        g.fillStyle = gr; g.fillText(text, cx, by);
        g.lineWidth = 3; g.strokeStyle = 'rgba(255,225,170,0.55)'; g.strokeText(text, cx, by);
      } else {
        g.shadowColor = 'rgba(0,0,0,0.9)'; g.shadowBlur = 16; g.shadowOffsetX = 8000; g.shadowOffsetY = 0;
        g.fillStyle = '#000'; g.fillText(text, cx - 8000, by);
      }
    };
    const mk = (mode) => { const cv = mkCanvas(W, H); draw(cv, mode); const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = aniso; return t; };
    const plane = new THREE.PlaneGeometry(W / PPM, H / PPM);
    const letters = new THREE.Mesh(plane, new THREE.MeshStandardMaterial({ map: mk('letters'), alphaTest: 0.45, metalness: 0.85, roughness: 0.32 }));
    letters.position.set(0, 5.7, Z + 0.045); letters.name = 'nameLetters'; group.add(letters);
    const shadow = new THREE.Mesh(plane, new THREE.MeshBasicMaterial({ map: mk('shadow'), transparent: true, opacity: 0.55, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));
    shadow.position.set(0.035, 5.7 - 0.045, Z + 0.004); shadow.renderOrder = 2; group.add(shadow);
  }
  {
    // HrM plaque beside the door
    const cv = mkCanvas(512, 352), g = cv.getContext('2d');
    const gr = g.createLinearGradient(0, 0, 512, 352); gr.addColorStop(0, '#5b3f22'); gr.addColorStop(0.5, '#7a5832'); gr.addColorStop(1, '#4e351c');
    g.fillStyle = gr; g.fillRect(0, 0, 512, 352);
    g.strokeStyle = 'rgba(230,190,130,0.5)'; g.lineWidth = 3; g.strokeRect(16, 16, 480, 320);
    g.fillStyle = '#ecd2a4'; g.textAlign = 'center';
    g.font = `400 150px ${FONT}`; g.fillText('HrM', 256, 190);
    g.font = `400 34px ${FONT}`; if ('letterSpacing' in g) g.letterSpacing = '8px'; g.fillText('THE WORKSHOP', 256, 262);
    g.font = `italic 400 26px ${FONT}`; g.fillText('open daily', 256, 305);
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = aniso;
    const pl = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.234, 0.02), [bronzeDark, bronzeDark, bronzeDark, bronzeDark, new THREE.MeshStandardMaterial({ map: t, metalness: 0.75, roughness: 0.4 }), bronzeDark]);
    pl.position.set(2.15, 1.45, Z + 0.01); add(pl);
  }

  return { group, regions: [], colliders: [], pickables: [], update() {}, onPick() {} };
}
