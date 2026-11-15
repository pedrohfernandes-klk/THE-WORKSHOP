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
