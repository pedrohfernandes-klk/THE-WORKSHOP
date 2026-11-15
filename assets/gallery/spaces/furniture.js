// furniture.js — outdoor furniture on the entrance plaza (BRIEF §6.1 / §6.2).
// Benches, lamp posts, litter bins, a bike rack and bollards, all in world
// coordinates, real dimensions, instanced by part. Ground is y = 0.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const ONE = new THREE.Vector3(1, 1, 1);
const AXIS_Y = new THREE.Vector3(0, 1, 0);

/** Local transform (x, y, z, rotation about Y) optionally placed under `parent`. */
function T(x, y, z, ry = 0, parent = null) {
  const q = new THREE.Quaternion().setFromAxisAngle(AXIS_Y, ry);
  const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), q, ONE);
  return parent ? new THREE.Matrix4().multiplyMatrices(parent, m) : m;
}

export function build(ctx) {
  const { M, quality } = ctx;
  const low = quality === 'low';
  const group = new THREE.Group();
  group.name = 'furniture';

  // Materials: blackened steel for street furniture, brushed stainless for
  // the bike rack and bollards, oak for the bench slats.
  const oak = M.get('oak');
  const blackSteel = M.get('steel', { color: 0x2c2e31, roughness: 0.5 });
  const stainless = M.get('steel', { color: 0xe6e9ec, roughness: 0.22, tile: 0.35 });
  const lensMat = new THREE.MeshStandardMaterial({
    color: 0xf6f1e8, emissive: 0xffd9a0, emissiveIntensity: 0.45, roughness: 0.2,
  });

  // Each part kind keeps one geometry and a list of instance matrices.
  const parts = new Map();
  function add(key, geometry, material, m) {
    let e = parts.get(key);
    if (!e) { e = { geometry, material, mats: [] }; parts.set(key, e); }
    e.mats.push(m);
  }
  const uv = (g) => M.boxUV(g);

  // ---- Geometries at real size (instance matrices only position/rotate) ----
  const slatCount = low ? 3 : 5;
  const slatW = low ? 0.12 : 0.08;
  const slatGap = low ? 0.04 : 0.02;
  const slatGeo = uv(new RoundedBoxGeometry(1.8, 0.05, slatW, 2, 0.012));
  const legGeo = uv(new RoundedBoxGeometry(0.05, 0.42, 0.05, 2, 0.012));
  const stretcherGeo = uv(new RoundedBoxGeometry(0.035, 0.03, 0.45, 1, 0.008));
  const railGeo = uv(new RoundedBoxGeometry(0.05, 0.04, 0.5, 2, 0.01));

  const poleGeo = uv(new THREE.CylinderGeometry(0.05, 0.05, 4.4, low ? 10 : 16));
  const baseGeo = uv(new THREE.CylinderGeometry(0.1, 0.12, 0.03, 20));
  const headGeo = uv(new THREE.CylinderGeometry(0.1, 0.12, 0.1, 24));
  const lensGeo = new THREE.CylinderGeometry(0.095, 0.095, 0.015, 24);

  const binBodyGeo = uv(new THREE.CylinderGeometry(0.19, 0.2, 0.76, low ? 12 : 28));
  const binLidGeo = uv(new THREE.CylinderGeometry(0.205, 0.205, 0.04, low ? 12 : 28));

  const hoopGeo = uv(new THREE.TorusGeometry(0.3, 0.016, 8, low ? 12 : 24, Math.PI));
  const hoopLegGeo = uv(new THREE.CylinderGeometry(0.016, 0.016, 0.4, 8));

  const bollardGeo = uv(new THREE.CylinderGeometry(0.075, 0.075, 0.825, low ? 12 : 24));
  const bollardCapGeo = uv(new THREE.SphereGeometry(0.075, low ? 12 : 24, 8, 0, Math.PI * 2, 0, Math.PI / 2));

  // ---- Benches: 6 at x = ±13, z = 24, 29.5, 35 --------------------------------
  // Bench local frame: length along +X (1.8 m), depth along +Z (0.5 m), front +Z.
  // Left bench rotated +90° so its front faces +X; right bench −90° so it faces −X
  // (both toward the centre x = 0).
  const benches = [];
  for (const side of [-1, 1]) {
    for (const z of [24, 29.5, 35]) {
      benches.push({ x: side * 13, z, ry: side < 0 ? Math.PI / 2 : -Math.PI / 2 });
    }
  }
  const slatZs = [];
  for (let i = 0; i < slatCount; i++) {
    slatZs.push((i - (slatCount - 1) / 2) * (slatW + slatGap));
  }
  for (const b of benches) {
    const B = T(b.x, 0, b.z, b.ry);
    for (const sz of slatZs) add('slat', slatGeo, oak, T(0, 0.425, sz, 0, B));
    for (const fx of [-0.6, 0.6]) {
      for (const lz of [-0.2, 0.2]) add('benchLeg', legGeo, blackSteel, T(fx, 0.21, lz, 0, B));
      add('benchStretcher', stretcherGeo, blackSteel, T(fx, 0.1, 0, 0, B));
      add('benchRail', railGeo, blackSteel, T(fx, 0.38, 0, 0, B));
    }
  }

  // ---- Lamp posts: x = ±13.5 at z 20, 38, 46 and x = ±4.5 at z 46 -----------
  const lamps = [];
  for (const z of [20, 38, 46]) for (const x of [-13.5, 13.5]) lamps.push({ x, z });
  for (const x of [-4.5, 4.5]) lamps.push({ x, z: 46 });
  for (const l of lamps) {
    add('lampPole', poleGeo, blackSteel, T(l.x, 2.2, l.z));
    if (!low) add('lampBase', baseGeo, blackSteel, T(l.x, 0.015, l.z));
    add('lampHead', headGeo, blackSteel, T(l.x, 4.45, l.z));
    add('lampLens', lensGeo, lensMat, T(l.x, 4.39, l.z));
  }

  // ---- Litter bins: beside the benches at (±13, 26.6) and (±13, 36.6) -------
  const bins = [];
  for (const z of [26.6, 36.6]) for (const x of [-13, 13]) bins.push({ x, z });
  for (const b of bins) {
    add('binBody', binBodyGeo, blackSteel, T(b.x, 0.38, b.z));
    add('binLid', binLidGeo, blackSteel, T(b.x, 0.78, b.z));
  }

  // ---- Bike rack: 5 stainless hoops at x −5 … −3, z 19.6 ---------------------
  // Hoops lie in the y–z plane (rotated 90° about Y), legs at z = 19.6 ± 0.3.
  const rackZ = 19.6;
  const rackXs = [-5, -4.5, -4, -3.5, -3];
  for (const x of rackXs) {
    add('hoop', hoopGeo, stainless, T(x, 0.4, rackZ, Math.PI / 2));
    add('hoopLeg', hoopLegGeo, stainless, T(x, 0.2, rackZ - 0.3));
    add('hoopLeg', hoopLegGeo, stainless, T(x, 0.2, rackZ + 0.3));
  }

  // ---- Bollards: 0.9 m stainless at z = 19.2, x = ±2.6, ±4.0, ±5.4 ----------
  const bollards = [];
  for (const x of [-5.4, -4.0, -2.6, 2.6, 4.0, 5.4]) bollards.push({ x, z: 19.2 });
  for (const b of bollards) {
    add('bollard', bollardGeo, stainless, T(b.x, 0.4125, b.z));
    add('bollardCap', bollardCapGeo, stainless, T(b.x, 0.825, b.z));
  }

  // ---- Instantiate one InstancedMesh per part kind --------------------------
  for (const e of parts.values()) {
    const im = new THREE.InstancedMesh(e.geometry, e.material, e.mats.length);
    for (let i = 0; i < e.mats.length; i++) im.setMatrixAt(i, e.mats[i]);
    im.instanceMatrix.needsUpdate = true;
    im.castShadow = true;
    im.receiveShadow = true;
    im.computeBoundingSphere();
    group.add(im);
  }

  // ---- Colliders: one AABB per bench / bin / rack / lamp / bollard -----------
  const colliders = [];
  for (const b of benches) {
    // Bench footprint: 1.8 m along Z (rotated), 0.5 m across X.
    colliders.push({ minX: b.x - 0.26, maxX: b.x + 0.26, minZ: b.z - 0.92, maxZ: b.z + 0.92, minY: 0, maxY: 1.2 });
  }
  for (const b of bins) {
    colliders.push({ minX: b.x - 0.22, maxX: b.x + 0.22, minZ: b.z - 0.22, maxZ: b.z + 0.22, minY: 0, maxY: 1.2 });
  }
  colliders.push({ minX: -5.05, maxX: -2.95, minZ: rackZ - 0.32, maxZ: rackZ + 0.32, minY: 0, maxY: 1.2 });
  for (const l of lamps) {
    colliders.push({ minX: l.x - 0.12, maxX: l.x + 0.12, minZ: l.z - 0.12, maxZ: l.z + 0.12, minY: 0, maxY: 4.5 });
  }
  for (const b of bollards) {
    colliders.push({ minX: b.x - 0.08, maxX: b.x + 0.08, minZ: b.z - 0.08, maxZ: b.z + 0.08, minY: 0, maxY: 1.2 });
  }

  return {
    group,
    regions: [],
    colliders,
    pickables: [],
    update() {},
  };
}
