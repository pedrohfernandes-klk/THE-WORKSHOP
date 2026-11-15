// First-person viewmodel hands with procedural gestures. Attached to the camera.
// createPlayer(camera, { reducedMotion }) -> { group, gesture(name), busy, update(dt, {speed,jumping,turnRate}),
//   cameraOffset:{y,roll}, onClap, dispose() }
import * as THREE from 'three';

export const GESTURES = ['wave', 'thumbs', 'clap', 'point', 'shrug', 'dance', 'peace'];

const DEPTH = 0.5;            // hands live ~0.5 m in front of the eye
const RISE = 0.4, FALL = 0.45;
// pose layout: 0-2 pos, 3-5 euler xyz, 6-10 curl (thumb,index,middle,ring,pinky), 11 finger spread
const N = 12;
const MCP = 1.4, PIP = 1.8, DIP = 1.1;
const FAN = [1.0, -0.4, -0.7, -1.1];
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const ease = (x) => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };

function S(a, px, py, pz, rx, ry, rz, sp, cT, cI, cM, cR, cP) {
  a[0] = px; a[1] = py; a[2] = pz; a[3] = rx; a[4] = ry; a[5] = rz; a[11] = sp;
  a[6] = cT; a[7] = cI; a[8] = cM; a[9] = cR; a[10] = cP;
}

// ctx: t, dur, R, L (pose arrays), cam{y,roll}, clap(n)
const G = {
  wave: { dur: 2.2, f(t, c) {
    const w = Math.sin(t * 13);
    S(c.R, 0.15 + w * 0.02, -0.12, -0.02, 0, -0.25, 0.1 + w * 0.32, 0.5, 0, 0, 0, 0, 0);
  } },
  thumbs: { dur: 1.9, f(t, c) {
    const b = Math.sin(clamp((t - 0.5) / 0.8, 0, 1) * Math.PI) * 0.03;
    S(c.R, 0.13, -0.14 + b, 0, -0.1, 0.9, 0.15, 0.1, 0, 1, 1, 1, 1);
    S(c.L, -0.13, -0.14 + b, 0, -0.1, -0.9, -0.15, 0.1, 0, 1, 1, 1, 1);
  } },
  clap: { dur: 2.1, f(t, c) {
    const cy = (t - 0.4) / 0.4;
    const k = clamp(cy, 0, 3);
    const open = 0.5 + 0.5 * Math.cos(k * Math.PI * 2);
    const x = 0.015 + 0.06 * open;
    S(c.R, x, -0.1, -0.02, -0.1, 1.45, 0.2, 0.1, 0, 0, 0, 0, 0);
    S(c.L, -x, -0.1, -0.02, -0.1, -1.45, -0.2, 0.1, 0, 0, 0, 0, 0);
    const n = Math.floor(cy + 0.5);
    if (cy >= 0 && n > c.state.claps && n <= 3) { c.state.claps = n; c.clap(n); }
  } },
  point: { dur: 2.0, f(t, c) {
    const jab = Math.max(0, Math.sin(clamp(t - 0.5, 0, 1.1) * 8));
    S(c.R, 0.1, -0.1, -0.04 - 0.05 * jab, -1.05, -0.1, 0, 0.15, 0.7, 0, 1, 1, 1);
  } },
  shrug: { dur: 2.0, f(t, c) {
    const s = Math.sin(clamp((t - 0.3) / 1.3, 0, 1) * Math.PI);
    const y = -0.22 + 0.03 * s;
    S(c.R, 0.23, y, 0, -1.3, Math.PI, 0, 0.25, 0.3, 0.25, 0.25, 0.25, 0.3);
    S(c.L, -0.23, y, 0, -1.3, -Math.PI, 0, 0.25, 0.3, 0.25, 0.25, 0.25, 0.3);
    c.cam.y = 0.03 * s; c.cam.roll = 0.012 * Math.sin(t * 5) * s;
  } },
  dance: { dur: 2.5, f(t, c) {
    const a = Math.sin(t * 9), b = Math.sin(t * 9 + Math.PI), q = Math.sin(t * 18);
    const sn = Math.pow(Math.max(0, Math.sin(t * Math.PI * 4)), 8);
    const sn2 = Math.pow(Math.max(0, Math.sin(t * Math.PI * 4 + Math.PI)), 8);
    S(c.R, 0.13 + 0.05 * a, -0.15 + 0.03 * q, -0.02, -0.3, Math.PI + 0.5 * a, 0.3 * a, 0.5, 0.5 * sn, 0.2, 0.2 + 0.8 * sn, 0.2, 0.2);
    S(c.L, -0.13 - 0.05 * b, -0.15 - 0.03 * q, -0.02, -0.3, -Math.PI + 0.5 * b, 0.3 * b, 0.5, 0.5 * sn2, 0.2, 0.2 + 0.8 * sn2, 0.2, 0.2);
    c.cam.roll = 0.02 * a; c.cam.y = 0.01 * q;
  } },
  peace: { dur: 1.9, f(t, c) {
    const w = Math.sin(clamp(t - 0.6, 0, 1) * Math.PI * 2) * 0.05;
    S(c.R, 0.14, -0.12 + w * 0.3, -0.02, -0.15, -0.35, 0.15 + w, 0.4, 0.8, 0, 0, 1, 1);
  } },
};

function buildHand(skin, jacket, trim, geos) {
  const root = new THREE.Group();
  const add = (parent, geo, mat, x, y, z) => {
    geos.push(geo);
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z); m.renderOrder = 999; m.frustumCulled = false;
    parent.add(m); return m;
  };
  // sleeve + wrist
  add(root, new THREE.CylinderGeometry(0.038, 0.042, 0.26, 20), jacket, 0, -0.175, 0);
  add(root, new THREE.TorusGeometry(0.039, 0.007, 8, 24), trim, 0, -0.045, 0).rotation.x = Math.PI / 2;
  add(root, new THREE.CylinderGeometry(0.024, 0.026, 0.07, 16), skin, 0, -0.025, 0);
  // palm
  const palm = add(root, new THREE.SphereGeometry(1, 20, 14), skin, 0, 0.045, 0);
  palm.scale.set(0.037, 0.05, 0.02);
  const fingers = [];
  const mk = (px, py, lens, r, ang) => {
    const base = new THREE.Group(); base.position.set(px, py, 0); root.add(base);
    const joints = []; let parent = base;
    for (let i = 0; i < lens.length; i++) {
      const j = new THREE.Group(); if (i) j.position.y = lens[i - 1];
      parent.add(j);
      const m = add(j, new THREE.CapsuleGeometry(r * (1 - i * 0.06), lens[i], 4, 10), skin, 0, lens[i] / 2, 0);
      m.renderOrder = 999;
      joints.push(j); parent = j;
    }
    return { base, joints, ang };
  };
  fingers.push(mk(-0.034, 0.03, [0.03, 0.026], 0.0105, 0)); // thumb
  const xs = [-0.0235, -0.0078, 0.0078, 0.0235];
  const L = [[0.032, 0.02, 0.018], [0.035, 0.022, 0.019], [0.032, 0.02, 0.018], [0.025, 0.016, 0.015]];
  for (let i = 0; i < 4; i++) fingers.push(mk(xs[i], 0.088, L[i], i === 3 ? 0.0075 : 0.0085, 0));
  fingers[0].base.rotation.z = 0.5;
  return { root, fingers };
}

function applyHand(h, p) {
  h.root.position.set(p[0], p[1], p[2]);
  h.root.rotation.set(p[3], p[4], p[5]);
  const f = h.fingers;
  const t = f[0].joints;
  t[0].rotation.x = -p[6] * 0.4; t[0].rotation.z = -p[6] * 0.7;
  t[1].rotation.x = -p[6] * 0.5; t[1].rotation.z = -p[6] * 0.3;
  for (let i = 1; i < 5; i++) {
    const c = p[5 + i], fi = f[i], j = fi.joints;
    fi.base.rotation.z = p[11] * FAN[i - 1];
    j[0].rotation.x = -c * MCP; j[1].rotation.x = -c * PIP; j[2].rotation.x = -c * DIP;
  }
}

export function createPlayer(camera, { reducedMotion = false } = {}) {
  const group = new THREE.Group();
  group.position.set(0, 0, -DEPTH);
  group.renderOrder = 999;
  group.visible = false;

  const skin = new THREE.MeshPhysicalMaterial({
    color: 0xe2ae96, roughness: 0.55, metalness: 0, sheen: 1, sheenRoughness: 0.45,
    sheenColor: new THREE.Color(0xff8c70), clearcoat: 0.04, clearcoatRoughness: 0.6,
    emissive: 0x2a1510, emissiveIntensity: 0.6, fog: false,
  });
  const jacket = new THREE.MeshStandardMaterial({ color: 0x1c2230, roughness: 0.92, emissive: 0x05070c, fog: false });
  const trim = new THREE.MeshStandardMaterial({ color: 0x343c50, roughness: 0.8, emissive: 0x080a10, fog: false });
  const mats = [skin, jacket, trim];
  for (const m of mats) { m.depthTest = true; m.depthWrite = true; }
  const geos = [];

  const hR = buildHand(skin, jacket, trim, geos);
  const hL = buildHand(skin, jacket, trim, geos);
  hL.root.scale.x = -1;
  group.add(hR.root, hL.root);
  camera.add(group);

  const pR = new Float32Array(N), pL = new Float32Array(N);
  const rR = new Float32Array(N), rL = new Float32Array(N);
  const ctx = { t: 0, R: pR, L: pL, cam: { y: 0, roll: 0 }, state: { claps: 0 }, clap: null };
  const cameraOffset = { y: 0, roll: 0 };

  let cur = null, time = 0;
  let sN = 0, jumpK = 0, phase = 0, turn = 0;

  const player = {
    group, cameraOffset, onClap: null,
    get busy() { return cur !== null; },
    gesture(name) {
      if (cur || !G[name]) return false;
      cur = G[name]; time = 0; ctx.state.claps = 0;
      return true;
    },
    update(dt, { speed = 0, jumping = false, turnRate = 0 } = {}) {
      dt = Math.min(dt, 0.1);
      const k = 1 - Math.exp(-dt * 8);
      sN += (clamp(speed / 5, 0, 1) - sN) * k;
      jumpK += ((jumping ? 1 : 0) - jumpK) * (1 - Math.exp(-dt * (jumping ? 14 : 6)));
      turn += (clamp(turnRate, -3, 3) - turn) * k;
      phase += dt * (2 + speed * 1.4);

      // rest poses (hidden low at the edges; tips peek in when walking)
      const lift = sN * 0.14 + jumpK * 0.07;
      const sw = Math.sin(phase), sw2 = Math.abs(Math.sin(phase));
      const dx = -turn * 0.012;
      S(rR, 0.23 + sw * 0.012 * sN + dx, -0.64 + lift + sw2 * 0.015 * sN, 0, 0, 0, 0.35, 0.2, 0.3, 0.3, 0.3, 0.3, 0.3);
      S(rL, -0.23 - sw * 0.012 * sN + dx, -0.64 + lift + sw2 * 0.015 * sN, 0, 0, 0, -0.35, 0.2, 0.3, 0.3, 0.3, 0.3, 0.3);

      let cy = 0, cr = 0, active = false;
      if (cur) {
        time += dt;
        if (time >= cur.dur) { cur = null; }
        else {
          pR.set(rR); pL.set(rL);
          ctx.cam.y = 0; ctx.cam.roll = 0; ctx.clap = (n) => { if (player.onClap) player.onClap(n); };
          cur.f(time, ctx);
          const e = Math.min(ease(time / RISE), ease((cur.dur - time) / FALL));
          for (let i = 0; i < N; i++) {
            rR[i] += (pR[i] - rR[i]) * e;
            rL[i] += (pL[i] - rL[i]) * e;
          }
          rR[1] += jumpK * 0.02 * e; rL[1] += jumpK * 0.02 * e;
          if (!reducedMotion) { cy = ctx.cam.y * e; cr = ctx.cam.roll * e; }
          active = true;
        }
      }
      cameraOffset.y = cy; cameraOffset.roll = cr;
      applyHand(hR, rR); applyHand(hL, rL);
      group.visible = active || sN > 0.05 || jumpK > 0.02;
    },
    dispose() {
      camera.remove(group);
      for (const g of geos) g.dispose();
      for (const m of mats) m.dispose();
    },
  };
  return player;
}
