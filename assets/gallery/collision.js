// Pure 2D collision helpers for the gallery walker (no THREE, no DOM).
// A visitor is a circle (centre x,z; radius r). `bounds` is the walkable
// rectangle the circle must stay inside; `colliders` are AABBs it must stay out
// of ({minX,maxX,minZ,maxZ}).

const MAX_PASSES = 4;
const MAX_STEPS = 256;

/** Push a circle out of bounds/colliders. Writes into `out` (or a new object). */
export function resolveCollision(x, z, radius, bounds, colliders, out) {
  const o = out || { x: 0, z: 0 };
  const r = radius;
  for (let pass = 0; pass < MAX_PASSES; pass++) {
    let changed = false;
    if (bounds) {
      const lo = bounds.minX + r, hi = bounds.maxX - r;
      const nx = lo > hi ? (bounds.minX + bounds.maxX) * 0.5 : x < lo ? lo : x > hi ? hi : x;
      const lz = bounds.minZ + r, hz = bounds.maxZ - r;
      const nz = lz > hz ? (bounds.minZ + bounds.maxZ) * 0.5 : z < lz ? lz : z > hz ? hz : z;
      if (nx !== x || nz !== z) { x = nx; z = nz; changed = true; }
    }
    if (colliders) {
      for (let i = 0; i < colliders.length; i++) {
        const c = colliders[i];
        const cx = x < c.minX ? c.minX : x > c.maxX ? c.maxX : x;
        const cz = z < c.minZ ? c.minZ : z > c.maxZ ? c.maxZ : z;
        const dx = x - cx, dz = z - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 >= r * r) continue;
        if (d2 > 1e-12) {
          const k = r / Math.sqrt(d2);
          x = cx + dx * k; z = cz + dz * k;
        } else {
          // centre inside the box: leave through the nearest face
          const l = x - c.minX, rt = c.maxX - x, t = z - c.minZ, b = c.maxZ - z;
          const m = Math.min(l, rt, t, b);
          if (m === l) x = c.minX - r;
          else if (m === rt) x = c.maxX + r;
          else if (m === t) z = c.minZ - r;
          else z = c.maxZ + r;
        }
        changed = true;
      }
    }
    if (!changed) break;
  }
  o.x = x; o.z = z;
  return o;
}

/** True if a circle at (x,z) overlaps nothing and is inside bounds. */
export function isWalkable(x, z, radius, bounds, colliders) {
  const eps = 1e-6;
  if (bounds && (x < bounds.minX + radius - eps || x > bounds.maxX - radius + eps ||
      z < bounds.minZ + radius - eps || z > bounds.maxZ - radius + eps)) return false;
  if (colliders) {
    for (let i = 0; i < colliders.length; i++) {
      const c = colliders[i];
      const cx = x < c.minX ? c.minX : x > c.maxX ? c.maxX : x;
      const cz = z < c.minZ ? c.minZ : z > c.maxZ ? c.maxZ : z;
      const dx = x - cx, dz = z - cz;
      if (dx * dx + dz * dz < radius * radius - eps) return false;
    }
  }
  return true;
}

/**
 * Move from (x,z) by (dx,dz), sub-stepping so no step exceeds radius/2; slides
 * along edges and never tunnels through thin colliders. Writes into `out`.
 */
export function moveWithCollision(x, z, dx, dz, radius, bounds, colliders, out) {
  const o = out || { x: 0, z: 0 };
  const len = Math.sqrt(dx * dx + dz * dz);
  const steps = Math.min(MAX_STEPS, Math.max(1, Math.ceil(len / (radius * 0.5))));
  const sx = dx / steps, sz = dz / steps;
  o.x = x; o.z = z;
  for (let i = 0; i < steps; i++) {
    resolveCollision(o.x + sx, o.z + sz, radius, bounds, colliders, o);
  }
  if (len === 0) resolveCollision(x, z, radius, bounds, colliders, o);
  return o;
}

// ---------------------------------------------------------------------------
// World mode: the visitor's centre must stand inside the union of `regions`
// (rectangles, flat at `y` or ramped), and is pushed out of `colliders` that
// overlap its current height. Regions at different heights may overlap in plan
// (the terrace over the hall): the one nearest the current floor wins, within
// a climbable step, so levels never swap under the visitor's feet.

export const STEP = 0.65;

export function regionHeight(r, x, z) {
  if (r.ramp) {
    const { axis, from, to, y0, y1 } = r.ramp;
    const c = axis === 'x' ? x : z;
    let t = (c - from) / (to - from);
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    return y0 + (y1 - y0) * t;
  }
  return r.y || 0;
}

/** The region a visitor at `floor` stands on at (x,z): the one nearest in height, within `step`. */
export function regionAt(regions, x, z, floor, step = STEP) {
  let best = null, bestD = Infinity;
  for (let i = 0; i < regions.length; i++) {
    const r = regions[i];
    if (x < r.minX || x > r.maxX || z < r.minZ || z > r.maxZ) continue;
    const d = Math.abs(regionHeight(r, x, z) - floor);
    if (d <= step && d < bestD) { bestD = d; best = r; }
  }
  return best;
}

/** Floor height at (x,z) reachable from `floor`, or null if not walkable. */
export function groundAt(regions, x, z, floor, step = STEP) {
  const r = regionAt(regions, x, z, floor, step);
  return r === null ? null : regionHeight(r, x, z);
}

/** True when an AABB collider spans the body of a visitor standing at `floor`. */
export function colliderActive(c, floor) {
  const minY = c.minY === undefined ? -Infinity : c.minY;
  const maxY = c.maxY === undefined ? Infinity : c.maxY;
  return floor + 0.15 < maxY && floor + 1.8 > minY;
}

// Largest t in [0, 1] for which (x + t·dx, z + t·dz) still has a floor
// reachable from `floor` (t = 0 must have one). Bisection to 1/256 of the step,
// so the visitor comes to rest at the same place at 20 fps as at 144.
function edgeFraction(regions, x, z, floor, dx, dz) {
  if (regionAt(regions, x + dx, z + dz, floor) !== null) return 1;
  let lo = 0, hi = 1;
  for (let i = 0; i < 8; i++) {
    const m = (lo + hi) * 0.5;
    if (regionAt(regions, x + dx * m, z + dz * m, floor) !== null) lo = m; else hi = m;
  }
  return lo;
}

/**
 * Move by (dx,dz) through the world, sub-stepped, sliding along region edges
 * and colliders. `active` is a scratch array (reused, no allocation).
 * Writes { x, z, floor, step, region } into `out`: `step` is the sum of the
 * floor's jumps on the way (stairs, kerbs: + up, - down), which a ramp or a
 * moving lift never adds to, so the eye can smooth the one and follow the other.
 */
export function moveInWorld(x, z, floor, dx, dz, radius, regions, colliders, active, out) {
  active.length = 0;
  for (let i = 0; i < colliders.length; i++) if (colliderActive(colliders[i], floor)) active.push(colliders[i]);
  const len = Math.sqrt(dx * dx + dz * dz);
  const steps = Math.min(MAX_STEPS, Math.max(1, Math.ceil(len / (radius * 0.5))));
  const sx = dx / steps, sz = dz / steps;
  let cx = x, cz = z, cf = floor, jump = 0;
  // The floor under the start may have moved since the last frame (the lift
  // car): follow it continuously.
  let reg = regionAt(regions, x, z, floor);
  if (reg !== null) cf = regionHeight(reg, x, z);
  for (let i = 0; i < steps; i++) {
    let nx = cx + sx, nz = cz + sz;
    let r = regionAt(regions, nx, nz, cf);
    if (r === null) {
      // At a floor edge: keep each axis's motion up to the edge (slide along it).
      const tx = sx ? edgeFraction(regions, cx, cz, cf, sx, 0) : 0;
      nx = cx + sx * tx;
      const tz = sz ? edgeFraction(regions, nx, cz, cf, 0, sz) : 0;
      nz = cz + sz * tz;
      r = regionAt(regions, nx, nz, cf);
      if (r === null) break;
    }
    const g = regionHeight(r, nx, nz);
    resolveCollision(nx, nz, radius, null, active, out);
    let r2 = regionAt(regions, out.x, out.z, g);
    if (r2 === null) {
      // A collider pushed the visitor off the floor: keep the push on one axis.
      const ox = out.x, oz = out.z;
      if ((r2 = regionAt(regions, ox, nz, g)) !== null) { out.x = ox; out.z = nz; }
      else if ((r2 = regionAt(regions, nx, oz, g)) !== null) { out.x = nx; out.z = oz; }
      else break;
    }
    const pg = regionHeight(r2, out.x, out.z);
    if (r2 !== reg) {
      // Compare both floors where they meet (the old region's edge nearest the
      // new point): a ramp's foot adds nothing, a stair riser its height.
      if (reg === null) jump += pg - cf;
      else {
        const qx = out.x < reg.minX ? reg.minX : out.x > reg.maxX ? reg.maxX : out.x;
        const qz = out.z < reg.minZ ? reg.minZ : out.z > reg.maxZ ? reg.maxZ : out.z;
        jump += regionHeight(r2, qx, qz) - regionHeight(reg, qx, qz);
      }
      reg = r2;
    }
    cx = out.x; cz = out.z; cf = pg;
  }
  out.x = cx; out.z = cz; out.floor = cf; out.step = jump; out.region = reg;
  return out;
}

/** Nearest walkable point to (x,z) on regions within `step` of `floor`. */
export function nearestWalkable(regions, x, z, floor, out, step = STEP) {
  let bd = Infinity;
  out.x = x; out.z = z; out.floor = floor;
  for (let i = 0; i < regions.length; i++) {
    const r = regions[i];
    const px = x < r.minX ? r.minX : x > r.maxX ? r.maxX : x;
    const pz = z < r.minZ ? r.minZ : z > r.maxZ ? r.maxZ : z;
    const h = regionHeight(r, px, pz);
    if (Math.abs(h - floor) > step) continue;
    const d = (px - x) ** 2 + (pz - z) ** 2;
    if (d < bd) { bd = d; out.x = px; out.z = pz; out.floor = h; }
  }
  return bd < Infinity;
}
