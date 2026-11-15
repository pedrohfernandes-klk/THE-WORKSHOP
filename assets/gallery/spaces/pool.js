// The long reflecting pool on the plaza axis (BRIEF §6.1): water x ±3.5, z 24–38,
// brim-full at y 0.40 inside a 0.4 m stone coping topped at y 0.45.
import { Reflector } from 'three/addons/objects/Reflector.js';

const X0 = -3.5, X1 = 3.5, Z0 = 24, Z1 = 38, COPE = 0.4, TOP = 0.45, WATER_Y = 0.40;

const WATER_SHADER = {
  name: 'PoolWater',
  uniforms: {
    color: { value: null },
    tDiffuse: { value: null },
    textureMatrix: { value: null },
    uTime: { value: 0 },
    uSun: { value: null },
    uBasin: { value: null },
    uSkyTint: { value: null },
  },
  vertexShader: /* glsl */`
    uniform mat4 textureMatrix;
    varying vec4 vUv;
    varying vec3 vWorld;
    void main() {
      vUv = textureMatrix * vec4(position, 1.0);
      vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform vec3 uSun, uBasin, uSkyTint;
    varying vec4 vUv;
    varying vec3 vWorld;
    // cheap analytic ripple height field: a few slow crossing wave trains
    float h(vec2 p, float t) {
      float a = sin(dot(p, vec2(1.7, 0.9)) * 2.1 + t * 0.9);
      a += 0.7 * sin(dot(p, vec2(-0.8, 1.9)) * 3.3 - t * 1.2);
      a += 0.4 * sin(dot(p, vec2(2.9, -2.2)) * 5.7 + t * 1.7);
      a += 0.12 * sin(dot(p, vec2(-4.1, -3.3)) * 7.0 - t * 1.6);
      return a;
    }
    void main() {
      vec2 p = vWorld.xz;
      float t = uTime;
      float e = 0.03;
      float h0 = h(p, t);
      vec2 g = vec2(h(p + vec2(e, 0.0), t) - h0, h(p + vec2(0.0, e), t) - h0) / e;
      // mostly calm: very small slope
      vec3 n = normalize(vec3(-g.x * 0.0022, 1.0, -g.y * 0.0022));
      vec3 V = normalize(cameraPosition - vWorld);
      float cosT = clamp(dot(n, V), 0.0, 1.0);
      float fres = 0.02 + 0.98 * pow(1.0 - cosT, 5.0);
      // reflection, distorted by the surface slope
      vec2 uv = vUv.xy / vUv.w + n.xz * 0.06;
      vec3 refl = texture2D(tDiffuse, uv).rgb;
      // deep dark slate basin, brightening to sky colour at grazing angles
      vec3 deep = uBasin * (0.6 + 0.4 * cosT);
      float mirror = clamp(0.62 + 0.38 * fres, 0.0, 1.0);
      vec3 col = mix(deep, refl, mirror);
      col = mix(col, col + uSkyTint * 0.25, pow(1.0 - cosT, 3.0));
      // sun glints
      vec3 L = normalize(uSun);
      vec3 H = normalize(L + V);
      float spec = pow(max(dot(n, H), 0.0), 900.0);
      col += vec3(1.0, 0.93, 0.8) * spec * 6.0;
      gl_FragColor = vec4(col, 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
};

export async function build(ctx) {
  const { THREE, M, quality } = ctx;
  const group = new THREE.Group();
  group.name = 'pool';
  const low = quality === 'low';
  const cx = (X0 + X1) / 2, cz = (Z0 + Z1) / 2, W = X1 - X0, D = Z1 - Z0;

  // ---- coping: bevelled frame ------------------------------------------------
  const b = 0.015;
  const shape = new THREE.Shape();
  const ox = W / 2 + COPE - b, oz = D / 2 + COPE - b;
  shape.moveTo(-ox, -oz); shape.lineTo(ox, -oz); shape.lineTo(ox, oz); shape.lineTo(-ox, oz); shape.closePath();
  const hole = new THREE.Path();
  const ix = W / 2 + b, iz = D / 2 + b;
  hole.moveTo(-ix, -iz); hole.lineTo(-ix, iz); hole.lineTo(ix, iz); hole.lineTo(ix, -iz); hole.closePath();
  shape.holes.push(hole);
  const copeGeo = new THREE.ExtrudeGeometry(shape, {
    depth: TOP - 2 * b, bevelEnabled: true, bevelThickness: b, bevelSize: b, bevelSegments: 2, curveSegments: 1,
  });
  copeGeo.rotateX(-Math.PI / 2);
  copeGeo.translate(cx, b, cz);
  M.boxUV(copeGeo);
  const coping = new THREE.Mesh(copeGeo, M.get('marble'));
  coping.castShadow = coping.receiveShadow = true;
  coping.name = 'pool-coping';
  group.add(coping);

  // ---- basin (dark floor + inner walls, visible only through the grazing blend) ----
  const basinMat = new THREE.MeshStandardMaterial({ color: 0x1b2229, roughness: 0.9 });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W + 0.1, D + 0.1), basinMat);
  floor.rotation.x = -Math.PI / 2; floor.position.set(cx, 0.02, cz);
  group.add(floor);

  // ---- water ----------------------------------------------------------------
  const wGeo = new THREE.PlaneGeometry(W + 0.04, D + 0.04);
  let water, uniforms = null;
  let sun = new THREE.Vector3(0.4, 0.8, 0.3);
  try { const s = await M.sky(); sun = s.sunDirection.clone(); } catch (e) { /* keep default */ }
  if (!low) {
    const px = ctx.renderer.getPixelRatio();
    const size = ctx.renderer.getSize(new THREE.Vector2());
    const tex = Math.max(256, Math.round(Math.min(2048, Math.max(size.x, size.y) * px * 0.5)));
    water = new Reflector(wGeo, {
      textureWidth: tex, textureHeight: Math.round(tex * 0.56), clipBias: 0.003, multisample: 0,
      shader: WATER_SHADER,
    });
    uniforms = water.material.uniforms;
    uniforms.uSun.value = sun;
    uniforms.uBasin.value = new THREE.Color(0x0b1218);
    uniforms.uSkyTint.value = new THREE.Color(0.55, 0.68, 0.85);
    water.material.transparent = false;
  } else {
    water = new THREE.Mesh(wGeo, new THREE.MeshStandardMaterial({
      color: 0x0d151b, roughness: 0.03, metalness: 0.0, envMapIntensity: 1.6,
    }));
  }
  water.rotation.x = -Math.PI / 2;
  water.position.set(cx, WATER_Y, cz);
  water.name = 'pool-water';
  water.receiveShadow = false;
  group.add(water);

  // ---- sitting (sit contract) -------------------------------------------------
  // People sit on the 0.4 m coping: on its centreline (0.2 m back from the outer
  // edge their knees hang over), on its top (y TOP), facing OUTWARD — away from
  // the water, toward the plaza. The long sides seat one person every STEP: the
  // 14.4 m of centreline between the corner centres (z 23.8…38.2) holds 12 places
  // a side (z 24.4…37.6, x ±3.7), looking ±x over the parterres. Each short end
  // seats END_SEATS at the same pitch, centred on the plaza axis (x 0, ±1.2, ±2.4;
  // z 23.8 looking −z at the hall door, z 38.2 looking +z down the plaza), which
  // keeps the corners clear. One invisible pick proxy per side wraps that side's
  // stone (top, outer face, the lip above the water) PM proud; the long sides own
  // the corner squares, so the proxies tile the coping without overlapping and a
  // click anywhere on it seats you at the nearest place of the side you clicked.
  const STEP = 1.2, END_SEATS = 5, PM = 0.02, PH = TOP + PM;
  const mm = (v) => Math.round(v * 1000) / 1000 || 0;
  const seats = [], pickables = [];
  const proxyMat = new THREE.MeshBasicMaterial({ visible: false });
  function sitSide(name, own, minX, maxX, minZ, maxZ) {
    const proxy = new THREE.Mesh(new THREE.BoxGeometry(maxX - minX, PH, maxZ - minZ), proxyMat);
    proxy.name = name;
    proxy.position.set((minX + maxX) / 2, PH / 2, (minZ + maxZ) / 2);
    proxy.userData.action = { type: 'sit', seats: own };
    group.add(proxy); pickables.push(proxy); seats.push(...own);
  }
  const along = (n, c) => Array.from({ length: n }, (_, i) => mm(c + (i - (n - 1) / 2) * STEP));
  const sideZ = along(Math.floor((D + COPE) / STEP + 1e-9), cz), endX = along(END_SEATS, cx);
  sitSide('pool-seats-east', sideZ.map((z) => ({ x: mm(X1 + COPE / 2), y: TOP, z, facing: [1, 0] })),
    X1 - PM, X1 + COPE + PM, Z0 - COPE - PM, Z1 + COPE + PM);
  sitSide('pool-seats-west', sideZ.map((z) => ({ x: mm(X0 - COPE / 2), y: TOP, z, facing: [-1, 0] })),
    X0 - COPE - PM, X0 + PM, Z0 - COPE - PM, Z1 + COPE + PM);
  sitSide('pool-seats-north', endX.map((x) => ({ x, y: TOP, z: mm(Z0 - COPE / 2), facing: [0, -1] })),
    X0 + PM, X1 - PM, Z0 - COPE - PM, Z0 + PM);
  sitSide('pool-seats-south', endX.map((x) => ({ x, y: TOP, z: mm(Z1 + COPE / 2), facing: [0, 1] })),
    X0 + PM, X1 - PM, Z1 - PM, Z1 + COPE + PM);

  const colliders = [{ minX: -3.9, maxX: 3.9, minZ: 23.6, maxZ: 38.4, minY: 0, maxY: TOP }];
  let time = 0;
  return {
    group, regions: [], colliders, pickables,
    seats, // every place to sit on the coping: { x, y, z, facing: [fx, fz] }, world metres
    update(dt) {
      time += ctx.reducedMotion ? dt * 0.3 : dt;
      if (uniforms) uniforms.uTime.value = time;
    },
    onPick() {},
  };
}
