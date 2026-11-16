// world.js — assembles the campus around the hall: every space module in
// assets/gallery/spaces/ (docs/gallery/BRIEF.md §6.2), merged into one walkable
// world with one list of regions, colliders and things to click.
import * as THREE from 'three';
import { createBatcher } from './batch.js';

// Order matters only for what appears first while loading.
export const SPACES = [
  'environment', 'landscape', 'facade', 'plaza', 'pool', 'parterre', 'furniture', 'wayfinding',
  'trees', 'garden', 'grass', 'flowers', 'fountain', 'pergola', 'sculptures', 'amphitheatre',
  'studio', 'arcade', 'terrace', 'cinema', 'lift', 'school', 'birds', 'passwords',
  'metro', 'skyliner', 'aviation', 'npcs', 'ruins',
  // The indie touches: real objects with a pixel soul, each found rather than announced.
  'murals', 'vending', 'cat', 'radio', 'ghost', 'floorsnake', 'photobooth', 'gnome', 'oddities', 'duck',
  'mercado', 'marginal', 'tram-ride',
  'arraial', 'quests',
  'lightpools',
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
  { name: 'Mercado', minX: 92, maxX: 112, minZ: 20, maxZ: 44, minY: -1, maxY: 6 },
  { name: 'Marginal', minX: -20, maxX: 28, minZ: 76, maxZ: 84, minY: -1, maxY: 6 },
];

export function areaAt(x, y, z) {
  for (const a of AREAS) {
    if (x >= a.minX && x <= a.maxX && z >= a.minZ && z <= a.maxZ && y >= a.minY && y <= a.maxY) return a;
  }
  return null;
}

// The campus waits for the hall: its modules are fetched only after the page's
// own load (capped), a few at a time, with the main thread handed back between
// module builds so the visitor can walk in the hall while the campus builds.
const IN_FLIGHT = 3;
// Flip to true once ?batch has been checked against ?nobatch (draw calls, screenshots, clicks).
const BATCH_BY_DEFAULT = false;

const HALL_LOAD_CENTRES = Object.freeze({
  environment: { essential: true }, facade: { essential: true }, plaza: { essential: true },
  lift: { x: 4.3, z: 15.8 },
  landscape: { x: 0, z: 28 },
  pool: { x: 0, z: 31 }, parterre: { x: 0, z: 28 },
  furniture: { x: 0, z: 32 }, wayfinding: { x: 0, z: 30 },
  trees: { x: 0, z: 30 }, garden: { x: 40, z: 30 },
  grass: { x: 38, z: 32 }, flowers: { x: 42, z: 30 },
  fountain: { x: 46, z: 30 }, pergola: { x: 54, z: 39 },
  sculptures: { x: 44, z: 36 }, amphitheatre: { x: -39, z: 30 },
  studio: { x: -11, z: 44 }, arcade: { x: 11, z: 44 },
  terrace: { x: 4, z: 15 }, cinema: { x: 0, z: 5 },
  school: { x: 0, z: 54 }, birds: { x: 0, z: 32 },
  passwords: { x: 0, z: 36 },
  metro: { x: 82, z: 34 }, skyliner: { x: 50, z: 40 },
  aviation: { x: 0, z: 34 }, npcs: { x: 0, z: 32 },
  ruins: { x: -44, z: -26 }, murals: { x: 0, z: 4 },
  vending: { x: 9, z: 22 }, cat: { x: 6, z: 24 },
  radio: { x: 4, z: 10 }, ghost: { x: -43, z: -26, after: ['ruins'] },
  floorsnake: { x: 0, z: 45 }, photobooth: { x: -21, z: 39 },
  gnome: { x: 44, z: 30 }, oddities: { x: 0, z: 34 },
  duck: { x: 0, z: 33, after: ['pool'] },
  mercado: { x: 101, z: 31, after: ['metro'] },
  marginal: { x: 4, z: 80, after: ['school'] },
  'tram-ride': { x: 86, z: 29, after: ['metro', 'npcs'] },
  arraial: { x: 71, z: 23 }, quests: { x: 0, z: 32 },
  lightpools: { x: 0, z: 32 },
});
export function hallLoadOrder(names=SPACES){
  const rank=name=>{const p=HALL_LOAD_CENTRES[name];return p?.essential?-1e6+SPACES.indexOf(name):p?(p.x*p.x+(p.z-13.5)**2):1e9;};
  const sorted=names.slice().sort((a,b)=>rank(a)-rank(b)),result=[],seen=new Set();
  function visit(name){if(seen.has(name))return;seen.add(name);for(const dependency of HALL_LOAD_CENTRES[name]?.after||[])if(names.includes(dependency))visit(dependency);result.push(name);}
  for(const name of sorted)visit(name);return result;
}
function firstCampusIdle(){return new Promise(resolve=>{if(typeof requestIdleCallback==='function')requestIdleCallback(()=>resolve(),{timeout:300});else setTimeout(resolve,0);});}

function yieldToMain() {
  return new Promise((resolve) => {
    if (typeof requestIdleCallback === 'function') requestIdleCallback(() => resolve(), { timeout: 120 });
    else if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => resolve());
    else setTimeout(resolve, 0);
  });
}

/**
 * createWorld(ctx, { hallColliders, onProgress }) → world
 * ctx: { THREE, renderer, scene, M, quality, reducedMotion, audio, ui }
 */
export async function createWorld(ctx, { hallColliders = [], onProgress, ready, loadModule = name => import(`./spaces/${name}.js`) } = {}) {
  const built = new Array(SPACES.length);
  let done = 0, next = 0;
  await ready; // The Hall artwork owns startup bandwidth; this never prepares shaders.
  await firstCampusIdle();
  const loadOrder=hallLoadOrder();
  const completed=new Map(),complete=new Map();
  for(const name of SPACES)completed.set(name,new Promise(resolve=>complete.set(name,resolve)));
  // Load nearby first; public registration remains in canonical SPACES order.
  async function worker() {
    while (next < SPACES.length) {
      const name = loadOrder[next++];
      const i = SPACES.indexOf(name);
      try {
        for(const dependency of HALL_LOAD_CENTRES[name]?.after||[])await completed.get(dependency);
        const mod = await loadModule(name);
        await yieldToMain();
        const out = await mod.build(ctx);
        if (out && out.group) {
          out.group.name = out.group.name || name;
          ctx.scene.add(out.group);
          if (FOLIAGE.has(name)) out.group.traverse((o) => o.layers.set(1));
        }
        built[i] = out || {};
      } catch (err) {
        console.warn(`[world] ${name} skipped:`, err);
      }
      complete.get(name)();
      done++;
      onProgress?.(done / SPACES.length);
      await yieldToMain();
    }
  }
  await Promise.all(Array.from({ length: Math.min(IN_FLIGHT, SPACES.length) }, worker));
  const modules = new Map();
  for (let i = 0; i < SPACES.length; i++) if (built[i]) modules.set(SPACES[i], built[i]);

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

  function registerPickables(name, list) {
    for (const object of list || []) if (!owner.has(object)) { owner.set(object, name); pickables.push(object); }
  }
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

  // Optional integration hook: tag reactions/proxies before the batcher samples.
  // Entry does not await the world; the map fetch has its own bounded timeout.
  if (typeof ctx.prepareInteractions === 'function') {
    try { await ctx.prepareInteractions({ modules, groups }); }
    catch (err) { console.warn('[interactions] preparation skipped', err); }
  }

  // Static batching (batch.js): once the campus has run a few seconds, merge
  // the meshes that provably never move into a few large ones per module and
  // ~30 m cell. OFF by default until verified in a browser: ?batch turns it on,
  // ?nobatch always leaves the world exactly as built.
  const query = typeof location !== 'undefined' ? new URLSearchParams(location.search) : null;
  const noBatch = !query || query.has('nobatch') || !(BATCH_BY_DEFAULT || query.has('batch'));
  let batcher = noBatch ? null : createBatcher({
    scene: ctx.scene, modules, pickables,
    onDone: (stats) => { world.batchStats = stats; refreshShadows(); },
  });

  function update(dt, frame) {
    syncDynamic();
    if (batcher) {
      try { batcher.tick(); } catch (err) { console.warn('[world] batching failed', err); }
      if (batcher.stats.done) batcher = null;
    }
    for (const out of modules.values()) {
      if (out.update) {
        try { out.update(dt, frame); } catch (err) { console.warn('[world] update failed', err); out.update = null; }
      }
    }
  }

  const world = { modules, groups, regions, colliders, pickables, lift, pick, actionFor, registerPickables, update, refreshShadows, batchStats: null };
  if (noBatch) world.batchStats = { disabled: true, before: 0, after: 0, merged: 0, skipped: 0 };
  return world;
}
