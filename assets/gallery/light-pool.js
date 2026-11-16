// One fixed set of lights, shadows and fog from the very first frame.
//
// Three keys every lit shader on how many lights of each kind the scene has, on whether shadows
// are on and on fog, and it recompiles every lit material in view whenever one of those changes.
// The campus used to bring its sun (with shadows and fog), its moon, a lightning fill, a school
// hemisphere light and 15 point lights one space at a time, after the Hall was already on screen:
// about ten whole-scene recompiles in the first minute, each a visible stall. Every point light
// also costs on every lit pixel, because Three does no light culling.
//
// So the final configuration is reserved at boot, while the title screen hides the cost:
// - shadows on (PCF soft, updated on demand) and a FogExp2 with density 0 that environment.js
//   tunes in place;
// - placeholders at intensity 0 hold the places of the sun (with shadow), the moon and the two
//   hemisphere lights, and step aside the moment the real light arrives;
// - the spaces' own point lights become virtual: they keep their place, colour and animation but
//   are never drawn. Four pooled point lights stand in for the nearest, brightest of them.
export function createLightPool(THREE, scene, renderer, { points = 4 } = {}) {
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = false;
  if (!scene.fog) scene.fog = new THREE.FogExp2(0xa3a9b8, 0);

  const known = new WeakSet();
  const holders = { shadow: [], dir: [], hemi: [] };
  function hold(kind) {
    const l = kind === 'hemi' ? new THREE.HemisphereLight(0xffffff, 0x000000, 0) : new THREE.DirectionalLight(0xffffff, 0);
    l.name = 'reserved-' + kind;
    if (kind === 'shadow') { l.castShadow = true; l.shadow.mapSize.set(16, 16); }
    scene.add(l); if (l.target) scene.add(l.target);
    known.add(l); holders[kind].push(l);
  }
  hold('shadow'); hold('dir'); hold('hemi'); hold('hemi');
  function release(kind) {
    const l = holders[kind].pop();
    if (!l) return false;
    l.parent?.remove(l); l.target?.parent?.remove(l.target);
    l.shadow?.dispose?.(); l.dispose?.();
    return true;
  }

  const slots = [];
  for (let i = 0; i < points; i++) {
    const l = new THREE.PointLight(0xffffff, 0, 1, 2);
    l.name = 'pool-point-' + i; scene.add(l); known.add(l);
    slots.push({ light: l, rec: null, k: 0 });
  }

  const virtual = [];
  function virtualize(light) {
    const rec = { light, wanted: light.visible !== false, pos: new THREE.Vector3(), score: 0, held: false };
    // The renderer reads `visible === false` and skips the light; a space that hides or shows
    // its light still does, through `wanted`.
    Object.defineProperty(light, 'visible', { configurable: true, enumerable: true, get() { return false; }, set(v) { rec.wanted = !!v; } });
    virtual.push(rec);
  }

  // Before a space's group joins the scene: its point lights go virtual now, so shaders compiled
  // ahead of time see the final counts. Returns true when the group holds a directional or
  // hemisphere light, whose placeholder can only step aside once the group is in the scene.
  function prepare(root) {
    let global = false;
    root?.traverse((o) => {
      if (!o.isLight || known.has(o)) return;
      if (o.isPointLight && !o.castShadow) { known.add(o); virtualize(o); }
      else global = true;
    });
    return global;
  }

  // Call after anything new has been added to the scene (a space's group, the weather).
  let overflow = 0;
  function adoptScene() {
    const found = [];
    scene.traverse((o) => { if (o.isLight && !known.has(o)) found.push(o); });
    for (const l of found) {
      known.add(l);
      if (l.isPointLight && !l.castShadow) virtualize(l);
      else if (l.isDirectionalLight) { if (!release(l.castShadow ? 'shadow' : 'dir')) overflow++; }
      // A hemisphere light moves to the scene root (same world position, so the same sky direction):
      // a pass that hides its space's group, like the hall-floor mirror, then still counts it.
      else if (l.isHemisphereLight) { if (!release('hemi')) overflow++; else if (l.parent !== scene) scene.attach(l); }
      else overflow++;   // spot or shadowed point light: drawn as is (it changes the counts once)
    }
    if (overflow && typeof console !== 'undefined') { console.debug?.(`[light-pool] ${overflow} light(s) beyond the reserved set`); overflow = 0; }
  }

  function shown(l) { for (let p = l.parent; p; p = p.parent) if (p.visible === false) return false; return true; }
  const cam = new THREE.Vector3();
  function update(camera, dt) {
    if (!virtual.length) return;
    camera.getWorldPosition(cam);
    for (const r of virtual) {
      const l = r.light; r.score = 0;
      if (!r.wanted || !(l.intensity > 0) || !shown(l)) continue;
      l.getWorldPosition(r.pos);
      const range = l.distance > 0 ? l.distance : 20, d = r.pos.distanceTo(cam);
      if (d > range + 18) continue;
      const far = Math.max(0, d - range * 0.5) / range;
      // Lights already in a slot get a margin, so two close rivals do not trade places.
      r.score = l.intensity / (1 + far * far) * (r.held ? 1.3 : 1);
    }
    const ranked = virtual.filter((r) => r.score > 0).sort((a, b) => b.score - a.score).slice(0, slots.length);
    const wanted = new Set(ranked);
    const rate = Math.min(1, (dt || 0.016) * 5);
    for (const s of slots) {
      if (s.rec && !wanted.has(s.rec)) { s.k -= rate; if (s.k <= 0) { s.k = 0; s.rec.held = false; s.rec = null; } }
      else if (s.rec) s.k = Math.min(1, s.k + rate);
    }
    for (const r of ranked) {
      if (r.held) continue;
      const s = slots.find((x) => !x.rec);
      if (!s) break;
      s.rec = r; s.k = 0; r.held = true;
    }
    for (const s of slots) {
      const pl = s.light;
      if (!s.rec) { pl.intensity = 0; continue; }
      const l = s.rec.light;
      pl.color.copy(l.color); pl.intensity = l.intensity * s.k; pl.distance = l.distance; pl.decay = l.decay;
      pl.position.copy(s.rec.pos);
    }
  }

  return { prepare, adoptScene, update, get virtualCount() { return virtual.length; }, slots };
}
