// parterre.js — two formal clipped-box parterres flanking the entrance plaza
// (BRIEF §6.1: x ±(5.5…10), z 21…35). Each bed: a whiteSandstone kerb, pale
// gravel inside, a hedge frame with a central diamond and four corner squares,
// and four clipped box cones at the frame corners. Mirror images about x = 0.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const KERB_H = 0.12;
const KERB_W = 0.25;
const GRAVEL_Y = 0.02;          // gravel surface, just below the kerb top
const HEDGE_W = 0.35;           // hedge width
const HEDGE_H = 0.45;           // hedge height
const BED_Z0 = 21, BED_Z1 = 35;
const BED_Z = (BED_Z0 + BED_Z1) / 2;
const BED_X_OUT = 10, BED_X_IN = 5.5;   // distances from x = 0
const BED_HALF_X = (BED_X_OUT - BED_X_IN) / 2;   // 2.25
const BED_CX = (BED_X_OUT + BED_X_IN) / 2;       // 7.75

// Pattern centre-lines, relative to the bed centre.
const FRAME_HX = 1.6, FRAME_HZ = 6.2;
const DIA_HX = 1.2, DIA_HZ = 2.6;
const SQ_X = 0.95, SQ_Z = 5.0, SQ_S = 0.6;
const CONE_TIERS = [[0.44, 0.36], [0.30, 0.26], [0.16, 0.24]]; // [width, height]

const _up = new THREE.Vector3(1, 0, 0);
const _dir = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _m = new THREE.Matrix4();
const _pos = new THREE.Vector3();
const _scale = new THREE.Vector3(1, 1, 1);

function place(geo, x, y, z, qy = 0) {
  _q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), qy);
  _pos.set(x, y, z);
  _m.compose(_pos, _q, _scale);
  geo.applyMatrix4(_m);
  return geo;
}

// A hedge bar between two plan points (x,z), extended by half a hedge width at
// each end so joints close cleanly.
function hedgeBar(out, segs, ax, az, bx, bz, baseY) {
  const dx = bx - ax, dz = bz - az;
  const len = Math.hypot(dx, dz) + HEDGE_W;
  _dir.set(dx, 0, dz).normalize();
  _q.setFromUnitVectors(_up, _dir);
  _pos.set((ax + bx) / 2, baseY + HEDGE_H / 2, (az + bz) / 2);
  _m.compose(_pos, _q, _scale);
  const g = new RoundedBoxGeometry(len, HEDGE_H, HEDGE_W, segs, 0.06);
  g.applyMatrix4(_m);
  out.push(g);
}

function hedgeSquare(out, segs, cx, cz, size, baseY) {
  const g = new RoundedBoxGeometry(size, HEDGE_H, size, segs, 0.06);
  out.push(place(g, cx, baseY + HEDGE_H / 2, cz));
}

// Clipped box cone: three stacked rounded boxes, narrowing and flat-topped.
function clippedCone(out, segs, cx, cz, baseY) {
  let y = baseY;
  for (const [w, h] of CONE_TIERS) {
    const g = new RoundedBoxGeometry(w, h, w, segs, 0.03);
    out.push(place(g, cx, y + h / 2, cz));
    y += h;
  }
}

function buildBed(cx, cz, segs, parts) {
  const { kerb, gravel, hedge, cone } = parts;
  const hx = BED_HALF_X, hz = (BED_Z1 - BED_Z0) / 2;

  // Kerb: four boxes forming a ring of width KERB_W inside the footprint.
  const k = KERB_W;
  const kerbPieces = [
    [cx, cz - hz + k / 2, 2 * hx, k],          // south (low z)
    [cx, cz + hz - k / 2, 2 * hx, k],          // north
    [cx - hx + k / 2, cz, k, 2 * hz - 2 * k],  // west
    [cx + hx - k / 2, cz, k, 2 * hz - 2 * k],  // east
  ];
  for (const [x, z, w, d] of kerbPieces) {
    const g = new THREE.BoxGeometry(w, KERB_H, d);
    kerb.push(place(g, x, KERB_H / 2, z));
  }

  // Gravel infill, inside the kerb.
  const gw = 2 * hx - 2 * k, gd = 2 * hz - 2 * k;
  const gp = new THREE.PlaneGeometry(gw, gd);
  gp.rotateX(-Math.PI / 2);
  gravel.push(place(gp, cx, GRAVEL_Y, cz));

  // Hedge frame (rectangle, corners at ±FRAME_HX, ±FRAME_HZ).
  const fx = FRAME_HX, fz = FRAME_HZ;
  const frame = [
    [cx - fx, cz - fz, cx + fx, cz - fz],
    [cx + fx, cz - fz, cx + fx, cz + fz],
    [cx + fx, cz + fz, cx - fx, cz + fz],
    [cx - fx, cz + fz, cx - fx, cz - fz],
  ];
  for (const [ax, az, bx, bz] of frame) hedgeBar(hedge, segs, ax, az, bx, bz, GRAVEL_Y);

  // Central diamond (rhombus).
  const dia = [
    [cx, cz + DIA_HZ], [cx + DIA_HX, cz], [cx, cz - DIA_HZ], [cx - DIA_HX, cz],
  ];
  for (let i = 0; i < 4; i++) {
    const [ax, az] = dia[i], [bx, bz] = dia[(i + 1) % 4];
    hedgeBar(hedge, segs, ax, az, bx, bz, GRAVEL_Y);
  }

  // Four corner squares, mirrored in both axes.
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    hedgeSquare(hedge, segs, cx + sx * SQ_X, cz + sz * SQ_Z, SQ_S, GRAVEL_Y);
  }

  // Four clipped cones on the frame corners.
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    clippedCone(cone, segs, cx + sx * fx, cz + sz * fz, GRAVEL_Y);
  }
}

export function build(ctx) {
  const { M, quality = 'high' } = ctx;
  const low = quality === 'low';
  const segs = low ? 1 : 3;

  const parts = { kerb: [], gravel: [], hedge: [], cone: [] };
  for (const sign of [1, -1]) {
    buildBed(sign * BED_CX, BED_Z, segs, parts);
  }

  const group = new THREE.Group();
  group.name = 'parterre';

  const add = (list, material, name, castShadow) => {
    if (!list.length) return;
    const merged = mergeGeometries(list, false);
    for (const g of list) g.dispose();
    M.boxUV(merged);
    const mesh = new THREE.Mesh(merged, material);
    mesh.name = name;
    mesh.castShadow = castShadow;
    mesh.receiveShadow = true;
    group.add(mesh);
  };

  add(parts.kerb, M.get('whiteSandstone'), 'parterreKerb', true);
  add(parts.gravel, M.get('gravel', { color: 0xf4efe4 }), 'parterreGravel', false);
  add(parts.hedge, M.get('leaves', { color: 0x3d5a2a }), 'parterreHedge', true);
  add(parts.cone, M.get('leaves', { color: 0x3d5a2a }), 'parterreCone', true);

  return {
    group,
    regions: [],
    colliders: [
      { minX: 5.4, maxX: 10.1, minZ: 20.9, maxZ: 35.1, minY: 0, maxY: 1 },
      { minX: -10.1, maxX: -5.4, minZ: 20.9, maxZ: 35.1, minY: 0, maxY: 1 },
    ],
    pickables: [],
    update() {},
  };
}
