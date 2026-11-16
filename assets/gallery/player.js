import { reserveModuleVoice, finishModuleVoice } from './audio-lease.js';
// First-person viewmodel hands with procedural gestures. Attached to the camera.
// createPlayer(camera, { reducedMotion, audio }) -> { group, gesture(name), busy, update(dt, {speed,jumping,turnRate,stepPhase}),
//   cameraOffset:{y,roll}, onClap, onGestureStart(name), setAudio(audio), dispose() }
// The two cheeky ones (manguito, pirete) are always allowed, but censored: a
// chunky pixel mosaic covers the hand and a 1 kHz bip plays.
import * as THREE from 'three';

/** Friendly gestures (G picks among these). */
export const FRIENDLY = ['wave', 'thumbs', 'clap', 'point', 'shrug', 'dance', 'peace'];
/** Censored on screen. */
export const CHEEKY = ['manguito', 'pirete'];
export const GESTURES = [...FRIENDLY, ...CHEEKY];

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
  // A quick open-handed swipe right to left (main.js plays it for a slap).
  slap: { dur: 0.6, rise: 0.08, fall: 0.2, f(t, c) {
    const k = ease((t - 0.06) / 0.16);
    S(c.R, 0.3 - 0.36 * k, -0.1 + 0.03 * Math.sin(k * Math.PI), -0.05, -0.15, -1.1, 0.5 - 0.9 * k, 0.3, 0.1, 0.05, 0.05, 0.05, 0.1);
  } },
  // Manguito (bras d'honneur): the right forearm swings up into a fist as the
  // left hand slaps the inside of the elbow. Censored.
  manguito: { dur: 2.3, censor: [0.12, -0.07, 0.15, 0.2, 0.34], f(t, c) {
    const up = ease((t - 0.08) / 0.3);
    const hit = Math.exp(-Math.max(0, t - 0.4) * 9) * (t > 0.4 ? 1 : 0);
    S(c.R, 0.12, -0.5 + 0.43 * up + 0.025 * hit, -0.04, -0.25 * up, 0.35, 0.95 * (1 - up) - 0.08, 0.05, 0.75, 1, 1, 1, 1);
    const sl = ease((t - 0.22) / 0.18);
    S(c.L, -0.2 + 0.27 * sl, -0.42 + 0.1 * sl, -0.03, -0.25, -1.45, -0.55, 0.15, 0.1, 0.1, 0.1, 0.1, 0.15);
  } },
  // Pirete: the middle finger, palm to the visitor, with a little jab. Censored.
  pirete: { dur: 2.0, censor: [0.11, -0.03, 0.11, 0.14, 0.22], f(t, c) {
    const jab = Math.max(0, Math.sin(clamp((t - 0.45) / 0.5, 0, 1) * Math.PI * 2)) * 0.015;
    S(c.R, 0.11, -0.11 + jab, -0.04, 0.12, Math.PI, -0.12, 0.05, 0.9, 1, 0, 1, 1);
  } },
};

// ---- censor: a flickering pixel mosaic with a tiny CENSURADO band ----------
const MOSAIC = ['#e2ae96', '#c98f78', '#f0c4ad', '#b07562', '#d9a08a', '#8f5b4b', '#f5d3c0', '#a86b58'];
function createCensor(reducedMotion) {
  if (typeof document === 'undefined' || !document.createElement) return null;
  const cv = document.createElement('canvas');
  cv.width = 48; cv.height = 60;
  const g = cv.getContext && cv.getContext('2d');
  if (!g) return null;
  const tex = new THREE.CanvasTexture(cv);
  tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter; tex.generateMipmaps = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false, fog: false, toneMapped: false });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1.25), mat);
  mesh.renderOrder = 1000; mesh.frustumCulled = false; mesh.visible = false;
  let clock = 0;
  const draw = () => {
    for (let y = 0; y < 6; y++) for (let x = 0; x < 6; x++) {
      g.fillStyle = MOSAIC[(Math.random() * MOSAIC.length) | 0];
      g.fillRect(x * 8, y * 8, 8, 8);
    }
    g.fillStyle = '#000'; g.fillRect(0, 48, 48, 12);
    g.fillStyle = '#fff'; g.font = 'bold 7px monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('CENSURADO', 24, 54.5, 46);
    tex.needsUpdate = true;
  };
  draw();
  return {
    mesh,
    update(dt) {
      if (reducedMotion || !mesh.visible) return;
      clock += dt;
      if (clock > 0.09) { clock = 0; draw(); }   // ~11 Hz shimmer, cheap (36 cells)
    },
    dispose() { mesh.geometry.dispose(); mat.dispose(); tex.dispose(); },
  };
}

// The censor's bip: a 1 kHz sine for 0.25 s on the page's audio context.
function bip(audio) {
  const ac = audio && audio.context;
  if (!ac || audio.muted || ac.state !== 'running') return;
  const lease = reserveModuleVoice({ audio }, 3, true, .3, audio.bus); if (!lease) return;
  try {
    const t = Math.max(ac.currentTime + .01, lease.startAt);
    const o = ac.createOscillator(), gn = ac.createGain();
    o.type = 'sine'; o.frequency.value = 1000;
    gn.gain.setValueAtTime(0, t);
    gn.gain.linearRampToValueAtTime(0.12, t + 0.008);
    gn.gain.setValueAtTime(0.12, t + 0.242);
    gn.gain.linearRampToValueAtTime(0, t + 0.25);
    o.connect(gn); gn.connect(lease.gain); lease.track(o); finishModuleVoice(lease, o);
    o.start(t); o.stop(t + 0.27);
  } catch (e) { lease.release(); /* audio is optional */ }
}

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

function applyHand(h, p, xk) {
  h.root.position.set(p[0] * xk, p[1], p[2]);
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

export function createPlayer(camera, { reducedMotion = false, audio = null } = {}) {
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

  const censor = createCensor(reducedMotion);
  if (censor) group.add(censor.mesh);
  let sound = audio;

  let cur = null, curName = '', time = 0, bipped = false;
  let sN = 0, jumpK = 0, phase = 0, turn = 0;

  const player = {
    group, cameraOffset, onClap: null, onGestureStart: null,
    get busy() { return cur !== null; },
    get current() { return cur ? curName : null; },
    setAudio(a) { sound = a || null; },
    gesture(name) {
      if (!G[name]) return false;
      // The cheeky ones can always be made, even over a friendly one.
      if (cur && !(CHEEKY.includes(name) && curName !== name)) return false;
      cur = G[name]; curName = name; time = 0; ctx.state.claps = 0; bipped = false;
      if (typeof player.onGestureStart === 'function') { try { player.onGestureStart(name); } catch (e) { /* listener's problem */ } }
      return true;
    },
    update(dt, { speed = 0, jumping = false, turnRate = 0, stepPhase } = {}) {
      dt = Math.min(dt, 0.1);
      const k = 1 - Math.exp(-dt * 8);
      sN += (clamp(speed / 5, 0, 1) - sN) * k;
      jumpK += ((jumping ? 1 : 0) - jumpK) * (1 - Math.exp(-dt * (jumping ? 14 : 6)));
      turn += (clamp(turnRate, -3, 3) - turn) * k;
      // Hands swing once per stride, in step with the footsteps (controls.stepPhase
      // when given, else the same cadence from speed).
      if (Number.isFinite(stepPhase)) phase = stepPhase * Math.PI;
      else phase += dt * Math.PI * (speed > 0.05 ? clamp(1.9 + (Math.min(speed, 3.2) - 1.6) * 0.62, 1, 3.3) : 0.6);
      const xk = clamp((camera.aspect || 1.6) / 1.6, 0.5, 1);   // narrow phone screens: hands closer in

      // rest poses (hidden low at the edges; tips peek in when walking)
      const lift = sN * 0.14 + jumpK * 0.07;
      const sw = Math.sin(phase), sw2 = Math.abs(Math.sin(phase));
      const dx = -turn * 0.012;
      S(rR, 0.23 + sw * 0.012 * sN + dx, -0.64 + lift + sw2 * 0.015 * sN, 0, 0, 0, 0.35, 0.2, 0.3, 0.3, 0.3, 0.3, 0.3);
      S(rL, -0.23 - sw * 0.012 * sN + dx, -0.64 + lift + sw2 * 0.015 * sN, 0, 0, 0, -0.35, 0.2, 0.3, 0.3, 0.3, 0.3, 0.3);

      let cy = 0, cr = 0, active = false, cens = null;
      if (cur) {
        time += dt;
        if (time >= cur.dur) { cur = null; curName = ''; }
        else {
          pR.set(rR); pL.set(rL);
          ctx.cam.y = 0; ctx.cam.roll = 0; ctx.clap = (n) => { if (player.onClap) player.onClap(n); };
          cur.f(time, ctx);
          const e = Math.min(ease(time / (cur.rise || RISE)), ease((cur.dur - time) / (cur.fall || FALL)));
          if (cur.censor && time >= cur.censor[4] && time < cur.dur - 0.06) cens = cur.censor;
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
      applyHand(hR, rR, xk); applyHand(hL, rL, xk);
      if (censor) {
        const m = censor.mesh;
        m.visible = !!cens;
        if (cens) {
          if (!bipped) { bipped = true; bip(sound); }
          // a hair in front of the hand, over the rude part; the tiniest jitter
          const j = reducedMotion ? 0 : (Math.random() - 0.5) * 0.002;
          m.position.set(cens[0] * xk + j, cens[1] + rR[1] + 0.11 + j, 0.06);
          m.scale.set(cens[2], cens[3] / 1.25, 1);
          censor.update(dt);
        }
      }
      group.visible = active || sN > 0.05 || jumpK > 0.02;
    },
    dispose() {
      if (censor) censor.dispose();
      camera.remove(group);
      for (const g of geos) g.dispose();
      for (const m of mats) m.dispose();
    },
  };
  return player;
}
