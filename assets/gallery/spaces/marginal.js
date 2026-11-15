// A quiet canal-side promenade behind the school, reached around its east wall.
// Seven batches; warm emissive lanterns, no extra lights or mirror render passes.
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export function build(ctx) {
  const { THREE, M } = ctx;
  const low = ctx.quality === 'low';
  const group = new THREE.Group(); group.name = 'marginal';
  const regions = [
    { minX: 20.5, maxX: 27, minZ: 53.8, maxZ: 55.5, y: 0 },
    { minX: 24, maxX: 27, minZ: 54.5, maxZ: 77, y: 0 },
    { minX: -20, maxX: 28, minZ: 76, maxZ: 83.6, y: 0 },
  ];
  const colliders = [], pickables = [], seats = [];
  const mats = [
    M.get('sandstone', { color: 0xd0c6af, roughness: 0.82 }).clone(),
    M.get('oakPlanks', { color: 0xaa7953, roughness: 0.72 }).clone(),
    M.get('steel', { color: 0xffffff, roughness: 0.4 }).clone(),
    M.get('plaster', { color: 0xffffff, roughness: 0.7 }).clone(),
    M.get('fabric', { color: 0xffffff, roughness: 0.95 }).clone(),
    M.get('plaster', { color: 0xffe4b4, roughness: 0.3 }).clone(),
    M.get('marble', { color: 0x315e6c, roughness: 0.23 }).clone(),
  ];
  mats[5].emissive.set(0xffbd76); mats[5].emissiveIntensity = 0.04;
  // Dielectric canal surface: keep the library PBR base, not its stone pattern.
  // Existing environment lighting supplies glints; no planar-reflection pass.
  for (const key of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap']) mats[6][key] = null;
  mats[6].metalness = 0;
  mats[6].roughness = 0.16;
  mats[6].envMapIntensity = 1.15;
  const parts = mats.map(() => []), colour = new THREE.Color();
  function add(k, g, x, y, z, tint = 0xffffff) {
    g.translate(x, y, z); M.boxUV(g);
    const c = new Float32Array(g.attributes.position.count * 3); colour.set(tint);
    for (let i = 0; i < c.length; i += 3) { c[i] = colour.r; c[i + 1] = colour.g; c[i + 2] = colour.b; }
    g.setAttribute('color', new THREE.BufferAttribute(c, 3)); parts[k].push(g);
  }
  function box(k, w, h, d, x, y, z, tint) { add(k, new THREE.BoxGeometry(w, h, d), x, y, z, tint); }
  function cylinder(k, r, h, x, y, z, tint) { add(k, new THREE.CylinderGeometry(r, r, h, low ? 8 : 12), x, y, z, tint); }
  function col(x, z, w, d, h) { colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2, minY: 0, maxY: h }); }
  const proxyMat = new THREE.MeshBasicMaterial({ visible: false });
  function proxy(id, label, x, y, z, w, h, d) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), proxyMat);
    p.position.set(x, y, z); p.name = 'marginal-' + id;
    p.userData.action = { type: 'custom', id, label }; group.add(p); pickables.push(p); return p;
  }
  // The new slabs begin at the existing forecourt edge; only regions overlap.
  box(0, 5.5, 0.16, 1.7, 24.25, -0.08, 54.65);
  box(0, 3, 0.16, 20.5, 25.5, -0.08, 65.75);
  box(0, 48, 0.7, 8, 4, -0.35, 80);
  // A bounded canal beyond the quay; the far bank conceals the original terrain edge.
  const waterGeo = new THREE.PlaneGeometry(48, 9, low ? 8 : 24, low ? 3 : 6);
  waterGeo.rotateX(-Math.PI / 2); add(6, waterGeo, 4, -0.012, 88.5);
  box(0, 49, 0.36, 0.7, 4, 0.08, 93.3);
  box(0, 0.65, 0.5, 9.4, -20.3, -0.05, 88.5);
  box(0, 0.65, 0.5, 9.4, 28.3, -0.05, 88.5);
  // Three horizontal rails and close-spaced uprights on the water side.
  for (const y of [0.28, 0.64, 1.05]) box(2, 48, 0.045, 0.045, 4, y, 83.85, 0x37494a);
  for (let x = -20; x <= 28; x += 1.5) {
    box(2, 0.065, 1.1, 0.065, x, 0.55, 83.85, 0x37494a);
    box(0, 0.18, 0.08, 0.18, x, 0.04, 83.85);
  }
  col(4, 83.85, 48.2, 0.09, 1.1);
  // Bench slats, curved-looking end caps and sturdy cast feet, looking over the canal.
  for (const x of [-14, -5, 6, 18]) {
    for (let i = 0; i < 4; i++) box(1, 2.25, 0.065, 0.11, x, 0.46, 81.12 + i * 0.13);
    for (const y of [0.67, 0.85]) box(1, 2.25, 0.13, 0.06, x, y, 81.04);
    for (const dx of [-0.88, 0.88]) {
      box(2, 0.075, 0.46, 0.52, x + dx, 0.23, 81.32, 0x314345);
      box(2, 0.06, 0.5, 0.06, x + dx, 0.7, 81.04, 0x314345);
      box(2, 0.08, 0.05, 0.58, x + dx, 0.67, 81.32, 0x314345);
    }
    col(x, 81.32, 2.3, 0.6, 1);
    const own = [{ x, y: 0.4925, z: 81.34, facing: [0, 1] }]; seats.push(own[0]);
    const bench = proxy('banco', 'SENTAR', x, 0.5, 81.32, 2.35, 1, 0.64);
    bench.userData.action = { type: 'sit', label: 'SENTAR', seats: own };
  }
  // Lanterns with porcelain reflectors: warm at night without adding light passes.
  for (const x of [-18, -9, 2, 13, 26]) {
    cylinder(2, 0.085, 3.1, x, 1.55, 82.4, 0x35494a);
    cylinder(0, 0.18, 0.25, x, 0.125, 82.4);
    box(2, 0.7, 0.07, 0.42, x, 3.11, 82.4, 0x35494a);
    box(5, 0.56, 0.15, 0.3, x, 2.99, 82.4);
    col(x, 82.4, 0.36, 0.36, 3.2);
  }
  // Compact kiosk; the north counter is reachable from the main promenade aisle.
  box(3, 3.2, 1, 2.2, -13, 0.5, 77.6, 0x6c9487);
  box(1, 3.4, 0.09, 0.6, -13, 1.06, 78.8);
  for (const x of [-14.5, -11.5]) for (const z of [76.6, 78.6]) box(2, 0.075, 2.5, 0.075, x, 1.25, z, 0x37494a);
  box(3, 3.4, 0.18, 2.4, -13, 2.5, 77.6, 0x446c62);
  for (let i = 0; i < 10; i++) {
    const g = new THREE.BoxGeometry(0.36, 0.045, 1.2, 1, 1, 4); g.rotateX(0.15);
    add(4, g, -14.62 + i * 0.36, 2.4, 79, i % 2 ? 0xfff3d6 : 0xc27b52);
  }
  box(5, 1.4, 0.07, 0.12, -13, 2.25, 78.6);
  cylinder(2, 0.15, 0.3, -13.8, 1.25, 78.8, 0xc0c8c4);
  box(3, 0.45, 0.15, 0.27, -12, 1.18, 78.8, 0xfff3d6);
  col(-13, 77.6, 3.4, 2.4, 2.7);
  proxy('quiosque', 'PEDIR', -13, 1.2, 78.95, 3.5, 0.8, 0.55);
  // A coin telescope that offers perspective rather than zooming the camera.
  cylinder(2, 0.09, 1.1, 11, 0.55, 82.9, 0x465c5d);
  cylinder(0, 0.28, 0.1, 11, 0.05, 82.9);
  const scope = new THREE.CylinderGeometry(0.13, 0.16, 0.65, low ? 10 : 16);
  scope.rotateX(Math.PI / 2 - 0.1); add(2, scope, 11, 1.22, 82.9, 0x9baaa8);
  box(2, 0.25, 0.05, 0.18, 11, 1.12, 82.58, 0x33474c);
  col(11, 82.9, 0.56, 0.65, 1.5);
  proxy('luneta', 'ESPREITAR', 11, 1.1, 82.9, 0.6, 0.9, 0.8);
  // Life ring is real round geometry, neither a sprite nor an extra texture.
  const ring = new THREE.TorusGeometry(0.28, 0.075, 8, low ? 16 : 24);
  add(3, ring, -1, 0.7, 83.77, 0xe68354);
  box(2, 0.06, 0.5, 0.13, -1, 0.7, 83.82, 0x37494a);
  proxy('boia', 'CONSULTAR', -1, 0.7, 83.71, 0.75, 0.8, 0.2);
  // An unoccupied rowing boat gives the water scale, with no animated actor cost.
  const hull = new THREE.SphereGeometry(1, low ? 8 : 12, 6); hull.scale(0.65, 0.25, 1.5);
  add(1, hull, 18, 0.07, 88.5);
  box(3, 0.9, 0.025, 2.2, 18, 0.26, 88.5, 0x405c63);
  for (const z of [87.9, 88.7]) box(1, 1.05, 0.06, 0.24, 18, 0.3, z);
  const wind = { value: 0 }, time = { value: 0 };
  const waterTime = { value: 0 }, waterStorm = { value: 0 };
  mats[4].onBeforeCompile = shader => {
    shader.uniforms.quayWind = wind; shader.uniforms.quayTime = time;
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nuniform float quayWind, quayTime;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed.y += quayWind * sin(position.x * 3.0 + quayTime * 5.0) * smoothstep(78.4,79.6,position.z);');
  };
  mats[4].customProgramCacheKey = () => 'marginal-wind-v1';
  mats[6].onBeforeCompile = shader => {
    shader.uniforms.quayWaterTime = waterTime;
    shader.uniforms.quayWaterStorm = waterStorm;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vQuayWater;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvQuayWater = (modelMatrix * vec4(position, 1.0)).xz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vQuayWater; uniform float quayWaterTime, quayWaterStorm;')
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        // Two long ripples and a filtered capillary component. World-space
        // slopes are rotated to view space before disturbing the PBR normal.
        float wt = quayWaterTime;
        float capillary = 1.0 - smoothstep(0.02, 0.12, max(fwidth(vQuayWater.x), fwidth(vQuayWater.y)));
        float sx = 0.026 * cos(vQuayWater.x * 3.4 + vQuayWater.y * 1.3 - wt * 0.9)
          + 0.009 * capillary * cos(vQuayWater.x * 19.0 + wt * 1.7);
        float sz = 0.018 * cos(vQuayWater.y * 4.7 - vQuayWater.x * 0.8 + wt * 0.65)
          + 0.007 * capillary * cos(vQuayWater.y * 23.0 - wt * 1.4);
        normal = normalize(normal + mat3(viewMatrix) * vec3(-sx, 0.0, -sz) * (1.0 + quayWaterStorm * 1.5));`);
  };
  mats[6].customProgramCacheKey = () => 'marginal-water-v2';
  for (let k = 0; k < mats.length; k++) {
    mats[k].vertexColors = true;
    const geo = mergeGeometries(parts[k], false); for (const p of parts[k]) p.dispose();
    const mesh = new THREE.Mesh(geo, mats[k]); mesh.name = 'marginal-batch-' + k;
    mesh.castShadow = k < 4; mesh.receiveShadow = k !== 6; mesh.matrixAutoUpdate = false; group.add(mesh);
  }
  let clock = 0, lastPick = -10;
  function update(dt, frame) {
    if (!frame || !frame.camera) return;
    const p = frame.camera.position;
    // Distance to the occupied rectangle rather than its centre: both ends wake correctly.
    const dx = Math.max(-20 - p.x, 0, p.x - 28), dz = Math.max(76 - p.z, 0, p.z - 84);
    if (dx * dx + dz * dz > 1600) return;
    clock += Math.min(0.1, Math.max(0, dt || 0));
    const weather = ctx.scene?.userData?.weather || frame.weather;
    const mode = typeof weather === 'string' ? weather : weather?.mode;
    const night = weather ? Math.max(0, Math.min(1, weather.nightK ?? (weather.night || mode === 'night' ? 1 : 0))) : 0;
    const storm = weather ? Math.max(0, Math.min(1, weather.rainK ?? (weather.storm || mode === 'storm' ? 1 : 0))) : 0;
    time.value = clock; wind.value = ctx.reducedMotion ? 0 : storm * 0.07;
    waterTime.value = ctx.reducedMotion ? 0 : clock;
    waterStorm.value = storm;
    mats[6].roughness = 0.16 + storm * 0.12;
    mats[5].emissiveIntensity = 0.04 + night * 2.3;
  }
  const lines = {
    quiosque: ['Café curto. Pausa sem limite.', 'A pressa fica lá fora.'],
    luneta: ['O horizonte não aceita reuniões.', 'Hoje, basta olhar um bocadinho.'],
    boia: ['Emergências, sim. Reuniões, talvez.', 'Salva vidas. Não salva prazos.'],
  };
  const turns = { quiosque: 0, luneta: 0, boia: 0 };
  function onPick(object) {
    const id = object?.userData?.action?.id;
    if (!lines[id] || clock - lastPick < 0.25) return;
    lastPick = clock; ctx.ui?.toast?.(lines[id][turns[id]++ % 2]);
  }
  return { group, regions, colliders, pickables, seats, update, onPick };
}
