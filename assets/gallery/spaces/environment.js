// Environment module: sky background + IBL, sun with one static campus-wide
// shadow map, aerial-perspective fog matched to the horizon sky.
// The integrator must call result.refreshShadows() once after ALL modules are
// built (shadowMap.autoUpdate is false). A fallback call fires after 1.5 s.
// result.setSunDirection(dir) re-aims the sun (weather's low rainbow sun) and
// refits + re-renders the shadow map once.
export async function build(ctx) {
  const { THREE, scene, renderer } = ctx;
  const sky = await ctx.M.sky();

  // The photographed sun disc (peak ~72 000) is ~2/3 of this sky's light. Left in
  // the PMREM it fills every shadow with unshadowed sunlight (shadow:lit ~1:1.45,
  // flat, milky). Light the world from a copy with the disc capped; the shadowed
  // DirectionalLight below carries that energy. The background keeps the disc.
  let environment = sky.environment;
  try {
    const img = sky.background && sky.background.image;
    if (img && img.data instanceof Uint16Array && !sky.background.userData.discCapped) {
      const cap = THREE.DataUtils.toHalfFloat(32);
      const d = img.data.slice();
      // positive half floats order like uint16; alpha (1.0 = 0x3C00) is below the cap
      for (let i = 0; i < d.length; i++) if (d[i] > cap && d[i] < 0x8000) d[i] = cap;
      const src = new THREE.DataTexture(d, img.width, img.height, sky.background.format, sky.background.type);
      src.mapping = THREE.EquirectangularReflectionMapping;
      src.colorSpace = sky.background.colorSpace;
      src.flipY = sky.background.flipY;
      src.minFilter = src.magFilter = THREE.LinearFilter;
      src.generateMipmaps = false;
      src.needsUpdate = true;
      const pmrem = new THREE.PMREMGenerator(renderer);
      environment = pmrem.fromEquirectangular(src).texture;
      pmrem.dispose();
      src.dispose();
      environment.userData.discCapped = true;
    }
  } catch (e) { environment = sky.environment; }
  const capped = environment !== sky.environment;

  scene.background = sky.background;
  scene.backgroundIntensity = 0.9;
  scene.backgroundBlurriness = 0.0;
  scene.environment = environment;
  scene.environmentIntensity = 1.0;
  // Aerial perspective converges on the horizon sky as drawn (sky.hdr median at
  // ~5 deg: 0.39/0.40/0.47 x 0.9), a touch cooler, so distance reads paler and
  // bluer and never glows brighter than the sky behind it.
  scene.fog = new THREE.FogExp2(0xa3a9b8, 0.0012);

  // Sun direction: sanity-check, fall back to elevation 30deg, azimuth from +z/-x.
  let dir = sky.sunDirection ? sky.sunDirection.clone().normalize() : null;
  if (!dir || dir.y < 0.17 || dir.y > 0.85) {
    const el = 30 * Math.PI / 180;
    dir = new THREE.Vector3(-0.5 * Math.cos(el), Math.sin(el), 0.8 * Math.cos(el)).normalize();
    dir.y = Math.sin(el);
    const h = Math.cos(el) / Math.hypot(dir.x, dir.z);
    dir.x *= h; dir.z *= h;
  }

  const group = new THREE.Group();
  group.name = 'environment';

  const target = new THREE.Object3D();
  target.position.set(0, 0, 20);
  // With the disc out of the IBL the sun carries it: 2.6 + ~4.4 at normal
  // incidence, trimmed; weather's sunny x1.1 applies. Without the cap keep 2.6.
  const sun = new THREE.DirectionalLight(0xfff0dc, capped ? 6.0 : 2.6);
  sun.name = 'sun';
  sun.target = target;
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  sun.shadow.bias = -0.00025;
  sun.shadow.normalBias = 0.03;
  sun.shadow.radius = 2;
  group.add(sun, target);

  // Fit the orthographic shadow camera to the campus box in light space.
  const cam = sun.shadow.camera;
  const v = new THREE.Vector3();
  const sunDirection = dir.clone();
  function aim(d) {
    sunDirection.copy(d).normalize();
    sun.position.copy(target.position).addScaledVector(sunDirection, 200);
    group.updateMatrixWorld(true);
    cam.position.copy(sun.position);
    cam.lookAt(target.position);
    cam.updateMatrixWorld(true);
    const inv = cam.matrixWorldInverse.copy(cam.matrixWorld).invert();
    let l = Infinity, r = -Infinity, b = Infinity, t = -Infinity, n = Infinity, f = -Infinity;
    for (const x of [-70, 70]) for (const y of [-4.5, 14]) for (const z of [-45, 72]) {
      v.set(x, y, z).applyMatrix4(inv);
      l = Math.min(l, v.x); r = Math.max(r, v.x);
      b = Math.min(b, v.y); t = Math.max(t, v.y);
      n = Math.min(n, -v.z); f = Math.max(f, -v.z);
    }
    // Include some casters (tall trees) behind the box toward the sun.
    cam.left = l - 2; cam.right = r + 2; cam.bottom = b - 2; cam.top = t + 2;
    cam.near = Math.max(1, n - 25); cam.far = f + 5;
    cam.updateProjectionMatrix();
  }
  aim(dir);

  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = false;

  function refreshShadows() { renderer.shadowMap.needsUpdate = true; }
  refreshShadows();
  setTimeout(refreshShadows, 1500);

  return {
    group, regions: [], colliders: [], pickables: [],
    refreshShadows, sun, sunDirection: dir, update() {},
    // the photographed sun (sky.hdr); the live light direction is sun.position - target
    baseSunDirection: dir.clone(),
    setSunDirection(d) { if (d && d.lengthSq() > 1e-8) { aim(d); refreshShadows(); } },
  };
}
