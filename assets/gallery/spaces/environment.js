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
  // flat, milky). Light the world from a copy with the sun inpainted (disc and
  // aureole replaced by the surrounding sky); the shadowed DirectionalLight below
  // carries that energy. The copy is also offered as `backgroundNoSun`, so weather
  // can draw its own sun at any elevation (golden hour, radiant noon, rainbow).
  // scene.background keeps the photographed disc for anything without weather.
  let environment = sky.environment, backgroundNoSun = null;
  try {
    const bg = sky.background, img = bg && bg.image;
    if (img && img.data instanceof Uint16Array && img.width > 8) {
      const W = img.width, H = img.height, d = img.data.slice();
      const h2f = THREE.DataUtils.fromHalfFloat, f2h = THREE.DataUtils.toHalfFloat;
      // brightest texel = the sun (positive half floats order like uint16)
      let best = 0, bi = 0;
      for (let p = 0, n = W * H; p < n; p++) { const x = d[p * 4 + 1]; if (x > best && x < 0x7c00) { best = x; bi = p; } }
      const i0 = bi % W, j0 = (bi / W) | 0;
      const cl = Math.max(0.15, Math.cos(Math.PI * (0.5 - (j0 + 0.5) / H)));
      const ppd = W / 360, R0 = 2.4, R1 = 5.5, RR = 6.5;
      const di = Math.ceil(RR * ppd / cl), dj = Math.ceil(RR * ppd);
      const j0a = Math.max(0, j0 - dj), j0b = Math.min(H - 1, j0 + dj);
      const at = (ii, j) => ((((i0 + ii) % W) + W) % W + j * W) * 4;
      let sr = 0, sg = 0, sb = 0, sn = 0;
      for (let j = j0a; j <= j0b; j++) for (let ii = -di; ii <= di; ii++) {
        const r = Math.hypot(ii * cl, j - j0) / ppd; if (r < R1 || r > RR) continue;
        const p = at(ii, j);
        sr += Math.min(h2f(d[p]), 8); sg += Math.min(h2f(d[p + 1]), 8); sb += Math.min(h2f(d[p + 2]), 8); sn++;
      }
      if (sn) {
        const ring = [sr / sn, sg / sn, sb / sn];
        for (let j = j0a; j <= j0b; j++) for (let ii = -di; ii <= di; ii++) {
          const r = Math.hypot(ii * cl, j - j0) / ppd; if (r >= R1) continue;
          const t = Math.max(0, Math.min(1, (r - R0) / (R1 - R0))), s2 = t * t * (3 - 2 * t);
          const p = at(ii, j);
          for (let c = 0; c < 3; c++) {
            const o = h2f(d[p + c]), a = ring[c];
            d[p + c] = f2h(Math.max(0, Math.min(a + (o - a) * s2, a * (1 + 3 * s2))));
          }
        }
      }
      const cap = f2h(32); // safety: no stray texel may light the world unshadowed
      for (let i = 0; i < d.length; i++) if (d[i] > cap && d[i] < 0x8000) d[i] = cap;
      const src = new THREE.DataTexture(d, W, H, bg.format, bg.type);
      src.mapping = THREE.EquirectangularReflectionMapping;
      src.colorSpace = bg.colorSpace;
      src.flipY = bg.flipY;
      src.minFilter = src.magFilter = THREE.LinearFilter;
      src.generateMipmaps = false;
      src.needsUpdate = true;
      const pmrem = new THREE.PMREMGenerator(renderer);
      environment = pmrem.fromEquirectangular(src).texture;
      pmrem.dispose();
      environment.userData.discCapped = true;
      backgroundNoSun = src;
    }
  } catch (e) { environment = sky.environment; backgroundNoSun = null; }
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
    backgroundNoSun,
    setSunDirection(d) { if (d && d.lengthSq() > 1e-8) { aim(d); refreshShadows(); } },
  };
}
