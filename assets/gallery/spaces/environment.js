// Environment module: sky background + IBL, sun with one static campus-wide
// shadow map, subtle aerial-perspective fog.
// The integrator must call result.refreshShadows() once after ALL modules are
// built (shadowMap.autoUpdate is false). A fallback call fires after 1.5 s.
// Recommended renderer.toneMappingExposure: 0.85 (ACES).
export async function build(ctx) {
  const { THREE, scene, renderer } = ctx;
  const sky = await ctx.M.sky();

  scene.background = sky.background;
  scene.backgroundIntensity = 0.9;
  scene.backgroundBlurriness = 0.0;
  scene.environment = sky.environment;
  scene.environmentIntensity = 1.0;
  scene.fog = new THREE.FogExp2(0xc9d2dd, 0.0012);

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
  const sun = new THREE.DirectionalLight(0xfff0dc, 2.6);
  sun.name = 'sun';
  sun.position.copy(target.position).addScaledVector(dir, 200);
  sun.target = target;
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  sun.shadow.bias = -0.00025;
  sun.shadow.normalBias = 0.03;
  sun.shadow.radius = 2;
  group.add(sun, target);
  group.updateMatrixWorld(true);

  // Fit the orthographic shadow camera to the campus box in light space.
  const cam = sun.shadow.camera;
  cam.position.copy(sun.position);
  cam.lookAt(target.position);
  cam.updateMatrixWorld(true);
  const inv = cam.matrixWorldInverse.copy(cam.matrixWorld).invert();
  const v = new THREE.Vector3();
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

  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = false;

  function refreshShadows() { renderer.shadowMap.needsUpdate = true; }
  refreshShadows();
  setTimeout(refreshShadows, 1500);

  return {
    group, regions: [], colliders: [], pickables: [],
    refreshShadows, sun, sunDirection: dir, update() {},
  };
}
