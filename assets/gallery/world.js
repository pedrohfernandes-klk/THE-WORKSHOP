// world.js — assembles the campus around the hall: every space module in
// assets/gallery/spaces/ (docs/gallery/BRIEF.md §6.2), merged into one walkable
// world with one list of regions, colliders and things to click.
import * as THREE from 'three';

// Order matters only for what appears first while loading.
export const SPACES = [
  'environment', 'landscape', 'facade', 'plaza', 'pool', 'parterre', 'furniture', 'signage',
  'trees', 'garden', 'grass', 'flowers', 'fountain', 'pergola', 'sculptures', 'amphitheatre',
  'studio', 'arcade', 'terrace', 'cinema', 'lift', 'school', 'birds',
  'metro', 'skyliner', 'aviation', 'npcs', 'ruins',
];

// Dense vegetation is drawn by the main camera but skipped by reflections and
// clicks (layer 1), which keeps the mirror-like floors and pool affordable.
const FOLIAGE = new Set(['grass', 'trees', 'flowers', 'birds', 'aviation', 'skyliner']);

// The hall's own walkable floor (BRIEF §5.6) — the lift corner is excluded.
const HALL_REGIONS = [
  { minX: -5.7, maxX: 5.7, minZ: -16.2, maxZ: 14.1, y: 0 },
  { minX: -5.7, maxX: 2.4, minZ: 14.0, maxZ: 16.2, y: 0 },
  { minX: -0.85, maxX: 0.85, minZ: 15.5, maxZ: 18.5, y: 0 },
];

// Named places, announced as the visitor arrives (first match wins).
export const AREAS = [
  { name: 'The Cinema', minX: -6.6, maxX: 6.6, minZ: -17.1, maxZ: 5.2, minY: 6, maxY: 14 },
  { name: 'Roof terrace', minX: -7, maxX: 7, minZ: 5.2, maxZ: 17.5, minY: 6, maxY: 14 },
  { name: 'The Hall', minX: -6.6, maxX: 6.6, minZ: -17.1, maxZ: 17.1, minY: -1, maxY: 6 },
  { name: 'Studio', minX: -23, maxX: -11, minZ: 38, maxZ: 50, minY: -1, maxY: 6 },
  { name: 'Arcade', minX: 11, maxX: 23, minZ: 38, maxZ: 50, minY: -1, maxY: 6 },
  { name: 'Sala Lente', minX: -22, maxX: -2, minZ: 56.3, maxZ: 72, minY: -1, maxY: 6, school: 'west' },
  { name: 'Sala de Português', minX: 2, maxX: 22, minZ: 56.3, maxZ: 72, minY: -1, maxY: 6, school: 'east' },
  { name: 'The School', minX: -22, maxX: 22, minZ: 52.4, maxZ: 56.3, minY: -1, maxY: 6 },
  { name: 'The Amphitheatre', minX: -68, maxX: -28, minZ: 12, maxZ: 48, minY: -6, maxY: 6 },
  { name: 'The Garden', minX: 24, maxX: 66, minZ: 12, maxZ: 52, minY: -1, maxY: 6 },
  { name: 'The Plaza', minX: -24, maxX: 24, minZ: 17.4, maxZ: 52.4, minY: -1, maxY: 6 },
];

export function areaAt(x, y, z) {
  for (const a of AREAS) {
    if (x >= a.minX && x <= a.maxX && z >= a.minZ && z <= a.maxZ && y >= a.minY && y <= a.maxY) return a;
  }
  return null;
}

/**
 * createWorld(ctx, { hallColliders, onProgress }) → world
 * ctx: { THREE, renderer, scene, M, quality, reducedMotion, audio, ui }
 */
export async function createWorld(ctx, { hallColliders = [], onProgress } = {}) {
  const modules = new Map();
  let done = 0;
  await Promise.all(SPACES.map(async (name) => {
    try {
      const mod = await import(`./spaces/${name}.js`);
      const out = await mod.build(ctx);
      if (out && out.group) {
        out.group.name = out.group.name || name;
        ctx.scene.add(out.group);
        if (FOLIAGE.has(name)) out.group.traverse((o) => o.layers.set(1));
      }
      modules.set(name, out || {});
    } catch (err) {
      console.warn(`[world] ${name} skipped:`, err);
    }
    done++;
    onProgress?.(done / SPACES.length);
  }));

  const staticRegions = [...HALL_REGIONS];
  const staticColliders = hallColliders.map((c) => ({ minY: 0, maxY: 2.6, ...c }));
  const pickables = [];
  const owner = new Map();       // pickable → module name
  for (const name of SPACES) {
    const out = modules.get(name);
    if (!out) continue;
    for (const r of out.regions || []) staticRegions.push(r);
    for (const c of out.colliders || []) staticColliders.push(c);
    for (const p of out.pickables || []) { pickables.push(p); owner.set(p, name); }
  }

  const lift = modules.get('lift')?.lift || null;
  const liftColliders = modules.get('lift')?.colliders || [];
  // Live arrays handed to the controls; the lift's moving parts are re-merged
  // each frame without allocating.
  const regions = staticRegions.slice();
  const colliders = staticColliders.filter((c) => !liftColliders.includes(c));
  const fixedColliderCount = colliders.length;
  for (const c of liftColliders) colliders.push(c);
  const fixedRegionCount = regions.length;

  function syncDynamic() {
    if (!lift) return;
    regions.length = fixedRegionCount;
    for (let i = 0; i < lift.regions.length; i++) regions.push(lift.regions[i]);
    colliders.length = fixedColliderCount;
    for (let i = 0; i < liftColliders.length; i++) colliders.push(liftColliders[i]);
  }
  syncDynamic();

  function actionFor(object) {
    for (let o = object; o; o = o.parent) {
      if (o.userData && o.userData.action) return { action: o.userData.action, object: o, module: owner.get(o) || moduleOf(o) };
    }
    return null;
  }
  function moduleOf(object) {
    for (let o = object; o; o = o.parent) if (owner.has(o)) return owner.get(o);
    return null;
  }
  function pick(object) {
    const found = actionFor(object);
    if (!found) return false;
    const { action, object: target } = found;
    if (action.type === 'app') { ctx.ui.openApp(action.url, action.title); return true; }
    const name = found.module || moduleOf(target);
    const out = name ? modules.get(name) : null;
    if (out && typeof out.onPick === 'function') {
      try { out.onPick(target); } catch (err) { console.warn(`[world] ${name}.onPick failed`, err); }
      return true;
    }
    // A module may own the pickable without registering it (nested meshes).
    for (const m of modules.values()) if (m.pickables?.includes(target) && m.onPick) { m.onPick(target); return true; }
    return false;
  }

  const environment = modules.get('environment');
  function refreshShadows() { environment?.refreshShadows?.(); }
  // Static shadows: render once everything has had a moment to settle.
  setTimeout(refreshShadows, 400);
  setTimeout(refreshShadows, 2500);

  const groups = Object.fromEntries([...modules].map(([n, o]) => [n, o.group]).filter(([, g]) => g));

  function update(dt, frame) {
    syncDynamic();
    for (const out of modules.values()) {
      if (out.update) {
        try { out.update(dt, frame); } catch (err) { console.warn('[world] update failed', err); out.update = null; }
      }
    }
  }

  return { modules, groups, regions, colliders, pickables, lift, pick, actionFor, update, refreshShadows };
}
