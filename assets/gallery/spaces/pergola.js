// Timber pergola walk over the east garden's main path (BRIEF §6.1 garden,
// path z 27.5…30.5, x 50…62, ground y 0). Oak posts on sandstone pad footings
// every 3 m, beams at 2.7 m, cross rafters every 0.6 m, a wisteria canopy of
// alpha-cut leaf cards with leafy shadows, twisting vine stems up four posts and
// hanging lilac racemes (instanced tapered cards) that sway gently.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export function build(ctx) {
  const { M, quality, renderer } = ctx;
  const low = quality === 'low';
  const reduced = !!ctx.reducedMotion;
  const group = new THREE.Group();
  group.name = 'pergola';

  // ---- deterministic randomness -------------------------------------------------
  let seed = 4242;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const rr = (a, b) => a + (b - a) * rnd();

  // ---- layout (metres) ----------------------------------------------------------
  const POST_X = [50, 53, 56, 59, 62];
  const POST_Z = [27.3, 30.7];
  const POST = 0.18;          // square post section
  const PAD_TOP = 0.12;       // top of sandstone pad footing
  const BEAM_TOP = 2.7;       // beam soffit-to-top line
  const RAFTER_Y = 2.8;       // rafter centre (sits on beams, 0.2 deep)
  const RAFTER_LEN = 3.8;     // z 27.1…30.9: slight overhang past the beams
  const RAFTER_STEP = 0.6;
  const ZC = 29.0;            // walk centre line

  // ---- materials ------------------------------------------------------------------
  const matOak = M.get('oak');
  const matStone = M.get('whiteSandstone');

  const aniso = renderer && renderer.capabilities ? renderer.capabilities.getMaxAnisotropy() : 4;

  // ---- procedural canvas textures ----------------------------------------------
  function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  function tex(c, srgb) {
    const t = new THREE.CanvasTexture(c);
    t.anisotropy = aniso;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  // Wisteria compound leaf: a rachis with paired leaflets. The colour canvas and
  // the alpha canvas share one layout so the cut-out matches the painted leaf.
  let ls = 91;
  const lrnd = () => ((ls = (ls * 1664525 + 1013904223) >>> 0) / 4294967296);
  const leaflets = [];
  for (let i = 0; i < 7; i++) {
    const y = 36 + i * 28;
    const side = i % 2 ? 1 : -1;
    for (const s of [-1, 1]) {
      if (i === 6 && s === -1) continue;
      leaflets.push({
        x: 128 + s * (34 + lrnd() * 10) + side * 4,
        y: y + lrnd() * 6,
        rx: 36 + lrnd() * 8, ry: 15 + lrnd() * 4,
        rot: s * (0.55 + lrnd() * 0.25) + (i - 3) * 0.02,
        g: 0.8 + lrnd() * 0.3,
      });
    }
  }
  leaflets.push({ x: 128, y: 14, rx: 22, ry: 13, rot: 0, g: 1 });

  const leafColourCanvas = canvas(256, 256);
  {
    const g = leafColourCanvas.getContext('2d');
    g.fillStyle = '#2f5a2a'; g.fillRect(0, 0, 256, 256);
    for (const l of leaflets) {
      const r = Math.round(50 * l.g), gg = Math.round(104 * l.g), b = Math.round(46 * l.g);
      g.beginPath(); g.ellipse(l.x, l.y, l.rx, l.ry, l.rot, 0, Math.PI * 2);
      g.fillStyle = `rgb(${r},${gg},${b})`; g.fill();
      // midrib
      const cx = Math.cos(l.rot), sy = Math.sin(l.rot);
      g.strokeStyle = 'rgba(190,220,140,0.45)'; g.lineWidth = 1.6;
      g.beginPath(); g.moveTo(l.x - cx * l.rx * 0.8, l.y - sy * l.rx * 0.8);
      g.lineTo(l.x + cx * l.rx * 0.8, l.y + sy * l.rx * 0.8); g.stroke();
    }
    // rachis
    g.strokeStyle = '#6b7a3c'; g.lineWidth = 3;
    g.beginPath(); g.moveTo(128, 250); g.lineTo(128, 12); g.stroke();
  }
  const leafAlphaCanvas = canvas(256, 256);
  {
    const g = leafAlphaCanvas.getContext('2d');
    g.fillStyle = '#000'; g.fillRect(0, 0, 256, 256);
    g.fillStyle = '#fff';
    for (const l of leaflets) { g.beginPath(); g.ellipse(l.x, l.y, l.rx, l.ry, l.rot, 0, Math.PI * 2); g.fill(); }
    g.strokeStyle = '#fff'; g.lineWidth = 3;
    g.beginPath(); g.moveTo(128, 250); g.lineTo(128, 12); g.stroke();
  }
  const leafMap = tex(leafColourCanvas, true);
  const leafAlpha = tex(leafAlphaCanvas, false);

  // Lilac raceme: a column of florets along the card (top = canvas top).
  let fs = 515;
  const frnd = () => ((fs = (fs * 1664525 + 1013904223) >>> 0) / 4294967296);
  const florets = [];
  for (let i = 0; i < 150; i++) {
    const y = 8 + frnd() * 240;
    const half = 54 * (1 - 0.6 * (y / 256));
    florets.push({
      x: 64 + (frnd() * 2 - 1) * half,
      y,
      r: 6 + frnd() * 5,
      h: 262 + frnd() * 18, s: 26 + frnd() * 14, l: 70 + frnd() * 14,
    });
  }
  const racemeColourCanvas = canvas(128, 256);
  {
    const g = racemeColourCanvas.getContext('2d');
    g.clearRect(0, 0, 128, 256);
    g.strokeStyle = '#5b6b3a'; g.lineWidth = 3;
    g.beginPath(); g.moveTo(64, 0); g.lineTo(64, 256); g.stroke();
    for (const f of florets) {
      g.beginPath(); g.arc(f.x, f.y, f.r, 0, Math.PI * 2);
      g.fillStyle = `hsl(${f.h} ${f.s}% ${f.l}%)`; g.fill();
      g.beginPath(); g.arc(f.x, f.y + 2, f.r * 0.35, 0, Math.PI * 2);
      g.fillStyle = 'rgb(232,205,120)'; g.fill();
    }
  }
  const racemeAlphaCanvas = canvas(128, 256);
  {
    const g = racemeAlphaCanvas.getContext('2d');
    g.fillStyle = '#000'; g.fillRect(0, 0, 128, 256);
    g.fillStyle = '#fff'; g.strokeStyle = '#fff'; g.lineWidth = 3;
    g.beginPath(); g.moveTo(64, 0); g.lineTo(64, 256); g.stroke();
    for (const f of florets) { g.beginPath(); g.arc(f.x, f.y, f.r, 0, Math.PI * 2); g.fill(); }
  }
  const racemeMap = tex(racemeColourCanvas, true);
  const racemeAlpha = tex(racemeAlphaCanvas, false);

  // ---- materials for leaves, racemes, vines --------------------------------------
  const matLeaves = new THREE.MeshStandardMaterial({
    map: leafMap, alphaMap: leafAlpha, alphaTest: 0.5, side: THREE.DoubleSide,
    roughness: 0.7, metalness: 0,
  });
  const matLeafDepth = new THREE.MeshDepthMaterial({
    depthPacking: THREE.RGBADepthPacking, alphaMap: leafAlpha, alphaTest: 0.5, side: THREE.DoubleSide,
  });
  const matRaceme = new THREE.MeshStandardMaterial({
    map: racemeMap, alphaMap: racemeAlpha, alphaTest: 0.5, side: THREE.DoubleSide,
    roughness: 0.55, metalness: 0,
  });
  const matVine = new THREE.MeshStandardMaterial({ color: 0x4f5c33, roughness: 0.9, metalness: 0 });

  // ---- structure: footings, posts, beams, rafters (merged per material) ---------
  const oakParts = [];
  const stoneParts = [];
  function boxPart(bucket, w, h, d, x, y, z) {
    const g = new THREE.BoxGeometry(w, h, d);
    g.translate(x, y, z);
    M.boxUV(g);
    bucket.push(g);
  }

  for (const x of POST_X) {
    for (const z of POST_Z) {
      boxPart(stoneParts, 0.4, PAD_TOP, 0.4, x, PAD_TOP / 2, z);
      // post runs into the beam; its top sits inside the beam so no coplanar faces
      const top = BEAM_TOP - 0.1;
      boxPart(oakParts, POST, top - PAD_TOP, POST, x, (PAD_TOP + top) / 2, z);
    }
  }
  const beamX0 = POST_X[0] - 0.1, beamX1 = POST_X[POST_X.length - 1] + 0.1;
  for (const z of POST_Z) {
    boxPart(oakParts, beamX1 - beamX0, 0.22, 0.2, (beamX0 + beamX1) / 2, BEAM_TOP - 0.11, z);
  }
  const rafterCount = Math.round((POST_X[POST_X.length - 1] - POST_X[0]) / RAFTER_STEP) + 1;
  for (let i = 0; i < rafterCount; i++) {
    const x = POST_X[0] + i * RAFTER_STEP;
    boxPart(oakParts, 0.06, 0.2, RAFTER_LEN, x, RAFTER_Y, ZC);
  }

  function addMerged(parts, mat, cast = true) {
    const geo = mergeGeometries(parts, false);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = cast;
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  }
  addMerged(oakParts, matOak);
  addMerged(stoneParts, matStone, false);

  // ---- canopy of wisteria leaf cards --------------------------------------------
  const dummy = new THREE.Object3D();
  dummy.rotation.order = 'YXZ';
  const leafCount = low ? 220 : 640;
  const leafParts = [];
  for (let i = 0; i < leafCount; i++) {
    const w = rr(0.36, 0.52);
    const geo = new THREE.PlaneGeometry(w, w * 0.8);
    dummy.position.set(rr(49.7, 62.3), rr(2.92, 3.25), rr(26.8, 31.2));
    // yaw about world Y applied after laying the card flat (YXZ order)
    dummy.rotation.set(rr(-Math.PI, Math.PI), -Math.PI / 2 + rr(-0.5, 0.5), rr(-0.25, 0.25));
    dummy.updateMatrix();
    geo.applyMatrix4(dummy.matrix);
    leafParts.push(geo);
  }
  const leaves = addMerged(leafParts, matLeaves);
  leaves.customDepthMaterial = matLeafDepth;

  // ---- twisting vine stems up four posts --------------------------------------
  const vinePosts = low
    ? [[53, POST_Z[0], 1.3], [62, POST_Z[1], 1.9]]
    : [[53, POST_Z[0], 1.3], [56, POST_Z[1], 2.1], [59, POST_Z[0], 0.6], [62, POST_Z[1], 1.9]];
  const vineParts = [];
  for (const [cx, cz, phase] of vinePosts) {
    const pts = [];
    const N = 60, turns = 1.6, yTop = 2.3;
    for (let k = 0; k <= N; k++) {
      const t = k / N;
      const y = 0.2 + t * (yTop - 0.2);
      const th = phase + t * turns * Math.PI * 2;
      const r = 0.125 + 0.012 * Math.sin(t * 9);
      pts.push(new THREE.Vector3(cx + r * Math.cos(th), y, cz + r * Math.sin(th)));
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    vineParts.push(new THREE.TubeGeometry(curve, 90, 0.011, 6, false));
  }
  const vines = addMerged(vineParts, matVine);
  vines.castShadow = true;

  // ---- hanging lilac racemes: instanced tapered cards ---------------------------
  // Unit card: top width 1, bottom 0.36 of that, length 1 downward. Instances scale
  // it to width x length and hang from the canopy in the gaps between rafters.
  const racemeGeo = new THREE.BufferGeometry();
  racemeGeo.setAttribute('position', new THREE.Float32BufferAttribute([
    -0.5, 0, 0,   0.5, 0, 0,   0.18, -1, 0,   -0.18, -1, 0,
  ], 3));
  racemeGeo.setAttribute('normal', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1], 3));
  racemeGeo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 1, 1, 1, 0.82, 0, 0.18, 0], 2));
  racemeGeo.setIndex([0, 2, 1, 0, 3, 2]);

  const RAFTER_GAPS = Math.round((POST_X[POST_X.length - 1] - POST_X[0]) / RAFTER_STEP);
  const racemeCount = low ? 60 : 170;
  const racemes = new THREE.InstancedMesh(racemeGeo, matRaceme, racemeCount);
  racemes.castShadow = false;
  racemes.receiveShadow = true;
  racemes.frustumCulled = false;

  const basePos = [], baseYaw = [], baseScale = [], swayAmp = [], swayFreq = [], swayPhase = [];
  for (let i = 0; i < racemeCount; i++) {
    const gap = Math.floor(rnd() * RAFTER_GAPS);
    const x = POST_X[0] + RAFTER_STEP * gap + RAFTER_STEP / 2 + (rnd() - 0.5) * 0.2;
    const z = rr(27.6, 30.4);
    const y = rr(2.86, 2.92);
    const w = rr(0.085, 0.12), L = rr(0.35, 0.7);
    basePos.push(new THREE.Vector3(x, y, z));
    baseYaw.push(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rr(0, Math.PI * 2)));
    baseScale.push(new THREE.Vector3(w, L, 1));
    swayAmp.push(rr(0.05, 0.12));
    swayFreq.push(rr(0.7, 1.3));
    swayPhase.push(rnd() * Math.PI * 2);
  }
  group.add(racemes);

  // Pre-allocated scratch objects: the sway update does no allocation per frame.
  const AXIS_Z = new THREE.Vector3(0, 0, 1);
  const tmpSway = new THREE.Quaternion();
  const tmpQuat = new THREE.Quaternion();
  const tmpMat = new THREE.Matrix4();

  function placeRacemes(time) {
    for (let i = 0; i < racemeCount; i++) {
      tmpSway.setFromAxisAngle(AXIS_Z, swayAmp[i] * Math.sin(time * swayFreq[i] + swayPhase[i]));
      tmpQuat.multiplyQuaternions(baseYaw[i], tmpSway);
      tmpMat.compose(basePos[i], tmpQuat, baseScale[i]);
      racemes.setMatrixAt(i, tmpMat);
    }
    racemes.instanceMatrix.needsUpdate = true;
  }
  placeRacemes(0);

  // ---- colliders: one 0.4 m box per post ---------------------------------------
  const colliders = [];
  for (const x of POST_X) {
    for (const z of POST_Z) {
      colliders.push({ minX: x - 0.2, maxX: x + 0.2, minZ: z - 0.2, maxZ: z + 0.2, minY: 0, maxY: 2.7 });
    }
  }

  let time = 0;
  return {
    group,
    regions: [],
    colliders,
    pickables: [],
    update(dt) {
      if (reduced) return;
      time += dt;
      placeRacemes(time);
    },
  };
}
