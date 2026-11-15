// Birds: small flocks of dark swifts circling high over the campus (25-70 m).
// One InstancedMesh for every bird. Each bird is a tiny low-poly body with two
// swept wings; the vertex shader flaps the wings (per-instance phase, rate and
// amplitude) and occasionally holds them still for a glide. Flock centres trace
// smooth Lissajous loops; each bird trails its flock leader with a small
// individual wobble. No per-frame allocation: scratch vectors and one Object3D
// are reused.

export function build(ctx) {
  const { THREE, quality } = ctx;
  const group = new THREE.Group();
  group.name = 'birds';

  if (ctx.reducedMotion) {
    return { group, regions: [], colliders: [], pickables: [], update() {} };
  }

  const low = quality === 'low';

  // deterministic random so the flocks look the same on every visit
  let seed = 90210;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const rr = (a, b) => a + (b - a) * rnd();

  // c: flock centre; a: loop amplitude per axis; w: angular rates; p: phases; n: birds
  const FLOCKS = [
    { n: 12, c: [-10, 45, 0], a: [36, 14, 22], w: [0.11, 0.07, 0.085], p: [0.3, 1.1, 2.0] },
    { n: 10, c: [26, 55, 14], a: [22, 10, 20], w: [0.09, 0.12, 0.10], p: [2.2, 0.4, 1.3] },
    { n: 9, c: [-28, 40, -16], a: [18, 12, 14], w: [0.13, 0.09, 0.11], p: [4.0, 2.5, 0.7] },
  ].slice(0, low ? 2 : 3);

  const birds = [];
  for (let fi = 0; fi < FLOCKS.length; fi++) {
    const f = FLOCKS[fi];
    const n = low ? 8 : f.n;
    for (let k = 0; k < n; k++) {
      birds.push({
        f,
        lag: k * 0.035,                       // trail the leader a little
        o: [rr(-5, 5), rr(-1.5, 1.5), rr(-4, 4)],  // offset inside the flock
        q: [rnd() * 6.283, rnd() * 6.283, rnd() * 6.283],
      });
    }
  }
  const N = birds.length;

  // ---- bird template: fuselage + two swept wings (non-indexed) ----
  const pos = [];
  const flex = []; // 0 = body (rigid), 1 = wing tip; the flap bends wings by this weight
  const tri = (a, b, c) => {
    pos.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
    for (let i = 0; i < 3; i++) flex.push(0);
  };
  const triF = (a, b, c, fa, fb, fc) => {
    pos.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
    flex.push(fa, fb, fc);
  };
  // body: slim double-pyramid, nose at +z (direction of travel)
  const Nz = [0, 0, 0.1], Tp = [0, 0.018, 0], Lf = [-0.022, 0, 0], Rt = [0.022, 0, 0];
  const Bt = [0, -0.012, 0], Tl = [0, 0, -0.1];
  tri(Nz, Rt, Tp); tri(Nz, Tp, Lf); tri(Nz, Lf, Bt); tri(Nz, Bt, Rt);
  tri(Tl, Tp, Rt); tri(Tl, Lf, Tp); tri(Tl, Bt, Lf); tri(Tl, Rt, Bt);
  // wings: root front, mid front, tip (swept back like a swift), root back
  const flexOf = (x) => Math.min(Math.max((Math.abs(x) - 0.02) / 0.205, 0), 1);
  for (const s of [1, -1]) {
    const rF = [s * 0.02, 0, 0.05], mF = [s * 0.12, 0, 0.035];
    const tp = [s * 0.225, 0, -0.07], rB = [s * 0.02, 0, -0.045];
    triF(rF, mF, rB, 0, flexOf(mF[0]), 0);
    triF(mF, tp, rB, flexOf(mF[0]), 1, 0);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('aFlex', new THREE.Float32BufferAttribute(flex, 1));
  geo.computeVertexNormals();

  // per-instance flap: x = phase (0..1), y = angular rate, z = amplitude (m)
  const flap = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    flap[i * 3] = rnd();
    flap[i * 3 + 1] = rr(13, 17);
    flap[i * 3 + 2] = rr(0.05, 0.075);
  }
  geo.setAttribute('aFlap', new THREE.InstancedBufferAttribute(flap, 3));

  const uTime = { value: 0 };
  const mat = new THREE.MeshStandardMaterial({
    color: 0x2c333b, roughness: 0.62, metalness: 0.05, side: THREE.DoubleSide,
  });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uTime;
    shader.vertexShader = 'attribute float aFlex;\nattribute vec3 aFlap;\nuniform float uTime;\n' +
      shader.vertexShader.replace('#include <begin_vertex>', [
        'vec3 transformed = vec3( position );',
        'float ph = aFlap.x * 6.2831853;',
        // glide: wings held still for a while, a fraction of the time per bird
        'float glide = smoothstep( 0.6, 0.9, sin( uTime * 0.21 + ph ) );',
        'float flapY = sin( uTime * aFlap.y + ph ) * aFlap.z * ( 1.0 - glide );',
        'transformed.y += flapY * aFlex;',
        'transformed.x *= 1.0 + 0.08 * aFlex * flapY / max( aFlap.z, 1e-4 );',
      ].join('\n'));
  };
  mat.customProgramCacheKey = () => 'birds-flap-v1';

  const mesh = new THREE.InstancedMesh(geo, mat, N);
  mesh.name = 'birds-flock';
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.frustumCulled = false; // flocks roam; the template bounds do not cover them
  group.add(mesh);

  // ---- motion: flock centre on a Lissajous loop, bird = centre(t - lag) + offset + wobble ----
  const P = new THREE.Vector3(), Q = new THREE.Vector3(), T = new THREE.Vector3();
  const dummy = new THREE.Object3D();
  function posAt(b, t, out) {
    const f = b.f, tl = t - b.lag;
    out.set(
      f.c[0] + f.a[0] * Math.sin(f.w[0] * tl + f.p[0]) + b.o[0] + 1.8 * Math.sin(1.3 * t + b.q[0]),
      f.c[1] + f.a[1] * Math.sin(f.w[1] * tl + f.p[1]) + b.o[1] + 0.8 * Math.sin(1.7 * t + b.q[1]),
      f.c[2] + f.a[2] * Math.sin(f.w[2] * tl + f.p[2]) + b.o[2] + 1.8 * Math.sin(1.1 * t + b.q[2]),
    );
  }

  // The swifts read the sky: they climb away and vanish before a storm or at nightfall and drift
  // back down when it clears (the rainbow brings them out). `away` eases over ~30 s.
  let time = 0, away = 0;
  function update(dt, frame) {
    time += Math.min(dt || 0, 0.1);
    uTime.value = time;
    const wx = frame && frame.weather;
    away += ((wx === 'storm' || wx === 'night' ? 1 : 0) - away) * Math.min(1, Math.min(dt || 0, 0.1) * 0.12);
    mesh.visible = away < 0.97;
    if (!mesh.visible) return;
    const up = away * away * 150;
    for (let i = 0; i < N; i++) {
      const b = birds[i];
      posAt(b, time, P);
      posAt(b, time + 0.05, Q);
      P.y += up; Q.y += up;
      // aim a point ahead along the path: +z of the bird faces the direction of travel
      T.subVectors(Q, P).multiplyScalar(20).add(P);
      dummy.position.copy(P);
      dummy.lookAt(T);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }

  return { group, regions: [], colliders: [], pickables: [], update };
}
