// Moving through the room: damped look, eased walking, collision, glides.
import * as THREE from 'three';
import { resolveCollision, moveWithCollision } from './collision.js';

export { resolveCollision, moveWithCollision, isWalkable } from './collision.js';

// ---- tuning -----------------------------------------------------------
const RADIUS = 0.35;
const WALK_SPEED = 1.6;          // m/s
const HURRY = 1.8;
const ACCEL_K = 5.0;             // 1/s, exponential approach when speeding up
const DECEL_K = 7.5;             // when slowing down
const LOOK_K = 11;               // look damping (1/s)
const RAD_PER_PX = (120 * Math.PI / 180);   // per full dom width: 120 degrees
const KEY_TURN = 1.5;            // rad/s for arrow left/right
const PITCH_MAX = Math.PI / 3;   // 60 deg
const WHEEL_STEP = 0.5;          // metres per 100 wheel units
const WHEEL_MAX = 1.2;           // per event
const DOLLY_CAP = 3;
const DOLLY_K = 7;
const TAP_PX = 6, TAP_MS = 350;
const BOB_Y = 0.011, BOB_ROLL = 0.0028, STRIDE = 0.78; // m per step cycle
const TWO_PI = Math.PI * 2;

const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const wrapPi = (a) => { a = (a + Math.PI) % TWO_PI; if (a < 0) a += TWO_PI; return a - Math.PI; };

const KEY_CODES = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ShiftLeft', 'ShiftRight']);

function typingTarget(t) {
  if (!t || !t.tagName) return false;
  const n = t.tagName;
  if (n === 'INPUT' || n === 'TEXTAREA' || n === 'SELECT') return true;
  return !!t.isContentEditable;
}

export function createControls(camera, dom, opts = {}) {
  const bounds = opts.bounds;
  const colliders = opts.colliders || [];
  const eyeHeight = opts.eyeHeight || 1.62;
  const reduced = !!opts.reducedMotion;

  camera.rotation.order = 'YXZ';

  // state (scalars only: no per-frame allocation)
  let px = camera.position.x, pz = camera.position.z, py = camera.position.y || eyeHeight;
  let yaw = camera.rotation.y, pitch = camera.rotation.x;
  let tYaw = yaw, tPitch = pitch;
  let vx = 0, vz = 0, dolly = 0;
  let speed = 0, turnRate = 0;
  let bobPhase = 0, bobAmp = 0;
  const tmp = { x: 0, z: 0 };
  resolveCollision(px, pz, RADIUS, bounds, colliders, tmp);
  px = tmp.x; pz = tmp.z;

  const keys = new Set();
  let firstFired = false;

  // pointer
  let ptrId = -1, downX = 0, downY = 0, lastX = 0, lastY = 0, downT = 0, dragging = false;

  // flight
  let fl = null; // {t, dur, sx, sy, sz, ex, ey, ez, syaw, spitch, eyaw, epitch, resolve}

  const controls = {
    enabled: true,
    onTap: null,
    onFirstInput: null,
    get speed() { return speed; },
    get turnRate() { return turnRate; },
    get yaw() { return yaw; },
    get pitch() { return pitch; },
  };

  function firstInput() {
    if (firstFired) return;
    firstFired = true;
    if (typeof controls.onFirstInput === 'function') controls.onFirstInput();
  }
  function endFlight(ok) {
    if (!fl) return;
    const r = fl.resolve; fl = null; r(ok);
  }
  function interrupt() { endFlight(false); }

  // ---- input ----------------------------------------------------------
  function onKeyDown(e) {
    if (!controls.enabled || e.ctrlKey || e.metaKey || e.altKey || typingTarget(e.target)) return;
    if (!KEY_CODES.has(e.code)) return;
    if (e.code.charCodeAt(0) === 65 /* Arrow* */) e.preventDefault();
    const isShift = e.code === 'ShiftLeft' || e.code === 'ShiftRight';
    keys.add(e.code);
    if (!isShift) { interrupt(); firstInput(); }
  }
  function onKeyUp(e) { keys.delete(e.code); }
  function clearKeys() { keys.clear(); }
  function onVis() { if (document.hidden) { clearKeys(); cancelPointer(); } }

  function onPointerDown(e) {
    if (!controls.enabled || ptrId !== -1) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    ptrId = e.pointerId;
    downX = lastX = e.clientX; downY = lastY = e.clientY;
    downT = performance.now();
    dragging = false;
    try { dom.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
    if (e.pointerType !== 'mouse') e.preventDefault();
  }
  function onPointerMove(e) {
    if (e.pointerId !== ptrId) return;
    const x = e.clientX, y = e.clientY;
    if (!dragging) {
      const mx = x - downX, my = y - downY;
      if (mx * mx + my * my < TAP_PX * TAP_PX) return;
      dragging = true;
      dom.style.cursor = 'grabbing';
      interrupt(); firstInput();
      lastX = downX; lastY = downY;
    }
    if (!controls.enabled) { lastX = x; lastY = y; return; }
    const w = Math.max(dom.clientWidth || window.innerWidth || 1, 1);
    const k = RAD_PER_PX / w;
    tYaw += (x - lastX) * k;
    tPitch = clamp(tPitch + (y - lastY) * k, -PITCH_MAX, PITCH_MAX);
    lastX = x; lastY = y;
    e.preventDefault();
  }
  function releasePointer(e) {
    try { dom.releasePointerCapture(e.pointerId); } catch (_) { /* ignore */ }
  }
  function onPointerUp(e) {
    if (e.pointerId !== ptrId) return;
    releasePointer(e);
    const wasDrag = dragging;
    ptrId = -1; dragging = false; dom.style.cursor = 'grab';
    if (wasDrag || !controls.enabled) return;
    const dx = e.clientX - downX, dy = e.clientY - downY;
    if (dx * dx + dy * dy < TAP_PX * TAP_PX && performance.now() - downT < TAP_MS) {
      if (typeof controls.onTap === 'function') controls.onTap(e.clientX, e.clientY);
    }
  }
  function cancelPointer() {
    ptrId = -1; dragging = false; dom.style.cursor = 'grab';
  }
  function onPointerCancel(e) { if (e.pointerId === ptrId) { releasePointer(e); cancelPointer(); } }

  function onWheel(e) {
    e.preventDefault();
    if (!controls.enabled) return;
    let d = e.deltaY;
    if (e.deltaMode === 1) d *= 33; else if (e.deltaMode === 2) d *= 400;
    interrupt(); firstInput();
    dolly = clamp(dolly - clamp(d / 100 * WHEEL_STEP, -WHEEL_MAX, WHEEL_MAX), -DOLLY_CAP, DOLLY_CAP);
  }

  const prevCursor = dom.style.cursor;
  dom.style.cursor = 'grab';
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', clearKeys);
  document.addEventListener('visibilitychange', onVis);
  dom.addEventListener('pointerdown', onPointerDown);
  dom.addEventListener('pointermove', onPointerMove);
  dom.addEventListener('pointerup', onPointerUp);
  dom.addEventListener('pointercancel', onPointerCancel);
  dom.addEventListener('wheel', onWheel, { passive: false });

  // ---- flights --------------------------------------------------------
  function startFlight(ex, ey, ez, eyaw, epitch, dur) {
    endFlight(false);
    vx = vz = dolly = 0;
    return new Promise((resolve) => {
      fl = {
        t: 0, dur: Math.max(dur, 0.05), resolve,
        sx: px, sy: py, sz: pz, ex, ey, ez,
        syaw: yaw, spitch: pitch,
        eyaw: yaw + wrapPi(eyaw - yaw), epitch: clamp(epitch, -PITCH_MAX, PITCH_MAX),
      };
    });
  }

  controls.flyTo = function flyTo({ position, target, duration } = {}) {
    const p = position || { x: px, y: py, z: pz };
    resolveCollision(p.x, p.z, RADIUS, bounds, colliders, tmp);
    const ex = tmp.x, ez = tmp.z, ey = p.y !== undefined ? p.y : py;
    let eyaw = yaw, epitch = pitch;
    if (target) {
      const dx = target.x - ex, dy = target.y - ey, dz = target.z - ez;
      const h = Math.sqrt(dx * dx + dz * dz);
      if (h > 1e-4) eyaw = Math.atan2(-dx, -dz);
      epitch = Math.atan2(dy, Math.max(h, 1e-4));
    }
    let dur = duration;
    if (dur === undefined || dur === null) {
      const dist = Math.hypot(ex - px, ez - pz, ey - py);
      dur = clamp(0.9 + dist * 0.13 + Math.abs(wrapPi(eyaw - yaw)) * 0.2, 0.9, 2.4);
    }
    return startFlight(ex, ey, ez, eyaw, epitch, reduced ? 0.25 : dur);
  };

  controls.walkTo = function walkTo(point) {
    resolveCollision(point.x, point.z, RADIUS, bounds, colliders, tmp);
    const ex = tmp.x, ez = tmp.z;
    const dx = ex - px, dz = ez - pz;
    const dist = Math.sqrt(dx * dx + dz * dz);
    let eyaw = yaw;
    if (dist > 0.3) eyaw = yaw + wrapPi(Math.atan2(-dx, -dz) - yaw) * 0.25;
    const dur = reduced ? 0.25 : clamp(0.8 + dist / 2.2, 0.9, 2.4);
    return startFlight(ex, eyeHeight, ez, eyaw, pitch * 0.6, dur);
  };

  controls.lookAt = function lookAt(target) {
    interrupt();
    const dx = target.x - px, dy = target.y - py, dz = target.z - pz;
    const h = Math.sqrt(dx * dx + dz * dz);
    if (h > 1e-4) yaw = Math.atan2(-dx, -dz);
    pitch = clamp(Math.atan2(dy, Math.max(h, 1e-4)), -PITCH_MAX, PITCH_MAX);
    tYaw = yaw; tPitch = pitch;
    applyCamera(0);
  };

  function applyCamera(bobY, roll) {
    camera.position.set(px, py + bobY, pz);
    camera.rotation.set(pitch, yaw, roll || 0);
  }

  // ---- per-frame ------------------------------------------------------
  controls.update = function update(dt) {
    if (!(dt > 0)) return;
    if (dt > 0.1) dt = 0.1;
    const oyaw = yaw, opitch = pitch, ox = px, oz = pz;
    const live = controls.enabled;

    if (fl) {
      fl.t += dt;
      const u = Math.min(fl.t / fl.dur, 1), e = ease(u);
      const nx = fl.sx + (fl.ex - fl.sx) * e, nz = fl.sz + (fl.ez - fl.sz) * e;
      resolveCollision(nx, nz, RADIUS, bounds, colliders, tmp); // slide along obstacles en route
      px = tmp.x; pz = tmp.z;
      py = fl.sy + (fl.ey - fl.sy) * e;
      yaw = tYaw = fl.syaw + (fl.eyaw - fl.syaw) * e;
      pitch = tPitch = fl.spitch + (fl.epitch - fl.spitch) * e;
      if (u >= 1) { px = fl.ex; pz = fl.ez; endFlight(true); }
    } else {
      // keyboard look/turn
      if (live) {
        if (keys.has('ArrowLeft')) tYaw += KEY_TURN * dt;
        if (keys.has('ArrowRight')) tYaw -= KEY_TURN * dt;
      }
      const a = 1 - Math.exp(-dt * LOOK_K);
      yaw += (tYaw - yaw) * a;
      pitch += (tPitch - pitch) * a;
      if (yaw > 12 || yaw < -12) { yaw -= TWO_PI * Math.sign(yaw); tYaw -= TWO_PI * Math.sign(yaw); }

      // walking
      let f = 0, s = 0;
      if (live) {
        if (keys.has('KeyW') || keys.has('ArrowUp')) f += 1;
        if (keys.has('KeyS') || keys.has('ArrowDown')) f -= 1;
        if (keys.has('KeyD')) s += 1;
        if (keys.has('KeyA')) s -= 1;
      }
      const mag = Math.sqrt(f * f + s * s);
      if (mag > 1) { f /= mag; s /= mag; }
      const top = WALK_SPEED * (keys.has('ShiftLeft') || keys.has('ShiftRight') ? HURRY : 1);
      const sy = Math.sin(yaw), cy = Math.cos(yaw);
      const dvx = (-sy * f + cy * s) * top, dvz = (-cy * f - sy * s) * top;
      const k = mag > 0 ? ACCEL_K : DECEL_K;
      const ka = 1 - Math.exp(-dt * k);
      vx += (dvx - vx) * ka; vz += (dvz - vz) * ka;
      if (mag === 0 && vx * vx + vz * vz < 1e-5) { vx = 0; vz = 0; }

      const ds = dolly * (1 - Math.exp(-dt * DOLLY_K));
      dolly -= ds;
      if (Math.abs(dolly) < 1e-4) dolly = 0;
      const mx = vx * dt - sy * ds, mz = vz * dt - cy * ds;
      if (mx !== 0 || mz !== 0) {
        moveWithCollision(px, pz, mx, mz, RADIUS, bounds, colliders, tmp);
        const ax = tmp.x - px, az = tmp.z - pz;
        // blocked: bleed velocity (and dolly) into what actually happened
        if (Math.abs(ax - mx) + Math.abs(az - mz) > 1e-6) {
          vx = (ax + sy * ds) / dt;
          vz = (az + cy * ds) / dt;
          dolly *= 0.5;
        }
        px = tmp.x; pz = tmp.z;
      }
      // y eases back to eye height after a flight that changed it
      py += (eyeHeight - py) * (1 - Math.exp(-dt * 1.5));
    }

    // measured motion -> smoothed getters
    const inst = Math.hypot(px - ox, pz - oz) / dt;
    const instTurn = Math.hypot(wrapPi(yaw - oyaw), pitch - opitch) / dt;
    const sa = 1 - Math.exp(-dt * 8);
    speed += (inst - speed) * sa;
    turnRate += (instTurn - turnRate) * sa;
    if (speed < 1e-3) speed = 0;
    if (turnRate < 1e-3) turnRate = 0;

    // head bob
    let bobY = 0, roll = 0;
    if (!reduced) {
      const target = clamp(speed / WALK_SPEED, 0, 1.3);
      bobAmp += (target - bobAmp) * (1 - Math.exp(-dt * 6));
      bobPhase += speed * dt * (TWO_PI / STRIDE);
      if (bobPhase > 1e4) bobPhase %= TWO_PI;
      bobY = Math.sin(bobPhase * 2) * BOB_Y * bobAmp;
      roll = Math.sin(bobPhase) * BOB_ROLL * bobAmp;
    }
    applyCamera(bobY, roll);
  };

  controls.dispose = function dispose() {
    endFlight(false);
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    window.removeEventListener('blur', clearKeys);
    document.removeEventListener('visibilitychange', onVis);
    dom.removeEventListener('pointerdown', onPointerDown);
    dom.removeEventListener('pointermove', onPointerMove);
    dom.removeEventListener('pointerup', onPointerUp);
    dom.removeEventListener('pointercancel', onPointerCancel);
    dom.removeEventListener('wheel', onWheel);
    dom.style.cursor = prevCursor;
    keys.clear();
  };

  applyCamera(0);
  return controls;
}
