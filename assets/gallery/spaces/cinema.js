// cinema.js — the private screening room, level 1 (y 7.2 → 13.2).
// Interior x ±6.5, z −17…5. Screen on the z = −16.8 wall, raked seating
// rising toward the back, glazed front façade at z = 5 onto the roof terrace.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const FLOOR = 7.2, CEIL = 13.2;
const X0 = -6.5, X1 = 6.5, Z0 = -17, Z1 = 5;

// Raked seating (metres)
const ROWS = 7, PITCH = 1.05, ROW0_Z = -11.0, RISE = 0.12;
const TIER_Z0 = ROW0_Z - PITCH / 2;                    // -11.525
const TIER_Z1 = ROW0_Z + (ROWS - 1) * PITCH + PITCH / 2; // -4.175
const TOP = RISE * ROWS;                               // 0.84
const SEAT_W = 0.56, PER_BLOCK = 8, AISLE = 0.65;      // centre aisle 1.3 m
const BLOCK_X1 = AISLE + SEAT_W * PER_BLOCK;           // 5.13
const BACK_RAMP_END = 3.2;

const SCREEN_W = 10, SCREEN_H = 4.2, SCREEN_Y0 = FLOOR + 0.85, SCREEN_Z = -16.8;

export function build(ctx) {
  const { M, quality } = ctx;
  const low = quality === 'low';
  const group = new THREE.Group();
  group.name = 'cinema';

  // ---------------------------------------------------------------- env ---
  // A little PMREM'd model of the dark room so glossy things reflect the
  // screen and cove lights instead of the daytime sky.
  const roomEnv = (() => {
    try {
      const s = new THREE.Scene();
      const oy = FLOOR + 1.5, oz = -7;
      const mk = (w, h, r, g, b) => new THREE.Mesh(new THREE.PlaneGeometry(w, h),
        new THREE.MeshBasicMaterial({ color: new THREE.Color().setRGB(r, g, b), side: THREE.DoubleSide }));
      const room = new THREE.Mesh(new THREE.BoxGeometry(13, 6, 22), new THREE.MeshBasicMaterial({ color: 0x0b0909, side: THREE.BackSide }));
      room.position.set(0, (FLOOR + CEIL) / 2 - oy, -6 - oz);
      s.add(room);
      const scr = mk(SCREEN_W, SCREEN_H, 1.6, 1.55, 1.45);
      scr.position.set(0, SCREEN_Y0 + SCREEN_H / 2 - oy, SCREEN_Z + 0.05 - oz); s.add(scr);
      const front = mk(13, 6, 1.6, 1.9, 2.4);
      front.position.set(0, (FLOOR + CEIL) / 2 - oy, Z1 - oz - 0.05); front.rotation.y = Math.PI; s.add(front);
      for (const sx of [-1, 1]) {
        const c = mk(0.2, 22, 2.4, 1.3, 0.55);
        c.rotation.x = -Math.PI / 2; c.position.set(sx * 6.2, CEIL - 0.3 - oy, -6 - oz); s.add(c);
      }
      const pm = new THREE.PMREMGenerator(ctx.renderer);
      const t = pm.fromScene(s, 0.03).texture;
      pm.dispose();
      s.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
      return t;
    } catch (e) { return null; }
  })();

  const lib = (name, opts, envI = 1) => {
    const m = M.get(name, opts).clone();
    if (roomEnv) { m.envMap = roomEnv; m.envMapIntensity = envI; }
    return m;
  };
  const std = (color, rough = 0.8, metal = 0, envI = 1) => {
    const m = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });
    if (roomEnv) { m.envMap = roomEnv; m.envMapIntensity = envI; }
    return m;
  };
  const uv = g => (M.boxUV(g), g);
  const add = (geo, mat, x = 0, y = 0, z = 0, cast = true, recv = true) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z); m.castShadow = cast; m.receiveShadow = recv;
    group.add(m); return m;
  };
  const box = (w, h, d, mat, x, y, z, cast = true) => add(uv(new THREE.BoxGeometry(w, h, d)), mat, x, y, z, cast);

  // ------------------------------------------------------------ materials ---
  const carpet = lib('fabric', { color: 0x6a3d42, roughness: 1 }, 0.6);
  const carpetAisle = lib('fabric', { color: 0x4c2c31, roughness: 1 }, 0.6);
  const wallFab = lib('fabric', { color: 0x55515a, roughness: 1 }, 0.8);
  const darkPaint = std(0x0d0d0f, 0.85, 0, 0.6);
  const ceilPaint = std(0x111114, 0.9, 0, 0.7);
  const steel = lib('steel', { color: 0x2a2a2d }, 1);
  const brass = std(0x9b7a45, 0.35, 1, 1);
  const wood = lib('darkWood', {}, 0.8);
  const velvetM = lib('velvet', { color: 0x5e0d16, roughness: 1 }, 0.7);
  const frameM = std(0x1b1c1e, 0.45, 0.8, 1);
  const glassM = new THREE.MeshStandardMaterial({
    color: 0xcfe0e6, roughness: 0.04, metalness: 0, transparent: true, opacity: 0.16,
    depthWrite: false, side: THREE.DoubleSide,
  });
  const warm = new THREE.MeshBasicMaterial({ color: new THREE.Color().setRGB(1.5, 0.82, 0.38) });

  // ------------------------------------------------------- floor / shell ---
  // base slab (carpet) and enclosure inner faces
  {
    const g = uv(new THREE.PlaneGeometry(13, 22)); g.rotateX(-Math.PI / 2);
    add(g, carpet, 0, FLOOR + 0.001, -6, false, true);
  }
  // ceiling
  {
    const g = new THREE.PlaneGeometry(13, 22); g.rotateX(Math.PI / 2);
    add(g, ceilPaint, 0, CEIL, -6, true, true);
  }
  // wall backing planes (cast shadow so sun cannot leak through)
  const backing = (w, h, x, y, z, ry) => {
    const g = new THREE.PlaneGeometry(w, h); g.rotateY(ry);
    add(g, darkPaint, x, y, z, true, true);
  };
  backing(22, 6, X0, (FLOOR + CEIL) / 2, -6, Math.PI / 2);
  backing(22, 6, X1, (FLOOR + CEIL) / 2, -6, -Math.PI / 2);
  backing(13, 6, 0, (FLOOR + CEIL) / 2, Z0, 0);

  // acoustic fabric panels: instanced slabs, 1.2 m modules with 3 cm reveals
  {
    const PH = 4.9, PW = 1.2, T = 0.07;
    const g = uv(new RoundedBoxGeometry(PW, PH, T, low ? 1 : 2, 0.012));
    const nSide = 18, zStart = Z0 + 0.5 + PW / 2;
    const nBack = 10;
    const im = new THREE.InstancedMesh(g, wallFab, nSide * 2 + nBack);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(1, 1, 1);
    let i = 0;
    const py = FLOOR + 0.18 + PH / 2;
    for (let k = 0; k < nSide; k++) {
      const z = Math.min(zStart + k * (PW + 0.03), Z1 - PW / 2 - 0.05);
      for (const sx of [-1, 1]) {
        q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), sx < 0 ? Math.PI / 2 : -Math.PI / 2);
        p.set(sx * (6.5 - T / 2), py, z); m4.compose(p, q, s); im.setMatrixAt(i++, m4);
      }
    }
    q.identity();
    for (let k = 0; k < nBack; k++) {
      p.set(-6.5 + 0.5 + PW / 2 + k * (PW + 0.03) - 0.0, py, Z0 + T / 2);
      m4.compose(p, q, s); im.setMatrixAt(i++, m4);
    }
    im.count = i; im.castShadow = false; im.receiveShadow = true;
    group.add(im);
    // skirting
    for (const sx of [-1, 1]) box(0.04, 0.16, 22, darkPaint, sx * 6.46, FLOOR + 0.08, -6, false);
    box(13, 0.16, 0.04, darkPaint, 0, FLOOR + 0.08, Z0 + 0.02, false);
  }

  // perimeter soffit + warm cove strips
  for (const sx of [-1, 1]) {
    box(0.5, 0.3, 22, ceilPaint, sx * 6.25, CEIL - 0.15, -6, false);
    add(new THREE.BoxGeometry(0.035, 0.02, 21.6), warm, sx * 5.97, CEIL - 0.31, -6, false, false);
  }
  box(13, 0.3, 0.5, ceilPaint, 0, CEIL - 0.15, Z0 + 0.25, false);
  add(new THREE.BoxGeometry(12, 0.02, 0.035), warm, 0, CEIL - 0.31, Z0 + 0.52, false, false);

  // recessed downlights (star field)
  {
    const pts = [];
    for (let xi = -4; xi <= 4; xi++) for (let zi = 0; zi < 9; zi++) {
      pts.push([xi * 1.4 + (zi % 2) * 0.35, -15 + zi * 2.1]);
    }
    const disc = new THREE.CircleGeometry(0.055, 12); disc.rotateX(Math.PI / 2);
    const ring = new THREE.RingGeometry(0.055, 0.085, 14); ring.rotateX(Math.PI / 2);
    const lamp = new THREE.MeshBasicMaterial({ color: new THREE.Color().setRGB(2.2, 1.7, 1.1) });
    const trim = new THREE.MeshBasicMaterial({ color: 0x050505 });
    const a = new THREE.InstancedMesh(disc, lamp, pts.length), b = new THREE.InstancedMesh(ring, trim, pts.length);
    const m4 = new THREE.Matrix4();
    pts.forEach(([x, z], i) => { m4.makeTranslation(x, CEIL - 0.004, z); a.setMatrixAt(i, m4); m4.makeTranslation(x, CEIL - 0.003, z); b.setMatrixAt(i, m4); });
    group.add(a, b);
  }

  // ------------------------------------------------------ stage lip + screen ---
  {
    const lipH = 0.2;
    const lip = uv(new RoundedBoxGeometry(SCREEN_W + 1.6, lipH, 1.0, 3, 0.04));
    add(lip, wood, 0, FLOOR + lipH / 2, Z0 + 0.2 + 0.5);
    add(new THREE.BoxGeometry(SCREEN_W + 1.5, 0.015, 0.02), warm, 0, FLOOR + 0.06, Z0 + 1.2 + 0.006, false, false);
  }
  const MASK = 0.32;
  const maskMat = std(0x020202, 1, 0, 0.1);
  const cy = SCREEN_Y0 + SCREEN_H / 2;
  {
    // black masking frame sits slightly proud of the wall, screen proud of it
    box(SCREEN_W + MASK * 2, SCREEN_H + MASK * 2, 0.06, maskMat, 0, cy, Z0 + 0.03 + 0.07, false);
    // thin steel border
    box(SCREEN_W + MASK * 2 + 0.06, 0.03, 0.09, steel, 0, cy + SCREEN_H / 2 + MASK, Z0 + 0.12, false);
    box(SCREEN_W + MASK * 2 + 0.06, 0.03, 0.09, steel, 0, cy - SCREEN_H / 2 - MASK, Z0 + 0.12, false);
  }
  // video
  const video = document.createElement('video');
  video.muted = true; video.loop = true; video.playsInline = true; video.preload = 'none';
  video.crossOrigin = 'anonymous';
  video.src = new URL('../../video/because-you-say-so.mp4', import.meta.url).href;
  const vtex = new THREE.VideoTexture(video);
  vtex.colorSpace = THREE.SRGBColorSpace;
  vtex.minFilter = THREE.LinearFilter; vtex.generateMipmaps = false;
  const SCR_ASPECT = SCREEN_W / SCREEN_H;
  video.addEventListener('loadedmetadata', () => {
    const va = video.videoWidth / video.videoHeight || 16 / 9;
    if (va < SCR_ASPECT) { vtex.repeat.set(1, va / SCR_ASPECT); vtex.offset.set(0, (1 - va / SCR_ASPECT) / 2); }
    else { vtex.repeat.set(SCR_ASPECT / va, 1); vtex.offset.set((1 - SCR_ASPECT / va) / 2, 0); }
  });
  const screenOff = new THREE.MeshStandardMaterial({ color: 0xc4c2bd, roughness: 0.85, metalness: 0, emissive: 0x2a2926, emissiveIntensity: 0.6 });
  if (roomEnv) { screenOff.envMap = roomEnv; screenOff.envMapIntensity = 0.5; }
  const screenOn = new THREE.MeshBasicMaterial({ map: vtex, toneMapped: false });
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(SCREEN_W, SCREEN_H), screenOff);
  screen.position.set(0, cy, Z0 + 0.2 + 0.02);
  screen.receiveShadow = true; screen.name = 'cinema-screen';
  screen.userData.action = { type: 'custom', id: 'cinema-sound' };
  group.add(screen);
  // speaker-ish: dark slits behind screen are implied; keep composition clean.

  // film light (soft glow on the first rows / walls)
  const filmLight = new THREE.PointLight(0xdfe3ea, 0, 12, 2);
  filmLight.position.set(0, cy - 0.2, Z0 + 2.2);
  group.add(filmLight);
  // room lights (warm, dim)
  const roomLights = [];
  for (const z of [-11, -6, -1.5]) {
    const l = new THREE.PointLight(0xffb878, 16, 10, 2);
    l.position.set(0, CEIL - 0.9, z);
    group.add(l); roomLights.push(l);
  }

  // ------------------------------------------------------- raked platforms ---
  const prism = (x0, x1, pts, mat, uvScale = 1) => {
    const sh = new THREE.Shape(pts.map(([z, y]) => new THREE.Vector2(z, y)));
    const g = new THREE.ExtrudeGeometry(sh, { depth: x1 - x0, bevelEnabled: false });
    const mtx = new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 1, 0), new THREE.Vector3(-1, 0, 0));
    g.applyMatrix4(mtx); g.translate(x1, FLOOR, 0);
    g.computeVertexNormals(); uv(g);
    return add(g, mat, 0, 0, 0, true, true);
  };
  const steps = [[TIER_Z0, 0]];
  for (let k = 0; k < ROWS; k++) {
    const za = TIER_Z0 + k * PITCH, zb = za + PITCH;
    steps.push([za, RISE * (k + 1)], [zb, RISE * (k + 1)]);
  }
  steps.push([TIER_Z1, 0]);
  const wedge = [[TIER_Z0, 0], [TIER_Z1, TOP], [TIER_Z1, 0]];
  for (const sx of [-1, 1]) {
    const a = sx > 0 ? AISLE : -BLOCK_X1, b = sx > 0 ? BLOCK_X1 : -AISLE;
    prism(a, b, steps, carpet);
    // side aisle
    const a2 = sx > 0 ? BLOCK_X1 : -6.5, b2 = sx > 0 ? 6.5 : -BLOCK_X1;
    prism(a2, b2, wedge, carpetAisle);
  }
  prism(-AISLE, AISLE, wedge, carpetAisle);
  // back ramp down to the door
  prism(-6.5, 6.5, [[TIER_Z1, 0], [TIER_Z1, TOP], [BACK_RAMP_END, 0]], carpet);
  // riser nosing: a thin steel/brass strip on the lip of each tier
  {
    const ng = new THREE.BoxGeometry(SEAT_W * PER_BLOCK, 0.012, 0.03);
    const im = new THREE.InstancedMesh(ng, brass, ROWS * 2);
    const m4 = new THREE.Matrix4(); let i = 0;
    for (const sx of [-1, 1]) for (let k = 0; k < ROWS; k++) {
      m4.makeTranslation(sx * (AISLE + SEAT_W * PER_BLOCK / 2), FLOOR + RISE * (k + 1) + 0.006, TIER_Z0 + k * PITCH + 0.015);
      im.setMatrixAt(i++, m4);
    }
    group.add(im);
  }

  // ------------------------------------------------------------- seats ---
  // Sit contract: every chair is one person-place { x, y (cushion top), z, facing }
  // in world metres, looking at the screen (−z). Per row and block (the centre
  // aisle splits each row) one invisible pick proxy encloses the block's 8 chairs
  // and lists their places; main.js seats the visitor on the one nearest the click.
  const seats = [], sitProxies = [];
  {
    const seg = low ? 1 : 3;
    // cushion: 0.13 thick, centre 0.45 above the tier, 2 cm forward of the row line,
    // tipped back 0.06 rad (front edge up)
    const CUSH_H = 0.13, CUSH_Y = 0.45, CUSH_DZ = -0.02, CUSH_TIP = 0.06;
    const cushionG = uv(new RoundedBoxGeometry(0.5, CUSH_H, 0.5, seg, 0.04));
    const backG = uv(new RoundedBoxGeometry(0.5, 0.68, 0.12, seg, 0.05));
    const armG = uv(new RoundedBoxGeometry(0.07, 0.05, 0.5, 1, 0.02));
    const armPostG = new THREE.BoxGeometry(0.035, 0.36, 0.06);
    const legG = new THREE.BoxGeometry(0.04, 0.4, 0.06);
    const footG = new THREE.BoxGeometry(0.06, 0.012, 0.42);
    const baseG = new THREE.BoxGeometry(0.46, 0.4, 0.3);

    const nSeat = ROWS * PER_BLOCK * 2;
    const nArm = ROWS * (PER_BLOCK + 1) * 2;
    const seatsIM = new THREE.InstancedMesh(cushionG, velvetM, nSeat);
    const backsIM = new THREE.InstancedMesh(backG, velvetM, nSeat);
    const armsIM = new THREE.InstancedMesh(armG, wood, nArm);
    const posts = low ? null : new THREE.InstancedMesh(armPostG, steel, nArm);
    const legs = low ? new THREE.InstancedMesh(baseG, darkPaint, nSeat) : new THREE.InstancedMesh(legG, steel, nArm);
    const feet = low ? null : new THREE.InstancedMesh(footG, steel, nArm);
    for (const im of [seatsIM, backsIM, armsIM, posts, legs, feet]) if (im) { im.castShadow = true; im.receiveShadow = true; group.add(im); }

    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(1, 1, 1);
    const tilt = new THREE.Quaternion(), flat = new THREE.Quaternion();
    tilt.setFromAxisAngle(new THREE.Vector3(1, 0, 0), -0.2); // top leans back (+z)

    // Sit place = the tipped cushion's top-centre: 0.515 above the tier, 1.6 cm
    // forward of the row line, in the middle of each 0.56 m chair.
    const SIT_Y = CUSH_Y + CUSH_H / 2 * Math.cos(CUSH_TIP), SIT_DZ = CUSH_DZ + CUSH_H / 2 * Math.sin(CUSH_TIP);
    // Proxy (relative to the row line and tier top): x over the block plus its end
    // arms (±3.5 cm) and 5 mm; y tier → backrest top (1.198) + 2 cm; z cushion front
    // corner (−0.274) … backrest foot (+0.464) with ~2.5 cm spare, inside the tier
    // (±0.525) so it never reaches the next riser or the aisles' walk regions.
    const PX_W = SEAT_W * PER_BLOCK + 0.08, PX_H = 1.22, PX_Z0 = -0.30, PX_Z1 = 0.49;
    const proxyG = new THREE.BoxGeometry(PX_W, PX_H, PX_Z1 - PX_Z0).translate(0, PX_H / 2, (PX_Z0 + PX_Z1) / 2);
    const proxyM = new THREE.MeshBasicMaterial({ visible: false });   // material, never object, invisible
    const mm = v => Math.round(v * 1000) / 1000 || 0;                 // drop float noise (and −0)
    let si = 0, ai = 0;
    const stepLights = [];
    for (let k = 0; k < ROWS; k++) {
      const z = ROW0_Z + k * PITCH, yT = FLOOR + RISE * (k + 1);
      for (const sx of [-1, 1]) {
        const own = [];
        for (let n = 0; n < PER_BLOCK; n++) {
          const x = sx * (AISLE + SEAT_W * (n + 0.5));
          // cushion (slight tip back), back rest
          q.setFromAxisAngle(new THREE.Vector3(1, 0, 0), CUSH_TIP);
          p.set(x, yT + CUSH_Y, z + CUSH_DZ); m4.compose(p, q, s); seatsIM.setMatrixAt(si, m4);
          p.set(x, yT + 0.45 + 0.07 + 0.34 * Math.cos(0.2), z + 0.27 + 0.34 * Math.sin(0.2)); m4.compose(p, tilt, s); backsIM.setMatrixAt(si, m4);
          if (low) { p.set(x, yT + 0.2, z + 0.1); m4.compose(p, flat, s); legs.setMatrixAt(si, m4); }
          own.push({ x: mm(x), y: mm(yT + SIT_Y), z: mm(z + SIT_DZ), facing: [0, -1] });
          si++;
        }
        const proxy = new THREE.Mesh(proxyG, proxyM);
        proxy.name = `cinema-seats-row${k + 1}-${sx < 0 ? 'west' : 'east'}`;
        proxy.position.set(sx * (AISLE + SEAT_W * PER_BLOCK / 2), yT, z);
        proxy.userData.action = { type: 'sit', seats: own };
        group.add(proxy); sitProxies.push(proxy); seats.push(...own);
        for (let n = 0; n <= PER_BLOCK; n++) {
          const x = sx * (AISLE + SEAT_W * n);
          p.set(x, yT + 0.62, z - 0.0); m4.compose(p, flat, s); armsIM.setMatrixAt(ai, m4);
          if (!low) {
            p.set(x, yT + 0.43, z + 0.08); m4.compose(p, flat, s); posts.setMatrixAt(ai, m4);
            p.set(x, yT + 0.2, z + 0.12); m4.compose(p, flat, s); legs.setMatrixAt(ai, m4);
            p.set(x, yT + 0.006, z - 0.04); m4.compose(p, flat, s); feet.setMatrixAt(ai, m4);
          }
          ai++;
        }
        // aisle step lights on the end standards (centre aisle + side aisle)
        stepLights.push([sx * AISLE - sx * 0.004, yT + 0.12, z, -sx], [sx * BLOCK_X1 + sx * 0.004, yT + 0.12, z, sx]);
      }
    }
    for (const im of [seatsIM, backsIM, armsIM, posts, legs, feet]) if (im) im.instanceMatrix.needsUpdate = true;

    const sg = new THREE.BoxGeometry(0.012, 0.035, 0.11);
    const led = new THREE.MeshBasicMaterial({ color: new THREE.Color().setRGB(2.2, 1.1, 0.42) });
    const lim = new THREE.InstancedMesh(sg, led, stepLights.length);
    stepLights.forEach(([x, y, z], i) => { m4.makeTranslation(x, y, z); lim.setMatrixAt(i, m4); });
    group.add(lim);
    // warm floor pools under the step LEDs (additive) — tiny, subtle
    const poolTex = glowTexture(64, [255, 150, 70]);
    const pm = new THREE.MeshBasicMaterial({ map: poolTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.5, toneMapped: true });
    const pg = new THREE.PlaneGeometry(0.5, 0.5); pg.rotateX(-Math.PI / 2);
    const pim = new THREE.InstancedMesh(pg, pm, stepLights.length);
    stepLights.forEach(([x, y, z, dir], i) => { m4.makeTranslation(x + dir * 0.22, y - 0.1, z); pim.setMatrixAt(i, m4); });
    group.add(pim);
  }

  // ----------------------------------------------------- wall sconces ---
  {
    const zs = [-14, -10.5, -7, -3.5, 0, 3.2];
    const bodyG = new THREE.BoxGeometry(0.09, 0.5, 0.07);
    const slitG = new THREE.BoxGeometry(0.02, 0.4, 0.05);
    const body = new THREE.InstancedMesh(bodyG, brass, zs.length * 2);
    const slit = new THREE.InstancedMesh(slitG, warm, zs.length * 2);
    const glowT = glowTexture(128, [255, 170, 90], true);
    const gm = new THREE.MeshBasicMaterial({ map: glowT, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.85 });
    const gg = new THREE.PlaneGeometry(1.5, 3.3); gg.rotateY(Math.PI / 2);
    const gim = new THREE.InstancedMesh(gg, gm, zs.length * 2);
    const m4 = new THREE.Matrix4(); let i = 0;
    for (const sx of [-1, 1]) for (const z of zs) {
      const x = sx * (6.43 - 0.045);
      m4.makeTranslation(x, 9.3, z); body.setMatrixAt(i, m4);
      m4.makeTranslation(x - sx * 0.035, 9.3, z); slit.setMatrixAt(i, m4);
      m4.makeRotationY(sx > 0 ? Math.PI : 0); m4.setPosition(sx * 6.425, 9.3, z); gim.setMatrixAt(i, m4);
      i++;
    }
    group.add(body, slit, gim);
  }

  // --------------------------------------------------- glazed front façade ---
  {
    const FZ = Z1 - 0.04, H = CEIL - FLOOR;
    const FD = 0.12, FW = 0.05;                       // mullion depth / width
    const DOOR_H = 2.6, HEAD = DOOR_H + 0.1;
    const fm = (w, h, d, x, y, z) => add(uv(new THREE.BoxGeometry(w, h, d)), frameM, x, y, z, true);
    // one large glass sheet each side of the door piece, one above
    const glassPane = (w, h, x, y) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), glassM);
      m.position.set(x, y, FZ); m.renderOrder = 2; group.add(m);
    };
    // verticals: edges, door jambs, every ~1.6 m
    const xs = [X0 + FW / 2, X1 - FW / 2, -0.9 - 0.03, 0.9 + 0.03];
    for (const x of [-4.9, -3.3, -1.7, 1.7, 3.3, 4.9]) xs.push(x);
    xs.forEach(x => fm(FW, H, FD, x, FLOOR + H / 2, FZ));
    // horizontals: top, bottom plinth, door head, intermediate transoms
    fm(13, 0.06, FD, 0, CEIL - 0.03, FZ);
    fm(13, 0.12, FD, 0, FLOOR + 0.06, FZ);
    fm(13, 0.06, FD, 0, FLOOR + HEAD, FZ);
    fm(13, 0.05, FD, 0, FLOOR + 4.6, FZ);
    // glass: lower (beside the door) and upper bands
    glassPane(5.6, HEAD - 0.12, -3.7, FLOOR + 0.12 + (HEAD - 0.12) / 2);
    glassPane(5.6, HEAD - 0.12, 3.7, FLOOR + 0.12 + (HEAD - 0.12) / 2);
    glassPane(13, 4.6 - HEAD - 0.06, 0, FLOOR + HEAD + 0.03 + (4.6 - HEAD - 0.06) / 2);
    glassPane(13, H - 4.6 - 0.09, 0, FLOOR + 4.6 + 0.025 + (H - 4.6 - 0.09) / 2);
    // double door, leaves standing open against the jambs (inside the room)
    for (const sx of [-1, 1]) {
      const leaf = new THREE.Group();
      const lw = 0.87, lh = DOOR_H - 0.12;
      const gl = new THREE.Mesh(new THREE.PlaneGeometry(lw - 0.1, lh - 0.18), glassM);
      gl.position.set(sx * -lw / 2, lh / 2 + 0.06, 0); gl.renderOrder = 2; leaf.add(gl);
      const fr = (w, h, x, y) => { const m = new THREE.Mesh(uv(new THREE.BoxGeometry(w, h, 0.05)), frameM); m.position.set(x, y, 0); m.castShadow = true; leaf.add(m); };
      fr(0.05, lh, sx * -0.025, lh / 2 + 0.06 * 0);
      fr(0.05, lh, sx * -(lw - 0.025), lh / 2);
      fr(lw, 0.09, sx * -lw / 2, lh - 0.045);
      fr(lw, 0.16, sx * -lw / 2, 0.08);
      const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.9, 8), steel);
      handle.position.set(sx * -(lw - 0.09), 1.05, 0.05 * 1.2); leaf.add(handle);
      leaf.position.set(sx * 0.9, FLOOR, FZ);
      leaf.rotation.y = sx * -Math.PI * 0.5 * 0.94;   // swung inward, flush to jamb
      leaf.rotation.y = sx > 0 ? -Math.PI / 2 * 0.94 : Math.PI / 2 * 0.94;
      group.add(leaf);
    }
    // threshold
    box(1.9, 0.02, 0.2, steel, 0, FLOOR + 0.01, FZ, false);
    // exit sign over the door (double sided)
    const cv = document.createElement('canvas'); cv.width = 256; cv.height = 90;
    const g2 = cv.getContext('2d');
    g2.fillStyle = '#052b14'; g2.fillRect(0, 0, 256, 90);
    g2.fillStyle = '#39ff7a'; g2.font = 'bold 56px Arial, Helvetica, sans-serif'; g2.textAlign = 'center'; g2.textBaseline = 'middle';
    g2.fillText('EXIT', 128, 48);
    const et = new THREE.CanvasTexture(cv); et.colorSpace = THREE.SRGBColorSpace;
    const faceM = new THREE.MeshBasicMaterial({ map: et, toneMapped: false });
    const bodyM = std(0x1a1a1a, 0.5, 0.2, 0.5);
    const sign = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.16, 0.05), [bodyM, bodyM, bodyM, bodyM, faceM, faceM]);
    sign.position.set(0, FLOOR + HEAD + 0.15, FZ);
    group.add(sign);
    const sl = new THREE.PointLight(0x40ff80, 0.5, 3.5, 2);
    sl.position.set(0, FLOOR + HEAD + 0.1, FZ - 0.35); group.add(sl);
  }

  // ------------------------------------------------ film → room glow ---
  const sampler = document.createElement('canvas'); sampler.width = 4; sampler.height = 4;
  const sctx = sampler.getContext('2d', { willReadFrequently: true });
  const tmpC = new THREE.Color();
  let glowAcc = 0, glowI = 6, glowTarget = 6;
  const glowCol = new THREE.Color(0xdfe3ea), glowColT = new THREE.Color(0xdfe3ea);
  const screenGlowEm = screenOn;

  // ----------------------------------------------------------- playback ---
  let playing = false, started = false;
  const regions = [
    { minX: -5.7, maxX: 5.7, minZ: -15.2, maxZ: -11.9, y: FLOOR },
    // aisles climb along the rake
    { minX: -0.3, maxX: 0.3, minZ: -12.3, maxZ: TIER_Z1, y: FLOOR, ramp: { axis: 'z', from: TIER_Z0, to: TIER_Z1, y0: FLOOR, y1: FLOOR + TOP } },
    { minX: 5.5, maxX: 5.95, minZ: -12.3, maxZ: TIER_Z1, y: FLOOR, ramp: { axis: 'z', from: TIER_Z0, to: TIER_Z1, y0: FLOOR, y1: FLOOR + TOP } },
    { minX: -5.95, maxX: -5.5, minZ: -12.3, maxZ: TIER_Z1, y: FLOOR, ramp: { axis: 'z', from: TIER_Z0, to: TIER_Z1, y0: FLOOR, y1: FLOOR + TOP } },
    // gentle back ramp (1:8.8) down to the entrance level
    { minX: -5.7, maxX: 5.7, minZ: TIER_Z1 - 0.3, maxZ: BACK_RAMP_END, y: FLOOR + TOP, ramp: { axis: 'z', from: TIER_Z1, to: BACK_RAMP_END, y0: FLOOR + TOP, y1: FLOOR } },
    { minX: -5.7, maxX: 5.7, minZ: BACK_RAMP_END - 0.1, maxZ: 4.4, y: FLOOR },
    { minX: -0.85, maxX: 0.85, minZ: 3.8, maxZ: 6.0, y: FLOOR },
  ];
  const colliders = [
    { minX: AISLE, maxX: BLOCK_X1, minZ: TIER_Z0, maxZ: TIER_Z1, minY: FLOOR - 0.2, maxY: FLOOR + TOP + 1.2 },
    { minX: -BLOCK_X1, maxX: -AISLE, minZ: TIER_Z0, maxZ: TIER_Z1, minY: FLOOR - 0.2, maxY: FLOOR + TOP + 1.2 },
    { minX: -SCREEN_W / 2 - 0.8, maxX: SCREEN_W / 2 + 0.8, minZ: Z0, maxZ: Z0 + 1.2, minY: FLOOR - 0.2, maxY: FLOOR + 0.6 },
    { minX: X0, maxX: -0.9, minZ: Z1 - 0.1, maxZ: Z1 + 0.05, minY: FLOOR - 0.2, maxY: CEIL },
    { minX: 0.9, maxX: X1, minZ: Z1 - 0.1, maxZ: Z1 + 0.05, minY: FLOOR - 0.2, maxY: CEIL },
  ];

  function setScreenOn(on) { screen.material = on ? screenOn : screenOff; }
  function sample() {
    try {
      sctx.drawImage(video, 0, 0, 4, 4);
      const d = sctx.getImageData(0, 0, 4, 4).data;
      let r = 0, g = 0, b = 0;
      for (let i = 0; i < 64; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; }
      r /= 16 * 255; g /= 16 * 255; b /= 16 * 255;
      const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      const mx = Math.max(r, g, b, 0.02);
      glowColT.setRGB(0.35 + 0.65 * r / mx, 0.35 + 0.65 * g / mx, 0.35 + 0.65 * b / mx);
      glowTarget = 3 + 55 * Math.pow(lum, 0.8);
    } catch (e) { glowTarget = 8; }
  }

  let retryAt = 0;
  function update(dt, frame) {
    const c = frame.camera.position;
    const inside = frame.level === 1 && c.z < Z1 && c.z > Z0 && Math.abs(c.x) < 6.6 && c.y > FLOOR - 0.5 && c.y < CEIL;
    if (inside && !playing && performance.now() > retryAt) {
      if (!started) { video.preload = 'auto'; started = true; }
      playing = true;
      const pr = video.play(); if (pr && pr.catch) pr.catch(() => { playing = false; retryAt = performance.now() + 3000; });
    } else if (!inside && playing) {
      playing = false; video.pause();
    }
    const live = playing && video.readyState >= 2 && !video.paused;
    if (live) {
      if (screen.material !== screenOn) setScreenOn(true);
      glowAcc += dt;
      if (glowAcc > 0.5) { glowAcc = 0; sample(); }
    } else {
      if (screen.material !== screenOff) setScreenOn(false);
      glowTarget = 7; glowColT.setRGB(0.9, 0.9, 0.88);
    }
    const k = Math.min(1, dt * 3);
    glowI += (glowTarget - glowI) * k;
    glowCol.lerp(glowColT, k);
    // lights only matter on level 1; keep the count constant, fade intensities
    const on = frame.level === 1 ? 1 : 0;
    filmLight.color.copy(glowCol);
    filmLight.intensity = glowI * on;
    for (const l of roomLights) l.intensity = 16 * on;
  }

  function onPick(obj) {
    if (!obj || !obj.userData.action || obj.userData.action.id !== 'cinema-sound') return;
    video.muted = !video.muted;
    if (!video.muted && video.paused && playing) video.play().catch(() => {});
    if (ctx.ui && ctx.ui.toast) ctx.ui.toast(video.muted ? 'Sound off' : 'Sound on');
  }

  return { group, regions, colliders, pickables: [screen, ...sitProxies], seats, update, onPick };
}

// soft radial / elliptical glow texture
function glowTexture(n, rgb, tall = false) {
  const c = document.createElement('canvas'); c.width = n; c.height = n;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2);
  grd.addColorStop(0, `rgba(${rgb},0.55)`); grd.addColorStop(0.45, `rgba(${rgb},0.16)`); grd.addColorStop(1, `rgba(${rgb},0)`);
  g.fillStyle = grd; g.fillRect(0, 0, n, n);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
