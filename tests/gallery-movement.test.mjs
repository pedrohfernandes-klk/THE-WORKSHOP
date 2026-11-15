// Movement feel: frame-rate independence, wall and floor-edge sliding, stairs,
// ramps, the lift, jumping, and input robustness (controls.js + collision.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { moveInWorld, groundAt, regionAt } from '../assets/gallery/collision.js';

// --- a minimal DOM for controls.js (fake clock, captured listeners) ---------
let T = 0;
Object.defineProperty(globalThis, 'performance', { value: { now: () => T }, configurable: true, writable: true });
let L = { window: {}, document: {}, dom: {} };
const on = (n) => (type, fn) => { (L[n][type] ||= []).push(fn); };
const off = (n) => (type, fn) => { const a = L[n][type] || []; const i = a.indexOf(fn); if (i >= 0) a.splice(i, 1); };
globalThis.window = { addEventListener: on('window'), removeEventListener: off('window'), innerWidth: 1280, innerHeight: 720 };
globalThis.document = { addEventListener: on('document'), removeEventListener: off('document'), pointerLockElement: null, hidden: false, exitPointerLock() {} };
globalThis.innerWidth = 1280; globalThis.innerHeight = 720;
const { createControls } = await import('../assets/gallery/controls.js');
const fire = (n, type, ev) => { for (const fn of (L[n][type] || []).slice()) fn(ev); };
const key = (code) => ({ code, key: code, repeat: false, target: null, preventDefault() {} });

function make({ world, x = 0, z = 0, yaw = 0, reduced = true } = {}) {
  L = { window: {}, document: {}, dom: {} }; T = 0;
  const cam = {
    position: { x, y: 1.62, z, set(a, b, c) { this.x = a; this.y = b; this.z = c; } },
    rotation: { x: 0, y: yaw, z: 0, order: 'XYZ', set(a, b, c) { this.x = a; this.y = b; this.z = c; } },
  };
  const dom = { style: {}, clientWidth: 1280, addEventListener: on('dom'), removeEventListener: off('dom'), requestPointerLock() {}, setPointerCapture() {}, releasePointerCapture() {} };
  const c = createControls(cam, dom, { colliders: [], eyeHeight: 1.62, reducedMotion: reduced });
  c.setWorld(world);
  return { c, cam, dom };
}
function sim(opts, fps, dur, events = [], onFrame) {
  const { c, cam, dom } = make(opts);
  const dt = 1 / fps, n = Math.round(dur * fps);
  const evs = events.slice();
  const trace = [];
  for (let i = 0; i < n; i++) {
    const t = i * dt;
    while (evs.length && evs[0].t <= t + 1e-9) { const e = evs.shift(); if (e.down) fire('window', 'keydown', key(e.down)); if (e.up) fire('window', 'keyup', key(e.up)); if (e.fn) e.fn(c, dom); }
    T += dt * 1000;
    if (onFrame) onFrame(t + dt);
    c.update(dt);
    trace.push({ t: t + dt, ...c.position, floor: c.floor, speed: c.speed, air: c.airborne });
  }
  c.dispose();
  return { c, cam, end: trace[trace.length - 1], trace };
}
const flat = () => ({ regions: [{ minX: -60, maxX: 60, minZ: -60, maxZ: 60, y: 0 }], colliders: [] });
const near = (a, b, eps, msg) => assert.ok(Math.abs(a - b) < eps, `${msg || ''} ${a} !~ ${b}`);

// --- collision ---------------------------------------------------------------
test('groundAt is regionAt + height; levels never swap', () => {
  const regions = [{ minX: 0, maxX: 10, minZ: 0, maxZ: 10, y: 0 }, { minX: 0, maxX: 10, minZ: 0, maxZ: 10, y: 5 }];
  assert.equal(regionAt(regions, 5, 5, 0.2), regions[0]);
  assert.equal(groundAt(regions, 5, 5, 4.6), 5);
  assert.equal(groundAt(regions, 11, 5, 0), null);
});

test('moveInWorld stops at a floor edge exactly, whatever the step size', () => {
  const regions = [{ minX: -10, maxX: 10, minZ: -4, maxZ: 10, y: 0 }];
  const out = {};
  for (const n of [1, 7, 40]) {
    let x = 0, z = 0;
    for (let i = 0; i < n; i++) { moveInWorld(x, z, 0, 1.5 / n, -6 / n, 0.35, regions, [], [], out); x = out.x; z = out.z; }
    near(z, -4, 0.01, `n=${n}`);
    near(x, 1.5, 1e-9, `slides along the edge n=${n}`);
  }
});

test('moveInWorld reports a stair riser as a step, a ramp foot as none', () => {
  const out = {};
  const stairs = [{ minX: -5, maxX: 5, minZ: -1, maxZ: 5, y: 0 }, { minX: -5, maxX: 5, minZ: -1.3, maxZ: -1, y: 0.17 }];
  moveInWorld(0, -0.9, 0, 0, -0.2, 0.35, stairs, [], [], out);
  near(out.floor, 0.17, 1e-9); near(out.step, 0.17, 1e-9);
  const ramp = [{ minX: -5, maxX: 5, minZ: -2, maxZ: 5, y: 0 }, { minX: -5, maxX: 5, minZ: -8, maxZ: -2, y: 0, ramp: { axis: 'z', from: -2, to: -8, y0: 0, y1: 1.5 } }];
  moveInWorld(0, -1.9, 0, 0, -0.4, 0.35, ramp, [], [], out);
  assert.ok(out.floor > 0.05); near(out.step, 0, 1e-9);
});

// --- controls ----------------------------------------------------------------
test('walking and stopping trace the same path at 20 and 144 fps', () => {
  const ev = [{ t: 0, down: 'KeyW' }, { t: 0, down: 'KeyD' }, { t: 1.5, up: 'KeyW' }, { t: 1.5, up: 'KeyD' }];
  const a = sim({ world: flat() }, 20, 2.5, ev), b = sim({ world: flat() }, 144, 2.5, ev);
  near(a.end.x, b.end.x, 1e-4); near(a.end.z, b.end.z, 1e-4);
  const at = (r, t) => r.trace.find((q) => Math.abs(q.t - t) < 1e-6);
  near(at(a, 0.25).z, at(b, 0.25).z, 1e-4, 'mid-acceleration');
  // weighty but quick: walking pace within ~0.3 s (the smoothed getter trails by ~0.1 s), stopped within 0.3 m
  assert.ok(b.trace.find((q) => q.t > 0.4).speed > 1.6);
  assert.ok(Math.hypot(b.end.x - at(b, 1.5).x, b.end.z - at(b, 1.5).z) < 0.3);
});

test('sliding along a wall keeps exactly the wish share along it', () => {
  const world = { regions: flat().regions, colliders: [{ minX: -30, maxX: 30, minZ: -8, maxZ: -5 }] };
  const yaw = 35 * Math.PI / 180;
  for (const fps of [20, 144]) {
    const r = sim({ world, yaw }, fps, 6, [{ t: 0, down: 'KeyW' }]);
    near(r.end.z, -4.65, 1e-6, `fps ${fps}`);
    near(r.end.speed, 2 * Math.sin(yaw), 0.01, `fps ${fps}`);
  }
});

test('ramps and the lift are followed exactly; stairs are smoothed', () => {
  const ramp = { regions: [{ minX: -5, maxX: 5, minZ: -2, maxZ: 5, y: 0 }, { minX: -5, maxX: 5, minZ: -8, maxZ: -2, y: 0, ramp: { axis: 'z', from: -2, to: -8, y0: 0, y1: 1.5 } }, { minX: -5, maxX: 5, minZ: -20, maxZ: -8, y: 1.5 }], colliders: [] };
  const r = sim({ world: ramp }, 30, 5, [{ t: 0, down: 'KeyW' }]);
  for (const q of r.trace) near(q.y, q.floor + 1.62, 1e-9);
  const car = { minX: -1, maxX: 1, minZ: -1, maxZ: 1, y: 0 };
  const l = sim({ world: { regions: [car], colliders: [] } }, 60, 2, [], (t) => { car.y = t * 1.5; });
  for (const q of l.trace) near(q.y, q.floor + 1.62, 1e-9);
  const regions = [{ minX: -5, maxX: 5, minZ: -1, maxZ: 5, y: 0 }];
  for (let i = 0; i < 6; i++) regions.push({ minX: -5, maxX: 5, minZ: -1.3 - 0.3 * i, maxZ: -1 - 0.3 * i, y: 0.17 * (i + 1) });
  regions.push({ minX: -5, maxX: 5, minZ: -20, maxZ: -2.8, y: 1.02 });
  const s = sim({ world: { regions, colliders: [] } }, 144, 4, [{ t: 0, down: 'KeyW' }]);
  let maxV = 0;
  for (let i = 1; i < s.trace.length; i++) maxV = Math.max(maxV, Math.abs(s.trace[i].y - s.trace[i - 1].y) * 144);
  assert.ok(maxV < 1.6, `eye speed on stairs ${maxV}`);
  near(s.end.y, 1.02 + 1.62, 1e-3);
});

test('a jump reaches the same apex at 20 and 144 fps, falls faster than it rises', () => {
  const peak = (fps) => { const r = sim({ world: flat(), reduced: false }, fps, 1.2, [{ t: 0, down: 'Space' }]); return { top: Math.max(...r.trace.map((q) => q.y)), r }; };
  const a = peak(20), b = peak(144);
  near(a.top, b.top, 0.01);
  near(b.top - 1.62, 0.717, 0.005);
  const up = b.r.trace.find((q) => q.y >= b.top - 1e-9).t, land = b.r.trace.find((q) => q.t > 0.05 && !q.air).t;
  assert.ok(land - up < up, `fall ${land - up} vs rise ${up}`);
});

test('blur and Cmd release every held key; 8 and 9 reach onGesture', () => {
  const { c } = make({ world: flat() });
  fire('window', 'keydown', key('KeyW'));
  for (let i = 0; i < 30; i++) { T += 16; c.update(1 / 60); }
  assert.ok(c.speed > 1);
  fire('window', 'blur', {});
  for (let i = 0; i < 90; i++) { T += 16; c.update(1 / 60); }
  assert.ok(c.speed < 0.01);
  fire('window', 'keydown', key('KeyW'));
  fire('window', 'keyup', { code: 'MetaLeft', key: 'Meta' });
  for (let i = 0; i < 90; i++) { T += 16; c.update(1 / 60); }
  assert.ok(c.speed < 0.01);
  const got = [];
  c.onGesture = (code) => got.push(code);
  for (const code of ['Digit1', 'Digit8', 'Digit9', 'KeyG']) fire('window', 'keydown', key(code));
  assert.deepEqual(got, ['Digit1', 'Digit8', 'Digit9', 'KeyG']);
  c.dispose();
});

test('pointer lock: look is direct, a bogus movement spike is ignored', () => {
  const { c, dom } = make({ world: flat() });
  globalThis.document.pointerLockElement = dom;
  fire('document', 'pointerlockchange', {});
  T += 200;
  const y0 = c.yaw;
  fire('document', 'mousemove', { movementX: 10, movementY: 0 });
  near(c.yaw, y0 - 10 * 0.0019, 1e-9);            // applied at once, no smoothing
  fire('document', 'mousemove', { movementX: -900, movementY: 0 });
  near(c.yaw, y0 - 10 * 0.0019, 1e-9);            // the spike is dropped
  fire('document', 'mousemove', { movementX: 12, movementY: 0 });
  near(c.yaw, y0 - 22 * 0.0019, 1e-9);
  globalThis.document.pointerLockElement = null;
  c.dispose();
});
