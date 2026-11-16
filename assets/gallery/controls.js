// Moving through the room: a body with weight, a camera with no lag.
// Every per-frame integration is closed-form (velocity, jump, eye spring), so
// the walk feels the same at 20 fps as at 144.
import * as THREE from 'three';
import { resolveCollision, moveWithCollision, groundAt, moveInWorld, nearestWalkable, regionAt, regionHeight } from './collision.js';

export { resolveCollision, moveWithCollision, isWalkable } from './collision.js';

// ---- tuning -----------------------------------------------------------
const RADIUS = 0.35;
const WALK_SPEED = 2.0;          // m/s — a brisk walk; Shift runs
const HURRY = 2.45;              // ≈ 4.9 m/s running
const BACK = 0.8;                // walking backwards is a little slower
const MOUSE_SENS = 0.0019;       // rad per pixel with the pointer captured (≈0.11°)
const JUMP_V = 4.4;              // m/s take-off: 0.72 m apex
const GRAVITY = 13.5;            // m/s² rising (a touch heavier than Earth: snappier)
const FALL_G = 1.4;              // ... and heavier still falling: no float at the top
// Pushing off: exponential approach with the force capped, so a step starts
// at once (12 m/s²) yet a run takes a moment to build. Braking is firmer.
const ACCEL_K = 10, ACCEL_MAX = 12;   // walk reached (90 %) in ~0.25 s
const BRAKE_K = 12, BRAKE_MAX = 20;   // stops in ~0.17 m from a walk, ~0.7 m from a run
const SPRINT_UP = 3.2, SPRINT_DOWN = 6;   // 1/s: the run ramps in over ~0.7 s
const LOOK_K = 11;               // arrow-key turning only: mouse and touch look are direct
const EYE_W = 16;                // 1/s: critically damped eye (steps, landings) settles in ~0.3 s
const LAND_DIP = 0.34, LAND_DIP_MAX = 2.0;  // eye velocity per m/s of impact: ~4 cm knee dip
const JUMP_BUFFER = 0.15;        // s: Space pressed just before landing still jumps
const RAD_PER_PX = (120 * Math.PI / 180);   // touch / drag: a full dom width turns 120°
const KEY_TURN = 1.5;            // rad/s for arrow left/right
const PITCH_MAX = Math.PI / 3;   // 60 deg
const WHEEL_STEP = 0.5;          // metres per 100 wheel units
const WHEEL_MAX = 1.2;           // per event
const DOLLY_CAP = 3;
const DOLLY_K = 7;
const TAP_PX = 6, TAP_MS = 350;
const HOLD_MS = 420;             // touch: press and hold walks ahead (slide to steer)
const LOCK_SETTLE_MS = 80;       // ignore the first, bogus movement after a capture
const BOB_Y = 0.011, BOB_ROLL = 0.0028;     // m, rad at walking pace
const TWO_PI = Math.PI * 2;

const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const wrapPi = (a) => { a = (a + Math.PI) % TWO_PI; if (a < 0) a += TWO_PI; return a - Math.PI; };
/** Footsteps per second at a speed: the cadence audio.js plays (its speed is capped at 3.2). */
export const stepRate = (speed) => clamp(1.9 + (Math.min(speed, 3.2) - 1.6) * 0.62, 1.0, 3.3);

// Velocity v approaching T at rate k with |acceleration| ≤ amax, exactly over dt.
// Returns the new velocity; the distance covered is left in `apD`.
let apD = 0;
function approach(v, T, k, amax, dt) {
  let d = 0, t = dt;
  const gap = T - v;
  const lin = Math.abs(gap) - amax / k;
  if (lin > 0) {
    const tl = Math.min(t, lin / amax), a = gap > 0 ? amax : -amax;
    d = v * tl + 0.5 * a * tl * tl; v += a * tl; t -= tl;
  }
  if (t > 0) {
    const e = Math.exp(-k * t);
    d += T * t + (v - T) * (1 - e) / k;
    v = T + (v - T) * e;
  }
  apD = d;
  return v;
}
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
  const allowLock = !!opts.pointerLock;
  const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

  camera.rotation.order = 'YXZ';

  // state (scalars only: no per-frame allocation)
  let px = camera.position.x, pz = camera.position.z, py = camera.position.y || eyeHeight;
  let yaw = camera.rotation.y, pitch = camera.rotation.x;
  let tYaw = yaw, tPitch = pitch;
  let vx = 0, vz = 0, dolly = 0;
  let speed = 0, turnRate = 0, sprint = 0;
  let stepPhase = 0, bobAmp = 0, stepping = false;
  let eyeOff = 0, eyeV = 0;    // eye spring: smooths stairs, kerbs and landings
  let sens = 1;                // user multiplier on the mouse sensitivity
  const tmp = { x: 0, z: 0 };
  resolveCollision(px, pz, RADIUS, bounds, colliders, tmp);
  px = tmp.x; pz = tmp.z;
  // World mode (setWorld): many regions at many heights instead of one rectangle.
  let world = null;
  let floor = py - eyeHeight;
  const wtmp = { x: 0, z: 0, floor: 0, step: 0, region: null };
  const active = [];
  let auto = null;   // auto-walk toward a clicked point: { x, z, resolve, stuck }
  let locked = false;          // pointer captured (FPS mode)
  let lockedAt = -1e9;         // when it was captured
  let seat = null;             // { x, y, z, eye, from: { x, z, floor } } while seated
  const SEATED_EYE = 0.78;     // eye above the seat top for a seated adult
  let jumpY = 0, jumpV = 0;    // height above the floor while airborne
  let jumpBuf = 0;             // a jump asked for just before landing
  let airRest = 0;             // time left in the frame after touching down

  const keys = new Set();
  let firstFired = false;

  // pointer
  let ptrId = -1, ptrType = '', downX = 0, downY = 0, lastX = 0, lastY = 0, downT = 0, dragging = false, holdWalk = false;
  let spikeAvg = 0, spikeDropped = false;

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
    get floor() { return floor; },
    get locked() { return locked; },
    get airborne() { return jumpY > 0 || jumpV > 0; },
    get seated() { return !!seat; },
    /** 0 walking … 1 at a full run (the Shift ramp). */
    get sprint() { return sprint; },
    /** Footsteps taken, fractional: an integer at each footfall (for hands, sound). */
    get stepPhase() { return stepPhase; },
    /** Mouse sensitivity multiplier (1 = default). */
    get sensitivity() { return sens; },
    set sensitivity(v) { if (Number.isFinite(v) && v > 0) sens = clamp(v, 0.1, 5); },
    onUse: null, onGesture: null, onLockChange: null,
    exitLock() { if (locked && document.exitPointerLock) document.exitPointerLock(); },
    get position() { return { x: px, y: py, z: pz }; },
  };

  // L2: an explicit moving floor, expressed in the carriage's local coordinates.
  let activeCarrier = null;
  const carrierActive = [];
  const carrierMove = { x: 0, z: 0, floor: .35, step: 0, region: null };
  function moveInsideCarrier(dx, dz, out) {
    const c = activeCarrier, co = Math.cos(c.yaw), si = Math.sin(c.yaw);
    const lx = co * (px - c.x) - si * (pz - c.z), lz = si * (px - c.x) + co * (pz - c.z);
    moveInWorld(lx, lz, floor, co * dx - si * dz, si * dx + co * dz, RADIUS,
      c.localWorld.regions, c.localWorld.colliders, carrierActive, carrierMove);
    out.x = c.x + co * carrierMove.x + si * carrierMove.z;
    out.z = c.z - si * carrierMove.x + co * carrierMove.z;
    out.floor = carrierMove.floor; out.step = carrierMove.step;
  }
  controls.moveCarrierDelta = function(dx, dz) {
    if (!activeCarrier?.riding) return false;
    if (seat || fl) return true; // a seated passenger retains the handhold/seat
    moveInsideCarrier(dx, dz, wtmp); px = wtmp.x; pz = wtmp.z; floor = wtmp.floor;
    py = floor + eyeHeight + jumpY + eyeOff; applyCamera(0); return true;
  };
  controls.transportCarrier = function(c) {
    if (!c?.riding) { activeCarrier = null; return; }
    activeCarrier = c;
    const da = wrapPi(c.yaw - c.fromYaw), co = Math.cos(da), si = Math.sin(da);
    let x = px - c.fromX, z = pz - c.fromZ;
    px = c.x + co*x + si*z; pz = c.z - si*x + co*z;
    if (seat) {
      x=seat.x-c.fromX;z=seat.z-c.fromZ;seat.x=c.x+co*x+si*z;seat.z=c.z-si*x+co*z;
      x=seat.from.x-c.fromX;z=seat.from.z-c.fromZ;seat.from.x=c.x+co*x+si*z;seat.from.z=c.z-si*x+co*z;
    }
    if (fl) {
      x=fl.sx-c.fromX;z=fl.sz-c.fromZ;fl.sx=c.x+co*x+si*z;fl.sz=c.z-si*x+co*z;
      x=fl.ex-c.fromX;z=fl.ez-c.fromZ;fl.ex=c.x+co*x+si*z;fl.ez=c.z-si*x+co*z;
      if (!reduced) { fl.syaw+=da;fl.eyaw+=da; }
    }
    if (!reduced) { yaw+=da;tYaw+=da; }
    floor=.35;applyCamera(0);
  };

  const eyeBase = () => (world ? floor : 0) + eyeHeight;

  /** Switch to world mode: { regions, colliders } (arrays may be mutated in place later). */
  controls.setWorld = function setWorld(w) {
    const before = eyeBase();
    world = w;
    const g = groundAt(w.regions, px, pz, floor, 100);
    if (g !== null) floor = g;
    else if (nearestWalkable(w.regions, px, pz, floor, wtmp, 100)) { px = wtmp.x; pz = wtmp.z; floor = wtmp.floor; }
    if (!fl && !seat) eyeOff = clamp(eyeOff + before - eyeBase(), -1.5, 1.5);   // no jump in the eye
  };
  /**
   * Sit on a seat { x, y (seat top), z, facing: [fx, fz] }: glide down onto it,
   * keep looking around freely; WASD, the wheel or Space stand back up exactly
   * where the visitor stood before (always walkable).
   */
  controls.sit = function sitOn(s) {
    if (!s) return Promise.resolve(false);
    const from = seat ? seat.from : { x: px, z: pz, floor };
    endFlight(false); endAuto(false);
    jumpY = jumpV = vx = vz = 0; dolly = 0;
    const fx = s.facing ? s.facing[0] : 0, fz = s.facing ? s.facing[1] : -1;
    seat = { x: s.x, y: s.y, z: s.z, eye: s.y + SEATED_EYE, from };
    const yawTo = Math.atan2(-fx, -fz);
    // Pace the glide by distance: 0.9 s beside the seat, up to 2.4 s from far
    // off (a fixed 0.9 s made a 40 m bench a 130 m/s fling).
    const d = Math.hypot(s.x - px, seat.eye - py, s.z - pz);
    return startFlight(s.x, seat.eye, s.z, yawTo, -0.08, reduced ? 0.25 : clamp(0.75 + d * 0.16, 0.9, 2.4));
  };
  controls.standUp = function standUp() {
    if (!seat) return;
    const { from } = seat;
    seat = null;
    floor = from.floor;
    startFlight(from.x, from.floor + eyeHeight, from.z, yaw, pitch * 0.5, reduced ? 0.2 : 0.55);
  };

  // Shared combat/tram displacement: additive, collision checked, no teleport reset.
  let impulseX=0, impulseZ=0, impulseLeft=0;
  controls.readPosition = (out) => { out.x=px;out.y=py;out.z=pz;return out; };
  controls.combatMove = (dx,dz) => {
    if(typeof controls.moveCarrierDelta === 'function' && controls.moveCarrierDelta(dx,dz)) return;
    const before=floor;
    if(world){moveInWorld(px,pz,floor,dx,dz,RADIUS,world.regions,world.colliders,active,wtmp);px=wtmp.x;pz=wtmp.z;floor=wtmp.floor;}
    else{moveWithCollision(px,pz,dx,dz,RADIUS,bounds,colliders,tmp);px=tmp.x;pz=tmp.z;}
    py+=floor-before;applyCamera(0);
  };
  controls.applyImpulse = (dx,dz,duration=.3) => {
    if(!Number.isFinite(dx)||!Number.isFinite(dz))return;
    impulseX+=dx;impulseZ+=dz;const length=Math.hypot(impulseX,impulseZ);
    if(length>1){impulseX/=length;impulseZ/=length;}
    impulseLeft=Math.max(.05,Math.min(.3,duration));
  };
  controls.combatJump = () => {
    if(seat){controls.standUp();return;}
    if(jumpY===0&&jumpV===0&&!fl){jumpV=reduced?JUMP_V*.8:JUMP_V;interrupt();}else jumpBuf=JUMP_BUFFER;
    firstInput();
  };
  controls.releaseCombatKeys = () => {keys.delete('ShiftLeft');keys.delete('ShiftRight');};

  /** Place the visitor on a floor point instantly (eye height added). */
  controls.teleport = function teleport(p) {
    interrupt();
    jumpY = jumpV = vx = vz = 0; eyeOff = eyeV = 0; jumpBuf = 0;
    px = p.x; pz = p.z; floor = p.y || 0; py = floor + eyeHeight;
    applyCamera(0);
  };

  function firstInput() {
    if (firstFired) return;
    firstFired = true;
    if (typeof controls.onFirstInput === 'function') controls.onFirstInput();
  }
  function endFlight(ok) {
    if (fl) { const r = fl.resolve; fl = null; r(ok); }
  }
  function endAuto(ok) {
    if (auto) { const r = auto.resolve; auto = null; r(ok); }
  }
  function interrupt() { endFlight(false); endAuto(false); }

  // ---- input ----------------------------------------------------------
  function onKeyDown(e) {
    if (!controls.enabled || e.ctrlKey || e.metaKey || e.altKey || typingTarget(e.target)) return;
    if (e.code === 'Space') {
      e.preventDefault();
      if (seat) { controls.standUp(); firstInput(); return; }
      if (e.repeat) return;
      if (jumpY === 0 && jumpV === 0 && !fl) { jumpV = reduced ? JUMP_V * 0.8 : JUMP_V; interrupt(); }
      else jumpBuf = JUMP_BUFFER;
      firstInput();
      return;
    }
    if (e.code === 'KeyE' && !e.repeat) { if (typeof controls.onUse === 'function') controls.onUse(); return; }
    if ((/^Digit[1-9]$/.test(e.code) || e.code === 'KeyG') && !e.repeat) {
      if (typeof controls.onGesture === 'function') controls.onGesture(e.code);
      return;
    }
    if (!KEY_CODES.has(e.code)) return;
    if (e.code.charCodeAt(0) === 65 /* Arrow* */) e.preventDefault();
    const isShift = e.code === 'ShiftLeft' || e.code === 'ShiftRight';
    keys.add(e.code);
    if (!isShift) { interrupt(); firstInput(); }
  }
  function onKeyUp(e) {
    keys.delete(e.code);
    // macOS sends no keyup for keys released while Cmd is held: never leave one stuck.
    if (e.key === 'Meta' || e.code === 'MetaLeft' || e.code === 'MetaRight' || e.code === 'OSLeft' || e.code === 'OSRight') keys.clear();
  }
  function clearKeys() { keys.clear(); holdWalk = false; }
  function onVis() { if (document.hidden) { clearKeys(); cancelPointer(); } }

  function onLockChange() {
    locked = document.pointerLockElement === dom;
    if (locked) { lockedAt = now(); spikeAvg = 0; spikeDropped = false; cancelPointer(); dom.style.cursor = 'none'; } else dom.style.cursor = 'grab';
    if (typeof controls.onLockChange === 'function') controls.onLockChange(locked);
  }
  function onLockError() { locked = false; dom.style.cursor = 'grab'; }   // the next click simply tries again
  function onLockedMove(e) {
    if (!locked || !controls.enabled) return;
    const mx = e.movementX || 0, my = e.movementY || 0;
    if (!mx && !my) return;
    // Chromium can report one bogus jump of hundreds of px right after the
    // capture or when it re-centres the hidden cursor: never whip the view round.
    if (now() - lockedAt < LOCK_SETTLE_MS) return;
    const mag = Math.abs(mx) + Math.abs(my);
    if (!spikeDropped && mag > 250 && mag > spikeAvg * 5 + 200) { spikeDropped = true; return; }
    spikeDropped = false;
    spikeAvg += (mag - spikeAvg) * 0.3;
    if (fl) endFlight(false);
    if (auto) endAuto(false);
    const k = MOUSE_SENS * sens;
    // Crisp, game-like look: the view follows the mouse exactly, no smoothing.
    yaw = tYaw = tYaw - mx * k;
    pitch = tPitch = clamp(tPitch - my * k, -PITCH_MAX, PITCH_MAX);
    firstInput();
  }
  document.addEventListener('pointerlockchange', onLockChange);
  document.addEventListener('pointerlockerror', onLockError);
  document.addEventListener('mousemove', onLockedMove);

  function onPointerDown(e) {
    if (locked) {
      // Captured: the left button uses whatever is under the crosshair.
      if (e.button === 0 && controls.enabled && typeof controls.onTap === 'function') {
        e.preventDefault();
        controls.onTap(innerWidth / 2, innerHeight / 2);
      }
      return;
    }
    if (allowLock && controls.enabled && e.pointerType === 'mouse' && e.button === 0 && dom.requestPointerLock) {
      // Click to play: capture the pointer like a game. (Esc releases it; a
      // click recaptures it, also after alt-tab.)
      try { const r = dom.requestPointerLock(); if (r && r.catch) r.catch(() => {}); } catch (err) { /* unsupported */ }
      firstInput();
      return;
    }
    if (!controls.enabled || ptrId !== -1) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    ptrId = e.pointerId; ptrType = e.pointerType || 'mouse';
    downX = lastX = e.clientX; downY = lastY = e.clientY;
    downT = now();
    dragging = false; holdWalk = false;
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
      if (!holdWalk) interrupt();
      firstInput();
      lastX = downX; lastY = downY;
    }
    if (!controls.enabled) { lastX = x; lastY = y; return; }
    const w = Math.max(dom.clientWidth || window.innerWidth || 1, 1);
    const k = RAD_PER_PX / w;
    // Drag the world: direct, no smoothing, so the view stays under the finger.
    yaw = tYaw = tYaw + (x - lastX) * k;
    pitch = tPitch = clamp(tPitch + (y - lastY) * k, -PITCH_MAX, PITCH_MAX);
    lastX = x; lastY = y;
    e.preventDefault();
  }
  function releasePointer(e) {
    try { dom.releasePointerCapture(e.pointerId); } catch (_) { /* ignore */ }
  }
  function onPointerUp(e) {
    if (e.pointerId !== ptrId) return;
    releasePointer(e);
    const wasDrag = dragging, wasHold = holdWalk;
    ptrId = -1; dragging = false; holdWalk = false; dom.style.cursor = 'grab';
    if (wasDrag || wasHold || !controls.enabled) return;
    const dx = e.clientX - downX, dy = e.clientY - downY;
    if (dx * dx + dy * dy < TAP_PX * TAP_PX && now() - downT < TAP_MS) {
      if (typeof controls.onTap === 'function') controls.onTap(e.clientX, e.clientY);
    }
  }
  function cancelPointer() {
    ptrId = -1; dragging = false; holdWalk = false; dom.style.cursor = 'grab';
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
    vx = vz = dolly = 0; jumpY = jumpV = 0; jumpBuf = 0;
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
    endAuto(false);
    // A deliberate flight (approaching a work, Next/Prev) leaves the seat: otherwise
    // the seated branch snaps the visitor back onto the bench the frame it lands.
    seat = null;
    const p = position || { x: px, y: py, z: pz };
    if (world) { tmp.x = p.x; tmp.z = p.z; }
    else resolveCollision(p.x, p.z, RADIUS, bounds, colliders, tmp);
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
    if (world) {
      // Walk there for real, so walls and glass stop the visitor instead of
      // being glided through.
      endFlight(false); endAuto(false);
      const y = point.y !== undefined ? point.y : floor;
      if (!nearestWalkable(world.regions, point.x, point.z, y, wtmp)) return Promise.resolve(false);
      return new Promise((resolve) => { auto = { x: wtmp.x, z: wtmp.z, resolve, stuck: 0 }; });
    }
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

  // Critically damped eye spring toward 0, exactly over dt.
  function eyeSpring(dt) {
    if (eyeOff === 0 && eyeV === 0) return;
    const e = Math.exp(-EYE_W * dt), B = eyeV + EYE_W * eyeOff;
    eyeOff = (eyeOff + B * dt) * e;
    eyeV = (eyeV - EYE_W * B * dt) * e;
    if (Math.abs(eyeOff) < 1e-5 && Math.abs(eyeV) < 1e-4) { eyeOff = 0; eyeV = 0; }
  }
  // Jump / fall, exactly over dt (light rise, heavy fall). Returns the impact
  // speed when the feet touch down this frame (airRest = time left), else 0.
  function air(dt) {
    let t = dt;
    if (jumpV > 0) {
      const tu = Math.min(t, jumpV / GRAVITY);
      jumpY += jumpV * tu - 0.5 * GRAVITY * tu * tu;
      jumpV -= GRAVITY * tu; t -= tu;
      if (t > 0) jumpV = 0;
    }
    if (t > 0 && (jumpY > 0 || jumpV < 0)) {
      const g = GRAVITY * FALL_G;
      const tl = (jumpV + Math.sqrt(jumpV * jumpV + 2 * g * Math.max(0, jumpY))) / g;
      if (tl <= t) { const u = g * tl - jumpV; jumpY = 0; jumpV = 0; airRest = t - tl; return u; }
      jumpY += jumpV * t - 0.5 * g * t * t; jumpV -= g * t;
    }
    return 0;
  }

  // ---- per-frame ------------------------------------------------------
  controls.update = function update(dt) {
    if (!(dt > 0)) return;
    if (dt > 0.1) dt = 0.1;
    if(impulseLeft>0){const part=Math.min(dt,impulseLeft)/impulseLeft,dx=impulseX*part,dz=impulseZ*part;impulseX-=dx;impulseZ-=dz;impulseLeft=Math.max(0,impulseLeft-dt);controls.combatMove(dx,dz);}
    const oyaw = yaw, opitch = pitch, ox = px, oz = pz;
    const live = controls.enabled;
    if (live && ptrId !== -1 && ptrType !== 'mouse' && !holdWalk && !dragging && now() - downT > HOLD_MS) { holdWalk = true; interrupt(); firstInput(); }

    // Seated: look around freely; any walking intent stands the visitor up.
    if (seat && !fl) {
      const wantsUp = live && (keys.has('KeyW') || keys.has('KeyS') || keys.has('KeyA') || keys.has('KeyD') ||
        keys.has('ArrowUp') || keys.has('ArrowDown') || dolly !== 0 || holdWalk);
      if (wantsUp) { dolly = 0; controls.standUp(); }
      else {
        if (live) {
          if (keys.has('ArrowLeft')) tYaw += KEY_TURN * dt;
          if (keys.has('ArrowRight')) tYaw -= KEY_TURN * dt;
        }
        const a = 1 - Math.exp(-dt * LOOK_K);
        yaw += (tYaw - yaw) * a; pitch += (tPitch - pitch) * a;
        px = seat.x; pz = seat.z; py = seat.eye;
        speed += (0 - speed) * (1 - Math.exp(-dt * 8)); if (speed < 1e-3) speed = 0;
        const instTurn = Math.hypot(wrapPi(yaw - oyaw), pitch - opitch) / dt;
        turnRate += (instTurn - turnRate) * (1 - Math.exp(-dt * 8)); if (turnRate < 1e-3) turnRate = 0;
        bobAmp = 0; sprint = 0;
        applyCamera(0, 0);
        return;
      }
    }

    let grounded = true;
    if (fl) {
      fl.t += dt;
      const u = Math.min(fl.t / fl.dur, 1), e = ease(u);
      const nx = fl.sx + (fl.ex - fl.sx) * e, nz = fl.sz + (fl.ez - fl.sz) * e;
      if (world) { tmp.x = nx; tmp.z = nz; }
      else resolveCollision(nx, nz, RADIUS, bounds, colliders, tmp); // slide along obstacles en route
      px = tmp.x; pz = tmp.z;
      py = fl.sy + (fl.ey - fl.sy) * e;
      yaw = tYaw = fl.syaw + (fl.eyaw - fl.syaw) * e;
      pitch = tPitch = fl.spitch + (fl.epitch - fl.spitch) * e;
      grounded = false;
      if (u >= 1) {
        px = fl.ex; pz = fl.ez;
        if (world) { const g = groundAt(world.regions, px, pz, py - eyeHeight, 1.2); if (g !== null) floor = g; }
        // whatever height the flight ended at, the eye spring settles it from rest
        eyeOff = seat ? 0 : clamp(py - eyeBase(), -1.5, 1.5); eyeV = 0;
        endFlight(true);
      }
    } else {
      // keyboard look/turn
      if (live) {
        if (keys.has('ArrowLeft')) tYaw += KEY_TURN * dt;
        if (keys.has('ArrowRight')) tYaw -= KEY_TURN * dt;
      }
      const a = 1 - Math.exp(-dt * LOOK_K);
      yaw += (tYaw - yaw) * a;
      pitch += (tPitch - pitch) * a;
      if (yaw > 12 || yaw < -12) { const w = TWO_PI * Math.sign(yaw); yaw -= w; tYaw -= w; }

      // walking intent
      let f = 0, s = 0;
      if (live) {
        if (keys.has('KeyW') || keys.has('ArrowUp') || holdWalk) f += 1;
        if (keys.has('KeyS') || keys.has('ArrowDown')) f -= 1;
        if (keys.has('KeyD')) s += 1;
        if (keys.has('KeyA')) s -= 1;
      }
      let mag = Math.sqrt(f * f + s * s);
      if (mag > 1) { f /= mag; s /= mag; }
      // the run ramps in (and out), averaged over the frame
      const run = live && mag > 0 && f >= 0 && (keys.has('ShiftLeft') || keys.has('ShiftRight'));
      const s0 = sprint;
      sprint = run ? 1 + (sprint - 1) * Math.exp(-SPRINT_UP * dt) : sprint * Math.exp(-SPRINT_DOWN * dt);
      if (sprint < 1e-4) sprint = 0;
      const top = WALK_SPEED * (1 + (HURRY - 1) * (s0 + sprint) * 0.5) * (f < 0 ? BACK : 1);
      const sy = Math.sin(yaw), cy = Math.cos(yaw);
      let tvx = (-sy * f + cy * s) * top, tvz = (-cy * f - sy * s) * top;
      if (auto && mag === 0) {
        const ax = auto.x - px, az = auto.z - pz;
        const d = Math.sqrt(ax * ax + az * az);
        if (d < 0.12) { endAuto(true); }
        else {
          const v = Math.min(WALK_SPEED, 0.6 + d * 1.2);
          tvx = (ax / d) * v; tvz = (az / d) * v; mag = 1;
          // turn the head gently toward where we are walking
          tYaw = yaw + wrapPi(Math.atan2(-ax, -az) - yaw) * (1 - Math.exp(-dt * 1.6));
          if (speed < 0.08 && auto) { auto.stuck += dt; if (auto.stuck > 0.8) endAuto(false); } else if (auto) auto.stuck = 0;
        }
      }

      // Body: the velocity heads straight for the wished one (exponential, force
      // capped), integrated exactly. Isotropic, so along a wall it settles on
      // exactly the wish's share along the wall.
      let mx = vx * dt, mz = vz * dt;
      const gx = tvx - vx, gz = tvz - vz, G = Math.sqrt(gx * gx + gz * gz);
      if (G > 1e-9) {
        const tt = tvx * tvx + tvz * tvz, vv = vx * vx + vz * vz;
        const push = tt > 1e-12 && tvx * vx + tvz * vz >= 0 && tt >= vv * 0.998;   // speeding up or turning
        const w = approach(0, G, push ? ACCEL_K : BRAKE_K, push ? ACCEL_MAX : BRAKE_MAX, dt);
        const ux = gx / G, uz = gz / G;
        mx += ux * apD; mz += uz * apD;
        vx += ux * w; vz += uz * w;
        if (tt <= 1e-12 && vx * vx + vz * vz < 1e-8) { vx = 0; vz = 0; }
      }

      const ds = dolly * (1 - Math.exp(-dt * DOLLY_K));
      dolly -= ds;
      if (Math.abs(dolly) < 1e-4) dolly = 0;
      mx -= sy * ds; mz -= cy * ds;
      let jump = 0;   // floor discontinuity crossed this frame (stairs, kerbs)
      let ax = px, az = pz;
      if (activeCarrier?.riding) {
        moveInsideCarrier(mx, mz, wtmp);
        ax=wtmp.x;az=wtmp.z;floor=wtmp.floor;jump=wtmp.step||0;
      } else if (world) {
        moveInWorld(px, pz, floor, mx, mz, RADIUS, world.regions, world.colliders, active, wtmp);
        ax = wtmp.x; az = wtmp.z; floor = wtmp.floor; jump = wtmp.step || 0;
        // a floor that moves (the lift car) carries the visitor; a new one appearing is a step
        const r = regionAt(world.regions, ax, az, floor);
        if (r !== null) { const g = regionHeight(r, ax, az); if (r !== wtmp.region) jump += g - floor; floor = g; }
      } else if (mx !== 0 || mz !== 0) {
        moveWithCollision(px, pz, mx, mz, RADIUS, bounds, colliders, tmp);
        ax = tmp.x; az = tmp.z;
      }
      // Blocked: keep the speed along the wall, lose only what went into it.
      const cx = ax - px - mx, cz = az - pz - mz, cl = Math.sqrt(cx * cx + cz * cz);
      if (cl > 1e-6) {
        const nx = cx / cl, nz = cz / cl, vn = vx * nx + vz * nz;
        if (vn < 0) { vx -= nx * vn; vz -= nz * vn; }
        dolly *= 0.5;
      }
      px = ax; pz = az;

      // Eye height: ramps and the lift are followed exactly; steps go into the
      // eye spring; in the air they change the height of the fall.
      if (jumpV !== 0 || jumpY > 0) {
        jumpY -= jump;
        let u = 0;
        airRest = 0;
        if (jumpY < 0 && jumpV <= 0) { eyeOff += jumpY; u = -jumpV; jumpY = 0; jumpV = 0; }   // onto something higher
        else u = air(dt);
        if (u > 0) {
          eyeSpring(dt - airRest);
          if (!reduced) eyeV -= Math.min(u * LAND_DIP, LAND_DIP_MAX);
          eyeSpring(airRest);
          if (jumpBuf > 0) { jumpV = reduced ? JUMP_V * 0.8 : JUMP_V; jumpBuf = 0; }
        }
        grounded = jumpY === 0 && jumpV === 0;
      } else {
        eyeOff -= jump;
        eyeSpring(dt);
      }
      if (jumpBuf > 0) jumpBuf = Math.max(0, jumpBuf - dt);
      eyeOff = clamp(eyeOff, -1.5, 1.5);
      py = eyeBase() + eyeOff + jumpY;
    }

    // measured motion -> smoothed getters
    const inst = Math.hypot(px - ox, pz - oz) / dt;
    const instTurn = Math.hypot(wrapPi(yaw - oyaw), pitch - opitch) / dt;
    const sa = 1 - Math.exp(-dt * 8);
    speed += (inst - speed) * sa;
    turnRate += (instTurn - turnRate) * sa;
    if (speed < 1e-3) speed = 0;
    if (turnRate < 1e-3) turnRate = 0;

    // Head bob: one dip per footfall, one sway per stride, at the cadence the
    // footsteps are heard. Only on the ground, never in a glide.
    const rate = stepRate(speed);
    if (!stepping && speed > 0.25) stepPhase = Math.floor(stepPhase) - 0.03 * rate;  // first step in 30 ms, as audio.js
    stepping = speed > 0.25;
    stepPhase += rate * dt * (speed > 0.05 ? 1 : 0);
    if (stepPhase > 1e4) stepPhase -= 1e4;
    let bobY = 0, roll = 0;
    if (!reduced) {
      const target = grounded ? clamp(speed / WALK_SPEED, 0, 1.25) : 0;
      bobAmp += (target - bobAmp) * (1 - Math.exp(-dt * 6));
      if (bobAmp < 1e-4) bobAmp = 0;
      bobY = -Math.cos(TWO_PI * stepPhase) * BOB_Y * bobAmp;
      roll = Math.sin(Math.PI * stepPhase) * BOB_ROLL * bobAmp;
    }
    applyCamera(bobY, roll);
  };

  controls.dispose = function dispose() {
    endAuto(false);
    seat = null;
    document.removeEventListener('pointerlockchange', onLockChange);
    document.removeEventListener('pointerlockerror', onLockError);
    document.removeEventListener('mousemove', onLockedMove);
    controls.exitLock();
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
