// East-garden lawn: GPU-instanced grass blades (one InstancedBufferGeometry mesh) + a ground-coloured base mesh.
// 2 draw calls. Query flag ?grassd=0.3 scales density (testing only).
export function build(ctx) {
  const { THREE, M, quality } = ctx;
  const group = new THREE.Group(); group.name = 'grass';
  const qs = new URLSearchParams(typeof location !== 'undefined' ? location.search : '');
  const requestedDensity = Number(qs.get('grassd') || 1);
  const densityScale = Number.isFinite(requestedDensity) ? Math.max(0.05, Math.min(2, requestedDensity)) : 1;
  const dens = (quality === 'low' ? 18 : quality === 'medium' ? 60 : 260) * densityScale;

  const LAWNS = [[29.5, 43.3, 15, 26.3], [48.7, 63, 15, 26.3], [29.5, 43.3, 31.7, 49], [48.7, 63, 31.7, 49]];
  const HOLES = [[46, 29, 5.5], [36, 21, 1.4], [56, 21, 1.4], [36, 42, 1.4], [60, 46, 1.4], [55, 40, 3.4]];
  // returns [inside, edgeProximity 0..1 (1 at a boundary)]
  function sample(x, z, rect) {
    for (const h of HOLES) { const d = Math.hypot(x - h[0], z - h[1]) - h[2]; if (d < 0) return null; }
    return true;
  }
  function edgeness(x, z, r) {
    let d = Math.min(x - r[0], r[1] - x, z - r[2], r[3] - z);
    for (const h of HOLES) d = Math.min(d, Math.hypot(x - h[0], z - h[1]) - h[2]);
    return 1 - Math.min(Math.max(d, 0) / 1.2, 1);
  }
  let seed = 1337;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };

  // ---- blade instances (stratified jitter) ----
  const cell = 1 / Math.sqrt(dens);
  const offs = [], pars = [];
  for (const r of LAWNS) {
    for (let x = r[0]; x < r[1]; x += cell) for (let z = r[2]; z < r[3]; z += cell) {
      const px = x + rnd() * cell, pz = z + rnd() * cell;
      if (px > r[1] || pz > r[3] || !sample(px, pz)) continue;
      const e = edgeness(px, pz, r);
      const h = (0.06 + rnd() * 0.03) * (1 + e * 0.45 * (0.5 + rnd()));
      offs.push(px, pz, rnd());
      pars.push(h, 0.0045 + rnd() * 0.002, rnd() * 6.2832, 0.25 + rnd() * 0.7);
    }
  }
  const N = offs.length / 3;

  // ---- base blade: 3 segments, 7 verts, tapered ----
  const seg = 3, pos = [], idx = [];
  for (let i = 0; i <= seg; i++) { const t = i / (seg + 1 > 3 ? seg : seg); pos.push(-0.5, t, 0, 0.5, t, 0); }
  // tip vertex
  pos.push(0, 1.0, 0);
  // rebuild properly: rows 0..2 at t=0,.33,.66 and tip at 1
  pos.length = 0;
  for (let i = 0; i < 3; i++) { const t = i / 3; pos.push(-0.5, t, 0, 0.5, t, 0); }
  pos.push(0, 1, 0);
  for (let i = 0; i < 2; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  idx.push(4, 5, 6);
  const geo = new THREE.InstancedBufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.setAttribute('aOff', new THREE.InstancedBufferAttribute(new Float32Array(offs), 3));
  geo.setAttribute('aPar', new THREE.InstancedBufferAttribute(new Float32Array(pars), 4));
  geo.instanceCount = N;
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(46, 0, 32), 40);
  geo.boundingBox = new THREE.Box3(new THREE.Vector3(28, 0, 14), new THREE.Vector3(64, 1, 50));

  const uniforms = { uTime: { value: 0 }, uCam: { value: new THREE.Vector3(0, 0, 0) }, uWind: { value: ctx.reducedMotion ? 0 : 1 } };
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.82, metalness: 0, side: THREE.DoubleSide });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uniforms.uTime; sh.uniforms.uCam = uniforms.uCam; sh.uniforms.uWind = uniforms.uWind;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        attribute vec3 aOff; attribute vec4 aPar;
        uniform float uTime; uniform vec3 uCam; uniform float uWind;
        varying vec3 vGrass;
        mat2 rot2(float a){ float c=cos(a), s=sin(a); return mat2(c,-s,s,c); }`)
      .replace('#include <beginnormal_vertex>', `
        float gT = position.y;
        vec3 objectNormal = vec3(0.0);
        {
          vec3 nl = normalize(vec3(position.x * 0.9, 1.1, 0.6 + aPar.w * 0.5));
          nl.xz = rot2(aPar.z) * nl.xz;
          objectNormal = nl;
        }
        #ifdef USE_TANGENT
          vec3 objectTangent = vec3( tangent.xyz );
        #endif`)
      .replace('#include <begin_vertex>', `
        float dCam = distance(aOff.xy, uCam.xz);
        float fade = 1.0 - smoothstep(34.0, 45.0, dCam);
        float h = aPar.x * fade;
        float wd = aPar.y * (1.0 - gT * gT * 0.92) * (0.5 + 0.5 * fade);
        vec3 lp = vec3(position.x * wd * 2.0, h * gT, aPar.w * gT * gT * h * 0.9);
        lp.y -= aPar.w * gT * gT * h * 0.25;
        // wind: rolling gusts along a heading plus per-blade flutter
        vec2 wdir = normalize(vec2(0.8, 0.6));
        float ph = dot(aOff.xy, wdir) * 0.22 - uTime * 1.5;
        float gust = 0.5 + 0.5 * sin(ph) * sin(ph * 0.37 + aOff.x * 0.05 + uTime * 0.3);
        float flut = sin(uTime * 3.1 + aOff.z * 40.0 + aOff.x * 1.3) * 0.15;
        vec2 wv = wdir * (0.25 + gust * 0.9 + flut) * uWind * gT * gT * h * 0.9;
        lp.xz = rot2(aPar.z) * lp.xz;
        lp.xz += wv;
        vec3 transformed = lp + vec3(aOff.x, 0.004, aOff.y);
        // colour: dark base, lighter / yellower tips, per-blade tint
        float r1 = fract(aOff.z * 7.31), r2 = fract(aOff.z * 13.7 + aPar.x * 91.0);
        vec3 cb = vec3(0.045, 0.11, 0.025) * (0.8 + 0.5 * r1);
        vec3 ct = mix(vec3(0.16, 0.30, 0.05), vec3(0.34, 0.46, 0.10), r2) * (0.85 + 0.3 * r1);
        vGrass = mix(cb, ct, smoothstep(0.0, 0.95, gT));
        vGrass = mix(vGrass, vec3(0.30, 0.28, 0.09), 0.18 * step(0.93, r2));`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vGrass;')
      .replace('#include <color_fragment>', 'diffuseColor.rgb = vGrass;')
      .replace('#include <normal_fragment_begin>', THREE.ShaderChunk.normal_fragment_begin.replace('gl_FrontFacing ? 1.0 : - 1.0', '1.0'));
  };
  mat.customProgramCacheKey = () => 'grass-blades-v1';
  const blades = new THREE.Mesh(geo, mat);
  blades.frustumCulled = true;   // the geometry's bounding sphere covers every lawn
  // These statements used to sit inside the comment above, so the blades never received the
  // trees', pergola's or fountain's shadows and the lawn read fully sunlit under them.
  blades.castShadow = false; blades.receiveShadow = true; blades.name = 'grass-blades';
  group.add(blades);

  // ---- ground-coloured base (grid of cells, same lawn mask) ----
  const cs = 0.15, bp = [], bu = [], bi = [];
  let vi = 0;
  for (const r of LAWNS) for (let x = r[0]; x < r[1] - 1e-6; x += cs) for (let z = r[2]; z < r[3] - 1e-6; z += cs) {
    const x1 = Math.min(x + cs, r[1]), z1 = Math.min(z + cs, r[3]);
    if (!sample((x + x1) / 2, (z + z1) / 2)) continue;
    bp.push(x, 0, z, x1, 0, z, x1, 0, z1, x, 0, z1);
    bu.push(x, z, x1, z, x1, z1, x, z1);
    bi.push(vi, vi + 2, vi + 1, vi, vi + 3, vi + 2); vi += 4;
  }
  const bg = new THREE.BufferGeometry();
  bg.setAttribute('position', new THREE.Float32BufferAttribute(bp, 3));
  bg.setAttribute('uv', new THREE.Float32BufferAttribute(bu, 2));
  bg.setAttribute('normal', new THREE.Float32BufferAttribute(bp.map((v, i) => (i % 3 === 1 ? 1 : 0)), 3));
  bg.setIndex(bi);
  let bm;
  try { bm = M.get('grass', { color: 0x3f5a22, roughness: 0.95 }).clone(); } catch (e) { bm = new THREE.MeshStandardMaterial({ color: 0x28401a, roughness: 1 }); }
  bm.polygonOffset = true; bm.polygonOffsetFactor = -1; bm.polygonOffsetUnits = -1;
  const base = new THREE.Mesh(bg, bm);
  base.position.y = 0.005; base.receiveShadow = true; base.name = 'grass-base';
  group.add(base);

  return {
    group, regions: [], colliders: [], pickables: [],
    update(dt, frame) {
      if (frame && frame.camera) uniforms.uCam.value.copy(frame.camera.position);
      if (!ctx.reducedMotion) uniforms.uTime.value += dt;
    },
    onPick() {},
  };
}
