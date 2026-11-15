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

/** Floor height at (x,z) reachable from `floor`, or null if not walkable. */
export function groundAt(regions, x, z, floor, step = STEP) {
  let best = null, bestD = Infinity;
  for (let i = 0; i < regions.length; i++) {
    const r = regions[i];
    if (x < r.minX || x > r.maxX || z < r.minZ || z > r.maxZ) continue;
    const h = regionHeight(r, x, z);
    const d = Math.abs(h - floor);
    if (d <= step && d < bestD) { bestD = d; best = h; }
  }
  return best;
}

/** True when an AABB collider spans the body of a visitor standing at `floor`. */
export function colliderActive(c, floor) {
  const minY = c.minY === undefined ? -Infinity : c.minY;
  const maxY = c.maxY === undefined ? Infinity : c.maxY;
  return floor + 0.15 < maxY && floor + 1.8 > minY;
}

/**
 * Move by (dx,dz) through the world, sub-stepped, sliding along region edges
 * and colliders. `active` is a scratch array (reused, no allocation).
 * Writes { x, z, floor } into `out`.
 */
export function moveInWorld(x, z, floor, dx, dz, radius, regions, colliders, active, out) {
  active.length = 0;
  for (let i = 0; i < colliders.length; i++) if (colliderActive(colliders[i], floor)) active.push(colliders[i]);
  const len = Math.sqrt(dx * dx + dz * dz);
  const steps = Math.min(MAX_STEPS, Math.max(1, Math.ceil(len / (radius * 0.5))));
  const sx = dx / steps, sz = dz / steps;
  let cx = x, cz = z, cf = floor;
  for (let i = 0; i < steps; i++) {
    let nx = cx + sx, nz = cz + sz;
    let g = groundAt(regions, nx, nz, cf);
    if (g === null) { nx = cx + sx; nz = cz; g = sx ? groundAt(regions, nx, nz, cf) : null; }
    if (g === null) { nx = cx; nz = cz + sz; g = sz ? groundAt(regions, nx, nz, cf) : null; }
    if (g === null) break;
    resolveCollision(nx, nz, radius, null, active, out);
    const pg = groundAt(regions, out.x, out.z, g);
    if (pg === null) break;
    cx = out.x; cz = out.z; cf = pg;
  }
  out.x = cx; out.z = cz; out.floor = cf;
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
