// batch.js — static batching for the campus: fewer, larger draw calls.
//
// Each space module is built from many small meshes; on ordinary GPUs the
// number of draw calls, not triangles, is what costs the frame. Once the world
// has run for a few seconds, every mesh that provably stays put is merged with
// the others of its module that share its material and render flags, one merged
// mesh per ~30 m cell so frustum culling keeps working. Merged meshes stay
// children of their module's group (group-level visibility, e.g. grass hidden
// indoors, still applies) and keep their layers, shadow flags and render order.
//
// A mesh is merged only when ALL of these hold:
//   - its module is one whose code has been read (BATCH_MODULES); modules that
//     animate parts on events, and any module added later, are left alone;
//   - its matrixWorld, parent, material, geometry and visibility did not change
//     during the settle window (sampled, not guessed from names);
//   - it and its ancestors are visible, not in any module's pickables, and carry
//     no userData (actions, labels and animation state live there);
//   - it is a plain THREE.Mesh: not Instanced/Skinned/Batched, no subclass
//     (Reflector, Water…), no onBeforeRender/onAfterRender, no morph targets,
//     no children, no custom depth material;
//   - its material is single, opaque, depth-tested and depth-written, visible,
//     not transmissive, without a material onBeforeRender hook; a custom shader
//     (ShaderMaterial / onBeforeCompile) is merged only when the mesh's transform
//     relative to its group is the identity, so the shader sees identical data;
//   - its geometry is static (no dynamic usage, attribute versions unchanged),
//     triangles only, full draw range.
// Disable with ?nobatch (world.js) to compare.
import * as THREE from 'three';

// Modules reviewed for event-driven motion, material swaps and visibility
// toggles: none found (continuous motion — the ruins' lamp, crows — is caught by
// sampling or by their userData).
export const BATCH_MODULES = new Set([
  'environment', 'landscape', 'facade', 'plaza', 'pool', 'parterre', 'furniture', 'signage',
  'trees', 'garden', 'grass', 'flowers', 'pergola', 'sculptures', 'amphitheatre',
  'studio', 'terrace', 'school', 'ruins',
]);

// Never batched (documentation: anything not in BATCH_MODULES is skipped anyway).
// They move, open, play or toggle parts on events, or are still being written.
export const BATCH_DENY = new Set([
  'npcs', 'birds', 'aviation', 'skyliner', 'metro', 'lift', 'fountain', 'cinema', 'arcade', 'weather',
  'floppies', 'duck', 'vending', 'cat', 'radio', 'ghost', 'floorsnake', 'photobooth', 'gnome',
  'murals', 'oddities',
]);

const CELL = 30;                  // metres per spatial cell
const MAX_VERTICES = 1 << 20;     // per merged mesh
const SETTLE_S = 4;               // seconds of sampling before merging
const MIN_SAMPLES = 6;
const SAMPLE_EVERY_S = 0.25;

const BASE_RENDER = THREE.Object3D.prototype.onBeforeRender;
const BASE_AFTER = THREE.Object3D.prototype.onAfterRender;
const BASE_COMPILE = THREE.Material.prototype.onBeforeCompile;
const BASE_CACHE_KEY = THREE.Material.prototype.customProgramCacheKey;
const BASE_MAT_RENDER = THREE.Material.prototype.onBeforeRender;

function hasKeys(o) { for (const k in o) return true; return false; }  // eslint-disable-line no-unreachable-loop

function isCustomShader(m) {
  return !!(m.isShaderMaterial || m.isRawShaderMaterial
    || m.onBeforeCompile !== BASE_COMPILE || m.customProgramCacheKey !== BASE_CACHE_KEY);
}

function usageOf(a) { return a.isInterleavedBufferAttribute ? a.data.usage : a.usage; }
function versionOf(g) {
  let v = g.index ? g.index.version : 0;
  for (const k in g.attributes) { const a = g.attributes[k]; v += a.isInterleavedBufferAttribute ? a.data.version : a.version; }
  return v;
}

// Why a mesh (on its own merits) cannot be merged, or null.
function meshReason(o) {
  if (Object.getPrototypeOf(o) !== THREE.Mesh.prototype) {
    return o.isInstancedMesh ? 'instanced' : o.isSkinnedMesh ? 'skinned' : o.isMesh ? 'mesh-subclass' : 'not-a-mesh';
  }
  if (o.children.length) return 'has-children';
  if (o.onBeforeRender !== BASE_RENDER || o.onAfterRender !== BASE_AFTER) return 'render-hook';
  if (o.morphTargetInfluences && o.morphTargetInfluences.length) return 'morph';
  if (o.customDepthMaterial || o.customDistanceMaterial) return 'custom-depth';
  const m = o.material;
  if (!m || Array.isArray(m)) return 'multi-material';
  if (m.transparent) return 'transparent';
  if (m.visible === false) return 'invisible-material';
  if (!m.depthTest || !m.depthWrite) return 'depth-flags';
  if (m.transmission > 0) return 'transmission';
  if (m.wireframe) return 'wireframe';
  if (m.onBeforeRender !== BASE_MAT_RENDER) return 'material-hook';
  const g = o.geometry;
  if (!g || !g.isBufferGeometry || g.isInstancedBufferGeometry) return 'geometry';
  const pos = g.attributes.position;
  if (!pos || pos.itemSize !== 3 || pos.count === 0) return 'geometry';
  if (g.attributes.normal && g.attributes.normal.itemSize !== 3) return 'geometry';
  if (g.attributes.tangent && g.attributes.tangent.itemSize !== 4) return 'geometry';
  for (const k in g.morphAttributes) if (g.morphAttributes[k].length) return 'morph';
  const n = g.index ? g.index.count : pos.count;
  if (n === 0 || n % 3) return 'geometry';
  if (g.drawRange.start !== 0 || g.drawRange.count < n) return 'draw-range';
  for (const k in g.attributes) if (usageOf(g.attributes[k]) !== THREE.StaticDrawUsage) return 'dynamic-attribute';
  if (g.index && usageOf(g.index) !== THREE.StaticDrawUsage) return 'dynamic-attribute';
  return null;
}

// Attribute names the merged geometry carries (sorted). `color` is dropped when
// a built-in material ignores it; everything else must match exactly.
function attributeNames(g, m) {
  const keepColor = m.vertexColors || isCustomShader(m);
  return Object.keys(g.attributes).filter((n) => n !== 'color' || keepColor).sort();
}

// Did this candidate change since it was first sampled? (Module-level group
// visibility is not checked: merged meshes stay in the group, so it still applies.)
function moved(c) {
  const o = c.o;
  if (o.parent !== c.parent || o.material !== c.mat || o.geometry !== c.geo) return true;
  for (let p = o; p && p !== c.group; p = p.parent) if (!p.visible) return true;
  const e = o.matrixWorld.elements, m = c.m;
  for (let i = 0; i < 16; i++) if (Math.abs(e[i] - m[i]) > 1e-6 * (1 + Math.abs(m[i]))) return true;
  return versionOf(o.geometry) !== c.v;
}

const IDENTITY_EPS = 1e-9;
function isIdentity(m) {
  const e = m.elements;
  for (let i = 0; i < 16; i++) if (Math.abs(e[i] - (i % 5 === 0 ? 1 : 0)) > IDENTITY_EPS) return false;
  return true;
}

// Raycasts against a merged mesh only test the triangles of the original meshes
// whose boxes the ray meets, so clicks cost what they did before batching.
const _inv = new THREE.Matrix4();
const _ray = new THREE.Ray();
const _sphere = new THREE.Sphere();
const _hitAt = new THREE.Vector3();
function partRaycast(raycaster, intersects) {
  const g = this.geometry;
  if (this.material === undefined) return;
  _sphere.copy(g.boundingSphere).applyMatrix4(this.matrixWorld);
  _ray.copy(raycaster.ray).recast(raycaster.near);
  if (_sphere.containsPoint(_ray.origin) === false) {
    if (_ray.intersectSphere(_sphere, _hitAt) === null) return;
    if (_ray.origin.distanceToSquared(_hitAt) > (raycaster.far - raycaster.near) ** 2) return;
  }
  _inv.copy(this.matrixWorld).invert();
  _ray.copy(raycaster.ray).applyMatrix4(_inv);
  if (_ray.intersectsBox(g.boundingBox) === false) return;
  const dr = g.drawRange, s0 = dr.start, c0 = dr.count;
  try {
    for (const p of this.batchParts) {
      if (!_ray.intersectsBox(p.box)) continue;
      dr.start = p.start; dr.count = p.count;
      this._computeIntersections(raycaster, intersects, _ray);
    }
  } finally {
    dr.start = s0; dr.count = c0;
  }
}

const _v = new THREE.Vector3();
const _nm = new THREE.Matrix3();
// items: [{ o, rel, flip }] sharing material, flags and attribute names.
function mergeItems(items, names) {
  let nv = 0, ni = 0;
  for (const it of items) {
    const g = it.o.geometry;
    nv += g.attributes.position.count;
    ni += g.index ? g.index.count : g.attributes.position.count;
  }
  const first = items[0].o.geometry;
  const sizes = names.map((n) => first.attributes[n].itemSize);
  const arrays = sizes.map((s) => new Float32Array(nv * s));
  const index = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni);
  const parts = [];
  let vo = 0, io = 0;
  for (const it of items) {
    const g = it.o.geometry, rel = it.rel;
    const count = g.attributes.position.count;
    _nm.getNormalMatrix(rel);
    const box = new THREE.Box3();
    for (let k = 0; k < names.length; k++) {
      const name = names[k], a = g.attributes[name], s = sizes[k], out = arrays[k];
      if (name === 'position') {
        for (let i = 0; i < count; i++) {
          _v.fromBufferAttribute(a, i).applyMatrix4(rel);
          const j = (vo + i) * 3; out[j] = _v.x; out[j + 1] = _v.y; out[j + 2] = _v.z;
          box.expandByPoint(_v);
        }
      } else if (name === 'normal') {
        for (let i = 0; i < count; i++) {
          _v.fromBufferAttribute(a, i).applyMatrix3(_nm).normalize();
          const j = (vo + i) * 3; out[j] = _v.x; out[j + 1] = _v.y; out[j + 2] = _v.z;
        }
      } else if (name === 'tangent') {
        for (let i = 0; i < count; i++) {
          _v.set(a.getX(i), a.getY(i), a.getZ(i)).transformDirection(rel);
          const j = (vo + i) * 4; out[j] = _v.x; out[j + 1] = _v.y; out[j + 2] = _v.z; out[j + 3] = a.getW(i);
        }
      } else {
        for (let i = 0; i < count; i++) {
          const j = (vo + i) * s;
          for (let c = 0; c < s; c++) out[j + c] = a.getComponent(i, c);
        }
      }
    }
    // A mirrored transform reverses the winding; flip it back so front faces stay front.
    const start = io;
    const src = g.index;
    const n = src ? src.count : count;
    for (let i = 0; i < n; i += 3) {
      const a0 = src ? src.getX(i) : i, b0 = src ? src.getX(i + 1) : i + 1, c0 = src ? src.getX(i + 2) : i + 2;
      index[io++] = vo + a0;
      if (it.flip) { index[io++] = vo + c0; index[io++] = vo + b0; } else { index[io++] = vo + b0; index[io++] = vo + c0; }
    }
    box.expandByScalar(1e-4);
    parts.push({ box, start, count: io - start });
    vo += count;
  }
  const geo = new THREE.BufferGeometry();
  names.forEach((n, k) => geo.setAttribute(n, new THREE.BufferAttribute(arrays[k], sizes[k])));
  geo.setIndex(new THREE.BufferAttribute(index, 1));
  geo.computeBoundingBox();
  geo.computeBoundingSphere();
  return { geo, parts };
}

function countRenderables(groups) {
  let n = 0;
  for (const g of groups) g.traverse((o) => { if (o.isMesh || o.isPoints || o.isLine || o.isSprite) n++; });
  return n;
}

/**
 * createBatcher({ scene, modules, pickables, onDone }) → { tick(), stats }
 * modules: Map name → module output ({ group, ... }). Call tick() once per
 * frame; it samples for SETTLE_S seconds, then merges one module per frame,
 * then calls onDone(stats).
 */
export function createBatcher({ scene, modules, pickables = [], onDone } = {}) {
  const pickSet = new Set(pickables);
  for (const out of modules.values()) for (const p of out.pickables || []) pickSet.add(p);
  const groups = [...modules].filter(([, o]) => o && o.group).map(([n, o]) => [n, o.group]);
  const reasons = {};
  const note = (r) => { reasons[r] = (reasons[r] || 0) + 1; };
  const stats = { before: 0, after: 0, merged: 0, skipped: 0, batches: 0, reasons, done: false, ms: 0 };
  let phase = 'idle';
  let t0 = 0, lastSample = 0, samples = 0;
  const byModule = new Map();  // name → candidates
  let queue = [];
  const removedGeometries = new Set();

  function collect() {
    stats.before = countRenderables(groups.map(([, g]) => g));
    for (const [name, group] of groups) {
      const list = [];
      byModule.set(name, list);
      if (!BATCH_MODULES.has(name)) {
        group.traverse((o) => { if (o.isMesh || o.isPoints || o.isLine || o.isSprite) note(BATCH_DENY.has(name) ? 'module-denied' : 'module-unknown'); });
        continue;
      }
      group.updateMatrixWorld(true);
      const walk = (o, blocked) => {
        if (o !== group) {
          if (!o.visible) blocked = blocked || 'hidden';
          else if (pickSet.has(o)) blocked = blocked || 'pickable';
          else if (hasKeys(o.userData)) blocked = blocked || 'userData';
        } else if (pickSet.has(o) || (o.userData && o.userData.action)) {
          blocked = 'pickable';
        }
        if (o.isMesh || o.isPoints || o.isLine || o.isSprite) {
          const r = blocked || meshReason(o);
          if (r) note(r);
          else list.push({ o, group, parent: o.parent, mat: o.material, geo: o.geometry, m: Float64Array.from(o.matrixWorld.elements), v: versionOf(o.geometry), moved: false });
        }
        for (const c of o.children) walk(c, blocked);
      };
      walk(group, null);
    }
  }

  function mergeModule(name) {
    const list = byModule.get(name) || [];
    if (!list.length) return;
    const group = list[0].group;
    const inv = new THREE.Matrix4().copy(group.matrixWorld).invert();
    const buckets = new Map();
    for (const c of list) {
      if (c.moved || moved(c)) { note('moved'); continue; }
      const o = c.o, g = o.geometry, m = o.material;
      const rel = new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld);
      if (isCustomShader(m) && !isIdentity(rel)) { note('custom-shader'); continue; }
      const det = rel.determinant();
      if (!Number.isFinite(det) || Math.abs(det) < 1e-12) { note('degenerate'); continue; }
      if (g.attributes.tangent && det < 0) { note('mirrored-tangents'); continue; }
      if (g.boundingSphere === null) g.computeBoundingSphere();
      _sphere.copy(g.boundingSphere).applyMatrix4(o.matrixWorld);
      if (!Number.isFinite(_sphere.radius) || !Number.isFinite(_sphere.center.x)) { note('geometry'); continue; }
      const cell = _sphere.radius > CELL ? 'big'
        : `${Math.floor(_sphere.center.x / CELL)},${Math.floor(_sphere.center.z / CELL)}`;
      const names = attributeNames(g, m);
      const sig = names.map((n) => n + g.attributes[n].itemSize).join(',');
      const key = `${m.uuid}|${o.layers.mask}|${+o.castShadow}${+o.receiveShadow}${+o.frustumCulled}|${o.renderOrder}|${sig}|${cell}`;
      let b = buckets.get(key);
      if (!b) buckets.set(key, (b = { names, items: [] }));
      b.items.push({ o, rel, flip: det < 0 });
    }
    let made = 0;
    for (const { names, items } of buckets.values()) {
      if (items.length < 2) { note('alone'); continue; }
      // Chunk very large buckets.
      const chunks = [];
      let cur = [], verts = 0;
      for (const it of items) {
        const c = it.o.geometry.attributes.position.count;
        if (cur.length && verts + c > MAX_VERTICES) { chunks.push(cur); cur = []; verts = 0; }
        cur.push(it); verts += c;
      }
      if (cur.length) chunks.push(cur);
      for (const chunk of chunks) {
        if (chunk.length < 2) { note('alone'); continue; }
        const { geo, parts } = mergeItems(chunk, names);   // may throw: nothing changed yet
        const f = chunk[0].o;
        const mesh = new THREE.Mesh(geo, f.material);
        mesh.name = `batch:${name}:${made++}`;
        mesh.layers.mask = f.layers.mask;
        mesh.castShadow = f.castShadow;
        mesh.receiveShadow = f.receiveShadow;
        mesh.renderOrder = f.renderOrder;
        mesh.frustumCulled = f.frustumCulled;
        mesh.matrixAutoUpdate = false;     // identity: the group's own transform applies
        mesh.batchParts = parts;
        mesh.raycast = partRaycast;
        group.add(mesh);
        mesh.updateMatrixWorld(true);
        for (const it of chunk) {
          it.o.removeFromParent();
          removedGeometries.add(it.o.geometry);
        }
        stats.merged += chunk.length;
        stats.batches++;
      }
    }
  }

  function finish() {
    // Free the GPU buffers of geometries nothing draws any more.
    const used = new Set();
    scene.traverse((o) => { if (o.geometry) used.add(o.geometry); });
    let disposed = 0;
    for (const g of removedGeometries) if (!used.has(g)) { g.dispose(); disposed++; }
    removedGeometries.clear();
    stats.disposedGeometries = disposed;
    stats.after = countRenderables(groups.map(([, g]) => g));
    stats.skipped = stats.before - stats.merged;
    stats.done = true;
    phase = 'done';
    byModule.clear();
    try { onDone?.(stats); } catch (err) { console.warn('[batch] onDone failed', err); }
  }

  function tick() {
    if (phase === 'done') return;
    const now = performance.now() / 1000;
    const started = performance.now();
    try {
      if (phase === 'idle') {
        collect();
        phase = 'sampling'; t0 = lastSample = now; samples = 0;
      } else if (phase === 'sampling') {
        if (now - lastSample < SAMPLE_EVERY_S) return;
        lastSample = now; samples++;
        for (const list of byModule.values()) for (const c of list) if (!c.moved && moved(c)) c.moved = true;
        if (samples >= MIN_SAMPLES && now - t0 >= SETTLE_S) { phase = 'merging'; queue = [...byModule.keys()]; }
      } else if (phase === 'merging') {
        // One module with work per frame, so the merge never stalls a frame for long.
        while (queue.length) {
          const name = queue.shift();
          if ((byModule.get(name) || []).length) { mergeModule(name); break; }
        }
        if (!queue.length) finish();
      }
    } catch (err) {
      console.warn('[batch] stopped:', err);
      stats.error = String(err && err.message || err);
      finish();
    } finally {
      stats.ms += performance.now() - started;
    }
  }

  return { tick, stats };
}
