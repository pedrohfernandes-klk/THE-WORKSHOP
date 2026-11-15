import test from 'node:test';
import assert from 'node:assert/strict';
import { LiftLogic, makeProfile } from '../assets/gallery/spaces/lift-logic.js';

const run = (L, secs, dt = 0.01) => { for (let t = 0; t < secs; t += dt) L.update(dt); };
const until = (L, pred, max = 60, dt = 0.01) => { let t = 0; while (!pred() && t < max) { L.update(dt); t += dt; } return t; };

test('S-curve profile: monotonic, limits, ~9 s for 7.2 m', () => {
  const p = makeProfile(7.2);
  assert.ok(p.total > 8 && p.total < 9.3, 'total ' + p.total);
  let prev = 0, vmax = 0, amax = 0, pv = 0;
  for (let t = 0.01; t <= p.total; t += 0.01) {
    const s = p.pos(t); assert.ok(s >= prev - 1e-9); const v = (s - prev) / 0.01; vmax = Math.max(vmax, v);
    amax = Math.max(amax, Math.abs(v - pv) / 0.01); prev = s; pv = v;
  }
  assert.ok(vmax <= 1.005, 'vmax ' + vmax);
  assert.ok(amax <= 0.65, 'amax ' + amax);
  assert.ok(Math.abs(p.pos(p.total) - 7.2) < 1e-9);
});

test('call at same level opens (1.2 s), holds 6 s, closes (1.4 s)', () => {
  const ev = []; const L = new LiftLogic({ emit: (n) => ev.push(n) });
  L.call(0); L.update(0.01);
  assert.equal(L.state, 'opening');
  const tOpen = until(L, () => L.state === 'open');
  assert.ok(Math.abs(tOpen - 1.2) < 0.05, 'open ' + tOpen);
  const tHold = until(L, () => L.state === 'closing');
  assert.ok(Math.abs(tHold - 6) < 0.05, 'hold ' + tHold);
  const tClose = until(L, () => L.state === 'idle');
  assert.ok(Math.abs(tClose - 1.4) < 0.05, 'close ' + tClose);
  assert.deepEqual(ev, ['doors-open', 'doors-close']);
});

test('threshold occupancy extends hold and reopens while closing', () => {
  const L = new LiftLogic(); L.call(0); until(L, () => L.state === 'open');
  L.setOccupancy(true, false); run(L, 20); assert.equal(L.state, 'open');
  L.setOccupancy(false, false); until(L, () => L.state === 'closing'); run(L, 0.5);
  assert.ok(L.door < 1 && L.door > 0);
  L.setOccupancy(true, false); L.update(0.01); assert.equal(L.state, 'opening');
  L.setOccupancy(false, false); until(L, () => L.state === 'open'); assert.equal(L.door, 1);
});

test('call from the other level: travel with S-curve, chime, open', () => {
  const ev = []; const L = new LiftLogic({ emit: (n) => ev.push(n) });
  L.call(1);
  assert.ok(L.isPending(1));
  const t = until(L, () => L.state === 'opening', 30);
  assert.ok(t > 8 && t < 10.5, 'trip ' + t);
  assert.equal(L.carY, 7.2); assert.equal(L.level, 1); assert.equal(L.doorLevel, 1);
  assert.deepEqual(ev.slice(0, 4), ['motor-start', 'motor-stop', 'chime', 'doors-open']);
  assert.ok(!L.isPending(1));
});

test('car button with visitor inside: doors close promptly then travel', () => {
  const L = new LiftLogic(); L.call(0); until(L, () => L.state === 'open');
  L.setOccupancy(false, true); L.go(1);
  const t = until(L, () => L.state === 'moving', 10);
  assert.ok(t < 2, 'depart after ' + t);
  assert.equal(L.door, 0);
  until(L, () => L.state === 'open', 30); assert.equal(L.carY, 7.2);
});

test('door-closed-while-pending: call elsewhere waits for hold then closes and goes', () => {
  const L = new LiftLogic(); L.call(0); until(L, () => L.state === 'open');
  L.call(1); // someone upstairs
  until(L, () => L.state === 'moving', 20); assert.equal(L.door, 0);
});

test('go() current level reopens closing doors', () => {
  const L = new LiftLogic(); L.call(0); until(L, () => L.state === 'closing');
  L.go(0); assert.equal(L.state, 'opening');
});
