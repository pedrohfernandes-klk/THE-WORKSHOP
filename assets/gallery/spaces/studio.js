// THE STUDIO — music listening & recording pavilion. Footprint x -23..-11, z 38..50.
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

export function build(ctx) {
  const { THREE, M } = ctx;
  const low = ctx.quality === 'low';
  const group = new THREE.Group();
  group.name = 'studio';
  const colliders = [];
  const pickables = [];

  const X0 = -23, X1 = -11, Z0 = 38, Z1 = 50;
  const T = 0.3;
  const IX0 = X0 + T, IX1 = X1 - T, IZ0 = Z0 + T, IZ1 = Z1 - T;
  const H = 4.5;
  const FLOOR = 0.015;
  const IE = 0.55;

  const mat = (name, o) => M.get(name, o);
  const paint = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0, ...o });
  const emissive = (color, intensity) => new THREE.MeshStandardMaterial({ color: 0x111111, emissive: color, emissiveIntensity: intensity, roughness: 0.5 });

  function add(parent, geo, material, x, y, z, o = {}) {
    if (o.uv) M.boxUV(geo);
    const m = new THREE.Mesh(geo, material);
    m.position.set(x, y, z);
    if (o.ry) m.rotation.y = o.ry;
    if (o.rx) m.rotation.x = o.rx;
    if (o.rz) m.rotation.z = o.rz;
    m.castShadow = o.cast !== false;
    m.receiveShadow = o.recv !== false;
    parent.add(m);
    return m;
  }
  const box = (parent, w, h, d, material, x, y, z, o = {}) => add(parent, new THREE.BoxGeometry(w, h, d), material, x, y, z, { uv: true, ...o });
  const rbox = (parent, w, h, d, r, material, x, y, z, o = {}) =>
    add(parent, new RoundedBoxGeometry(w, h, d, 3, Math.min(r, w / 2 - 1e-3, h / 2 - 1e-3, d / 2 - 1e-3)), material, x, y, z, { uv: true, ...o });
  const cyl = (parent, rt, rb, h, material, x, y, z, o = {}, seg = 24) => add(parent, new THREE.CylinderGeometry(rt, rb, h, seg), material, x, y, z, o);
  const solid = (minX, maxX, minZ, maxZ, minY, maxY) => colliders.push({ minX, maxX, minZ, maxZ, minY, maxY });
  const canvasTex = (w, h, draw) => {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
    return t;
  };
  const m4 = new THREE.Matrix4(), qI = new THREE.Quaternion(), pV = new THREE.Vector3(), sV = new THREE.Vector3(), eU = new THREE.Euler(), cC = new THREE.Color();

  // ---------------------------------------------------------------- materials
  const dark = mat('darkWood', { tile: 1.2 });
  const concrete = mat('concreteWall', { tile: 1.5 });
  const plasterWall = mat('plaster', { color: 0xd9d2c6, envMapIntensity: IE });
  const plasterCeil = mat('plaster', { color: 0xeee9e0, envMapIntensity: IE, emissive: 0x5a554c });
  const floorMat = mat('oakPlanks', { tile: 1.6, envMapIntensity: IE });
  const oak = mat('oak', { envMapIntensity: IE });
  const oakDoor = mat('oak', { tile: 1.0 });
  const steel = mat('steel', { color: 0x2a2b2e, roughness: 0.45, metalness: 0.8 });
  const blackSteel = paint(0x151618, { roughness: 0.4, metalness: 0.7 });
  const brass = paint(0xb88a3a, { roughness: 0.3, metalness: 1.0 });
  const leather = mat('leather', { color: 0x6b3b22, envMapIntensity: IE });
  const fabricGrey = mat('fabric', { color: 0x3b3f46, tile: 0.8, envMapIntensity: IE });
  const fabricTeal = mat('fabric', { color: 0x2f5a5c, tile: 0.8, envMapIntensity: IE });
  const fabricRust = mat('fabric', { color: 0x9a4a2a, tile: 0.8, envMapIntensity: IE });
  const fabricSand = mat('fabric', { color: 0xc8b48c, tile: 0.8, envMapIntensity: IE });
  const glass = new THREE.MeshStandardMaterial({ color: 0xcfe2ea, roughness: 0.04, metalness: 0, transparent: true, opacity: 0.16, depthWrite: false, envMapIntensity: 1.6 });
  const blackLac = new THREE.MeshPhysicalMaterial({ color: 0x0b0b0c, roughness: 0.22, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.08, envMapIntensity: IE + 0.3 });
  const speakerBlack = paint(0x1a1b1d, { roughness: 0.7, envMapIntensity: IE });

  // ---------------------------------------------------------------- shell
  box(group, IX1 - IX0 + 0.02, 0.2, IZ1 - IZ0 + 0.02, floorMat, (IX0 + IX1) / 2, FLOOR - 0.1, (IZ0 + IZ1) / 2, { cast: false });
  box(group, X1 - X0 - 0.02, 0.1, Z1 - Z0 - 0.02, plasterCeil, (X0 + X1) / 2, H + 0.05, (Z0 + Z1) / 2);
  const roofMat = paint(0x232427, { roughness: 0.55, metalness: 0.4 });
  box(group, X1 - X0, 0.5, Z1 - Z0, roofMat, (X0 + X1) / 2, H + 0.35, (Z0 + Z1) / 2);
  for (const z of [Z0 + 0.06, Z1 - 0.06]) box(group, X1 - X0, 0.3, 0.12, blackSteel, (X0 + X1) / 2, H + 0.75, z);
  for (const x of [X0 + 0.06, X1 - 0.06]) box(group, 0.12, 0.3, Z1 - Z0, blackSteel, x, H + 0.75, (Z0 + Z1) / 2);

  const battens = [];
  function wall(axis, outer, dir, u0, u1, openings) {
    const rects = [];
    const ops = openings.slice().sort((a, b) => a.u0 - b.u0);
    let cur = u0;
    for (const o of ops) {
      if (o.u0 > cur) rects.push([cur, o.u0, 0, H]);
      if (o.y0 > 0) rects.push([o.u0, o.u1, 0, o.y0]);
      if (o.y1 < H) rects.push([o.u0, o.u1, o.y1, H]);
      cur = o.u1;
    }
    if (cur < u1) rects.push([cur, u1, 0, H]);
    const PL = 0.5;
    for (const [a, b, y0, y1] of rects) {
      const len = b - a, mid = (a + b) / 2;
      const put = (th, off, h0, h1, material) => {
        if (h1 - h0 <= 0) return;
        const c = outer + dir * (off + th / 2);
        if (axis === 'z') box(group, th, h1 - h0, len, material, c, (h0 + h1) / 2, mid);
        else box(group, len, h1 - h0, th, material, mid, (h0 + h1) / 2, c);
      };
      if (y0 < PL) put(T, 0, y0, Math.min(PL, y1), concrete);
      const w0 = Math.max(y0, PL);
      if (y1 > w0) {
        put(T - 0.08, 0.08, w0, y1, plasterWall);
        put(0.04, 0.04, w0, y1, dark);
        const n = Math.max(1, Math.floor(len / 0.2));
        for (let i = 0; i < n; i++) battens.push({ axis, c: a + (i + 0.5) * (len / n), off: outer + dir * 0.02, y: (w0 + y1) / 2, h: y1 - w0 });
      }
    }
  }
  const DOOR = { u0: 43.2, u1: 44.8, y0: 0, y1: 2.6 };
  const WIN_E = { u0: 45.7, u1: 49.3, y0: 0.75, y1: 3.2 };
  const WIN_N = { u0: -21.6, u1: -17.6, y0: 1.0, y1: 3.1 };
  const WIN_S = { u0: -15.6, u1: -12.8, y0: 1.4, y1: 3.0 };
  wall('z', X1, -1, Z0, Z1, [DOOR, WIN_E]);
  wall('x', Z0, +1, X0, X1, [WIN_N]);
  wall('x', Z1, -1, X0, X1, [WIN_S]);
  wall('z', X0, +1, Z0, Z1, []);

  {
    const im = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), dark, battens.length);
    battens.forEach((b, i) => {
      if (b.axis === 'z') { pV.set(b.off, b.y, b.c); sV.set(0.04, b.h, 0.07); }
      else { pV.set(b.c, b.y, b.off); sV.set(0.07, b.h, 0.04); }
      m4.compose(pV, qI, sV); im.setMatrixAt(i, m4);
    });
    im.castShadow = im.receiveShadow = true;
    group.add(im);
  }

  function glazing(axis, fixed, o) {
    const w = o.u1 - o.u0, h = o.y1 - o.y0, cu = (o.u0 + o.u1) / 2, cy = (o.y0 + o.y1) / 2;
    const mk = (ww, hh, dd, material, u, y) => axis === 'z'
      ? add(group, new THREE.BoxGeometry(dd, hh, ww), material, fixed, y, u)
      : add(group, new THREE.BoxGeometry(ww, hh, dd), material, u, y, fixed);
    mk(w, h, 0.02, glass, cu, cy).castShadow = false;
    const f = 0.05, th = 0.06;
    mk(w + f, f, th, blackSteel, cu, o.y0); mk(w + f, f, th, blackSteel, cu, o.y1);
    mk(f, h, th, blackSteel, o.u0, cy); mk(f, h, th, blackSteel, o.u1, cy);
    const nm = Math.max(0, Math.round(w / 1.2) - 1);
    for (let i = 1; i <= nm; i++) mk(0.035, h, th, blackSteel, o.u0 + (w * i) / (nm + 1), cy);
    if (axis === 'z') box(group, 0.2, 0.04, w + 0.1, oak, fixed - 0.07, o.y0 - 0.02, cu);
    else box(group, w + 0.1, 0.04, 0.2, oak, cu, o.y0 - 0.02, fixed + (fixed < 44 ? 0.07 : -0.07));
  }
  glazing('z', X1 - 0.12, WIN_E);
  glazing('x', Z0 + 0.12, WIN_N);
  glazing('x', Z1 - 0.12, WIN_S);

  // door frame, threshold and the open pivoting oak door (swung inwards, hinge at z 44.8)
  box(group, T, 0.05, 1.7, concrete, X1 - T / 2, FLOOR, 44);
  box(group, 0.06, 0.02, 1.62, brass, X1 - 0.18, FLOOR + 0.03, 44);
  box(group, T, 0.12, 1.76, blackSteel, X1 - T / 2, 2.66, 44);
  box(group, T, 2.6, 0.04, blackSteel, X1 - T / 2, 1.3, 43.18);
  box(group, T, 2.6, 0.04, blackSteel, X1 - T / 2, 1.3, 44.82);
  {
    const hinge = new THREE.Group();
    hinge.position.set(X1 - 0.19, 0, 44.78);
    hinge.rotation.y = 1.75;
    group.add(hinge);
    box(hinge, 0.05, 2.55, 1.56, oakDoor, 0, 1.29, -0.8);
    for (let i = 0; i < 5; i++) box(hinge, 0.012, 2.4, 0.008, blackSteel, 0.028, 1.29, -0.2 - i * 0.3, { cast: false });
    box(hinge, 0.04, 0.5, 0.03, brass, 0.05, 1.05, -1.45);
    box(hinge, 0.04, 0.5, 0.03, brass, -0.05, 1.05, -1.45);
  }

  // name plate "STUDIO" (outer face of the east wall, beside the door)
  {
    const tex = canvasTex(512, 128, (g, w, h) => {
      const gr = g.createLinearGradient(0, 0, w, h);
      gr.addColorStop(0, '#d6ad5a'); gr.addColorStop(0.5, '#f1d48f'); gr.addColorStop(1, '#b88a3a');
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
      g.fillStyle = '#3a2a10'; g.font = '600 72px Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('S T U D I O', w / 2, h / 2 + 4);
    });
    tex.wrapS = THREE.RepeatWrapping; tex.repeat.x = -1; tex.offset.x = 1; // +x face runs along -z
    const faceM = new THREE.MeshStandardMaterial({ map: tex, metalness: 0.8, roughness: 0.32 });
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.09, 0.36), [faceM, brass, brass, brass, brass, brass]);
    plate.position.set(X1 - 0.07, 1.45, 42.6);
    plate.castShadow = true;
    group.add(plate);
  }

  solid(X1 - T, X1, Z0, 43.2, 0, 5.5);
  solid(X1 - T, X1, 44.8, Z1, 0, 5.5);
  solid(X0, X1, Z0, Z0 + T, 0, 5.5);
  solid(X0, X1, Z1 - T, Z1, 0, 5.5);
  solid(X0, X0 + T, Z0, Z1, 0, 5.5);

  // ---------------------------------------------------------------- ceiling details
  const ledWarm = emissive(0xffd9a0, 3.2);
  box(group, 0.08, 0.04, IZ1 - IZ0 - 0.4, ledWarm, IX0 + 0.12, H - 0.02, 44, { cast: false });
  box(group, 0.08, 0.04, IZ1 - IZ0 - 0.4, ledWarm, IX1 - 0.12, H - 0.02, 44, { cast: false });
  box(group, IX1 - IX0 - 0.6, 0.04, 0.08, ledWarm, (IX0 + IX1) / 2, H - 0.02, IZ0 + 0.12, { cast: false });
  box(group, IX1 - IX0 - 0.6, 0.04, 0.08, ledWarm, (IX0 + IX1) / 2, H - 0.02, IZ1 - 0.12, { cast: false });
  const troffer = emissive(0xfff0dc, 2.4);
  for (const z of [41, 47]) box(group, 3.2, 0.03, 0.14, troffer, -17.4, H - 0.015, z, { cast: false });
  for (const [cx, cz, w, d, m] of [[-19.0, 44, 2.2, 3.0, fabricGrey], [-16.0, 41.2, 1.8, 1.6, fabricRust], [-16.0, 46.9, 1.8, 1.6, fabricTeal]]) {
    rbox(group, w, 0.1, d, 0.03, m, cx, 3.55, cz);
    for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) cyl(group, 0.004, 0.004, 0.95, blackSteel, cx + dx * (w / 2 - 0.1), 4.02, cz + dz * (d / 2 - 0.1), { cast: false }, 6);
  }

  // ---------------------------------------------------------------- acoustic treatment
  {
    const cols = [[39.45, fabricTeal], [40.75, fabricGrey], [42.05, fabricRust], [46.0, fabricRust], [47.3, fabricGrey], [48.6, fabricTeal]];
    for (const [z, m] of cols) for (const y of [1.0, 2.35]) {
      const p = new THREE.Group(); p.position.set(IX0, y + 0.55, z); group.add(p);
      box(p, 0.1, 1.1, 1.2, oak, 0.05, 0, 0);
      rbox(p, 0.08, 1.0, 1.1, 0.015, m, 0.08, 0, 0);
    }
    // vertical slat wall between the main monitors
    const slat = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), oak, 40);
    for (let i = 0; i < 40; i++) { pV.set(IX0 + 0.06, 1.8, 42.7 + i * 0.0775); sV.set(0.05, 3.0, 0.05); m4.compose(pV, qI, sV); slat.setMatrixAt(i, m4); }
    slat.castShadow = slat.receiveShadow = true; group.add(slat);
    box(group, 0.03, 3.0, 3.1, blackSteel, IX0 + 0.015, 1.8, 44.1, { cast: false });
    for (const z of [IZ0 + 0.25, IZ1 - 0.25]) {
      cyl(group, 0.25, 0.25, 3.2, fabricSand, IX0 + 0.25, 1.7, z, {}, 20);
      cyl(group, 0.26, 0.26, 0.05, oak, IX0 + 0.25, 3.32, z, {}, 20);
    }
    // QRD-style wooden diffusers above the sofa
    const n = 18;
    const dif = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), oak, n * 2);
    const pat = [1, 4, 2, 5, 3, 0, 3, 5, 2, 4, 1, 0, 2, 4, 3, 5, 1, 3];
    for (let r = 0; r < 2; r++) for (let i = 0; i < n; i++) {
      const dpt = 0.05 + pat[(i + r * 5) % pat.length] * 0.035;
      pV.set(IX1 - dpt / 2, r ? 1.9 : 3.15, 39.0 + i * 0.1); sV.set(dpt, 1.1, 0.085);
      m4.compose(pV, qI, sV); dif.setMatrixAt(i + r * n, m4);
    }
    dif.castShadow = dif.receiveShadow = true; group.add(dif);
    box(group, 0.02, 2.5, 1.9, blackSteel, IX1 - 0.01, 2.5, 39.9, { cast: false });
  }
  // ON AIR sign beside the door
  {
    const tex = canvasTex(256, 96, (g, w, h) => {
      g.fillStyle = '#1b0505'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#ff4a38'; g.font = '700 54px Helvetica, Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('ON AIR', w / 2, h / 2 + 3);
    });
    const sign = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.15, 0.4),
      [new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 1.4 }), blackSteel, blackSteel, blackSteel, blackSteel, blackSteel]);
    sign.position.set(IX1 - 0.02, 3.0, 44);
    sign.rotation.y = Math.PI;
    group.add(sign);
  }

  // ---------------------------------------------------------------- rug
  {
    const tex = canvasTex(512, 384, (g, w, h) => {
      g.fillStyle = '#5a1f1a'; g.fillRect(0, 0, w, h);
      g.strokeStyle = '#b8a888'; g.lineWidth = 10; g.strokeRect(22, 22, w - 44, h - 44);
      g.strokeStyle = '#1f2933'; g.lineWidth = 18; g.strokeRect(52, 52, w - 104, h - 104);
      g.fillStyle = '#9a7a40';
      for (let i = 0; i < 7; i++) { g.save(); g.translate(w / 2 + (i - 3) * 52, h / 2); g.rotate(Math.PI / 4); g.fillRect(-16, -16, 32, 32); g.restore(); }
    });
    add(group, new THREE.BoxGeometry(4.2, 0.014, 3.2), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95, envMapIntensity: IE }), -17.1, FLOOR + 0.007, 44, { cast: false });
  }

  // ---------------------------------------------------------------- mixing console
  const consoleGroup = new THREE.Group();
  group.add(consoleGroup);
  const CZ0 = 42.8, CZ1 = 45.2, CL = CZ1 - CZ0;
  const NCH = 24, NL = 12;
  let meters;
  const meterState = { lvl: new Float32Array(NCH), ph: new Float32Array(NCH) };
  {
    const prof = new THREE.Shape();
    prof.moveTo(-19.72, 0.12); prof.lineTo(-18.45, 0.12); prof.lineTo(-18.45, 0.78);
    prof.lineTo(-19.55, 0.90); prof.lineTo(-19.72, 0.90); prof.lineTo(-19.72, 0.12);
    const bodyGeo = new THREE.ExtrudeGeometry(prof, { depth: CL, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.012, bevelSegments: 2 });
    bodyGeo.translate(0, 0, CZ0);
    add(consoleGroup, bodyGeo, paint(0x24282e, { roughness: 0.42, metalness: 0.55, envMapIntensity: 0.9 }), 0, 0, 0);
    box(consoleGroup, 1.2, 0.12, CL - 0.1, blackSteel, -19.1, 0.06, 44);
    const cheekM = mat('darkWood', { tile: 0.8, envMapIntensity: IE });
    for (const z of [CZ0 - 0.04, CZ1 + 0.04]) rbox(consoleGroup, 1.45, 0.86, 0.08, 0.012, cheekM, -19.05, 0.45, z);
    rbox(consoleGroup, 0.36, 0.05, CL + 0.16, 0.02, oak, -18.27, 0.8, 44);
    // meter bridge
    const bp = new THREE.Shape();
    bp.moveTo(-19.35, 0.9); bp.lineTo(-19.75, 0.9); bp.lineTo(-19.75, 1.27); bp.lineTo(-19.57, 1.27); bp.lineTo(-19.35, 0.9);
    const bridgeGeo = new THREE.ExtrudeGeometry(bp, { depth: CL - 0.1, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.008, bevelSegments: 2 });
    bridgeGeo.translate(0, 0, CZ0 + 0.05);
    add(consoleGroup, bridgeGeo, paint(0x111214, { roughness: 0.5, metalness: 0.4 }), 0, 0, 0);

    const pitch = 0.0845, startZ = 43.0 + pitch / 2 - 0.02;
    const tilt = -Math.atan(0.12 / 1.10);
    const yTop = (x) => 0.78 + (-18.45 - x) * (0.12 / 1.10);
    const qt = new THREE.Quaternion().setFromEuler(eU.set(0, 0, tilt));
    const place = (im, i, x, dy, z, sx, sy, sz) => { pV.set(x, yTop(x) + dy, z); sV.set(sx, sy, sz); m4.compose(pV, qt, sV); im.setMatrixAt(i, m4); };
    const unit = new THREE.BoxGeometry(1, 1, 1);
    const inst = (g, m, n) => { const im = new THREE.InstancedMesh(g, m, n); im.receiveShadow = true; consoleGroup.add(im); return im; };
    const zc = (i) => startZ + i * pitch + (i >= 8 ? 0.012 : 0) + (i >= 16 ? 0.012 : 0);
    const caps5 = [0xd93a2f, 0x2f6fd0, 0xe5b72b, 0x37a35a, 0xe9e5dc];

    const bands = inst(unit, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 }), NCH);
    for (let i = 0; i < NCH; i++) {
      place(bands, i, -18.88, 0.0015, zc(i), 0.5, 0.003, pitch - 0.006);
      bands.setColorAt(i, cC.set([0x3d444d, 0x394a58, 0x4d4a44, 0x3d4d44][i % 4]));
    }
    const slots = inst(unit, blackSteel, NCH + 4);
    const caps = inst(unit, paint(0xd9d6cf, { roughness: 0.4, metalness: 0.2 }), NCH + 4);
    for (let i = 0; i < NCH; i++) {
      place(slots, i, -18.68, 0.004, zc(i), 0.14, 0.004, 0.006);
      place(caps, i, -18.68 + (((i * 7) % 11) - 5) * 0.008, 0.011, zc(i), 0.026, 0.016, 0.017);
    }
    for (let k = 0; k < 4; k++) { const z = 44.73 + k * 0.095; place(slots, NCH + k, -18.6, 0.004, z, 0.16, 0.004, 0.007); place(caps, NCH + k, -18.62 - k * 0.01, 0.012, z, 0.03, 0.018, 0.024); }
    const knobRows = [-19.42, -19.33, -19.24, -19.15];
    const knobs = inst(new THREE.CylinderGeometry(0.0085, 0.0095, 1, 14), paint(0x1c1d20, { roughness: 0.5 }), NCH * 4);
    const knobCaps = inst(new THREE.CylinderGeometry(0.006, 0.006, 1, 12), paint(0xffffff, { roughness: 0.5 }), NCH * 4);
    for (let i = 0; i < NCH; i++) for (let r = 0; r < 4; r++) {
      const k = i * 4 + r;
      place(knobs, k, knobRows[r], 0.008, zc(i), 1, 0.016, 1);
      place(knobCaps, k, knobRows[r], 0.0165, zc(i), 1, 0.003, 1);
      knobCaps.setColorAt(k, cC.set(caps5[(r + (i >> 3)) % caps5.length]));
    }
    const btns = inst(unit, new THREE.MeshBasicMaterial({ color: 0xffffff }), NCH * 3);
    for (let i = 0; i < NCH; i++) for (let r = 0; r < 3; r++) {
      const k = i * 3 + r;
      place(btns, k, -19.0 + r * 0.045, 0.004, zc(i), 0.026, 0.006, 0.022);
      const on = ((i * 5 + r * 3) % 7) < 2;
      btns.setColorAt(k, cC.set(on ? [0xff3b2a, 0xffb020, 0x3ddc84][r] : [0x4a1410, 0x4a3410, 0x14401f][r]));
    }
    // meters on the bridge face
    meters = new THREE.InstancedMesh(unit, new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), NCH * NL);
    consoleGroup.add(meters);
    const alpha = Math.atan(0.18 / 0.37);
    const qf = new THREE.Quaternion().setFromEuler(eU.set(0, 0, alpha));
    const faceLen = Math.hypot(0.18, 0.37);
    const ux = -Math.sin(alpha), uy = Math.cos(alpha);
    for (let i = 0; i < NCH; i++) for (let l = 0; l < NL; l++) {
      const t = 0.1 + (l / (NL - 1)) * 0.75;
      pV.set(-19.35 + ux * faceLen * t + 0.005, 0.9 + uy * faceLen * t, zc(i)); sV.set(0.004, 0.0225, pitch - 0.04);
      m4.compose(pV, qf, sV); meters.setMatrixAt(i * NL + l, m4);
      meters.setColorAt(i * NL + l, cC.set(0x0a0a0a));
    }
    for (let i = 0; i < NCH; i++) meterState.ph[i] = i * 1.7 + 0.3;
    // monitor-level knob
    cyl(consoleGroup, 0.03, 0.032, 0.025, paint(0x16171a, { roughness: 0.35, metalness: 0.5 }), -18.64, yTop(-18.64) + 0.014, 44.62, { rz: tilt }, 24).castShadow = false;
    // bridge end brackets
    for (const z of [CZ0 + 0.05, CZ1 - 0.05]) box(consoleGroup, 0.4, 0.37, 0.03, steel, -19.55, 1.085, z);

    solid(-19.8, -18.1, 42.6, 45.4, 0, 1.3);
    const act = { type: 'app', url: 'assets/apps/studio-mixing-desk.html', title: 'Studio — mixing desk' };
    consoleGroup.userData.action = act; consoleGroup.userData.label = 'Mixing desk';
    consoleGroup.traverse((o) => { o.userData.action = act; });
    pickables.push(consoleGroup);
  }

  // tablet on the arm rest
  {
    const tg = new THREE.Group(); tg.position.set(-18.27, 0.84, 43.55); tg.rotation.y = 0.12; group.add(tg);
    const tex = canvasTex(512, 340, (g, w, h) => {
      const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, '#13213a'); gr.addColorStop(1, '#2a1740');
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 64; i++) { const a = 20 + Math.abs(Math.sin(i * 0.37) * 120 + Math.sin(i * 0.11) * 60); g.fillStyle = `hsl(${180 + i * 2},85%,60%)`; g.fillRect(24 + i * 7.2, h / 2 - a / 2, 4.5, a); }
      g.fillStyle = '#ffffff'; g.font = '600 26px Helvetica, Arial'; g.fillText('Loop sketchpad', 24, 40);
    });
    rbox(tg, 0.26, 0.009, 0.185, 0.004, paint(0x202124, { roughness: 0.3, metalness: 0.6 }), 0, 0, 0);
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.24, 0.16), new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 0.9, roughness: 0.2 }));
    scr.rotation.x = -Math.PI / 2; scr.position.y = 0.0052; tg.add(scr);
    const act = { type: 'app', url: 'assets/apps/loop-sketchpad.html', title: 'Loop sketchpad' };
    tg.traverse((o) => { o.userData.action = act; });
    tg.userData.label = 'Loop sketchpad';
    pickables.push(tg);
  }

  // operator's chair
  {
    const c = new THREE.Group(); c.position.set(-17.45, 0, 44); c.rotation.y = Math.PI / 2 + 0.1; group.add(c);
    rbox(c, 0.5, 0.09, 0.5, 0.035, leather, 0, 0.5, 0);
    rbox(c, 0.46, 0.5, 0.08, 0.035, leather, 0, 0.86, -0.25, { rx: -0.08 });
    cyl(c, 0.025, 0.03, 0.34, blackSteel, 0, 0.3, 0, {}, 12);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      box(c, 0.3, 0.03, 0.045, blackSteel, Math.cos(a) * 0.15, 0.1, Math.sin(a) * 0.15, { ry: -a });
      cyl(c, 0.025, 0.025, 0.03, blackSteel, Math.cos(a) * 0.3, 0.04, Math.sin(a) * 0.3, {}, 10);
    }
  }

  // ---------------------------------------------------------------- monitors
  function monitor(parent, w, h, d, woofR, tweetR) {
    const g = new THREE.Group();
    rbox(g, d, h, w, 0.025, speakerBlack, 0, 0, 0);
    const fx = d / 2 + 0.002;
    const wy = -h * 0.17, ty = h * 0.3;
    const r90 = { rz: Math.PI / 2, cast: false };
    cyl(g, woofR + 0.012, woofR + 0.012, 0.01, blackSteel, fx, wy, 0, r90, 28);
    cyl(g, woofR * 0.9, woofR * 0.9, 0.012, paint(0x2a2c2f, { roughness: 0.75 }), fx + 0.004, wy, 0, r90, 28);
    cyl(g, woofR * 0.28, woofR * 0.28, 0.014, paint(0x1e1f21, { roughness: 0.4 }), fx + 0.008, wy, 0, r90, 20);
    cyl(g, tweetR + 0.012, tweetR + 0.012, 0.01, blackSteel, fx, ty, 0, r90, 24);
    cyl(g, tweetR * 0.85, tweetR * 0.85, 0.012, paint(0x9aa0a6, { roughness: 0.3, metalness: 0.8 }), fx + 0.005, ty, 0, r90, 20);
    box(g, 0.008, 0.012, w * 0.36, paint(0x0d0e0f), fx, -h * 0.43, 0, { cast: false });
    add(g, new THREE.SphereGeometry(0.006, 8, 8), new THREE.MeshBasicMaterial({ color: 0x35ff6a }), fx, -h * 0.47 + 0.01, w * 0.3, { cast: false });
    parent.add(g);
    return g;
  }
  function mainMonitor(z) {
    const g = new THREE.Group(); g.position.set(IX0 + 0.62, 0, z);
    g.rotation.y = -Math.atan2(44 - z, -17.6 - g.position.x);
    group.add(g);
    box(g, 0.48, 0.03, 0.5, blackSteel, 0, 0.015, 0);
    box(g, 0.05, 1.0, 0.05, blackSteel, -0.05, 0.53, 0.12); box(g, 0.05, 1.0, 0.05, blackSteel, -0.05, 0.53, -0.12);
    box(g, 0.34, 0.025, 0.4, blackSteel, 0, 1.04, 0);
    monitor(g, 0.46, 0.78, 0.42, 0.13, 0.02).position.set(0, 1.44, 0);
    solid(g.position.x - 0.3, g.position.x + 0.3, z - 0.3, z + 0.3, 0, 1.9);
  }
  mainMonitor(41.4); mainMonitor(46.6);
  for (const z of [42.55, 45.45]) {
    const g = new THREE.Group(); g.position.set(-19.45, 1.05, z); g.rotation.y = -Math.atan2(44 - z, 1.7);
    group.add(g);
    monitor(g, 0.19, 0.3, 0.2, 0.05, 0.012);
  }

  // ---------------------------------------------------------------- upright piano
  {
    const pg = new THREE.Group(); pg.position.set(-16.2, 0, IZ0 + 0.35); group.add(pg);
    rbox(pg, 1.5, 1.16, 0.58, 0.02, blackLac, 0, 0.62, 0);
    rbox(pg, 1.56, 0.04, 0.62, 0.015, blackLac, 0, 1.22, 0.01);
    box(pg, 1.5, 0.1, 0.12, blackLac, 0, 0.05, 0.14);
    for (const x of [-0.7, 0.7]) box(pg, 0.06, 0.58, 0.55, blackLac, x, 0.34, 0.02, { cast: false });
    rbox(pg, 1.42, 0.07, 0.08, 0.01, blackLac, 0, 0.73, 0.34);
    box(pg, 1.42, 0.02, 0.28, blackLac, 0, 0.70, 0.45);
    const nw = 29, kp = 1.36 / nw;
    const wk = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), paint(0xf3efe4, { roughness: 0.3 }), nw);
    const bk = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), paint(0x0c0c0d, { roughness: 0.25 }), 20);
    for (let i = 0; i < nw; i++) { pV.set(-0.68 + kp * (i + 0.5), 0.725, 0.48); sV.set(kp - 0.003, 0.025, 0.16); m4.compose(pV, qI, sV); wk.setMatrixAt(i, m4); }
    let b = 0;
    for (let i = 0; i < nw - 1 && b < 20; i++) if ([0, 1, 3, 4, 5].includes(i % 7)) { pV.set(-0.68 + kp * (i + 1), 0.745, 0.435); sV.set(kp * 0.55, 0.02, 0.1); m4.compose(pV, qI, sV); bk.setMatrixAt(b++, m4); }
    bk.count = b; wk.castShadow = bk.castShadow = true; pg.add(wk, bk);
    rbox(pg, 1.1, 0.4, 0.025, 0.006, blackLac, 0, 1.0, 0.27, { rx: -0.2 });
    box(pg, 0.9, 0.3, 0.004, paint(0xf1ede2, { roughness: 0.9 }), 0, 1.0, 0.285, { rx: -0.2 });
    for (const x of [-0.08, 0, 0.08]) box(pg, 0.04, 0.012, 0.09, brass, x, 0.07, 0.4);
    const st = new THREE.Group(); st.position.set(-16.3, 0, IZ0 + 1.25); group.add(st);
    rbox(st, 0.55, 0.1, 0.32, 0.03, leather, 0, 0.5, 0);
    for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) box(st, 0.03, 0.46, 0.03, blackLac, dx * 0.23, 0.23, dz * 0.12);
    solid(-17.0, -15.4, IZ0, IZ0 + 0.7, 0, 1.3);
    cyl(pg, 0.07, 0.07, 0.02, brass, 0.5, 1.25, -0.05, {}, 16);
    cyl(pg, 0.012, 0.012, 0.28, brass, 0.5, 1.4, -0.05, {}, 8);
    cyl(pg, 0.09, 0.14, 0.17, emissive(0xffc27a, 2.6), 0.5, 1.58, -0.05, { cast: false }, 20);
  }

  // ---------------------------------------------------------------- sofa + coffee table
  {
    const sg = new THREE.Group(); sg.position.set(IX1 - 0.5, 0, 40.9); group.add(sg);
    rbox(sg, 0.9, 0.22, 2.2, 0.05, leather, 0, 0.3, 0);
    for (let i = 0; i < 3; i++) rbox(sg, 0.72, 0.16, 0.7, 0.06, leather, -0.08, 0.5, -0.73 + i * 0.73);
    rbox(sg, 0.22, 0.55, 2.2, 0.08, leather, 0.34, 0.72, 0);
    for (let i = 0; i < 3; i++) rbox(sg, 0.16, 0.42, 0.7, 0.07, leather, 0.22, 0.85, -0.73 + i * 0.73, { rz: -0.12 });
    for (const z of [-1, 1]) rbox(sg, 0.9, 0.3, 0.2, 0.06, leather, 0, 0.62, z * 1.1);
    for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) cyl(sg, 0.025, 0.018, 0.16, brass, dx * 0.38, 0.08, dz * 1.0, {}, 10);
    rbox(sg, 0.12, 0.38, 0.38, 0.05, fabricSand, 0.1, 0.78, -0.7, { rz: -0.18, ry: 0.2 });
    rbox(sg, 0.12, 0.34, 0.34, 0.05, fabricTeal, 0.1, 0.76, 0.75, { rz: -0.18, ry: -0.3 });
    solid(sg.position.x - 0.5, sg.position.x + 0.5, 39.7, 42.2, 0, 0.95);
    const ct = new THREE.Group(); ct.position.set(-14.2, 0, 40.9); group.add(ct);
    rbox(ct, 0.7, 0.04, 1.1, 0.012, oak, 0, 0.38, 0);
    for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) box(ct, 0.03, 0.36, 0.03, blackSteel, dx * 0.3, 0.18, dz * 0.5);
    solid(-14.6, -13.8, 40.3, 41.5, 0, 0.45);
    cyl(ct, 0.15, 0.15, 0.004, paint(0x0c0c0c, { roughness: 0.25 }), 0.0, 0.402, 0.2, {}, 32);
    cyl(ct, 0.04, 0.034, 0.09, paint(0xf0ece3, { roughness: 0.3 }), -0.1, 0.445, -0.25, {}, 16);
  }

  // ---------------------------------------------------------------- acoustic guitar on a stand
  {
    const gg = new THREE.Group(); gg.position.set(-13.9, 0, IZ1 - 0.75); gg.rotation.y = Math.PI + 0.25; group.add(gg);
    for (const a of [0, 2.1, -2.1]) {
      const leg = box(gg, 0.02, 0.5, 0.02, blackSteel, Math.sin(a) * 0.16, 0.24, Math.cos(a) * 0.16);
      leg.rotation.set(Math.cos(a) * 0.5, 0, -Math.sin(a) * 0.5);
    }
    cyl(gg, 0.012, 0.012, 0.35, blackSteel, 0, 0.55, 0, {}, 8);
    box(gg, 0.2, 0.02, 0.05, blackSteel, 0, 0.72, 0);
    const half = [[0.0, 0], [0.08, 0.005], [0.15, 0.04], [0.19, 0.11], [0.2, 0.19], [0.17, 0.26], [0.12, 0.31], [0.115, 0.35], [0.14, 0.4], [0.16, 0.45], [0.145, 0.5], [0.09, 0.535], [0.0, 0.545]];
    const pts = half.map(([w, y]) => new THREE.Vector2(w, y));
    for (let i = half.length - 2; i >= 1; i--) pts.push(new THREE.Vector2(-half[i][0], half[i][1]));
    const curve = new THREE.SplineCurve(pts.concat([pts[0].clone()]));
    const bodyGeo = new THREE.ExtrudeGeometry(new THREE.Shape(curve.getPoints(80)), { depth: 0.09, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.012, bevelSegments: 3 });
    add(gg, bodyGeo, mat('oak', { color: 0xd8a35a, tile: 0.5, roughness: 0.35 }), 0, 0.74, -0.045);
    cyl(gg, 0.045, 0.045, 0.004, paint(0x050505), 0, 0.74 + 0.32, 0.058, { rx: Math.PI / 2, cast: false }, 24);
    add(gg, new THREE.TorusGeometry(0.052, 0.006, 8, 28), paint(0x2b1b10, { roughness: 0.5 }), 0, 0.74 + 0.32, 0.058, { cast: false });
    box(gg, 0.14, 0.012, 0.012, paint(0x1d130c), 0, 0.74 + 0.12, 0.06);
    box(gg, 0.045, 0.62, 0.03, mat('darkWood', { tile: 0.3 }), 0, 0.74 + 0.545 + 0.28, 0);
    box(gg, 0.052, 0.16, 0.025, mat('oak', { color: 0x5a3a22 }), 0, 0.74 + 0.545 + 0.65, 0);
    for (let i = 0; i < 3; i++) for (const sx of [-1, 1]) cyl(gg, 0.007, 0.007, 0.02, brass, sx * 0.03, 0.74 + 0.545 + 0.6 + i * 0.045, 0, { rz: Math.PI / 2, cast: false }, 8);
    box(gg, 0.001, 1.05, 0.001, paint(0xd8d8d0, { metalness: 1, roughness: 0.3 }), 0, 0.74 + 0.12 + 0.52, 0.063, { cast: false });
    solid(-14.4, -13.4, IZ1 - 1.2, IZ1 - 0.3, 0, 1.9);
  }

  // ---------------------------------------------------------------- record shelf (south wall)
  {
    const sg = new THREE.Group(); sg.position.set(-18.6, 0, IZ1 - 0.2); group.add(sg);
    const cell = 0.36, cols = 5, rows = 4, th = 0.02;
    const W = cols * cell + th, Hh = rows * cell + th;
    for (let r = 0; r <= rows; r++) box(sg, W, th, 0.34, oak, 0, 0.08 + r * cell, 0);
    for (let c = 0; c <= cols; c++) box(sg, th, Hh, 0.34, oak, -W / 2 + th / 2 + c * cell, 0.08 + Hh / 2 - th / 2, 0);
    box(sg, W, Hh, 0.01, oak, 0, 0.08 + Hh / 2 - th / 2, 0.17, { cast: false });
    box(sg, W - 0.04, 0.08, 0.3, blackSteel, 0, 0.04, 0);
    const sleeves = [];
    const sc = [0xe7e0d0, 0xc9b79a, 0x2f3a46, 0x9aa7a0, 0xb4533a, 0xd8c26a, 0x1d1d20, 0x8b6f5a, 0x5d7488, 0xe9e5db];
    let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      if (rnd() < 0.2 && r > 0) continue;
      const n = Math.floor((low ? 8 : 14) + rnd() * (low ? 4 : 8));
      let x = -W / 2 + th + c * cell + 0.012;
      for (let i = 0; i < n && x < -W / 2 + c * cell + cell - 0.012; i++) {
        sleeves.push({ x, y: 0.08 + th / 2 + r * cell + 0.158, c: sc[Math.floor(rnd() * sc.length)], lean: i === n - 1 ? (rnd() - 0.5) * 0.2 : 0 });
        x += 0.0125;
      }
    }
    const im = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), paint(0xffffff, { roughness: 0.85, envMapIntensity: IE }), sleeves.length);
    sleeves.forEach((sv, i) => {
      qI.setFromEuler(eU.set(0, 0, sv.lean)); pV.set(sv.x, sv.y, 0); sV.set(0.007, 0.31, 0.31);
      m4.compose(pV, qI, sV); im.setMatrixAt(i, m4); im.setColorAt(i, cC.set(sv.c));
    });
    qI.identity();
    im.castShadow = im.receiveShadow = true; sg.add(im);
    solid(-18.6 - W / 2, -18.6 + W / 2, IZ1 - 0.4, IZ1, 0, 0.08 + Hh);
    const tt = new THREE.Group(); tt.position.set(0.3, 0.08 + Hh, 0); sg.add(tt);
    rbox(tt, 0.45, 0.07, 0.36, 0.012, mat('darkWood', { tile: 0.6 }), 0, 0.035, 0);
    cyl(tt, 0.15, 0.15, 0.012, paint(0x0c0c0d, { roughness: 0.25 }), -0.04, 0.076, 0, {}, 32);
    cyl(tt, 0.045, 0.045, 0.014, paint(0xb53a2c, { roughness: 0.5 }), -0.04, 0.078, 0, {}, 16);
    box(tt, 0.13, 0.008, 0.01, steel, 0.13, 0.09, -0.08, { ry: 0.5 });
  }

  // ---------------------------------------------------------------- side table, card deck, lamps
  {
    const tg = new THREE.Group(); tg.position.set(-12.55, 0, 46.9); group.add(tg);
    cyl(tg, 0.34, 0.34, 0.035, oak, 0, 0.55, 0, {}, 32);
    cyl(tg, 0.035, 0.05, 0.52, blackSteel, 0, 0.28, 0, {}, 12);
    cyl(tg, 0.22, 0.24, 0.025, blackSteel, 0, 0.012, 0, {}, 24);
    const deck = new THREE.Group(); deck.position.set(0.05, 0.585, 0.02); deck.rotation.y = 0.5; tg.add(deck);
    const navy = paint(0x1d3a52, { roughness: 0.55 });
    box(deck, 0.21, 0.004, 0.15, navy, 0, 0, 0);
    box(deck, 0.2, 0.01, 0.14, paint(0xe9e3d2, { roughness: 0.8 }), 0, 0.007, 0);
    box(deck, 0.21, 0.004, 0.15, navy, 0, 0.014, 0);
    box(deck, 0.01, 0.018, 0.15, paint(0xd8b35a, { roughness: 0.4 }), -0.1, 0.007, 0);
    const cards = new THREE.Group(); cards.position.set(-0.12, 0.6, -0.1); cards.rotation.y = -0.3; tg.add(cards);
    box(cards, 0.09, 0.025, 0.13, paint(0xf4efe1, { roughness: 0.6 }), 0, 0, 0);
    box(cards, 0.092, 0.004, 0.132, paint(0xd8553d, { roughness: 0.6 }), 0, 0.0145, 0);
    const act = { type: 'app', url: 'assets/apps/constraint-deck.html', title: 'Constraint deck' };
    for (const g of [deck, cards]) { g.traverse((o) => { o.userData.action = act; }); g.userData.label = 'Constraint deck'; pickables.push(g); }
    solid(-12.95, -12.15, 46.5, 47.3, 0, 0.6);
    cyl(tg, 0.07, 0.08, 0.02, brass, -0.18, 0.578, 0.14, {}, 18);
    cyl(tg, 0.01, 0.01, 0.26, brass, -0.18, 0.7, 0.14, {}, 8);
    cyl(tg, 0.085, 0.13, 0.16, emissive(0xffbf70, 2.8), -0.18, 0.86, 0.14, { cast: false }, 24);
  }
  {
    const lg = new THREE.Group(); lg.position.set(-12.0, 0, 38.85); group.add(lg);
    cyl(lg, 0.15, 0.17, 0.03, blackSteel, 0, 0.015, 0, {}, 24);
    cyl(lg, 0.012, 0.012, 1.5, brass, 0, 0.78, 0, {}, 8);
    cyl(lg, 0.16, 0.24, 0.3, emissive(0xffc27a, 2.4), 0, 1.7, 0, { cast: false }, 28);
    solid(-12.2, -11.8, 38.65, 39.05, 0, 1.9);
  }
  {
    const lg = new THREE.Group(); lg.position.set(-12.0, 0, 49.2); group.add(lg);
    cyl(lg, 0.13, 0.15, 0.03, blackSteel, 0, 0.015, 0, {}, 24);
    cyl(lg, 0.012, 0.012, 1.35, brass, 0, 0.7, 0, {}, 8);
    cyl(lg, 0.12, 0.2, 0.28, emissive(0xffcf8a, 2.2), 0, 1.55, 0, { cast: false }, 28);
  }
  {
    const pg = new THREE.Group(); pg.position.set(-22.05, 0, 38.9); group.add(pg);
    cyl(pg, 0.22, 0.17, 0.4, paint(0xb06a4a, { roughness: 0.8 }), 0, 0.2, 0, {}, 20);
    cyl(pg, 0.012, 0.018, 1.2, paint(0x4a3a26), 0, 1.0, 0, {}, 6);
    const lg = new THREE.SphereGeometry(0.5, 8, 6); lg.scale(0.12, 0.28, 0.02);
    const im = new THREE.InstancedMesh(lg, paint(0x2f5e34, { roughness: 0.4, side: THREE.DoubleSide }), 28);
    for (let i = 0; i < 28; i++) {
      const a = i * 2.4, h = 0.7 + (i / 28) * 1.1, r = 0.12 + (i % 5) * 0.05;
      pV.set(Math.cos(a) * r, h, Math.sin(a) * r); qI.setFromEuler(eU.set(Math.sin(a) * 0.9, a, Math.cos(a) * 0.9 + 0.3));
      m4.compose(pV, qI, sV.set(1.5, 1.6, 1)); im.setMatrixAt(i, m4);
    }
    qI.identity();
    im.castShadow = true; pg.add(im);
  }

  // ---------------------------------------------------------------- lights (2)
  const warm = new THREE.PointLight(0xffd2a0, 22, 14, 1.6);
  warm.position.set(-16.5, 3.8, 43.2);
  group.add(warm);
  const fill = new THREE.PointLight(0xfff2e2, 12, 11, 1.6);
  fill.position.set(-13.4, 3.4, 47.2);
  group.add(fill);

  const regions = [
    { minX: IX0, maxX: IX1, minZ: IZ0, maxZ: IZ1, y: FLOOR },
    { minX: -11.6, maxX: -10.2, minZ: 43.4, maxZ: 44.6, y: 0 },
  ];

  // ---------------------------------------------------------------- meters animation
  const cGreen = new THREE.Color(0x35ff6a), cAmb = new THREE.Color(0xffc21a), cRed = new THREE.Color(0xff2a1a);
  const cDim = [new THREE.Color(0x07180b), new THREE.Color(0x181205), new THREE.Color(0x1c0705)];
  function paintMeters(t) {
    for (let i = 0; i < NCH; i++) {
      const v = 0.45 + 0.4 * Math.sin(t * (1.3 + (i % 5) * 0.37) + meterState.ph[i]) * Math.sin(t * 0.7 + i) + 0.12 * Math.sin(t * 9.1 + i * 3.1);
      const lit = Math.round(Math.max(0.05, Math.min(1, v)) * NL);
      for (let l = 0; l < NL; l++) {
        const z = l < 8 ? 0 : l < 10 ? 1 : 2;
        meters.setColorAt(i * NL + l, l < lit ? (z === 0 ? cGreen : z === 1 ? cAmb : cRed) : cDim[z]);
      }
    }
    meters.instanceColor.needsUpdate = true;
  }
  paintMeters(0.5);
  let acc = 0, tick = 0;

  return {
    group, regions, colliders, pickables,
    update(dt, frame) {
      if (ctx.reducedMotion) return;
      acc += dt;
      if (acc < 0.08) return;
      acc = 0; tick++;
      paintMeters((frame && frame.time) || tick * 0.08);
    },
    onPick() {},
  };
}
