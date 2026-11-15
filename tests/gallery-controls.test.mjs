import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveCollision, moveWithCollision, isWalkable } from '../assets/gallery/collision.js';

const R = 0.35;
const bounds = { minX: -6.05, maxX: 6.05, minZ: -16.55, maxZ: 16.55 };
const bench = (z) => ({ minX: -0.3 - 0.3, maxX: 0.3 + 0.3, minZ: z - 1.2 - 0.3, maxZ: z + 1.2 + 0.3 });
const colliders = [bench(-5), bench(5)];
const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} !~ ${b}`);

test('point inside the walkable area is unchanged', () => {
  const p = resolveCollision(3, 10, R, bounds, colliders);
  assert.deepEqual(p, { x: 3, z: 10 });
});

test('walls clamp the circle centre by radius', () => {
  const p = resolveCollision(99, -99, R, bounds, colliders);
  near(p.x, bounds.maxX - R); near(p.z, bounds.minZ + R);
  const q = resolveCollision(-99, 99, R, bounds, colliders);
  near(q.x, bounds.minX + R); near(q.z, bounds.maxZ - R);
});

test('bench AABB pushes out on the nearest side', () => {
  const c = bench(5);
  let p = resolveCollision(c.maxX + 0.1, 5, R, bounds, colliders); // overlapping the right face
  near(p.x, c.maxX + R); near(p.z, 5);
  p = resolveCollision(0.2, 5, R, bounds, colliders);            // inside, nearer the right face? 0.2 -> left dist .8 right .4 -> right
  near(p.x, c.maxX + R); near(p.z, 5);
  p = resolveCollision(0, c.minZ + 0.1, R, bounds, colliders);   // inside near the -z face
  near(p.z, c.minZ - R);
  p = resolveCollision(0, c.maxZ + 0.1, R, bounds, colliders);   // just outside +z face, overlapping by radius
  near(p.z, c.maxZ + R);
});

test('corner pushes radially, not along an axis', () => {
  const c = bench(5);
  const p = resolveCollision(c.maxX + 0.1, c.maxZ + 0.1, R, bounds, colliders);
  const d = Math.hypot(p.x - c.maxX, p.z - c.maxZ);
  near(d, R);
  near(p.x - c.maxX, p.z - c.maxZ);
  assert.ok(isWalkable(p.x, p.z, R - 1e-6, bounds, colliders));
});

test('sliding along a bench side keeps the clearance and keeps moving', () => {
  const c = bench(5);
  const o = { x: c.maxX + R + 0.1, z: 9 };
  for (let i = 0; i < 140; i++) {          // walk -z while drifting -x into the bench's side
    moveWithCollision(o.x, o.z, -0.01, -0.06, R, bounds, colliders, o);
    assert.ok(isWalkable(o.x, o.z, R, bounds, colliders));
    if (o.z > c.minZ && o.z < c.maxZ) assert.ok(o.x >= c.maxX + R - 1e-9);
  }
  assert.ok(o.z < c.minZ);                 // slid all the way past it
  assert.ok(isWalkable(o.x, o.z, R, bounds, colliders));
});

test('large steps never tunnel through a thin collider', () => {
  const thin = [{ minX: -3, maxX: 3, minZ: 0, maxZ: 0.02 }];
  const o = moveWithCollision(0, 8, 0, -16, R, bounds, thin);
  near(o.x, 0);
  near(o.z, 0.02 + R);
  // diagonal + huge step into a wall corner
  const w = moveWithCollision(0, 0, 500, 500, R, bounds, []);
  near(w.x, bounds.maxX - R); near(w.z, bounds.maxZ - R);
  // walking down the axis stops at the near bench edge
  const b = moveWithCollision(0, 12, 0, -30, R, bounds, colliders);
  near(b.z, bench(5).maxZ + R);
});

test('start position is valid and degenerate move is stable', () => {
  assert.ok(isWalkable(0, 13.5, R, bounds, colliders));
  const o = moveWithCollision(0, 13.5, 0, 0, R, bounds, colliders);
  assert.deepEqual(o, { x: 0, z: 13.5 });
});
